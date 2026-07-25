// 안드로이드 상시 타이머 알림(chronometer) 네이티브 모듈 진입점.
// Expo Go/iOS에서는 requireNativeModule이 throw → 호출부(src/utils/ongoingNotif.js)에서 try/catch로 no-op 처리.
import { requireNativeModule } from 'expo-modules-core';

export default requireNativeModule('TimerNotif');
