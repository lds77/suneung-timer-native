package expo.modules.screenpin

import android.app.ActivityManager
import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// 화면 고정(App Pinning) — 울트라집중 '시험' 강도에서 홈/최근앱 이동을 OS 차원에서 차단.
// 기기 관리자 권한 없이 startLockTask()를 호출하면 OS가 사용자 확인을 거쳐 고정한다.
// 해제는 뒤로+최근앱 버튼 동시 길게 누르기(사용자) 또는 stopLockTask()(세션 종료 시).
//
// screenState(): 🔥모드 이탈 판정용 화면 켜짐/꺼짐 정보. 안드로이드는 화면을 끄기만 해도
// 앱이 background로 내려가 '이탈'로 잡히는데, 화면 끄기는 다른 앱을 쓰는 게 아니므로
// 이탈이 아니다. ACTION_SCREEN_ON/OFF는 매니페스트 등록이 불가해 동적 등록으로 시각을 기록한다.
class ScreenPinModule : Module() {
  companion object {
    // 프로세스 스코프 — JS 리로드로 모듈이 재생성돼도 마지막 전환 시각은 유지
    @Volatile private var lastScreenOnAt: Long = 0L
    @Volatile private var lastScreenOffAt: Long = 0L
    // 잠금해제(키가드 해제) 완료 시각. 다른 앱은 잠금을 풀어야 열 수 있으므로, 이탈 시간의
    // 기준점은 '화면을 켠 순간'이 아니라 여기여야 한다 (잠금화면 체류·패턴 입력은 이탈이 아님).
    @Volatile private var lastUnlockAt: Long = 0L
  }

  private var screenReceiver: BroadcastReceiver? = null

  private fun alarmPendingIntent(ctx: Context, id: String): PendingIntent {
    val intent = Intent(ctx, AlarmReceiver::class.java)
      .setAction("expo.modules.screenpin.PIN_ALARM")
      .putExtra("alarmId", id)
    return PendingIntent.getBroadcast(
      ctx, id.hashCode(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  // 위젯 강제 갱신 알람용 — PIN_ALARM과 액션이 달라 같은 requestCode여도 별개 PendingIntent
  private fun widgetRefreshPendingIntent(ctx: Context, id: String): PendingIntent {
    val intent = Intent(ctx, AlarmReceiver::class.java)
      .setAction(AlarmReceiver.WIDGET_REFRESH_ACTION)
      .putExtra("alarmId", id)
    return PendingIntent.getBroadcast(
      ctx, id.hashCode(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun scheduleAt(ctx: Context, atMs: Long, pi: PendingIntent) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val canExact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
    if (canExact) {
      am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
    } else {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ScreenPin")

    OnCreate {
      val ctx = appContext.reactContext ?: return@OnCreate
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, intent: Intent?) {
          when (intent?.action) {
            Intent.ACTION_SCREEN_ON -> lastScreenOnAt = System.currentTimeMillis()
            Intent.ACTION_SCREEN_OFF -> lastScreenOffAt = System.currentTimeMillis()
            Intent.ACTION_USER_PRESENT -> lastUnlockAt = System.currentTimeMillis()
          }
          // 이탈 알림 감시 — 배경에선 JS 타이머가 멈추므로 이 리시버가 유일한 트리거다.
          // 무장 상태가 아니면 즉시 return하므로 평소엔 비용이 없다 (AwayWatch 주석 참조)
          if (c != null && AwayWatch.isArmed()) AwayWatch.onScreenEvent(c)
        }
      }
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_ON)
        addAction(Intent.ACTION_SCREEN_OFF)
        // 잠금해제 완료. SCREEN_ON/OFF와 마찬가지로 매니페스트 등록이 불가해 동적 등록만 가능하다.
        // 잠금을 안 건 기기에서는 아예 오지 않으므로, JS는 값이 없으면 화면 켬 시각으로 폴백한다.
        addAction(Intent.ACTION_USER_PRESENT)
      }
      try {
        if (Build.VERSION.SDK_INT >= 33) {
          ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
          ctx.registerReceiver(receiver, filter)
        }
        screenReceiver = receiver
      } catch (_: Throwable) {}
    }

    OnDestroy {
      val receiver = screenReceiver ?: return@OnDestroy
      try { appContext.reactContext?.unregisterReceiver(receiver) } catch (_: Throwable) {}
      screenReceiver = null
    }

    // 화면 상태 — interactive는 지금 켜져 있는지, lastOnAt/lastOffAt은 마지막 전환 시각(epoch ms).
    // 전환 순간엔 isInteractive()가 아직 true일 수 있어 JS가 lastOffAt으로 보정한다.
    Function("screenState") {
      val pm = appContext.reactContext?.getSystemService(Context.POWER_SERVICE) as? PowerManager
      val interactive = try { pm?.isInteractive ?: true } catch (_: Throwable) { true }
      // 키가드는 브로드캐스트가 아니라 직접 조회라 캐시 프로세스에서도 지연 없이 정확하다.
      // deviceSecure: 보안 잠금(패턴/PIN/지문)이 설정돼 있는가 — 없으면 USER_PRESENT가 안 온다.
      val km = appContext.reactContext?.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
      val keyguardLocked = try { km?.isKeyguardLocked ?: false } catch (_: Throwable) { false }
      val deviceSecure = try { km?.isDeviceSecure ?: false } catch (_: Throwable) { false }
      return@Function mapOf(
        "interactive" to interactive,
        "lastOnAt" to lastScreenOnAt.toDouble(),
        "lastOffAt" to lastScreenOffAt.toDouble(),
        "lastUnlockAt" to lastUnlockAt.toDouble(),
        "keyguardLocked" to keyguardLocked,
        "deviceSecure" to deviceSecure
      )
    }

    // ─── 이탈 알림 감시 (화면 끄기로 배경에 내려간 구간 전용) ────────────────
    // JS는 배경에서 시간을 잴 수 없으므로(RN 안드는 onPause에서 JS 타이머를 멈춘다),
    // '화면 켜짐 + 잠금 해제가 graceMs 이어지면 이탈'이라는 판단을 네이티브가 대신한다.
    // steps: [{ sec, title, body }] — 첫 항목은 확정 즉시, 나머지는 확정 시각 기준 sec 뒤.
    // limitAtMs: 카운트다운 종료 시각(epoch ms). 그 뒤로는 알리지 않는다(0이면 무제한).
    AsyncFunction("armAwayWatch") { graceMs: Double, limitAtMs: Double, steps: List<Map<String, Any?>>, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) { promise.resolve(false); return@AsyncFunction }
      try {
        val parsed = steps.mapNotNull { m ->
          val sec = (m["sec"] as? Number)?.toLong() ?: return@mapNotNull null
          val title = m["title"] as? String ?: return@mapNotNull null
          val body = m["body"] as? String ?: return@mapNotNull null
          AwayWatch.Step(sec, title, body)
        }
        if (parsed.isEmpty()) { promise.resolve(false); return@AsyncFunction }
        AwayWatch.arm(ctx, graceMs.toLong(), limitAtMs.toLong(), parsed)
        promise.resolve(true)
      } catch (t: Throwable) {
        promise.resolve(false)
      }
    }

    // 앱 복귀/세션 종료 시 호출 — 예약된 확인·넛지 알람과 이미 게시된 알림을 전부 정리한다
    AsyncFunction("disarmAwayWatch") { promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) { promise.resolve(false); return@AsyncFunction }
      try {
        AwayWatch.disarm(ctx)
        promise.resolve(true)
      } catch (t: Throwable) {
        promise.resolve(false)
      }
    }

    // 통화 중인가 (벨 울림·통화·인터넷 통화 포함) — 전화를 받는 건 이탈이 아니다.
    // 권한 없이 오디오 모드로 판별한다 (AwayWatch.inCall 주석 참조)
    Function("inCall") {
      val ctx = appContext.reactContext ?: return@Function false
      return@Function AwayWatch.inCall(ctx)
    }

    // 진단용 원시값 — AudioManager.mode (0 NORMAL / 1 RINGTONE / 2 IN_CALL / 3 IN_COMMUNICATION).
    // inCall()이 왜 그렇게 판정했는지 실기기에서 확인할 때 쓴다
    Function("audioMode") {
      val am = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        ?: return@Function -99
      return@Function try { am.mode } catch (_: Throwable) { -98 }
    }

    AsyncFunction("pin") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      activity.runOnUiThread {
        try {
          activity.startLockTask()
          promise.resolve(true)
        } catch (t: Throwable) {
          promise.resolve(false)
        }
      }
    }

