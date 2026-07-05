// iOS Screen Time(FamilyControls) 앱 차단 네이티브 모듈 진입점.
// Expo Go/Android에서는 requireNativeModule이 throw → 호출부(src/utils/focusShield.js)에서 no-op 처리.
import { requireNativeModule } from 'expo-modules-core';

export default requireNativeModule('FocusShield');
