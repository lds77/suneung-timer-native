package expo.modules.screenpin

import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat

// 🔥모드 이탈 알림 중 **JS가 못 하는 구간**만 담당한다.
//
// 배경: 화면을 끄면 앱이 background로 내려가는데, 그 뒤 잠금화면 알림창에서 곧장 다른 앱으로
// 가버리면 앱은 'active'를 한 번도 못 받는다. 그 구간에서 "10초 뒤에 판단해서 알린다"를 JS로
// 할 수 없다 — RN 안드로이드는 액티비티 onPause에서 JS 타이머를 통째로 멈추기 때문
// (JavaTimerManager.onHostPause). 실제로 JS 폴링을 구현했다가 한 번도 안 도는 걸 확인했다.
// 반면 **동적 등록한 BroadcastReceiver와 AlarmManager는 배경에서도 정상 동작**하므로,
// 그 둘로 같은 판단을 네이티브에서 한다.
//
// 흐름 (arm은 '화면 끄기로 배경에 내려간' 경우에만 JS가 건다):
//   SCREEN_ON → 화면이 켜져 있는 동안 확인 알람을 짧게 반복 예약(폴링 시작)
//   SCREEN_OFF → 예약 취소 (알림만 확인하고 다시 끈 것)
//   확인 알람 → KeyguardManager/PowerManager 직접 조회
//     · 잠겨 있으면 기준점을 비우고 다시 예약 — 잠금화면에선 다른 앱을 쓸 수 없으므로 이탈이 아니다
//     · 풀려 있으면 그 시각부터 재고, graceMs 동안 이어지면 이탈 확정 → 알림 + 후속 넛지 예약
//   앱 복귀(JS의 disarm) → 알람·알림 전부 정리
//
// ★잠금해제를 `ACTION_USER_PRESENT`로 알아내지 않는다★ (2026-07-30 실기기 확인).
// **잠금화면 알림을 눌러 다른 앱을 여는 경로에서는 USER_PRESENT가 오지 않는 경우가 있어**,
// 그 이벤트로만 확인 알람을 걸면 **첫 시도에서 알림이 통째로 안 나갔다**(재현: 3번 중 1번꼴).
// 그래서 화면이 켜져 있는 동안은 짧게 폴링하며 **키가드를 직접 조회**한다 —
// 이 판단이 브로드캐스트에 의존하면 안 된다는 건 이 파일 계열에서 세 번째로 확인된 교훈이다.
// (JS 타이머와 달리 AlarmManager는 배경에서도 정상 동작하므로 폴링이 가능하다.
//  화면이 꺼져 있는 동안에는 폴링하지 않으므로 대기 배터리 부담도 없다.)
//
// ※JS가 이탈 카운트를 확정하는 방식(복귀 시 keyguard/화면 켬 역산)은 건드리지 않는다.
//   여기는 '알림'만 담당하고, 카운트는 기존대로 복귀 시점에 계산된다.
object AwayWatch {
  const val CHECK_ACTION = "expo.modules.screenpin.AWAY_CHECK"
  const val NUDGE_ACTION = "expo.modules.screenpin.AWAY_NUDGE"
  private const val CHANNEL_ID = "timer-complete" // expo-notifications가 만든 채널을 그대로 쓴다
  private const val BASE_NOTIF_ID = 7301
  private const val MAX_STEPS = 8
  // 화면이 켜져 있는 동안의 폴링 간격. 화면이 켜진 상태에서만 돌고 확정되면 멈춘다
  private const val POLL_MS = 2_000L
  // 폴링 상한 — 잠금화면에 아주 오래 머무는 등 확정이 안 나는 경우의 안전장치.
  // 여기서 멈춰도 다음 SCREEN_ON이 오면 다시 시작된다
  private const val MAX_CHECKS = 200

  data class Step(val sec: Long, val title: String, val body: String)

  // 프로세스 스코프 — JS 리로드로 모듈이 재생성돼도 유지. 프로세스가 죽으면 armed=false로
  // 초기화되므로, 살아남은 알람이 나중에 발화해도 아무 일도 하지 않는다(유령 알림 방지)
  @Volatile private var armed = false
  @Volatile private var graceMs = 10_000L
  @Volatile private var limitAtMs = 0L // 이 시각 이후로는 알림 금지(카운트다운 종료 시각). 0이면 무제한
  @Volatile private var steps: List<Step> = emptyList()
  // 잠금이 풀린 채 이어진 시작 시각(0이면 아직 아님) + 폴링 횟수
  @Volatile private var usableSince = 0L
  @Volatile private var checks = 0

