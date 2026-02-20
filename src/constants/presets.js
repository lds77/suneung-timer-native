// src/constants/presets.js
// 과목 프리셋 + 티어 정의

export const SUBJECT_PRESETS = [
  { name: '국어', color: '#E8575A', character: 'toru' },
  { name: '수학', color: '#4A90D9', character: 'paengi' },
  { name: '영어', color: '#5CB85C', character: 'taco' },
  { name: '과학', color: '#F5A623', character: 'totoru' },
  { name: '사회·한국사', color: '#9B6FC3', character: 'toru' },
  { name: '기타', color: '#8E8E93', character: 'paengi' },
];

export const TIERS = [
  { id: 'S+', min: 95, max: 120, color: '#FFD700', label: 'S+', message: '전설!' },
  { id: 'S',  min: 90, max: 94,  color: '#FF6B9D', label: 'S',  message: '완벽!' },
  { id: 'A',  min: 80, max: 89,  color: '#6C5CE7', label: 'A',  message: '대단해!' },
  { id: 'B',  min: 70, max: 79,  color: '#00B894', label: 'B',  message: '좋아!' },
  { id: 'C',  min: 60, max: 69,  color: '#FDCB6E', label: 'C',  message: '괜찮아' },
  { id: 'F',  min: 0,  max: 59,  color: '#B2BEC3', label: 'F',  message: '다음엔...' },
];

export const getTier = (density) => {
  for (const tier of TIERS) {
    if (density >= tier.min) return tier;
  }
  return TIERS[TIERS.length - 1];
};

// 일일 목표 옵션 (분)
export const DAILY_GOAL_OPTIONS = [180, 240, 300, 360, 420, 480, 540, 600];

// 뽀모도로 기본값
export const POMO_DEFAULTS = {
  workMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cyclesBeforeLongBreak: 4,
};

// 화이트노이즈 옵션
export const SOUNDS = [
  { id: 'none',   name: '끄기',   icon: '🔇' },
  { id: 'rain',   name: '빗소리', icon: '🌧️' },
  { id: 'cafe',   name: '카페',   icon: '☕' },
  { id: 'fire',   name: '모닥불', icon: '🔥' },
  { id: 'wave',   name: '파도',   icon: '🌊' },
  { id: 'forest', name: '숲속',   icon: '🌲' },
];
