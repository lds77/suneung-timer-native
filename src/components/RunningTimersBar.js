// src/components/RunningTimersBar.js
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useApp } from '../hooks/useAppState';
import { LIGHT, DARK } from '../constants/colors';
import { formatTime } from '../utils/format';

export default function RunningTimersBar() {
  const app = useApp();
  const T = app.settings.darkMode ? DARK : LIGHT;
  const active = app.timers.filter(t => t.status === 'running' || t.status === 'paused');

  if (active.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: T.card, borderBottomColor: T.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {active.map(t => {
          const display = t.type === 'free' ? t.elapsedSec
            : t.type === 'countdown' ? Math.max(0, t.totalSec - t.elapsedSec)
            : Math.max(0, (t.pomoPhase === 'work' ? t.pomoWorkMin * 60 : t.pomoBreakMin * 60) - t.elapsedSec);
          const icon = t.type === 'pomodoro' ? (t.pomoPhase === 'work' ? '🍅' : '☕') : t.type === 'countdown' ? '⏰' : '⏱';

          return (
            <View key={t.id} style={[styles.chip, { backgroundColor: t.color + '18', borderColor: t.color + '40' }]}>
              <Text style={styles.chipIcon}>{icon}</Text>
              <Text style={[styles.chipLabel, { color: T.text }]} numberOfLines={1}>{t.label}</Text>
              <Text style={[styles.chipTime, { color: t.status === 'paused' ? T.sub : t.color }]}>{formatTime(display)}</Text>
              {t.status === 'paused' ? (
                <TouchableOpacity style={[styles.chipBtn, { backgroundColor: t.color }]} onPress={() => app.resumeTimer(t.id)}>
                  <Text style={styles.chipBtnT}>▶</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.chipBtn, { backgroundColor: T.surface2 }]} onPress={() => app.pauseTimer(t.id)}>
                  <Text style={[styles.chipBtnT, { color: T.text }]}>⏸</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderBottomWidth: 1, paddingVertical: 5, paddingHorizontal: 8 },
  scroll: { flexDirection: 'row', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  chipIcon: { fontSize: 10 },
  chipLabel: { fontSize: 9, fontWeight: '700', maxWidth: 50 },
  chipTime: { fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'], minWidth: 38 },
  chipBtn: { width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  chipBtnT: { color: 'white', fontSize: 9, fontWeight: '800' },
});