  // 마지막으로 통화를 '관측한' 시각. inCall()이 true를 돌려줄 때마다 갱신된다(JS 질의·폴링 공용).
  // ★배경에 있는 동안은 JS가 아무것도 볼 수 없으므로, 이 기록이 통화 여부를 아는 유일한 수단이다★
  // arm/disarm으로 지우지 않는다 — 세션 경계와 무관한 '기기에 마지막으로 전화가 있었던 시각'이다.
  @Volatile private var lastCallAt = 0L

  // 마지막 통화 관측 이후 경과(ms). 관측 기록이 없으면 -1
  fun msSinceCall(): Long = if (lastCallAt > 0L) System.currentTimeMillis() - lastCallAt else -1L

  fun isArmed() = armed

  fun arm(ctx: Context, graceMsIn: Long, limitAtMsIn: Long, stepsIn: List<Step>) {
    armed = true
    graceMs = if (graceMsIn > 0) graceMsIn else 10_000L
    limitAtMs = limitAtMsIn
    steps = stepsIn.take(MAX_STEPS)
    usableSince = 0L
    checks = 0
    // 무장 시점에 이미 화면이 켜져 있을 수도 있다(화면 끄기 판정이 레이스로 어긋난 경우) → 즉시 평가
    onScreenEvent(ctx)
  }

  fun disarm(ctx: Context) {
    armed = false
    usableSince = 0L
    checks = 0
    cancelCheck(ctx)
    for (i in 0 until MAX_STEPS) cancelAlarm(ctx, nudgeIntent(ctx, i))
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
    for (i in 0 until MAX_STEPS) nm?.cancel(BASE_NOTIF_ID + i)
    steps = emptyList()
  }

  // SCREEN_ON / SCREEN_OFF / USER_PRESENT가 올 때마다 호출된다 (ScreenPinModule의 리시버).
  // 화면이 켜져 있으면 폴링을 (재)시작하고, 꺼져 있으면 멈춘다 — 잠금 해제 여부는 폴링이 직접 본다
  fun onScreenEvent(ctx: Context) {
    if (!armed) return
    if (interactive(ctx)) {
      checks = 0 // 새로 켜졌으니 상한 초기화
      scheduleAt(ctx, System.currentTimeMillis() + POLL_MS, checkIntent(ctx))
    } else {
      usableSince = 0L
      cancelCheck(ctx)
    }
  }

  fun onCheck(ctx: Context) {
    if (!armed) return
    val now = System.currentTimeMillis()
    if (limitAtMs > 0 && now >= limitAtMs) { armed = false; return } // 타이머가 끝났으면 알리지 않는다

    // ★통화 상태는 화면 상태보다 먼저 본다★ — 통화 중엔 근접센서로 화면이 꺼지므로
    // 아래 interactive 검사에 걸려 조기 return하면 통화를 한 번도 관측하지 못한다.
    // 여기서 남긴 lastCallAt이 '통화 직후 유예'(JS의 awayMsAfterCall)의 기준이 된다
    val calling = inCall(ctx)

    // 화면이 꺼졌으면 폴링 종료 (SCREEN_ON이 오면 다시 시작된다)
    if (!interactive(ctx)) { usableSince = 0L; return }

    if (!unlocked(ctx) || calling) {
      // 잠금화면 체류 = 다른 앱을 쓸 수 없음 / 통화 중 = 이탈이 아님.
      // (잠금화면 위로 걸려온 전화를 받는 경우가 여기 걸린다 — 통화가 끝날 때까지 알리지 않는다)
      // 기준점을 비우고 계속 지켜본다
      usableSince = 0L
      if (++checks < MAX_CHECKS) scheduleAt(ctx, now + POLL_MS, checkIntent(ctx))
      return
    }

    if (usableSince == 0L) usableSince = now
    val heldMs = now - usableSince
    if (heldMs < graceMs) {
      // 잠금은 풀렸지만 아직 유예 중 — 남은 시간과 폴링 간격 중 짧은 쪽으로 다시 확인
      val next = minOf(POLL_MS, graceMs - heldMs)
      if (++checks < MAX_CHECKS) scheduleAt(ctx, now + next, checkIntent(ctx))
      return
    }

    // 잠금이 풀린 채 graceMs가 지나도록 앱으로 안 돌아왔다 = 진짜 이탈
    val first = steps.firstOrNull() ?: return
    notify(ctx, 0, first.title, first.body)
    // 후속 넛지 — 확정 시점 기준 상대 시각. 카운트다운이 먼저 끝나면 그 뒤는 예약하지 않는다
    for (i in 1 until steps.size) {
      val at = now + steps[i].sec * 1000L
      if (limitAtMs > 0 && at >= limitAtMs) break
      scheduleAt(ctx, at, nudgeIntent(ctx, i))
    }
  }

