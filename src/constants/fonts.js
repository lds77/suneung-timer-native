// src/constants/fonts.js
// 폰트 관련 상수와 맵핑

// fontFamily 설정값(fontId)과 실제 Expo에 등록할 폰트 이름을 연결합니다.
// Bold 등 weight가 필요한 경우 "<base>-Bold" 형태로 파일을 등록하여 뒤쪽 로직에서
// fontWeight에 따라 적용합니다.
export const FONT_FAMILY_MAP = {
  pretendard:  'Pretendard',
  gowunDodum:  'GowunDodum',
  cookieRun:   'CookieRun',
  nanumSquare: 'NanumSquare',
  maplestory:  'Maplestory',
};

// Expo Font.loadAsync에 전달할 객체.
// 키는 실제 fontFamily로 사용할 문자열이고, 값은 require 경로입니다.
export const FONT_MAP = {
  default: null,
  pretendard:  { 'Pretendard': require('../../assets/fonts/Pretendard-Medium.ttf'), 'Pretendard-Bold': require('../../assets/fonts/Pretendard-Bold.ttf') },
  gowunDodum:  { 'GowunDodum': require('../../assets/fonts/GowunDodum-Regular.ttf'), 'GowunDodum-Bold': require('../../assets/fonts/GowunDodum-Regular.ttf') },
  cookieRun:   { 'CookieRun': require('../../assets/fonts/CookieRun-Regular.ttf'), 'CookieRun-Bold': require('../../assets/fonts/CookieRun-Bold.ttf') },
  nanumSquare: { 'NanumSquare': require('../../assets/fonts/NanumSquareR.ttf'), 'NanumSquare-Bold': require('../../assets/fonts/NanumSquareB.ttf') },
  maplestory:  { 'Maplestory': require('../../assets/fonts/MaplestoryLight.ttf'), 'Maplestory-Bold': require('../../assets/fonts/MaplestoryBold.ttf') },
};
