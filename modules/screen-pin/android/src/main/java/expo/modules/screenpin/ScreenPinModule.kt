package expo.modules.screenpin

import android.app.ActivityManager
import android.content.Context
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// 화면 고정(App Pinning) — 울트라집중 '시험' 강도에서 홈/최근앱 이동을 OS 차원에서 차단.
// 기기 관리자 권한 없이 startLockTask()를 호출하면 OS가 사용자 확인을 거쳐 고정한다.
// 해제는 뒤로+최근앱 버튼 동시 길게 누르기(사용자) 또는 stopLockTask()(세션 종료 시).
class ScreenPinModule : Module() {
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
  }
}
