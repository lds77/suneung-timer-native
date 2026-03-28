// src/components/TimePickerGrid.js
// 갤럭시 드럼롤 스타일 — 시간 휠 + 분 휠 (컴팩트 3줄)

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

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

export default function TimePickerGrid({ label, value, onChange, T }) {
  const is24 = value === '24:00';
  const [hVal, mVal] = is24 ? [24, 0] : (value || '08:00').split(':').map(Number);

  const hIdx = Math.min(hVal, 24);
  const mIdx = Math.min(Math.round(mVal / 5), 11);

  const handleHour = useCallback((idx) => {
    if (idx === 24) {
      onChange('24:00');
    } else {
      const snappedM = Math.round((is24 ? 0 : mVal) / 5) * 5 % 60;
      onChange(`${String(idx).padStart(2, '0')}:${String(snappedM).padStart(2, '0')}`);
    }
  }, [mVal, is24, onChange]);

  const handleMin = useCallback((idx) => {
    if (is24) return;
    onChange(`${String(hVal).padStart(2, '0')}:${String(idx * 5).padStart(2, '0')}`);
  }, [hVal, is24, onChange]);

  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub, marginBottom: 3, textAlign: 'center' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 13, fontWeight: '900', color: T.accent, textAlign: 'center', marginBottom: 5 }}>
        {is24 ? '24:00' : (value || '--:--')}
      </Text>

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
