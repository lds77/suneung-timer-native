// src/constants/colors.js
// 열공 멀티타이머 — 테마 색상
//
// 6개 테마: 남녀 모두 사용 가능한 구성
// 🩷 로즈핑크 — 여학생 선호 (기본)
// 💜 퍼플 — 남녀 공용 (유니섹스 대표)
// 💙 스카이블루 — 남학생 선호
// 🌿 민트 — 남녀 공용 (상쾌)
// 🌙 네이비 — 남학생 선호 (진중)
// 🍊 코랄 — 남녀 공용 (따뜻)
//
// 전략: 카드는 흰색 유지, bg/surface/border에 눈에 보이는 틴트

const ACCENT_COLORS = {
  pink:   {
    accent: '#FF6B9D',
    bg: '#FFF5F8', t1: '#FFE8F0', t2: '#FFD4E3', t3: '#F0B0C8',
    dt1: '#2A1520', dt2: '#3A2030', dt3: '#4A2840',
  },
  purple: {
    accent: '#6C5CE7',
    bg: '#F6F4FE', t1: '#EDE8FF', t2: '#DDD0FA', t3: '#C0B0E8',
    dt1: '#1C1A30', dt2: '#28254A', dt3: '#352F5A',
  },
  blue:   {
    accent: '#4A90D9',
    bg: '#F3F8FD', t1: '#E0EEFA', t2: '#C8DEF5', t3: '#A0C4E8',
    dt1: '#141E30', dt2: '#1E2E48', dt3: '#283A58',
  },
  mint:   {
    accent: '#00B894',
    bg: '#F0FAF7', t1: '#DCF5ED', t2: '#B8EBD8', t3: '#90D8C0',
    dt1: '#142824', dt2: '#1E3830', dt3: '#28483C',
  },
  navy:   {
    accent: '#2C5F9E',
    bg: '#F0F3F8', t1: '#DEE6F2', t2: '#C0D0E8', t3: '#98B4D8',
    dt1: '#101828', dt2: '#182238', dt3: '#1E2E4A',
  },
  coral:  {
    accent: '#E07050',
    bg: '#FDF5F2', t1: '#FFEAE3', t2: '#FFD5C8', t3: '#F0B8A8',
    dt1: '#281815', dt2: '#3A2420', dt3: '#48302A',
  },
  slate:  {
    accent: '#64748B',
    bg: '#F8FAFC', t1: '#F1F5F9', t2: '#E2E8F0', t3: '#CBD5E1',
    dt1: '#0F172A', dt2: '#1E293B', dt3: '#334155',
  },
};

const FONT_SCALES = { small: 0.9, medium: 1.1, large: 1.25 };

// 스타일 프리셋: cute(귀여운) / minimal(미니멀)
// cardRadius: 카드/모달 borderRadius, buttonRadius: 버튼, chipRadius: 뱃지/칩
// characterScale: 캐릭터 아바타 크기 배율
const STYLE_PRESETS = {
  cute:    { cardRadius: 20, buttonRadius: 14, chipRadius: 20, characterScale: 1.15, timerFontWeight: '900', ringStroke: 14, ringStrokeFull: 16 },
  minimal: { cardRadius: 8,  buttonRadius: 6,  chipRadius: 4,  characterScale: 1.0,  timerFontWeight: '300', ringStroke: 2,  ringStrokeFull: 2  },
};

export const getTheme = (darkMode, accentColor = 'pink', fontScaleId = 'medium', stylePreset = 'cute') => {
  const ac = ACCENT_COLORS[accentColor] || ACCENT_COLORS.pink;
  const fs = FONT_SCALES[fontScaleId] || 1.0;
  const sp = STYLE_PRESETS[stylePreset] || STYLE_PRESETS.cute;

  if (darkMode) {
    return {
      bg: ac.dt1, card: ac.dt2, surface: ac.dt2, surface2: ac.dt3,
      border: ac.dt3, tabBar: ac.dt1, tabBarBorder: ac.dt3,
      text: '#E8E8F2', sub: '#9898B0', accent: ac.accent, accentLight: ac.dt2,
      green: '#00B894', red: '#E84057', gold: '#FFD700',
      purple: '#6C5CE7', yellow: '#FDCB6E', gray: '#636E72', fontScale: fs,
      cardRadius: sp.cardRadius, buttonRadius: sp.buttonRadius,
      chipRadius: sp.chipRadius, characterScale: sp.characterScale,
      timerFontWeight: sp.timerFontWeight, ringStroke: sp.ringStroke, ringStrokeFull: sp.ringStrokeFull, stylePreset,
    };
  }
  return {
    bg: ac.bg, card: '#FFFFFF', surface: ac.t1, surface2: ac.t2,
    border: ac.t3, tabBar: '#FFFFFF', tabBarBorder: ac.t2,
    text: '#2D2B3D', sub: '#8B8599', accent: ac.accent, accentLight: ac.t1,
    green: '#00B894', red: '#E84057', gold: '#FFD700',
    purple: '#6C5CE7', yellow: '#FDCB6E', gray: '#B2BEC3', fontScale: fs,
    cardRadius: sp.cardRadius, buttonRadius: sp.buttonRadius,
    chipRadius: sp.chipRadius, characterScale: sp.characterScale,
    timerFontWeight: sp.timerFontWeight, ringStroke: sp.ringStroke, ringStrokeFull: sp.ringStrokeFull, stylePreset,
  };
};

// 하위 호환
export const LIGHT = {
  bg: '#FFF5F8', card: '#FFFFFF', surface: '#FFE8F0', surface2: '#FFD4E3',
  border: '#F0B0C8', tabBar: '#FFFFFF', tabBarBorder: '#FFD4E3',
  text: '#2D2B3D', sub: '#8B8599', accent: '#FF6B9D', accentLight: '#FFE8F0',
  green: '#00B894', red: '#E84057', gold: '#FFD700',
  purple: '#6C5CE7', yellow: '#FDCB6E', gray: '#B2BEC3', fontScale: 1.0,
};
export const DARK = {
  bg: '#2A1520', card: '#3A2030', surface: '#3A2030', surface2: '#4A2840',
  border: '#4A2840', tabBar: '#2A1520', tabBarBorder: '#4A2840',
  text: '#E8E8F2', sub: '#9898B0', accent: '#FF6B9D', accentLight: '#3A2030',
  green: '#00B894', red: '#E84057', gold: '#FFD700',
  purple: '#6C5CE7', yellow: '#FDCB6E', gray: '#636E72', fontScale: 1.0,
};

export const CHARACTER_BG = {
  toru: '#FFE0E8', paengi: '#DBE8F5', taco: '#E0F5E0', totoru: '#E8E0F0',
};

export const SUBJECT_COLORS = [
  '#E8575A', '#4A90D9', '#5CB85C', '#F5A623',
  '#9B6FC3', '#FF6B9D', '#00B894', '#E17055',
];
