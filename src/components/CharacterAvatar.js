// src/components/CharacterAvatar.js
// 캐릭터 아바타 — 원형에 캐릭터 꽉 차게, 발바닥 하단 정렬

import React, { useState } from 'react';
import { View, Image, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CHARACTERS, CHARACTER_LIST } from '../constants/characters';

// 캐릭터별 미세 조정 (이미지 내 캐릭터 크기/위치가 다름)
// scale: 이미지 확대 비율 (높이 기준, 1.0 = 원형과 같은 높이, >1.0은 상하 crop 됨)
// offsetY: 발바닥을 원형 하단에 맞추기 위해 위로 당기기 (양수 = 아래로, 음수 = 위로)
const CHAR_ADJUST = {
  toru:   { scale: 1.25, offsetY: 0.12 },  // 캐릭터를 크게, 발바닥 정렬
  paengi: { scale: 1.20, offsetY: 0.07 },  // 캐릭터를 크게, 다리 노출 (조정)
  taco:   { scale: 1.20, offsetY: 0.09 },  // 캐릭터를 크게, 다리 노출 (조정)
  totoru: { scale: 1.35, offsetY: 0.10 },  // 더 크게 키움
};

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
  const adj = CHAR_ADJUST[currentId] || { scale: 1.0, offsetY: 0.05 };

  const handleTap = () => {
    if (!tappable) return;
    const next = (localIdx + 1) % CHARACTER_LIST.length;
    setLocalIdx(next);
    onCharChange?.(CHARACTER_LIST[next]);
  };

  const Wrapper = tappable ? TouchableOpacity : View;
  const wrapProps = tappable ? { onPress: handleTap, activeOpacity: 0.7 } : {};

  // 이미지 원본: 1376x768 (1.79:1), 캐릭터는 중앙
  const imgH = size * adj.scale;
  const imgW = imgH * 1.79;
  const topOffset = size * adj.offsetY;

  return (
    <Wrapper {...wrapProps} style={[styles.container, { width: size, height: size }]}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: char.bgColor,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'flex-end', // 하단 정렬 (발바닥 맞춤)
      }}>
        <Image
          source={char.image}
          style={[
            { width: imgW, height: imgH, marginBottom: -topOffset },
            mood === 'sad' && { opacity: 0.7 },
            mood === 'sleep' && { opacity: 0.5 },
          ]}
          resizeMode="contain"
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
