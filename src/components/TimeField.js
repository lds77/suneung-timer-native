// src/components/TimeField.js
// 시각(HH:MM) 입력 — 네모 [시] 칸 + 네모 [분] 칸.
// 드럼롤 휠(TimePickerGrid)을 대체한다: 스크롤로 시간을 맞추는 게 느리다는 제보가 출발점이고,
// 휠 위에 타이핑을 얹어봤더니 부가 기능처럼 보여 어색하다는 판단으로 타이핑만 남겼다
// (2026-08-02 사용자 결정). 분은 더 이상 5분 단위에 묶이지 않는다.
//
// 커밋 규칙: 글자마다 부모에 올린다(라이브). 확인 버튼이나 blur를 기다리면
// "타이핑 후 곧바로 저장"에서 값이 유실된다(버튼 press와 blur의 순서가 플랫폼마다 다름).
//
// ★친 값을 이 컴포넌트가 말없이 바꾸지 않는다★ — 한때 minValue(종료<시작 방지)로 하한을
// 걸었는데 두 가지가 어긋났다: ①고정 일정은 자정 넘김(23:00~07:00)이 **허용된 기능**이라
// 클램프가 정상 입력을 막았고, ②07을 쳤는데 23이 되는 건 사용자에겐 버그로 읽힌다.
// 시작/종료 관계 검증은 저장 시점에 각 화면이 한다(경고 또는 자정 넘김 확인창).
//
// draft는 시/분 각각 따로 둔다 — 하나로 합치면 시 칸에서 분 칸으로 넘어갈 때
// (분 onFocus → 시 onBlur 순서) 남의 draft를 자기 값으로 확정해버린다.

import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { splitHm, commitTimeText } from '../utils/timeInput';

// onFocus: 부모가 '이 칸이 키보드에 가리지 않게' 스크롤을 맞추기 위한 신호.
// 안드 Modal은 별도 창이라 app.config의 softwareKeyboardLayoutMode:'pan'이 적용되지 않는다
// (키보드가 입력창을 덮는다) — 모달마다 KeyboardAvoidingView + 이 신호로 스크롤을 맞춘다.
export default function TimeField({ label, value, onChange, T, onFocus, style }) {
  const cur = value || '08:00';
  const { h, m } = splitHm(cur);

  const [hDraft, setHDraft] = useState(null);
  const [mDraft, setMDraft] = useState(null);
  const [focusKey, setFocusKey] = useState(null);   // 테두리 강조용

  const two = (n) => String(n).padStart(2, '0');

  const handleChange = useCallback((key) => (raw) => {
    const digits = raw.replace(/[^0-9]/g, '').slice(0, 2);
    (key === 'h' ? setHDraft : setMDraft)(digits);
    if (!digits) return;                    // 빈 칸은 확정하지 않는다 (지우고 다시 치는 중)
    onChange(key === 'h'
      ? commitTimeText(digits, String(m), { prev: cur })
      : commitTimeText(String(h), digits, { prev: cur }));
  }, [h, m, cur, onChange]);

  const handleBlur = useCallback((key) => () => {
    const draft = key === 'h' ? hDraft : mDraft;
    (key === 'h' ? setHDraft : setMDraft)(null);
    setFocusKey((f) => (f === key ? null : f));
    // 빈 칸으로 떠나면 직전 값이 살아난다 (commitTimeText의 fallback)
    const next = key === 'h'
      ? commitTimeText(draft, String(m), { prev: cur })
      : commitTimeText(String(h), draft, { prev: cur });
    if (next !== cur) onChange(next);
  }, [hDraft, mDraft, h, m, cur, onChange]);

  const box = (key, val, draft, unit) => (
    <View style={styles.pair}>
      <TextInput
        value={draft !== null ? draft : two(val)}
        onChangeText={handleChange(key)}
        onFocus={() => { setFocusKey(key); (key === 'h' ? setHDraft : setMDraft)(two(val)); onFocus?.(); }}
        onBlur={handleBlur(key)}
        selectTextOnFocus
        keyboardType="number-pad"
        returnKeyType="done"
        maxLength={2}
        style={[styles.box, {
          color: T.accent,
          borderColor: focusKey === key ? T.accent : T.border,
          backgroundColor: T.surface2 || T.surface,
        }]}
      />
      <Text style={[styles.unit, { color: T.sub }]}>{unit}</Text>
    </View>
  );

  return (
    // ★루트에 flex:1을 박아두지 말 것★ — 시작/종료를 나란히 놓는 '행' 안에서는 반씩 나눠 갖는
    // 뜻이 되지만, 세로 컨테이너에 홀로 놓이면 flexBasis 0이 되어 **높이가 0으로 접힌다**
    // (설정 리마인더 시트가 이렇게 무너졌다 — 입력칸이 제목 위로 겹쳐 나옴, 2026-08-02).
    // 행에서 쓰는 호출부가 style={{ flex: 1 }}을 직접 넘긴다.
    <View style={style}>
      {!!label && <Text style={[styles.label, { color: T.sub }]}>{label}</Text>}
      <View style={styles.row}>
        {box('h', h, hDraft, '시')}
        {box('m', m, mDraft, '분')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  box: {
    width: 46,
    height: 44,
    borderWidth: 1.5,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  unit: {
    fontSize: 12,
    fontWeight: '700',
  },
});
