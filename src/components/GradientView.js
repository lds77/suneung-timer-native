import React, { useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

// expo-linear-gradient 대체 — Android Fabric 호환
// onLayout으로 실제 픽셀 크기를 측정해 SVG에 전달 (% 문자열이 react-native-svg에서 잘리는 버그 방지)
// gradientId를 고유하게 생성해 여러 인스턴스 동시 렌더 시 ID 충돌 방지
export default function GradientView({ colors, start, end, style, children }) {
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const gradientId = useRef(`g_${Math.random().toString(36).slice(2)}`).current;

  const x1 = `${(start?.x ?? 0) * 100}%`;
  const y1 = `${(start?.y ?? 0) * 100}%`;
  const x2 = `${(end?.x ?? 1) * 100}%`;
  const y2 = `${(end?.y ?? 0) * 100}%`;

  return (
    <View
      style={[style, { overflow: 'hidden' }]}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== dims.width || height !== dims.height) {
          setDims({ width, height });
        }
      }}
    >
      {dims.width > 0 && (
        <Svg style={StyleSheet.absoluteFill} width={dims.width} height={dims.height}>
          <Defs>
            <LinearGradient id={gradientId} x1={x1} y1={y1} x2={x2} y2={y2}>
              {colors.map((color, i) => (
                <Stop key={i} offset={`${i / (colors.length - 1)}`} stopColor={color} stopOpacity="1" />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={dims.width} height={dims.height} fill={`url(#${gradientId})`} />
        </Svg>
      )}
      {children}
    </View>
  );
}