  fun onNudge(ctx: Context, index: Int) {
    if (!armed) return
    val s = steps.getOrNull(index) ?: return
    if (limitAtMs > 0 && System.currentTimeMillis() >= limitAtMs) return
    notify(ctx, index, s.title, s.body)
  }

  // 통화 중인가 — **권한 없이** 알 수 있는 방법으로 오디오 모드를 본다.
  // (TelephonyManager.getCallState는 API 31+에서 READ_PHONE_STATE가 필요하고, 그 권한은
  //  Play 정책상 정당화가 까다롭고 지원 기기까지 줄일 수 있다 — CAMERA 때 겪은 그 문제.)
  // 벨 울림(RINGTONE) / 통화 중(IN_CALL) / 인터넷 통화(IN_COMMUNICATION, 보이스톡 등) /
  // 통화 선별(CALL_SCREENING)을 모두 통화로 본다. 전화를 받는 건 이탈이 아니다.
  // ※실기기 확인(2026-07-30): 통화 중 네이티브 폴링에서 mode=2(IN_CALL)가 관측됐다 —
  //   이 방식이 실제로 통화를 잡는다는 근거. 권한 없이 되는 유일한 수단이라 대안도 없다.
  fun inCall(ctx: Context): Boolean {
    val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return false
    val mode = try { am.mode } catch (_: Throwable) { AudioManager.MODE_NORMAL }
    val calling = mode == AudioManager.MODE_RINGTONE ||
        mode == AudioManager.MODE_IN_CALL ||
        mode == AudioManager.MODE_IN_COMMUNICATION ||
        (Build.VERSION.SDK_INT >= 30 && mode == AudioManager.MODE_CALL_SCREENING)
    // 관측 시각을 남긴다 — 누가 물어보든(JS 질의/폴링) 이 한 곳에서 갱신되게 한다
    if (calling) lastCallAt = System.currentTimeMillis()
    return calling
  }

  // 아래 둘 다 브로드캐스트 시각이 아니라 지금 이 순간의 직접 조회라 지연·누락이 없다
  private fun interactive(ctx: Context): Boolean {
    val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
    return try { pm?.isInteractive ?: false } catch (_: Throwable) { false }
  }

  private fun unlocked(ctx: Context): Boolean {
    val km = ctx.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    return try { !(km?.isKeyguardLocked ?: false) } catch (_: Throwable) { true }
  }

  private fun checkIntent(ctx: Context): PendingIntent =
    PendingIntent.getBroadcast(
      ctx, 9100,
      Intent(ctx, AlarmReceiver::class.java).setAction(CHECK_ACTION),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  private fun nudgeIntent(ctx: Context, index: Int): PendingIntent =
    PendingIntent.getBroadcast(
      ctx, 9110 + index,
      Intent(ctx, AlarmReceiver::class.java).setAction(NUDGE_ACTION).putExtra("index", index),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  private fun cancelCheck(ctx: Context) = cancelAlarm(ctx, checkIntent(ctx))

  private fun cancelAlarm(ctx: Context, pi: PendingIntent) {
    try { (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pi) } catch (_: Throwable) {}
  }

  private fun scheduleAt(ctx: Context, atMs: Long, pi: PendingIntent) {
    try {
      val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val canExact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
      if (canExact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
      else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
    } catch (_: Throwable) {}
  }

  private fun smallIconRes(ctx: Context): Int {
    val res = ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
    return if (res != 0) res else ctx.applicationInfo.icon
  }

  private fun notify(ctx: Context, index: Int, title: String, body: String) {
    try {
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
      // 채널은 expo-notifications가 앱 시작 시 만들어 둔다. 혹시 없으면(순서 문제) 같은 설정으로 생성
      if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL_ID) == null) {
        nm.createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "타이머 알림", NotificationManager.IMPORTANCE_HIGH)
        )
      }
      val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
        ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val builder = NotificationCompat.Builder(ctx, CHANNEL_ID)
        .setSmallIcon(smallIconRes(ctx))
        .setContentTitle(title)
        .setContentText(body)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_REMINDER)
        .setDefaults(NotificationCompat.DEFAULT_ALL)
        .setAutoCancel(true)
      if (launch != null) {
        builder.setContentIntent(
          PendingIntent.getActivity(
            ctx, BASE_NOTIF_ID + index, launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
          )
        )
      }
      nm.notify(BASE_NOTIF_ID + index, builder.build())
    } catch (_: Throwable) {}
  }
}
