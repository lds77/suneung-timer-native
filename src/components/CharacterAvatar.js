// src/components/CharacterAvatar.js
// 캐릭터 아바타 — 원형에 캐릭터 꽉 차게 (머리~발)

import React, { useState } from 'react';
import { View, Image, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CHARACTERS, CHARACTER_LIST } from '../constants/characters';

/**
 * 이미지 원본: 1376x768 (비율 1.79:1)
 * 캐릭터는 이미지 중앙에 세로 약 85% 차지
 * → 이미지 높이를 원형의 1.3배로 → 캐릭터가 머리~발 꽉 참
 * → 가로는 비율대로 자동 → 좌우 배경만 잘림
 * → overflow:hidden으로 원형 클리핑
 */
export default function CharacterAvatar({
  characterId = 'toru',
  size = 56,
  mood = 'normal',
  tappable = false,
  onCharChange,
}) {
  const [localIdx, setLocalIdx] = useState(() => {
    const idx = CHARACTER_LIST.indexOf(characterId);
    return idx >= 0 ? idx : 0;
  });

  const currentId = tappable ? CHARACTER_LIST[localIdx % CHARACTER_LIST.length] : characterId;
  const char = CHARACTERS[currentId] || CHARACTERS.toru;

  const handleTap = () => {
    if (!tappable) return;
    const next = (localIdx + 1) % CHARACTER_LIST.length;
    setLocalIdx(next);
    onCharChange?.(CHARACTER_LIST[next]);
  };

  const Wrapper = tappable ? TouchableOpacity : View;
  const wrapProps = tappable ? { onPress: handleTap, activeOpacity: 0.7 } : {};

  // 이미지 높이 = 원형 * 1.3 → 캐릭터 머리~발 꽉 참
  // 이미지 가로 = 높이 * 1.79 (원본 비율) → 좌우 배경만 잘림
  const imgH = size * 1.3;
  const imgW = imgH * 1.79;

  return (
    <Wrapper {...wrapProps} style={[styles.container, { width: size, height: size }]}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: char.bgColor,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Image
          source={char.image}
          style={[
            { width: imgW, height: imgH },
            mood === 'sad' && { opacity: 0.7 },
            mood === 'sleep' && { opacity: 0.5 },
          ]}
          resizeMode="cover"
        />
      </View>
      {mood === 'happy' && (
        <View style={[styles.overlay, { top: -2, right: -2 }]}>
          <Text style={{ fontSize: size * 0.25 }}>✨</Text>
        </View>
      )}
      {mood === 'splus' && (
        <View style={[styles.overlay, { top: -6, alignSelf: 'center' }]}>
          <Text style={{ fontSize: size * 0.3 }}>👑</Text>
        </View>
      )}
      {mood === 'sad' && (
        <View style={[styles.overlay, { bottom: 2, right: 0 }]}>
          <Text style={{ fontSize: size * 0.2 }}>💧</Text>
        </View>
      )}
      {mood === 'sleep' && (
        <View style={[styles.overlay, { top: -4, right: -4 }]}>
          <Text style={{ fontSize: size * 0.22 }}>💤</Text>
        </View>
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
  },
});
