// src/components/Stepper.js
// +/- 시간 조절 컴포넌트

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function Stepper({
  value,
  onChange,
  min = 1,
  max = 180,
  step = 5,
  unit = '분',
  colors,
}) {
  const T = colors;

  const adjust = (delta) => {
    const next = Math.max(min, Math.min(max, value + delta));
    onChange(next);
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.btnLarge, { borderColor: T.border, backgroundColor: T.card }]}
        onPress={() => adjust(-step)}
        activeOpacity={0.7}
      >
        <Text style={[styles.btnText, { color: T.text }]}>−{step}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btnSmall, { borderColor: T.border, backgroundColor: T.surface }]}
        onPress={() => adjust(-1)}
        activeOpacity={0.7}
      >
        <Text style={[styles.btnSmallText, { color: T.sub }]}>−1</Text>
      </TouchableOpacity>

      <View style={styles.valueContainer}>
        <Text style={[styles.value, { color: T.accent }]}>{value}</Text>
        <Text style={[styles.unit, { color: T.sub }]}>{unit}</Text>
      </View>

      <TouchableOpacity
        style={[styles.btnSmall, { borderColor: T.border, backgroundColor: T.surface }]}
        onPress={() => adjust(1)}
        activeOpacity={0.7}
      >
        <Text style={[styles.btnSmallText, { color: T.sub }]}>+1</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btnLarge, { borderColor: T.border, backgroundColor: T.card }]}
        onPress={() => adjust(step)}
        activeOpacity={0.7}
      >
        <Text style={[styles.btnText, { color: T.text }]}>+{step}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  btnLarge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSmall: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  btnSmallText: {
    fontSize: 11,
    fontWeight: '600',
  },
  valueContainer: {
    minWidth: 70,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
  },
  value: {
    fontSize: 28,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
});
