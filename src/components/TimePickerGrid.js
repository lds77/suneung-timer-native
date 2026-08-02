// src/components/TimePickerGrid.js
// 갤럭시 드럼롤 스타일 — 시간 휠 + 분 휠 (컴팩트 3줄)
// 위의 'HH:MM'을 탭하면 타이핑으로 바꿀 수 있다 (휠 스크롤이 느려서 나온 요청, 2026-08-02).
// 타이핑은 5분 단위에 묶이지 않는다 — 08:37 같은 값도 들어온다. 저장 형식은 그대로 'HH:MM'.

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { commitTimeText, splitHm } from '../utils/timeInput';

const ITEM_H = 44;
const VISIBLE = 3;
const WHEEL_H = ITEM_H * VISIBLE;

const H_LABELS = Array.from({ length: 25 }, (_, i) => `${i}시`);
const M_LABELS = Array.from({ length: 12 }, (_, i) => `${String(i * 5).padStart(2, '0')}분`);

function Wheel({ items, selectedIdx, onSelect, T, disabled }) {
  const ref = useRef(null);
  const mounted = useRef(false);
  const fromUser = useRef(false);
  const [liveIdx, setLiveIdx] = useState(selectedIdx);

  useEffect(() => {
    // 사용자 스크롤로 인한 변경은 ScrollView가 이미 위치를 잡고 있으므로
    // scrollTo를 다시 호출하지 않음 — 이게 "백업" 느낌의 원인
    if (fromUser.current) {
      fromUser.current = false;
      return;
    }
    const y = selectedIdx * ITEM_H;
    if (!mounted.current) {
      mounted.current = true;
      setTimeout(() => ref.current?.scrollTo({ y, animated: false }), 80);
    } else {
      ref.current?.scrollTo({ y, animated: true });
    }
    setLiveIdx(selectedIdx);
  }, [selectedIdx]);

  const handleSnap = useCallback((e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    fromUser.current = true;
    onSelect(Math.max(0, Math.min(items.length - 1, idx)));
  }, [items.length, onSelect]);

  const handleScroll = useCallback((e) => {
    const raw = e.nativeEvent.contentOffset.y / ITEM_H;
    setLiveIdx(Math.max(0, Math.min(items.length - 1, Math.round(raw))));
  }, [items.length]);

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      {/* 선택 강조 밴드 */}
      <View pointerEvents="none" style={{
        position: 'absolute',
        top: ITEM_H, left: 4, right: 4,
        height: ITEM_H,
        backgroundColor: disabled ? T.surface : T.accent + '22',
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: disabled ? T.border : T.accent + '55',
        zIndex: 2,
      }} />

      <ScrollView
        ref={ref}
        style={{ height: WHEEL_H }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate={0.985}
        onMomentumScrollEnd={handleSnap}
        onScrollEndDrag={handleSnap}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: ITEM_H }}
        nestedScrollEnabled
        scrollEnabled={!disabled}
      >
        {items.map((item, i) => {
          const dist = Math.abs(i - liveIdx);
          const isSel = dist === 0;
          return (
            <View key={i} style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{
                fontSize: isSel ? 21 : 15,
                fontWeight: isSel ? '800' : '400',
                color: isSel && !disabled ? T.accent : T.text,
                opacity: disabled ? 0.3 : (isSel ? 1 : 0.35),
              }}>
                {item}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function TimePickerGrid({ label, value, onChange, T, minValue }) {
  const is24 = value === '24:00';
  const { h: hRaw, m: mRaw } = splitHm(value || '08:00');
  const [hVal, mVal] = is24 ? [24, 0] : [hRaw, mRaw];

  const hIdx = Math.min(hVal, 24);
  const mIdx = Math.min(Math.round(mVal / 5), 11);

  // ── 타이핑 모드 ──
  const [editing, setEditing] = useState(false);
  const [hDraft, setHDraft] = useState('');
  const [mDraft, setMDraft] = useState('');
  const minRef = useRef(null);
  const hFocused = useRef(false);
  const mFocused = useRef(false);
  const alive = useRef(true);
  // 지연 커밋(commitIfLeft)이 '이미 끝난 편집'을 되살려 휠 선택을 덮어쓰지 않도록 하는 문지기.
  // editing state는 setState라 80ms 뒤 콜백에서 최신값을 못 본다 — ref가 필요하다.
  const editingRef = useRef(false);
  useEffect(() => () => { alive.current = false; }, []);

  const endEdit = useCallback(() => {
    editingRef.current = false;
    setEditing(false);
  }, []);

  const beginEdit = useCallback(() => {
    setHDraft(String(hVal).padStart(2, '0'));
    setMDraft(String(mVal).padStart(2, '0'));
    editingRef.current = true;
    setEditing(true);
  }, [hVal, mVal]);

  const commitEdit = useCallback(() => {
    if (!editingRef.current) return;   // 확인 눌러 이미 확정했거나, 휠로 넘어간 뒤
    endEdit();
    onChange(commitTimeText(hDraft, mDraft, { prev: value || '08:00', minValue }));
  }, [hDraft, mDraft, value, minValue, onChange, endEdit]);

  // 시 → 분으로 넘어가는 순간의 blur까지 커밋으로 치면 입력이 중간에 끊긴다.
  // 잠깐 뒤에 둘 다 포커스가 없을 때만 확정한다(= 바깥을 눌러 키보드를 닫은 경우).
  const commitIfLeft = useCallback(() => {
    setTimeout(() => {
      if (!alive.current || hFocused.current || mFocused.current) return;
      commitEdit();
    }, 80);
  }, [commitEdit]);

  const handleHour = useCallback((idx) => {
    endEdit();   // 휠을 만졌으면 타이핑 중이던 값은 버린다
    if (idx === 24) {
      onChange('24:00');
    } else {
      // 타이핑으로 들어온 분(예: 37)을 휠이 5분 단위로 깎지 않도록 그대로 유지
      const keepM = is24 ? 0 : Math.max(0, Math.min(59, mVal));
      onChange(`${String(idx).padStart(2, '0')}:${String(keepM).padStart(2, '0')}`);
    }
  }, [mVal, is24, onChange, endEdit]);

  const handleMin = useCallback((idx) => {
    if (is24) return;
    endEdit();
    onChange(`${String(hVal).padStart(2, '0')}:${String(idx * 5).padStart(2, '0')}`);
  }, [hVal, is24, onChange, endEdit]);

  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub, marginBottom: 3, textAlign: 'center' }}>
        {label}
      </Text>
      {editing ? (
        <View style={styles.editRow}>
          <TextInput
            value={hDraft}
            onChangeText={(v) => {
              const d = v.replace(/[^0-9]/g, '').slice(0, 2);
              setHDraft(d);
              if (d.length === 2) minRef.current?.focus();  // 두 자리 채우면 분으로 자동 이동
            }}
            onFocus={() => { hFocused.current = true; }}
            onBlur={() => { hFocused.current = false; commitIfLeft(); }}
            autoFocus
            selectTextOnFocus
            keyboardType="number-pad"
            returnKeyType="next"
            onSubmitEditing={() => minRef.current?.focus()}
            maxLength={2}
            style={[styles.editInput, { color: T.accent, borderColor: T.accent, backgroundColor: T.surface }]}
          />
          <Text style={{ fontSize: 15, fontWeight: '900', color: T.sub }}>:</Text>
          <TextInput
            ref={minRef}
            value={mDraft}
            onChangeText={(v) => setMDraft(v.replace(/[^0-9]/g, '').slice(0, 2))}
            onFocus={() => { mFocused.current = true; }}
            onBlur={() => { mFocused.current = false; commitIfLeft(); }}
            selectTextOnFocus
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={commitEdit}
            maxLength={2}
            style={[styles.editInput, { color: T.accent, borderColor: T.accent, backgroundColor: T.surface }]}
          />
          <TouchableOpacity onPress={commitEdit} style={[styles.editOk, { backgroundColor: T.accent }]}>
            <Ionicons name="checkmark" size={15} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={beginEdit} activeOpacity={0.6}
          hitSlop={{ top: 6, bottom: 6, left: 16, right: 16 }}
          style={{ alignItems: 'center', marginBottom: 5 }}>
          <View style={styles.valueRow}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: T.accent }}>
              {is24 ? '24:00' : (value || '--:--')}
            </Text>
            {/* 연필 = 탭하면 타이핑할 수 있다는 신호 */}
            <Ionicons name="create-outline" size={11} color={T.sub} />
          </View>
        </TouchableOpacity>
      )}

      {/* 두 휠 */}
      <View style={{
        flexDirection: 'row',
        backgroundColor: T.surface,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: T.border,
        overflow: 'hidden',
        height: WHEEL_H,
      }}>
        <Wheel items={H_LABELS} selectedIdx={hIdx} onSelect={handleHour} T={T} />
        <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: T.border }} />
        <Wheel items={M_LABELS} selectedIdx={mIdx} onSelect={handleMin} T={T} disabled={is24} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginBottom: 5,
  },
  editInput: {
    width: 34,
    height: 30,
    borderWidth: 1.5,
    borderRadius: 7,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '900',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  editOk: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
});
