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
        { label: '학교', start: '08:40', end: '13:00', type: 'school', icon: '🏫', color: '#95A5A6' },
      ],
      plans: [
        { label: '숙제', icon: '✏️', color: '#F5A623', targetMin: 20 },
        { label: '독서', icon: '📖', color: '#9B6FC3', targetMin: 20 },
      ],
    },
    weekend: {
      fixed: [],
      plans: [
        { label: '독서', icon: '📖', color: '#9B6FC3', targetMin: 30 },
        { label: '복습', icon: '📝', color: '#4A90D9', targetMin: 20 },
      ],
    },
  },

  // ═══ 초등 고학년 ═══
  elementary_upper: {
    weekday: {
      fixed: [
        { label: '학교', start: '08:40', end: '14:30', type: 'school', icon: '🏫', color: '#95A5A6' },
      ],
      plans: [
        { label: '숙제', icon: '✏️', color: '#F5A623', targetMin: 30 },
        { label: '수학', icon: '📐', color: '#4A90D9', targetMin: 30 },
        { label: '독서', icon: '📖', color: '#9B6FC3', targetMin: 20 },
      ],
    },
    weekend: {
      fixed: [],
      plans: [
        { label: '수학', icon: '📐', color: '#4A90D9', targetMin: 40 },
        { label: '독서', icon: '📖', color: '#9B6FC3', targetMin: 30 },
        { label: '복습', icon: '📝', color: '#5CB85C', targetMin: 20 },
      ],
    },
  },

  // ═══ 중학생 ═══
  middle: {
    weekday: {
      fixed: [
        { label: '학교', start: '08:20', end: '15:30', type: 'school', icon: '🏫', color: '#95A5A6' },
      ],
      plans: [
        { label: '수학', icon: '📐', color: '#4A90D9', targetMin: 40 },
        { label: '영어', icon: '📗', color: '#5CB85C', targetMin: 30 },
        { label: '숙제/복습', icon: '📝', color: '#F5A623', targetMin: 30 },
      ],
    },
    weekend: {
      fixed: [],
      plans: [
        { label: '수학', icon: '📐', color: '#4A90D9', targetMin: 50 },
        { label: '영어', icon: '📗', color: '#5CB85C', targetMin: 40 },
        { label: '국어', icon: '📘', color: '#E8575A', targetMin: 30 },
        { label: '과학/사회', icon: '🔬', color: '#F5A623', targetMin: 30 },
      ],
    },
  },

  // ═══ 고등학생 ═══
  high: {
    weekday: {
      fixed: [
        { label: '학교', start: '08:00', end: '16:30', type: 'school', icon: '🏫', color: '#95A5A6' },
      ],
      optionalFixed: [
        { label: '야간자율학습', start: '18:00', end: '21:00', type: 'school', icon: '🌙', color: '#636E72' },
      ],
      plans: [
        { label: '수학', icon: '📐', color: '#4A90D9', targetMin: 50 },
        { label: '영어', icon: '📗', color: '#5CB85C', targetMin: 40 },
        { label: '탐구', icon: '🔬', color: '#F5A623', targetMin: 30 },
      ],
    },
    weekend: {
      fixed: [],
      plans: [
        { label: '국어', icon: '📘', color: '#E8575A', targetMin: 50 },
        { label: '수학', icon: '📐', color: '#4A90D9', targetMin: 60 },
        { label: '영어', icon: '📗', color: '#5CB85C', targetMin: 50 },
        { label: '탐구1', icon: '🔬', color: '#F5A623', targetMin: 40 },
        { label: '탐구2', icon: '🧪', color: '#9B6FC3', targetMin: 40 },
      ],
    },
  },

  // ═══ N수생 ═══
  nsuneung: {
    weekday: {
      fixed: [
        { label: '독서실', start: '08:00', end: '22:00', type: 'custom', icon: '📚', color: '#B2BEC3' },
      ],
      plans: [
        { label: '국어', icon: '📘', color: '#E8575A', targetMin: 80 },
        { label: '수학', icon: '📐', color: '#4A90D9', targetMin: 100 },
        { label: '영어', icon: '📗', color: '#5CB85C', targetMin: 60 },
        { label: '탐구1', icon: '🔬', color: '#F5A623', targetMin: 50 },
        { label: '탐구2', icon: '🧪', color: '#9B6FC3', targetMin: 50 },
      ],
    },
    weekend: {
      fixed: [],
      plans: [
        { label: '국어', icon: '📘', color: '#E8575A', targetMin: 80 },
        { label: '수학', icon: '📐', color: '#4A90D9', targetMin: 100 },
        { label: '영어', icon: '📗', color: '#5CB85C', targetMin: 60 },
        { label: '탐구1', icon: '🔬', color: '#F5A623', targetMin: 50 },
        { label: '탐구2', icon: '🧪', color: '#9B6FC3', targetMin: 50 },
      ],
    },
  },

  // ═══ 대학생 ═══
  university: {
    weekday: {
      fixed: [],
      plans: [
        { label: '전공', icon: '📕', color: '#E8575A', targetMin: 60 },
        { label: '교양', icon: '📗', color: '#5CB85C', targetMin: 30 },
        { label: '과제', icon: '📝', color: '#F5A623', targetMin: 40 },
      ],
    },
    weekend: {
      fixed: [],
      plans: [
        { label: '전공', icon: '📕', color: '#E8575A', targetMin: 90 },
        { label: '시험 준비', icon: '📋', color: '#4A90D9', targetMin: 60 },
      ],
    },
  },

  // ═══ 공시생/자격증 ═══
  exam_prep: {
    weekday: {
      fixed: [
        { label: '독서실/도서관', start: '09:00', end: '22:00', type: 'custom', icon: '📚', color: '#B2BEC3' },
      ],
      plans: [
        { label: '과목1', icon: '📘', color: '#E8575A', targetMin: 90 },
        { label: '과목2', icon: '📗', color: '#4A90D9', targetMin: 90 },
        { label: '과목3', icon: '📕', color: '#5CB85C', targetMin: 60 },
        { label: '기출/오답', icon: '📝', color: '#F5A623', targetMin: 60 },
      ],
    },
    weekend: {
      fixed: [],
      plans: [
        { label: '과목1', icon: '📘', color: '#E8575A', targetMin: 90 },
        { label: '과목2', icon: '📗', color: '#4A90D9', targetMin: 90 },
        { label: '과목3', icon: '📕', color: '#5CB85C', targetMin: 60 },
        { label: '모의고사', icon: '🎯', color: '#9B6FC3', targetMin: 120 },
      ],
    },
  },
};

// 고정 일정 유형별 기본값
export const FIXED_TYPES = [
  { type: 'school',   label: '학교',           icon: '🏫', color: '#95A5A6' },
  { type: 'academy',  label: '학원',           icon: '🏢', color: '#E17055' },
  { type: 'tutoring', label: '과외',           icon: '👨‍🏫', color: '#6C5CE7' },
  { type: 'exercise', label: '운동',           icon: '🏃', color: '#00B894' },
  { type: 'meal',     label: '식사',           icon: '🍽️', color: '#FDCB6E' },
  { type: 'sleep',    label: '취침',           icon: '😴', color: '#636E72' },
  { type: 'work',     label: '출근/아르바이트', icon: '💼', color: '#0984E3' },
  { type: 'commute',  label: '이동',           icon: '🚌', color: '#B2BEC3' },
  { type: 'custom',   label: '직접입력',       icon: '✏️', color: '#DFE6E9' },
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
