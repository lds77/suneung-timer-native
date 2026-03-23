// stats/components/GoalRing.js — 목표 달성 링 컴포넌트
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export default function GoalRing({ pct, size = 88, color, bgColor }) {
  const stroke = Math.round(size * 0.115);
  const r = size / 2;
  const clamped = Math.min(100, Math.max(0, pct));
  const innerR = r - stroke / 2;
  const circumference = 2 * Math.PI * innerR;
  const offset = circumference * (1 - clamped / 100);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={r} cy={r} r={innerR} stroke={bgColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={r} cy={r} r={innerR}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${r} ${r})`}
        />
      </Svg>
      <Text style={{ fontSize: 15, fontWeight: '800', color }}>{clamped}%</Text>
    </View>
  );
}
