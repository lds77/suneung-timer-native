package expo.modules.timernotif

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

// 실행 중 타이머의 상시(ongoing) 알림 — iOS Live Activity의 안드로이드 대응물.
// 상단바/알림창/잠금화면에 chronometer로 흐르는 시간을 표시한다.
// OS가 초를 직접 그리므로(setUsesChronometer) 앱이 백그라운드/도즈 상태여도 정확하고 배터리 소모가 없다.
// 벽시계 앵커(when) 기반이라 앱 프로세스가 죽어도 표시 시간은 계속 정확하다 (불변식 1과 같은 원리).
class TimerNotifModule : Module() {
  companion object {
    const val CHANNEL_ID = "timer-ongoing"
    const val NOTIF_ID = 41100
  }

  class ShowOptions : Record {
    @Field var title: String = ""
    @Field var subtitle: String = ""
    // 'up' = whenMs부터 카운트업 / 'down' = whenMs까지 카운트다운 / 'none' = 정적(일시정지)
    @Field var mode: String = "none"
    @Field var whenMs: Double = 0.0
    // 0보다 크면 해당 ms 후 OS가 알림을 자동 제거 — 앱이 죽어도 좀비 알림이 남지 않게 하는 상한
    @Field var timeoutMs: Double = 0.0
    @Field var color: String? = null
  }

  private fun ensureChannel(ctx: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val ch = NotificationChannel(CHANNEL_ID, "집중 진행 상황", NotificationManager.IMPORTANCE_LOW)
    ch.description = "타이머 실행 중 상단바와 잠금화면에 흐르는 시간을 보여줘요"
    ch.setShowBadge(false)
    ch.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    ch.setSound(null, null)
    ch.enableVibration(false)
    nm.createNotificationChannel(ch)
  }

  // expo-notifications 플러그인이 생성하는 흰색 실루엣 아이콘 우선, 없으면 앱 아이콘 폴백
  private fun smallIconRes(ctx: Context): Int {
    val res = ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
    return if (res != 0) res else ctx.applicationInfo.icon
  }

  // 커스텀 알림 뷰: 과목명(작게) + 진행 시간(크게 — 한눈에 들어오도록).
  // Chronometer base는 벽시계(when)가 아닌 elapsedRealtime 기준이라 변환해서 넣는다.
  // 카운트업이면 whenMs < now라 음수 오프셋이 돼 같은 식으로 처리된다.
  private fun chronoViews(ctx: Context, opts: ShowOptions, layout: Int, hasSub: Boolean): RemoteViews {
    val rv = RemoteViews(ctx.packageName, layout)
    rv.setTextViewText(R.id.timer_notif_title, opts.title)
    if (hasSub) rv.setTextViewText(R.id.timer_notif_sub, opts.subtitle)
    if (opts.mode == "down") rv.setChronometerCountDown(R.id.timer_notif_chrono, true)
    val base = SystemClock.elapsedRealtime() + (opts.whenMs.toLong() - System.currentTimeMillis())
    rv.setChronometer(R.id.timer_notif_chrono, base, null, true)
    return rv
  }

  override fun definition() = ModuleDefinition {
    Name("TimerNotif")

    AsyncFunction("show") { opts: ShowOptions, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) { promise.resolve(false); return@AsyncFunction }
      try {
        ensureChannel(ctx)
        val builder = NotificationCompat.Builder(ctx, CHANNEL_ID)
          .setSmallIcon(smallIconRes(ctx))
          .setContentTitle(opts.title)
          .setContentText(opts.subtitle)
          .setOngoing(true)
          .setOnlyAlertOnce(true)
          .setSilent(true)
          .setShowWhen(false)
          .setPriority(NotificationCompat.PRIORITY_LOW)
          .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
          .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        if (opts.mode == "up" || opts.mode == "down") {
          // 실행 중: 커스텀 뷰로 진행 시간을 크게 표시 (헤더의 작은 chronometer 대신).
          // DecoratedCustomViewStyle이 앱 아이콘/이름 헤더와 테마 배경을 유지해 준다
          builder.setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(chronoViews(ctx, opts, R.layout.timer_notif_small, false))
            .setCustomBigContentView(chronoViews(ctx, opts, R.layout.timer_notif_big, true))
        }
        // 'none'(일시정지): 표준 템플릿 정적 텍스트만 — 경과 시간은 subtitle에 담겨 온다
        if (opts.timeoutMs > 0) builder.setTimeoutAfter(opts.timeoutMs.toLong())
        opts.color?.let { try { builder.setColor(Color.parseColor(it)) } catch (_: Throwable) {} }

        ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let { launch ->
          launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          builder.setContentIntent(
            PendingIntent.getActivity(
              ctx, NOTIF_ID, launch,
              PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
          )
        }

        // POST_NOTIFICATIONS 미허용(안드 13+) 시 SecurityException → false 반환
        NotificationManagerCompat.from(ctx).notify(NOTIF_ID, builder.build())
        promise.resolve(true)
      } catch (t: Throwable) {
        promise.resolve(false)
      }
    }

    AsyncFunction("dismiss") { promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) { promise.resolve(false); return@AsyncFunction }
      try {
        NotificationManagerCompat.from(ctx).cancel(NOTIF_ID)
        promise.resolve(true)
      } catch (t: Throwable) {
        promise.resolve(false)
      }
    }
  }
}
