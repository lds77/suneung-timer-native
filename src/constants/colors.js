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
    h: ['#FFD6E8', '#FF85B5', '#FF3D80', '#C4255A'],   // 30m, 1h, 2h, 4h+
    dh: ['#3D1828', '#7A2850', '#C43878', '#FF5CA0'],
  },
  purple: {
    accent: '#6C5CE7',
    bg: '#F6F4FE', t1: '#EDE8FF', t2: '#DDD0FA', t3: '#C0B0E8',
    dt1: '#1C1A30', dt2: '#28254A', dt3: '#352F5A',
    h: ['#DDD4FF', '#A48EF0', '#6C5CE7', '#4030B0'],
    dh: ['#282050', '#483890', '#6C5CE7', '#9488FF'],
  },
  blue:   {
    accent: '#4A90D9',
    bg: '#F3F8FD', t1: '#E0EEFA', t2: '#C8DEF5', t3: '#A0C4E8',
    dt1: '#141E30', dt2: '#1E2E48', dt3: '#283A58',
    h: ['#C8DEFA', '#70A8E8', '#3878D0', '#1850A0'],
    dh: ['#182848', '#284888', '#4088D8', '#68B0F8'],
  },
  mint:   {
    accent: '#00B894',
    bg: '#F0FAF7', t1: '#DCF5ED', t2: '#B8EBD8', t3: '#90D8C0',
    dt1: '#142824', dt2: '#1E3830', dt3: '#28483C',
    h: ['#B8F0E0', '#50D0A8', '#00A880', '#006850'],
    dh: ['#143028', '#1C6048', '#00A880', '#38D0A8'],
  },
  navy:   {
    accent: '#2C5F9E',
    bg: '#F0F3F8', t1: '#DEE6F2', t2: '#C0D0E8', t3: '#98B4D8',
    dt1: '#101828', dt2: '#182238', dt3: '#1E2E4A',
    h: ['#C0D4F0', '#6888C0', '#2C5F9E', '#143060'],
    dh: ['#142440', '#284070', '#3870B0', '#6098D0'],
  },
  coral:  {
    accent: '#E07050',
    bg: '#FDF5F2', t1: '#FFEAE3', t2: '#FFD5C8', t3: '#F0B8A8',
    dt1: '#281815', dt2: '#3A2420', dt3: '#48302A',
    h: ['#FFD0C0', '#F08868', '#D05030', '#A03018'],
    dh: ['#301C14', '#784030', '#D05838', '#FF8060'],
  },
  slate:  {
    accent: '#64748B',
    bg: '#F8FAFC', t1: '#F1F5F9', t2: '#E2E8F0', t3: '#CBD5E1',
    dt1: '#0F172A', dt2: '#1E293B', dt3: '#334155',
    h: ['#D8DEE8', '#8898B0', '#546880', '#303C50'],
    dh: ['#202830', '#384858', '#5878A0', '#8CA8C0'],
  },
};

const FONT_SCALES = { small: 0.9, medium: 1.0, large: 1.25 };

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
      bg: '#131316', card: ac.dt2, surface: ac.dt2, surface2: ac.dt3,
      border: ac.dt3, tabBar: '#131316', tabBarBorder: ac.dt3,
      text: '#E8E8F2', sub: '#AEAEC8', accent: ac.accent, accentLight: ac.dt2,
      heat1: ac.dh[0], heat2: ac.dh[1], heat3: ac.dh[2], heat4: ac.dh[3],
      green: '#00B894', red: '#E84057', gold: '#FFD700',
      purple: '#6C5CE7', yellow: '#FDCB6E', gray: '#636E72', fontScale: fs,
      cardRadius: sp.cardRadius, buttonRadius: sp.buttonRadius,
      chipRadius: sp.chipRadius, characterScale: sp.characterScale,
      timerFontWeight: sp.timerFontWeight, ringStroke: sp.ringStroke, ringStrokeFull: sp.ringStrokeFull, stylePreset,
    };
  }
  return {
    bg: '#F7F7F9', card: '#FFFFFF', surface: ac.t1, surface2: ac.t2,
    border: ac.t3, tabBar: '#FFFFFF', tabBarBorder: ac.t2,
    text: '#2D2B3D', sub: '#6B6580', accent: ac.accent, accentLight: ac.t1,
    heat1: ac.h[0], heat2: ac.h[1], heat3: ac.h[2], heat4: ac.h[3],
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

// 집중탭 헤더 배경 프리셋 (0 = 기본/투명)
export const HEADER_BG_PRESETS = [
  { id: 0,  type: 'none',     label: '기본' },
  // 단색
  { id: 1,  type: 'solid',    label: '코랄',    color: '#FF6B6B' },
  { id: 2,  type: 'solid',    label: '오렌지',  color: '#FF9F43' },
  { id: 3,  type: 'solid',    label: '민트',    color: '#00B894' },
  { id: 4,  type: 'solid',    label: '스카이',  color: '#4A90D9' },
  { id: 5,  type: 'solid',    label: '퍼플',    color: '#6C5CE7' },
  { id: 6,  type: 'solid',    label: '다크',    color: '#2D3436' },
  // 그라데이션
  { id: 7,  type: 'gradient', label: '선셋',    colors: ['#FF6B6B', '#FF9F43'] },
  { id: 8,  type: 'gradient', label: '오션',    colors: ['#4A90D9', '#00CEC9'] },
  { id: 9,  type: 'gradient', label: '포레스트', colors: ['#00B894', '#6AB04C'] },
  { id: 10, type: 'gradient', label: '퍼플드림', colors: ['#A29BFE', '#6C5CE7'] },
  { id: 11, type: 'gradient', label: '로즈',    colors: ['#FD79A8', '#E84393'] },
  { id: 12, type: 'gradient', label: '골드',    colors: ['#F9CA24', '#F0932B'] },
];
