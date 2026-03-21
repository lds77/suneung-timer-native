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
  { id: 'SS', min: 100, max: 120, color: '#FF4FCC', label: 'SS', message: '전설!' },
  { id: 'S+', min: 93,  max: 99,  color: '#FFD700', label: 'S+', message: '완벽!' },
  { id: 'S',  min: 86,  max: 92,  color: '#FF6B9D', label: 'S',  message: '대단해!' },
  { id: 'A',  min: 76,  max: 85,  color: '#6C5CE7', label: 'A',  message: '훌륭해!' },
  { id: 'B',  min: 66,  max: 75,  color: '#00B894', label: 'B',  message: '좋아!' },
  { id: 'C',  min: 56,  max: 65,  color: '#F5A623', label: 'C',  message: '오늘도 수고했어!' },
];

export const getTier = (density) => {
  for (const tier of TIERS) {
    if (density >= tier.min) return tier;
  }
  return TIERS[TIERS.length - 1];
};

// 일일 목표 옵션 (분) — 2행 6열 (1~12시간)
export const DAILY_GOAL_OPTIONS = [60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720];

// 뽀모도로 기본값
export const POMO_DEFAULTS = {
  workMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cyclesBeforeLongBreak: 4,
};

// 카테고리별 기본 시간표 템플릿
export const DEFAULT_SCHEDULES = {

  // ═══ 초등 저학년 ═══
  elementary_lower: {
    weekday: {
      fixed: [
        { label: '취침',     start: '21:00', end: '07:00', type: 'sleep',  icon: 'moon-outline',       color: '#636E72' },
        { label: '아침 식사', start: '07:10', end: '07:40', type: 'meal',   icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '학교',     start: '08:40', end: '13:00', type: 'school', icon: 'school-outline',     color: '#95A5A6' },
        { label: '저녁 식사', start: '18:30', end: '19:00', type: 'meal',   icon: 'restaurant-outline', color: '#FDCB6E' },
      ],
      plans: [
        { label: '숙제', icon: 'pencil-outline',        color: '#F5A623', targetMin: 20 },
        { label: '독서', icon: 'bookmark-outline',      color: '#9B6FC3', targetMin: 20 },
      ],
    },
    weekend: {
      fixed: [
        { label: '취침',     start: '21:00', end: '07:30', type: 'sleep', icon: 'moon-outline',       color: '#636E72' },
        { label: '아침 식사', start: '07:40', end: '08:10', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '저녁 식사', start: '18:30', end: '19:00', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
      ],
      plans: [
        { label: '독서', icon: 'bookmark-outline',      color: '#9B6FC3', targetMin: 30 },
        { label: '복습', icon: 'document-text-outline', color: '#4A90D9', targetMin: 20 },
      ],
    },
  },

  // ═══ 초등 고학년 ═══
  elementary_upper: {
    weekday: {
      fixed: [
        { label: '취침',     start: '21:30', end: '07:00', type: 'sleep',  icon: 'moon-outline',       color: '#636E72' },
        { label: '아침 식사', start: '07:10', end: '07:40', type: 'meal',   icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '학교',     start: '08:40', end: '14:30', type: 'school', icon: 'school-outline',     color: '#95A5A6' },
        { label: '저녁 식사', start: '18:30', end: '19:00', type: 'meal',   icon: 'restaurant-outline', color: '#FDCB6E' },
      ],
      plans: [
        { label: '숙제', icon: 'pencil-outline',        color: '#F5A623', targetMin: 30 },
        { label: '수학', icon: 'calculator-outline',    color: '#4A90D9', targetMin: 30 },
        { label: '독서', icon: 'bookmark-outline',      color: '#9B6FC3', targetMin: 20 },
      ],
    },
    weekend: {
      fixed: [
        { label: '취침',     start: '21:30', end: '07:30', type: 'sleep', icon: 'moon-outline',       color: '#636E72' },
        { label: '아침 식사', start: '07:40', end: '08:10', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '저녁 식사', start: '18:30', end: '19:00', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
      ],
      plans: [
        { label: '수학', icon: 'calculator-outline',    color: '#4A90D9', targetMin: 40 },
        { label: '독서', icon: 'bookmark-outline',      color: '#9B6FC3', targetMin: 30 },
        { label: '복습', icon: 'document-text-outline', color: '#5CB85C', targetMin: 20 },
      ],
    },
  },

  // ═══ 중학생 ═══
  middle: {
    weekday: {
      fixed: [
        { label: '취침',     start: '22:30', end: '06:30', type: 'sleep',  icon: 'moon-outline',       color: '#636E72' },
        { label: '아침 식사', start: '06:40', end: '07:10', type: 'meal',   icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '학교',     start: '08:20', end: '15:30', type: 'school', icon: 'school-outline',     color: '#95A5A6' },
        { label: '저녁 식사', start: '18:30', end: '19:00', type: 'meal',   icon: 'restaurant-outline', color: '#FDCB6E' },
      ],
      plans: [
        { label: '수학',     icon: 'calculator-outline',    color: '#4A90D9', targetMin: 40 },
        { label: '영어',     icon: 'globe-outline',         color: '#5CB85C', targetMin: 30 },
        { label: '숙제/복습', icon: 'document-text-outline', color: '#F5A623', targetMin: 30 },
      ],
    },
    weekend: {
      fixed: [
        { label: '취침',     start: '22:30', end: '07:00', type: 'sleep', icon: 'moon-outline',       color: '#636E72' },
        { label: '아침 식사', start: '07:10', end: '07:40', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '저녁 식사', start: '18:30', end: '19:00', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
      ],
      plans: [
        { label: '수학',     icon: 'calculator-outline',    color: '#4A90D9', targetMin: 50 },
        { label: '영어',     icon: 'globe-outline',         color: '#5CB85C', targetMin: 40 },
        { label: '국어',     icon: 'book-outline',          color: '#E8575A', targetMin: 30 },
        { label: '과학/사회', icon: 'flask-outline',         color: '#F5A623', targetMin: 30 },
      ],
    },
  },

  // ═══ 고등학생 ═══
  high: {
    weekday: {
      fixed: [
        { label: '취침',     start: '23:00', end: '06:00', type: 'sleep',  icon: 'moon-outline',       color: '#636E72' },
        { label: '아침 식사', start: '06:10', end: '06:40', type: 'meal',   icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '학교',     start: '08:00', end: '16:30', type: 'school', icon: 'school-outline',     color: '#95A5A6' },
        { label: '저녁 식사', start: '18:00', end: '18:30', type: 'meal',   icon: 'restaurant-outline', color: '#FDCB6E' },
      ],
      optionalFixed: [
        { label: '야간자율학습', start: '18:00', end: '21:00', type: 'school', icon: 'moon-outline', color: '#636E72' },
      ],
      plans: [
        { label: '수학', icon: 'calculator-outline', color: '#4A90D9', targetMin: 50 },
        { label: '영어', icon: 'globe-outline',      color: '#5CB85C', targetMin: 40 },
        { label: '탐구', icon: 'flask-outline',      color: '#F5A623', targetMin: 30 },
      ],
    },
    weekend: {
      fixed: [
        { label: '취침',     start: '23:00', end: '07:00', type: 'sleep', icon: 'moon-outline',       color: '#636E72' },
        { label: '아침 식사', start: '07:10', end: '07:40', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '저녁 식사', start: '18:30', end: '19:00', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
      ],
      plans: [
        { label: '국어',  icon: 'book-outline',       color: '#E8575A', targetMin: 50 },
        { label: '수학',  icon: 'calculator-outline', color: '#4A90D9', targetMin: 60 },
        { label: '영어',  icon: 'globe-outline',      color: '#5CB85C', targetMin: 50 },
        { label: '탐구1', icon: 'flask-outline',      color: '#F5A623', targetMin: 40 },
        { label: '탐구2', icon: 'layers-outline',     color: '#9B6FC3', targetMin: 40 },
      ],
    },
  },

  // ═══ N수생 ═══
  nsuneung: {
    weekday: {
      fixed: [
        { label: '취침',     start: '23:00', end: '06:00', type: 'sleep', icon: 'moon-outline',       color: '#636E72' },
        { label: '아침 식사', start: '06:10', end: '06:40', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '점심 식사', start: '12:00', end: '12:30', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '저녁 식사', start: '18:30', end: '19:00', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
      ],
      plans: [
        { label: '국어',  icon: 'book-outline',       color: '#E8575A', targetMin: 80 },
        { label: '수학',  icon: 'calculator-outline', color: '#4A90D9', targetMin: 100 },
        { label: '영어',  icon: 'globe-outline',      color: '#5CB85C', targetMin: 60 },
        { label: '탐구1', icon: 'flask-outline',      color: '#F5A623', targetMin: 50 },
        { label: '탐구2', icon: 'layers-outline',     color: '#9B6FC3', targetMin: 50 },
      ],
    },
    weekend: {
      fixed: [
        { label: '취침',     start: '23:00', end: '07:00', type: 'sleep', icon: 'moon-outline',       color: '#636E72' },
        { label: '아침 식사', start: '07:10', end: '07:40', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '저녁 식사', start: '18:30', end: '19:00', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
      ],
      plans: [
        { label: '국어',  icon: 'book-outline',       color: '#E8575A', targetMin: 80 },
        { label: '수학',  icon: 'calculator-outline', color: '#4A90D9', targetMin: 100 },
        { label: '영어',  icon: 'globe-outline',      color: '#5CB85C', targetMin: 60 },
        { label: '탐구1', icon: 'flask-outline',      color: '#F5A623', targetMin: 50 },
        { label: '탐구2', icon: 'layers-outline',     color: '#9B6FC3', targetMin: 50 },
      ],
    },
  },

  // ═══ 대학생 ═══
  university: {
    weekday: {
      fixed: [
        { label: '취침',     start: '00:00', end: '07:30', type: 'sleep', icon: 'moon-outline',       color: '#636E72' },
        { label: '아침 식사', start: '07:40', end: '08:10', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '저녁 식사', start: '18:30', end: '19:00', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
      ],
      plans: [
        { label: '전공', icon: 'book-outline',          color: '#E8575A', targetMin: 60 },
        { label: '교양', icon: 'globe-outline',         color: '#5CB85C', targetMin: 30 },
        { label: '과제', icon: 'document-text-outline', color: '#F5A623', targetMin: 40 },
      ],
    },
    weekend: {
      fixed: [
        { label: '취침',     start: '00:00', end: '08:30', type: 'sleep', icon: 'moon-outline',       color: '#636E72' },
        { label: '아침 식사', start: '08:40', end: '09:10', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '저녁 식사', start: '18:30', end: '19:00', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
      ],
      plans: [
        { label: '전공',    icon: 'book-outline',      color: '#E8575A', targetMin: 90 },
        { label: '시험 준비', icon: 'clipboard-outline', color: '#4A90D9', targetMin: 60 },
      ],
    },
  },

  // ═══ 공시생/자격증 ═══
  exam_prep: {
    weekday: {
      fixed: [
        { label: '취침',     start: '23:30', end: '06:30', type: 'sleep', icon: 'moon-outline',       color: '#636E72' },
        { label: '아침 식사', start: '06:40', end: '07:30', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '점심 식사', start: '12:00', end: '12:30', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '저녁 식사', start: '18:30', end: '19:00', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
      ],
      plans: [
        { label: '과목1',    icon: 'book-outline',          color: '#E8575A', targetMin: 90 },
        { label: '과목2',    icon: 'layers-outline',        color: '#4A90D9', targetMin: 90 },
        { label: '과목3',    icon: 'globe-outline',         color: '#5CB85C', targetMin: 60 },
        { label: '기출/오답', icon: 'document-text-outline', color: '#F5A623', targetMin: 60 },
      ],
    },
    weekend: {
      fixed: [
        { label: '취침',     start: '23:30', end: '07:00', type: 'sleep', icon: 'moon-outline',       color: '#636E72' },
        { label: '아침 식사', start: '07:10', end: '07:40', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
        { label: '저녁 식사', start: '18:30', end: '19:00', type: 'meal',  icon: 'restaurant-outline', color: '#FDCB6E' },
      ],
      plans: [
        { label: '과목1',   icon: 'book-outline',      color: '#E8575A', targetMin: 90 },
        { label: '과목2',   icon: 'layers-outline',    color: '#4A90D9', targetMin: 90 },
        { label: '과목3',   icon: 'globe-outline',     color: '#5CB85C', targetMin: 60 },
        { label: '모의고사', icon: 'clipboard-outline', color: '#9B6FC3', targetMin: 120 },
      ],
    },
  },
};

// 고정 일정 유형별 기본값
export const FIXED_TYPES = [
  { type: 'school',   label: '학교',           icon: 'school-outline',     color: '#95A5A6' },
  { type: 'academy',  label: '학원',           icon: 'business-outline',   color: '#E17055' },
  { type: 'tutoring', label: '과외',           icon: 'person-outline',     color: '#6C5CE7' },
  { type: 'exercise', label: '운동',           icon: 'barbell-outline',    color: '#00B894' },
  { type: 'meal',     label: '식사',           icon: 'restaurant-outline', color: '#FDCB6E' },
  { type: 'sleep',    label: '취침',           icon: 'moon-outline',       color: '#636E72' },
  { type: 'work',     label: '출근/아르바이트', icon: 'briefcase-outline',  color: '#0984E3' },
  { type: 'commute',  label: '이동',           icon: 'bus-outline',        color: '#B2BEC3' },
  { type: 'custom',   label: '직접입력',       icon: 'pencil-outline',     color: '#DFE6E9' },
];

// 화이트노이즈 옵션
export const SOUNDS = [
  { id: 'none',   name: '끄기',   icon: '🔇' },
  { id: 'rain',   name: '빗소리', icon: '🌧️' },
  { id: 'cafe',   name: '카페',   icon: '☕' },
  { id: 'fire',   name: '모닥불', icon: '🔥' },
  { id: 'wave',   name: '파도',   icon: '🌊' },
  { id: 'forest', name: '숲속',   icon: '🌲' },
];
