// src/components/CharacterAvatar.js
// 캐릭터 아바타 + 기분 오버레이 이펙트

import React from 'react';
import { View, Image, Text, StyleSheet, Animated } from 'react-native';
import { CHARACTERS } from '../constants/characters';

/**
 * @param {string} characterId - 'toru', 'paengi', 'taco', 'totoru'
 * @param {number} size - 아바타 크기 (기본 48)
 * @param {string} mood - 'happy', 'normal', 'sad', 'sleep', 'splus'
 * @param {boolean} showBg - 배경색 원 표시 여부
 */
export default function CharacterAvatar({
  characterId = 'toru',
  size = 48,
  mood = 'normal',
  showBg = false,
}) {
  const char = CHARACTERS[characterId] || CHARACTERS.toru;

  return (
    <View style={[
      styles.container,
      { width: size, height: size },
      showBg && { backgroundColor: char.bgColor, borderRadius: size / 2 },
    ]}>
      <Image
        source={char.image}
        style={[
          styles.image,
          { width: size * 0.85, height: size * 0.85 },
          mood === 'sad' && { opacity: 0.7 },
          mood === 'sleep' && { opacity: 0.5 },
        ]}
        resizeMode="contain"
      />
      {/* 오버레이 이펙트 */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  image: {
    // 크기는 인라인으로
  },
  overlay: {
    position: 'absolute',
  },
});
