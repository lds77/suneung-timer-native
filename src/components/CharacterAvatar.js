// src/components/CharacterAvatar.js
// 캐릭터 아바타 — 원형에 캐릭터 꽉 차게, 발바닥 하단 정렬

import { View, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { CHARACTERS, CHARACTER_LIST } from '../constants/characters';
import { useState } from 'react';

// 캐릭터별 미세 조정 (이미지 내 캐릭터 크기/위치가 다름)
const CHAR_ADJUST = {
  toru:   { scale: 1.25, offsetY: 0.12 },
  paengi: { scale: 1.20, offsetY: 0.07 },
  taco:   { scale: 1.20, offsetY: 0.09 },
  totoru: { scale: 1.35, offsetY: 0.10 },
};

export default function CharacterAvatar({
  characterId = 'toru',
  size = 56,
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
        justifyContent: 'flex-end',
      }}>
        <Image
          source={char.image}
          style={{ width: imgW, height: imgH, marginBottom: -topOffset }}
          resizeMode="contain"
        />
      </View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
