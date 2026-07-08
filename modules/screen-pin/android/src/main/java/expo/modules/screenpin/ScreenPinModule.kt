package expo.modules.screenpin

import android.app.ActivityManager
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// 화면 고정(App Pinning) — 울트라집중 '시험' 강도에서 홈/최근앱 이동을 OS 차원에서 차단.
// 기기 관리자 권한 없이 startLockTask()를 호출하면 OS가 사용자 확인을 거쳐 고정한다.
// 해제는 뒤로+최근앱 버튼 동시 길게 누르기(사용자) 또는 stopLockTask()(세션 종료 시).
class ScreenPinModule : Module() {
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
