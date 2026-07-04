package expo.modules.screenpin

import android.app.ActivityManager
import android.content.BroadcastReceiver
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
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
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
}
