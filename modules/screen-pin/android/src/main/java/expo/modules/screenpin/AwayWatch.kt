package expo.modules.screenpin

import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
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
//   SCREEN_ON / USER_PRESENT → 지금 잠금이 풀려 있나? (KeyguardManager 직접 조회)
//     · 잠겨 있으면 아무것도 안 함 — 잠금화면에선 다른 앱을 쓸 수 없으므로 이탈이 아니다
//     · 풀려 있으면 graceMs(10초) 뒤 확인 알람 예약
//   SCREEN_OFF → 예약 취소 (알림만 확인하고 다시 끈 것)
//   확인 알람 → 여전히 켜짐+해제 상태면 그때부터가 진짜 이탈 → 알림 게시 + 후속 넛지 예약
//   앱 복귀(JS의 disarm) → 알람·알림 전부 정리
//
// ※JS가 이탈 카운트를 확정하는 방식(복귀 시 keyguard/화면 켬 역산)은 건드리지 않는다.
//   여기는 '알림'만 담당하고, 카운트는 기존대로 복귀 시점에 계산된다.
object AwayWatch {
  const val CHECK_ACTION = "expo.modules.screenpin.AWAY_CHECK"
  const val NUDGE_ACTION = "expo.modules.screenpin.AWAY_NUDGE"
  private const val CHANNEL_ID = "timer-complete" // expo-notifications가 만든 채널을 그대로 쓴다
  private const val BASE_NOTIF_ID = 7301
  private const val MAX_STEPS = 8

  data class Step(val sec: Long, val title: String, val body: String)

  // 프로세스 스코프 — JS 리로드로 모듈이 재생성돼도 유지. 프로세스가 죽으면 armed=false로
  // 초기화되므로, 살아남은 알람이 나중에 발화해도 아무 일도 하지 않는다(유령 알림 방지)
  @Volatile private var armed = false
  @Volatile private var graceMs = 10_000L
  @Volatile private var limitAtMs = 0L // 이 시각 이후로는 알림 금지(카운트다운 종료 시각). 0이면 무제한
  @Volatile private var steps: List<Step> = emptyList()

  fun isArmed() = armed

  fun arm(ctx: Context, graceMsIn: Long, limitAtMsIn: Long, stepsIn: List<Step>) {
    armed = true
    graceMs = if (graceMsIn > 0) graceMsIn else 10_000L
    limitAtMs = limitAtMsIn
    steps = stepsIn.take(MAX_STEPS)
    // 무장 시점에 이미 켜짐+해제 상태일 수도 있다(화면 끄기 판정이 레이스로 어긋난 경우) → 즉시 평가
    onScreenEvent(ctx)
  }

  fun disarm(ctx: Context) {
    armed = false
    cancelCheck(ctx)
    for (i in steps.indices) cancelAlarm(ctx, nudgeIntent(ctx, i))
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
    for (i in 0 until MAX_STEPS) nm?.cancel(BASE_NOTIF_ID + i)
    steps = emptyList()
  }

  // SCREEN_ON / SCREEN_OFF / USER_PRESENT가 올 때마다 호출된다 (ScreenPinModule의 리시버)
  fun onScreenEvent(ctx: Context) {
    if (!armed) return
    if (usable(ctx)) scheduleAt(ctx, System.currentTimeMillis() + graceMs, checkIntent(ctx))
    else cancelCheck(ctx)
  }

  fun onCheck(ctx: Context) {
    if (!armed) return
    // 확인 시점에 다시 직접 조회한다 — 예약 이후 화면을 껐거나 다시 잠갔을 수 있다.
    // 아직 잠겨 있으면 아무것도 안 하고, 다음 USER_PRESENT가 오면 그때 다시 예약된다
    if (!usable(ctx)) return
    val first = steps.firstOrNull() ?: return
    val now = System.currentTimeMillis()
    if (limitAtMs > 0 && now >= limitAtMs) { armed = false; return }
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

  // 지금 다른 앱을 쓸 수 있는 상태인가 — 브로드캐스트 시각이 아니라 직접 조회라 지연이 없다
  private fun usable(ctx: Context): Boolean {
    val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val interactive = try { pm?.isInteractive ?: false } catch (_: Throwable) { false }
    if (!interactive) return false
    val km = ctx.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    val locked = try { km?.isKeyguardLocked ?: false } catch (_: Throwable) { false }
    return !locked
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