    AsyncFunction("unpin") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      activity.runOnUiThread {
        try {
          activity.stopLockTask()
          promise.resolve(true)
        } catch (t: Throwable) {
          promise.resolve(false)
        }
      }
    }

    Function("isPinned") {
      val am = appContext.reactContext?.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        ?: return@Function false
      return@Function am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
    }

    // 고정 중 알림 소리/진동 차단 대비 — 지정 시각에 AlarmReceiver를 깨워 직접 진동+알림음.
    // 같은 id로 재예약하면 기존 알람을 대체한다 (FLAG_UPDATE_CURRENT).
    AsyncFunction("scheduleAlarm") { id: String, atMs: Double, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) { promise.resolve(false); return@AsyncFunction }
      try {
        scheduleAt(ctx, atMs.toLong(), alarmPendingIntent(ctx, id))
        promise.resolve(true)
      } catch (t: Throwable) {
        promise.resolve(false)
      }
    }

    AsyncFunction("cancelAlarm") { id: String, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) { promise.resolve(false); return@AsyncFunction }
      try {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(alarmPendingIntent(ctx, id))
        promise.resolve(true)
      } catch (t: Throwable) {
        promise.resolve(false)
      }
    }

    // 타이머 종료 시각에 홈 위젯 강제 갱신 — 앱이 죽어 있어도 위젯의 '집중 중' 표시/오늘합계가
    // 종료 순간 갱신되도록 AlarmManager로 AlarmReceiver(WIDGET_REFRESH)를 깨운다.
    // 같은 id로 재예약하면 기존 알람을 대체한다 (FLAG_UPDATE_CURRENT).
    AsyncFunction("scheduleWidgetRefresh") { id: String, atMs: Double, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) { promise.resolve(false); return@AsyncFunction }
      try {
        scheduleAt(ctx, atMs.toLong(), widgetRefreshPendingIntent(ctx, id))
        promise.resolve(true)
      } catch (t: Throwable) {
        promise.resolve(false)
      }
    }

    AsyncFunction("cancelWidgetRefresh") { id: String, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) { promise.resolve(false); return@AsyncFunction }
      try {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(widgetRefreshPendingIntent(ctx, id))
        promise.resolve(true)
      } catch (t: Throwable) {
        promise.resolve(false)
      }
    }
  }
}
