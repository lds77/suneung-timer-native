// 집중 타이머 Live Activity 네이티브 모듈 진입점 (iOS 전용, ActivityKit).
// Android/Expo Go에서는 requireNativeModule이 throw → 호출부(src/utils/liveActivity.js)에서 try/catch로 no-op 처리.
import { requireNativeModule } from 'expo-modules-core';

export default requireNativeModule('FocusLiveActivity');
