// src/components/EditableNumber.js
// 숫자를 탭하면 그 자리에서 타이핑으로 바꾸는 입력.
// Stepper(+/- 버튼)와 연속모드 항목이 공유한다 — 두 곳의 커밋 규칙이 갈리지 않도록 한 곳에 둔다.
// 정규화는 utils/timeInput.clampInt가 전담(테스트 有).

import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { clampInt } from '../utils/timeInput';

export default function EditableNumber({
  value,
  onChange,
  min = 0,
  max = 999,
  unit = '분',
  colors,
  valueStyle,   // 평소 보이는 숫자 텍스트 스타일
  inputStyle,   // 타이핑 중 입력칸 스타일 (표시용 크기를 그대로 쓰면 좁은 행에서 넘친다)
  unitStyle,
  inputWidth = 64,
  align = 'center',
}) {
  const T = colors;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // onSubmitEditing과 onBlur가 연달아 불려 커밋이 두 번 도는 것을 막는다
  const committed = useRef(false);

  const begin = useCallback(() => {
    setDraft(String(value));
    committed.current = false;
    setEditing(true);
  }, [value]);

  const commit = useCallback(() => {
    if (committed.current) return;
    committed.current = true;
    setEditing(false);
    const next = clampInt(draft, { min, max, fallback: value });
    if (next !== value) onChange(next);
  }, [draft, min, max, value, onChange]);

  if (editing) {
    return (
      <View style={[styles.row, { justifyContent: align === 'center' ? 'center' : 'flex-start' }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          autoFocus
          selectTextOnFocus
          keyboardType="number-pad"
          returnKeyType="done"
          maxLength={4}
          style={[
            styles.input,
            {
              width: inputWidth,
              color: T.accent,
              borderColor: T.accent,
              backgroundColor: T.surface2 || T.surface,
            },
            inputStyle,   // 호출부가 색/크기를 덮어쓸 수 있게 마지막
          ]}
        />
        <Text style={[styles.unit, { color: T.sub }, unitStyle]}>{unit}</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={begin}
      activeOpacity={0.6}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.row, { justifyContent: align === 'center' ? 'center' : 'flex-start' }]}
    >
      {/* 밑줄 = 탭하면 고칠 수 있다는 신호 (안드는 한쪽 면만 dashed가 안 먹어 solid로 통일) */}
      <Text
        style={[
          styles.value,
          { color: T.accent, borderBottomColor: T.border },
          valueStyle,   // 호출부가 색(예: 쉬는시간 초록)을 덮어쓸 수 있게 마지막
        ]}
      >
        {value}
      </Text>
      <Text style={[styles.unit, { color: T.sub }, unitStyle]}>{unit}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  value: {
    fontSize: 28,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    borderBottomWidth: 1,
  },
  input: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  unit: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
});
