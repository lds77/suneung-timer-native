// 안드로이드 화면 고정(App Pinning) 네이티브 모듈 진입점.
// Expo Go/iOS에서는 requireNativeModule이 throw → 호출부(src/utils/screenPin.js)에서 try/catch로 no-op 처리.
import { requireNativeModule } from 'expo-modules-core';

export default requireNativeModule('ScreenPin');
