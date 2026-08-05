// src/components/NumberField.js
// 네모 숫자 입력창. 타이머 분/시, 연속모드 항목 등 '수치'를 직접 타이핑한다.
// (2026-08-02: 휠/스테퍼를 걷어내고 타이핑을 기본 입력으로 승격 — 사용자 결정)
//
// 커밋 규칙: 글자를 칠 때마다 부모에 올린다(라이브).
//   확인 버튼이나 blur를 기다리면 "타이핑 후 곧바로 저장"에서 값이 유실된다
//   (버튼 press와 blur의 순서가 플랫폼마다 다름).
//
// ★blur에 아무것도 미루지 말 것★ (2026-08-03) — 예전엔 min 보정을 blur에서 했는데,
//   입력 모달은 `keyboardShouldPersistTaps="handled"`라 **키보드가 뜬 채 버튼을 누르면
//   blur가 아예 일어나지 않는다.** 그래서 '0'을 치고 바로 '시작'을 누르면 0분 타이머가
//   만들어졌다(뽀모는 화면상 25분으로 돌면서 세션만 0초로 기록 = 공부하고도 통계에 안 남음).
//   지금은 하한도 commitNumberText가 즉시 적용한다. 사용자에겐 안 보인다 —
//   입력칸은 부모 값이 아니라 draft(친 그대로)를 그리기 때문.
//
// ★부모가 값을 바꾸면(빠른 선택 칩) 편집 중이어도 draft를 그 값으로 맞춘다★ —
//   안 그러면 칩을 누른 뒤 키보드를 내리는 순간 blur가 **stale draft로 칩 선택을 덮어쓴다**
//   (60분 칩을 눌렀는데 25분으로 되돌아감). 같은 이유로 blur는 값 비교만 한다.

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { clampInt, commitNumberText } from '../utils/timeInput';

// unitW = 단위 글자 자리폭(고정). '시간'(2자)과 '분'(1자)이 섞여도 입력칸이 세로로 정렬된다
const SIZES = {
  md: { h: 48, w: 92, font: 24, unit: 13, radius: 12, unitW: 32 },
  sm: { h: 40, w: 52, font: 17, unit: 11, radius: 10, unitW: 26 },
  xs: { h: 26, w: 40, font: 13, unit: 11, radius: 7, unitW: 20 },
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
  // 우리가 마지막으로 올린 값. 부모 value가 이것과 다르면 '외부 변경'(칩 등)이다
  const sentRef = useRef(value);

  useEffect(() => {
    if (value === sentRef.current) return;
    sentRef.current = value;
    setDraft((d) => (d === null ? null : String(value)));  // 편집 중이면 draft도 따라간다
  }, [value]);

  const commit = useCallback((n) => { sentRef.current = n; onChange(n); }, [onChange]);

  const handleChange = useCallback((text) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
    setDraft(digits);
    if (!digits) return;                       // 빈 칸은 아직 확정하지 않는다
    commit(commitNumberText(digits, { min, max }));
  }, [min, max, commit]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    const next = clampInt(draft, { min, max, fallback: value });
    setDraft(null);
    if (next !== value) commit(next);
  }, [draft, min, max, value, commit]);

  return (
    <View style={[styles.row, align === 'center' && { justifyContent: 'center' }]}>
      <TextInput
        value={draft !== null ? draft : String(value)}
        onChangeText={handleChange}
        onFocus={() => { setFocused(true); sentRef.current = value; setDraft(String(value)); onFocus?.(); }}
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
      {/* 단위 폭을 고정한다 — '시간'과 '분'의 글자 폭이 달라 가운데 정렬하면
          위아래로 놓인 입력칸의 좌우가 어긋난다 (결과모달 시간 수정, 2026-08-02 제보) */}
      {!!unit && (
        <Text style={[styles.unit, { fontSize: S.unit, color: T.sub, minWidth: S.unitW }]}>{unit}</Text>
      )}
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
