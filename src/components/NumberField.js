// src/components/NumberField.js
// 네모 숫자 입력창. 타이머 분/시, 연속모드 항목 등 '수치'를 직접 타이핑한다.
// (2026-08-02: 휠/스테퍼를 걷어내고 타이핑을 기본 입력으로 승격 — 사용자 결정)
//
// 커밋 규칙: 글자를 칠 때마다 부모에 올린다(라이브).
//   확인 버튼이나 blur를 기다리면 "타이핑 후 곧바로 저장"에서 값이 유실된다
//   (버튼 press와 blur의 순서가 플랫폼마다 다름). 대신 min/빈칸 보정은 blur에서 한다 —
//   치는 도중에 하면 '5'를 지우고 '50'을 치려는 순간 최소값으로 튄다.

import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { clampInt } from '../utils/timeInput';

const SIZES = {
  md: { h: 48, w: 92, font: 24, unit: 13, radius: 12 },
  sm: { h: 40, w: 52, font: 17, unit: 11, radius: 10 },
  xs: { h: 26, w: 40, font: 13, unit: 11, radius: 7 },
};

export default function NumberField({
  value,
  onChange,
  min = 0,
  max = 999,
  unit = '분',
  colors,
  size = 'md',
  width,            // 크기 프리셋의 폭을 덮어쓸 때
  accentColor,      // 숫자 색 (쉬는시간 초록 등)
  align = 'center',
  // 부모가 '이 칸이 키보드에 가리지 않게' 스크롤을 맞추기 위한 신호.
  // 안드 Modal은 별도 창이라 softwareKeyboardLayoutMode:'pan'이 적용되지 않는다
  onFocus,
}) {
  const T = colors;
  const S = SIZES[size] || SIZES.md;
  const tint = accentColor || T.accent;
  const [focused, setFocused] = useState(false);
  // 편집 중에만 쓰는 원본 텍스트. 비어 있으면 value를 그대로 보여준다
  // (부모가 값을 바꿔도 따라가도록 — 프리셋 칩과 입력창이 같은 값을 가리킨다)
  const [draft, setDraft] = useState(null);

  const handleChange = useCallback((text) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
    setDraft(digits);
    if (!digits) return;                       // 빈 칸은 아직 확정하지 않는다
    const n = parseInt(digits, 10);
    // 상한만 즉시 적용 — 하한은 blur에서 (1을 치는 순간 min으로 튀는 것 방지)
    onChange(Math.min(max, n));
  }, [max, onChange]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    const next = clampInt(draft, { min, max, fallback: value });
    setDraft(null);
    if (next !== value) onChange(next);
  }, [draft, min, max, value, onChange]);

  return (
    <View style={[styles.row, align === 'center' && { justifyContent: 'center' }]}>
      <TextInput
        value={draft !== null ? draft : String(value)}
        onChangeText={handleChange}
        onFocus={() => { setFocused(true); setDraft(String(value)); onFocus?.(); }}
        onBlur={handleBlur}
        selectTextOnFocus
        keyboardType="number-pad"
        returnKeyType="done"
        maxLength={4}
        style={[styles.box, {
          height: S.h,
          width: width || S.w,
          fontSize: S.font,
          borderRadius: S.radius,
          color: tint,
          borderColor: focused ? tint : T.border,
          backgroundColor: T.surface2 || T.surface,
        }]}
      />
      {!!unit && <Text style={[styles.unit, { fontSize: S.unit, color: T.sub }]}>{unit}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  box: {
    borderWidth: 1.5,
    textAlign: 'center',
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    paddingVertical: 0,
    paddingHorizontal: 2,
  },
  unit: {
    fontWeight: '700',
  },
});
