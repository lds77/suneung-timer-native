import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

// expo-linear-gradient 대체 — Android Fabric 호환
// react-native-svg LinearGradient 사용 (Fabric 지원)
export default function GradientView({ colors, start, end, style, children }) {
  const x1 = `${(start?.x ?? 0) * 100}%`;
  const y1 = `${(start?.y ?? 0) * 100}%`;
  const x2 = `${(end?.x ?? 1) * 100}%`;
  const y2 = `${(end?.y ?? 0) * 100}%`;
  return (
    <View style={[style, { overflow: 'hidden' }]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="g" x1={x1} y1={y1} x2={x2} y2={y2}>
            {colors.map((color, i) => (
              <Stop key={i} offset={`${i / (colors.length - 1)}`} stopColor={color} stopOpacity="1" />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#g)" />
      </Svg>
      {children}
    </View>
  );
}
