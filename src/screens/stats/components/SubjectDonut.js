// stats/components/SubjectDonut.js — 과목 도넛 차트
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { formatShort } from '../../../utils/format';

export default function SubjectDonut({ data, size = 120, strokeWidth = 15, T }) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const totalSec = data.reduce((s, d) => s + d.sec, 0);
  let accumulated = 0;
  const segments = data.map(d => {
    const start = accumulated;
    accumulated += d.pct;
    return { ...d, start };
  });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={cx} cy={cy} r={r} stroke={T.surface2 || '#00000015'} strokeWidth={strokeWidth} fill="none" />
        {segments.map((seg, i) => {
          const dashLength = (seg.pct / 100) * circumference;
          if (dashLength < 1) return null;
          return (
            <Circle
              key={i}
              cx={cx} cy={cy} r={r}
              stroke={seg.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={circumference - (seg.start / 100) * circumference}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
        })}
      </Svg>
      <Text style={{ fontSize: 12, fontWeight: '800', color: T.text, textAlign: 'center' }}>
        {formatShort(totalSec)}
      </Text>
    </View>
  );
}
