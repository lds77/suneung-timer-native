package expo.modules.screenpin

import android.app.ActivityManager
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

// 화면 고정(lock task) 중에는 OS가 알림을 소리/진동째 차단한다.
// 그래서 타이머 완료/페이즈 전환 시각에 AlarmManager로 이 리시버를 깨워 직접 진동+알림음을 울린다.
// 고정 중이 아니면 일반 예약 알림이 정상적으로 울리므로 아무것도 하지 않는다 (중복/유령 알람 방지).
//
// WIDGET_REFRESH 액션: 앱 프로세스가 죽어 있어도 타이머 종료 시각에 홈 위젯을 강제 갱신한다.
// react-native-android-widget 프로바이더(<package>.widget.<이름>)에 APPWIDGET_UPDATE를 쏘면
// 라이브러리가 헤드리스 JS(widgetTaskHandler)를 띄워 다시 렌더한다 —
// widgetData.js의 좀비 가드/완료분 잠정 가산이 이때 반영된다.
class AlarmReceiver : BroadcastReceiver() {
  companion object {
    const val WIDGET_REFRESH_ACTION = "expo.modules.screenpin.WIDGET_REFRESH"
    // getInstalledProvidersForPackage(API 26+) 미가용 시 폴백용 위젯 이름 (app.config.js와 일치)
    private val WIDGET_NAMES = listOf("StudyTime", "DDay", "SubjectLauncher", "TodayPlan")
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == WIDGET_REFRESH_ACTION) {
      refreshWidgets(context)
      return
    }

    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return
    if (am.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) return

    try {
      val vibrator = if (Build.VERSION.SDK_INT >= 31) {
        (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      }
      val pattern = longArrayOf(0, 500, 200, 500, 200, 500)
      if (Build.VERSION.SDK_INT >= 26) {
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
      } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(pattern, -1)
      }
    } catch (_: Throwable) {}

    try {
      val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
      RingtoneManager.getRingtone(context, uri)?.play()
    } catch (_: Throwable) {}
  }

  private fun refreshWidgets(context: Context) {
    try {
      val mgr = AppWidgetManager.getInstance(context) ?: return
      val providers: List<ComponentName> = if (Build.VERSION.SDK_INT >= 26) {
        mgr.getInstalledProvidersForPackage(context.packageName, null).map { it.provider }
      } else {
        WIDGET_NAMES.map { ComponentName(context, "${context.packageName}.widget.$it") }
      }
      for (cn in providers) {
        val ids = mgr.getAppWidgetIds(cn) ?: continue
        if (ids.isEmpty()) continue // 홈에 안 붙인 위젯은 건너뜀 (불필요한 헤드리스 기동 방지)
        context.sendBroadcast(
          Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
            .setComponent(cn)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        )
      }
    } catch (_: Throwable) {}
  }
}
