// focus/helpers.js — FocusScreen 전용 헬퍼/상수 (FocusScreen.js에서 분리, 코드 변경 없음)
import React from 'react';
import { View, Text } from 'react-native';

// 헥스 색상 밝기 계산 (0~255), 160 초과 = 밝은 배경
export function hexLuminance(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export const getSchoolDefaultFavs = (school) => {
  const pomo = (w, b, label) => ({ id: `def_pomo_${w}`, label: label, icon: '🍅', type: 'pomodoro', color: '#E17055', totalSec: 0, pomoWorkMin: w, pomoBreakMin: b });
  const cd = (min, label, color) => ({ id: `def_cd_${min}`, label: label, icon: '⏰', type: 'countdown', color: color, totalSec: min * 60 });
  if (school === 'elementary_lower') return [
    pomo(10, 5, '뽀모 10+5'), cd(15, '15분', '#5CB85C'), cd(20, '20분', '#4A90D9'), cd(25, '25분', '#9B6FC3'),
  ];
  if (school === 'elementary_upper') return [
    pomo(15, 5, '뽀모 15+5'), cd(20, '20분', '#5CB85C'), cd(30, '30분', '#4A90D9'), cd(45, '45분', '#9B6FC3'),
  ];
  if (school === 'middle') return [
    pomo(25, 5, '뽀모 25+5'), cd(30, '30분', '#5CB85C'), cd(45, '45분', '#4A90D9'), cd(60, '1시간', '#9B6FC3'),
  ];
  if (school === 'university') return [
    pomo(25, 5, '뽀모 25+5'), cd(45, '45분', '#5CB85C'), cd(60, '1시간', '#4A90D9'), cd(90, '90분', '#9B6FC3'),
  ];
  if (school === 'exam_prep') return [
    pomo(50, 10, '뽀모 50+10'), cd(60, '1시간', '#5CB85C'), cd(90, '90분', '#4A90D9'), cd(120, '2시간', '#9B6FC3'),
  ];
  // high, nsuneung
  return [
    pomo(25, 5, '뽀모 25+5'), cd(45, '45분', '#5CB85C'), cd(60, '1시간', '#4A90D9'), cd(90, '90분', '#9B6FC3'),
  ];
};
export const DEFAULT_FAVS = getSchoolDefaultFavs('high');

// ─── 이모지 → Ionicons 이름 변환 (기존 저장 데이터 호환) ──────────
export const EMOJI_ICON_MAP = {
  '😴': 'moon-outline', '🌙': 'moon-outline',
  '🍽️': 'nutrition-outline', '🍽': 'nutrition-outline',
  '🏫': 'school-outline', '🏢': 'business-outline',
  '👨‍🏫': 'person-outline', '🏃': 'barbell-outline',
  '💼': 'briefcase-outline', '🚌': 'bus-outline',
  '✏️': 'pencil-outline', '✏': 'pencil-outline',
  '📚': 'book-outline', '📖': 'bookmark-outline',
  '📝': 'document-text-outline', '📐': 'calculator-outline',
  '📗': 'globe-outline', '📘': 'book-outline', '📕': 'book-outline',
  '🔬': 'flask-outline', '🧪': 'flask-outline',
  '📋': 'clipboard-outline', '🎯': 'flag-outline',
  '📌': 'pin-outline', '⭐': 'star-outline', '🔥': 'flame',
  '⏰': 'alarm-outline', '🍅': 'nutrition-outline',
  '🔁': 'repeat-outline', '🔄': 'refresh-outline',
  '✨': 'star-outline', '💫': 'star-outline',
  '📜': 'document-outline', '🌍': 'globe-outline', '🌎': 'globe-outline',
  '🏆': 'trophy-outline', '💡': 'bulb-outline', '🎵': 'musical-notes-outline',
  '☕': 'cafe-outline', '🚀': 'rocket-outline', '⚡': 'flash-outline',
  '🧠': 'bulb-outline', '❤️': 'heart-outline', '🔒': 'lock-closed-outline',
};
// 유효한 Ionicons 이름인지 확인 (ASCII 소문자·숫자·하이픈만)
export const resolveIcon = (icon) => {
  if (!icon) return null;
  if (EMOJI_ICON_MAP[icon]) return EMOJI_ICON_MAP[icon];
  if (/^[a-z0-9-]+$/.test(icon)) return icon; // 이미 Ionicons 이름
  return null; // 미등록 이모지 → 호출부 fallback 사용
};

// ─── 미니 캘린더 아이콘 (오늘 날짜 표시) ──────────────────────────
export function CalendarIcon({ accentColor, size = 28 }) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return (
    <View style={{ width: size, height: size, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: accentColor }}>
      <View style={{ backgroundColor: accentColor, height: size * 0.36, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.2, color: 'white', fontWeight: '800', lineHeight: size * 0.32 }}>{month}월</Text>
      </View>
      <View style={{ flex: 1, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.4, color: '#222', fontWeight: '900', lineHeight: size * 0.52 }}>{day}</Text>
      </View>
    </View>
  );
}
