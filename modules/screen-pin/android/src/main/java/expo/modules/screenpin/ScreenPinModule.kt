package expo.modules.screenpin

import android.app.ActivityManager
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
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
          }
        }
      }
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_ON)
        addAction(Intent.ACTION_SCREEN_OFF)
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
      return@Function mapOf(
        "interactive" to interactive,
        "lastOnAt" to lastScreenOnAt.toDouble(),
        "lastOffAt" to lastScreenOffAt.toDouble()
      )
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
