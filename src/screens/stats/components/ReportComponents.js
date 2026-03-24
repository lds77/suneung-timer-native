// stats/components/ReportComponents.js — 리포트 카드 공통 컴포넌트
import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import CharacterAvatar from '../../../components/CharacterAvatar';
import { darkenColor } from '../helpers';

// 그라디언트 헤더
export function ReportGradientHeader({ accent, icon, title, subtitle, characterId }) {
  return (
    <LinearGradient
      colors={[accent, darkenColor(accent, 0.35)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderTopLeftRadius: 19, borderTopRightRadius: 19 }}
    >
      <View style={{ position: 'absolute', top: -18, right: -18, width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.08)' }} />
      <View style={{ position: 'absolute', bottom: -22, left: 24, width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.05)' }} />
      <View style={{ position: 'absolute', top: 8, right: 56, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)' }} />
      <View style={{ padding: 20, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <CharacterAvatar characterId={characterId} size={38} mood="happy" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Ionicons name={icon} size={18} color="rgba(255,255,255,0.9)" />
            <Text style={{ color: 'white', fontSize: 18, fontWeight: '900', letterSpacing: 0.3 }}>{title}</Text>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 3 }}>{subtitle}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

// 과목 비율 수평 바
export function SubjectProportionBar({ subjects, T }) {
  if (!subjects || subjects.length === 0) return null;
  const total = subjects.reduce((s, x) => s + x.sec, 0);
  if (total === 0) return null;
  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <Ionicons name="pie-chart-outline" size={11} color={T.sub} />
        <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub }}>과목 비율</Text>
      </View>
      <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' }}>
        {subjects.slice(0, 6).map((s, i) => (
          <View key={i} style={{ flex: s.sec / total, backgroundColor: s.color, marginRight: i < Math.min(subjects.length, 6) - 1 ? 1.5 : 0 }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
        {subjects.slice(0, 4).map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: s.color }} />
            <Text style={{ fontSize: 10, color: T.sub, fontWeight: '600' }}>{s.name}</Text>
            <Text style={{ fontSize: 10, color: T.sub }}>{Math.round(s.sec / total * 100)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// 응원 메시지 푸터
export function ReportFooterMessage({ message, characterId, T }) {
  if (!message) return null;
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 14, backgroundColor: T.surface2, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <CharacterAvatar characterId={characterId} size={28} mood="happy" />
      <Text style={{ fontSize: 12, color: T.text, fontWeight: '600', flex: 1, lineHeight: 17 }}>{message}</Text>
    </View>
  );
}

// 브랜딩 워터마크
export function ReportWatermark({ T, tag }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingBottom: 16, paddingTop: 2 }}>
      <Ionicons name="book" size={11} color={T.sub} style={{ opacity: 0.5 }} />
      <Text style={{ fontSize: 11, color: T.sub, opacity: 0.5, fontWeight: '600' }}>
        열공메이트{tag ? ` · ${tag}` : ''}
      </Text>
    </View>
  );
}
