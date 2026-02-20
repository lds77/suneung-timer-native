// src/components/CircularTimer.js
// 원형 프로그레스 타이머

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const SIZE = 200;
const STROKE = 6;
const RADIUS = (SIZE - STROKE * 2) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function CircularTimer({
  timeText,       // "25:00"
  progress = 0,   // 0~100
  isRunning = false,
  isPaused = false,
  phaseColor,     // 색상 오버라이드 (뽀모도로 휴식 = green)
  subLabel = '',  // 하단 작은 텍스트
  colors,         // 테마 colors
  children,       // 중앙에 넣을 커스텀 요소 (캐릭터 등)
}) {
  const T = colors;
  const strokeColor = isRunning
    ? (phaseColor || T.accent)
    : T.border;
  const offset = CIRCUMFERENCE * (1 - Math.min(100, progress) / 100);

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE} style={styles.svg}>
        {/* 배경 링 */}
        <Circle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          fill="none" stroke={T.surface2}
          strokeWidth={STROKE}
        />
        {/* 프로그레스 링 */}
        <Circle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          fill="none" stroke={strokeColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        {children}
        <Text style={[styles.time, { color: isRunning ? strokeColor : T.text }]}>
          {timeText}
        </Text>
        {subLabel ? (
          <Text style={[styles.sub, { color: T.sub }]}>{subLabel}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  svg: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: {
    fontSize: 42,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
  sub: {
    fontSize: 11,
    marginTop: 2,
  },
});
