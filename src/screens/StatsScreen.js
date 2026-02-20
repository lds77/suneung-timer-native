// src/screens/StatsScreen.js
// 탭 3: 통계

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions,
} from 'react-native';
import { useApp } from '../hooks/useAppState';
import { LIGHT, DARK } from '../constants/colors';
import { CHARACTERS } from '../constants/characters';
import { getTier } from '../constants/presets';
import { formatDuration, formatShort, formatDDay, getToday } from '../utils/format';
import { calcAverageDensity } from '../utils/density';
import CharacterAvatar from '../components/CharacterAvatar';

const { width: SW } = Dimensions.get('window');
const DAYS_KR = ['일', '월', '화', '수', '목', '금', '토'];

export default function StatsScreen() {
  const app = useApp();
  const T = app.settings.darkMode ? DARK : LIGHT;
  const [tab, setTab] = useState('daily'); // 'daily' | 'weekly'

  const today = getToday();

  // ── 오늘 데이터 ──
  const todaySessions = app.todaySessions;
  const todayTotalSec = app.todayTotalSec;
  const todayAvgDensity = calcAverageDensity(todaySessions);
  const todayTier = getTier(todayAvgDensity);

  // ── 7일 데이터 ──
  const weekData = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const daySess = app.sessions.filter(s => s.date === dateStr);
      const sec = daySess.reduce((sum, s) => sum + (s.durationSec || 0), 0);
      const density = calcAverageDensity(daySess);
      data.push({
        date: dateStr,
        day: DAYS_KR[d.getDay()],
        sec,
        density,
        isToday: dateStr === today,
        sessions: daySess.length,
      });
    }
    return data;
  }, [app.sessions, today]);

  const weekMax = Math.max(...weekData.map(d => d.sec), 3600); // 최소 1시간 스케일
  const weekTotal = weekData.reduce((s, d) => s + d.sec, 0);

  // ── 과목별 비율 (오늘) ──
  const subjectBreakdown = useMemo(() => {
    const map = {};
    todaySessions.forEach(s => {
      const key = s.subjectId || '_none';
      map[key] = (map[key] || 0) + (s.durationSec || 0);
    });
    return Object.entries(map)
      .map(([id, sec]) => {
        const subj = app.subjects.find(s => s.id === id);
        return {
          id,
          name: subj ? subj.name : '미지정',
          color: subj ? subj.color : '#B2BEC3',
          sec,
          pct: todayTotalSec > 0 ? Math.round((sec / todayTotalSec) * 100) : 0,
        };
      })
      .sort((a, b) => b.sec - a.sec);
  }, [todaySessions, todayTotalSec]);

  // ── 타임라인 (오늘 24시간) ──
  const timeline = useMemo(() => {
    const hours = new Array(24).fill(0);
    todaySessions.forEach(s => {
      if (!s.startedAt) return;
      const startH = new Date(s.startedAt).getHours();
      hours[startH] += s.durationSec || 0;
    });
    return hours;
  }, [todaySessions]);
  const timelineMax = Math.max(...timeline, 1800);

  // ── D-Day 목록 ──
  const primaryDD = app.ddays.find(d => d.isPrimary);

  return (
    <View style={[styles.container, { backgroundColor: T.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: T.text }]}>📊 통계</Text>
          <View style={[styles.tabRow, { backgroundColor: T.surface2 }]}>
            {['daily', 'weekly'].map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.tabBtn, tab === t && { backgroundColor: T.card }]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabText, { color: tab === t ? T.text : T.sub }]}>
                  {t === 'daily' ? '일간' : '주간'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 요약 카드 */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[styles.summaryLabel, { color: T.sub }]}>
              {tab === 'daily' ? '오늘' : '이번 주'}
            </Text>
            <Text style={[styles.summaryValue, { color: T.accent }]}>
              {formatDuration(tab === 'daily' ? todayTotalSec : weekTotal)}
            </Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[styles.summaryLabel, { color: T.sub }]}>세션</Text>
            <Text style={[styles.summaryValue, { color: T.text }]}>
              {tab === 'daily' ? todaySessions.length : weekData.reduce((s, d) => s + d.sessions, 0)}회
            </Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[styles.summaryLabel, { color: T.sub }]}>연속</Text>
            <Text style={[styles.summaryValue, { color: T.gold }]}>
              🔥{app.settings.streak}일
            </Text>
          </View>
        </View>

        {/* 밀도 티어 (일간) */}
        {tab === 'daily' && todaySessions.length > 0 && (
          <View style={[styles.tierCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[styles.sectionLabel, { color: T.sub }]}>오늘 평균 집중 밀도</Text>
            <View style={styles.tierRow}>
              <View style={[styles.tierBig, { backgroundColor: todayTier.color + '20' }]}>
                <Text style={[styles.tierBigText, { color: todayTier.color }]}>
                  {todayTier.label}
                </Text>
              </View>
              <View>
                <Text style={[styles.tierScore, { color: T.text }]}>{todayAvgDensity}점</Text>
                <Text style={[styles.tierMsg, { color: todayTier.color }]}>
                  {todayTier.message}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 7일 막대 차트 */}
        {tab === 'weekly' && (
          <View style={[styles.chartCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[styles.sectionLabel, { color: T.sub }]}>7일간 공부량</Text>
            {weekData.map((d, i) => (
              <View key={i} style={styles.barRow}>
                <Text style={[
                  styles.barDay,
                  { color: d.isToday ? T.accent : T.sub },
                ]}>
                  {d.day}
                </Text>
                <View style={[styles.barTrack, { backgroundColor: T.surface2 }]}>
                  <View style={[
                    styles.barFill,
                    {
                      width: `${Math.max(1, (d.sec / weekMax) * 100)}%`,
                      backgroundColor: d.isToday ? T.accent : T.purple,
                    },
                  ]} />
                </View>
                <Text style={[
                  styles.barTime,
                  { color: d.sec > 0 ? T.text : T.sub },
                ]}>
                  {d.sec > 0 ? formatShort(d.sec) : '-'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* 밀도 추이 (주간) */}
        {tab === 'weekly' && (
          <View style={[styles.chartCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[styles.sectionLabel, { color: T.sub }]}>집중 밀도 추이</Text>
            <View style={styles.densityChart}>
              {weekData.map((d, i) => {
                const h = d.density > 0 ? Math.max(8, (d.density / 120) * 60) : 4;
                const tier = d.density > 0 ? getTier(d.density) : null;
                return (
                  <View key={i} style={styles.densityCol}>
                    <View style={[
                      styles.densityBar,
                      {
                        height: h,
                        backgroundColor: tier ? tier.color : T.surface2,
                        borderRadius: 3,
                      },
                    ]} />
                    <Text style={[styles.densityDay, { color: d.isToday ? T.accent : T.sub }]}>
                      {d.day}
                    </Text>
                    {tier && (
                      <Text style={[styles.densityTier, { color: tier.color }]}>
                        {tier.label}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* 타임라인 (일간) */}
        {tab === 'daily' && todaySessions.length > 0 && (
          <View style={[styles.chartCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[styles.sectionLabel, { color: T.sub }]}>오늘 타임라인</Text>
            <View style={styles.timelineRow}>
              {timeline.map((sec, h) => {
                const height = sec > 0 ? Math.max(4, (sec / timelineMax) * 36) : 2;
                return (
                  <View key={h} style={styles.timelineCol}>
                    <View style={[
                      styles.timelineBar,
                      {
                        height,
                        backgroundColor: sec > 0 ? T.accent : T.surface2,
                      },
                    ]} />
                    {h % 3 === 0 && (
                      <Text style={[styles.timelineLabel, { color: T.sub }]}>{h}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* 과목 비율 (일간) */}
        {tab === 'daily' && subjectBreakdown.length > 0 && (
          <View style={[styles.chartCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[styles.sectionLabel, { color: T.sub }]}>과목 비율</Text>
            {/* 가로 스택 바 */}
            <View style={[styles.stackBar, { backgroundColor: T.surface2 }]}>
              {subjectBreakdown.map((s, i) => (
                <View
                  key={i}
                  style={[
                    styles.stackSegment,
                    {
                      width: `${Math.max(2, s.pct)}%`,
                      backgroundColor: s.color,
                    },
                  ]}
                />
              ))}
            </View>
            {subjectBreakdown.map((s, i) => (
              <View key={i} style={styles.subjRow}>
                <View style={[styles.subjDot, { backgroundColor: s.color }]} />
                <Text style={[styles.subjName, { color: T.text }]}>{s.name}</Text>
                <Text style={[styles.subjPct, { color: T.sub }]}>{s.pct}%</Text>
                <Text style={[styles.subjTime, { color: T.text }]}>{formatShort(s.sec)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* D-Day 목록 */}
        {app.ddays.length > 0 && (
          <View style={[styles.chartCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[styles.sectionLabel, { color: T.sub }]}>📅 D-Day</Text>
            {app.ddays.map(dd => (
              <View key={dd.id} style={styles.ddayRow}>
                <Text style={[styles.ddayStar, { color: dd.isPrimary ? T.gold : 'transparent' }]}>★</Text>
                <Text style={[styles.ddayLabel, { color: T.text }]}>{dd.label}</Text>
                <Text style={[styles.ddayDate, { color: T.sub }]}>{dd.date}</Text>
                <Text style={[
                  styles.ddayBadge,
                  { color: T.accent, backgroundColor: T.accentLight },
                ]}>
                  {formatDDay(dd.date)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* 캐릭터 인사이트 */}
        {todaySessions.length > 0 && (
          <View style={[styles.insightCard, {
            backgroundColor: CHARACTERS[app.settings.mainCharacter]?.bgColor || T.surface,
            borderColor: T.border,
          }]}>
            <CharacterAvatar
              characterId={app.settings.mainCharacter}
              size={40}
              mood={app.mood}
            />
            <Text style={[styles.insightText, { color: T.text }]}>
              {getInsightMessage(todayTotalSec, todayAvgDensity, app.settings.streak)}
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

// 성취도 기반 인사이트 메시지 (제미나이 제안 반영)
function getInsightMessage(totalSec, density, streak) {
  const hours = totalSec / 3600;
  if (density >= 95 && hours >= 3) return '너... 혹시 천재야? 곰인 내가 봐도 무서워! 🐻👑';
  if (density >= 90) return '완벽한 집중이었어! 이 조자만 유지하면 무적이야 💪';
  if (streak >= 7) return `${streak}일 연속! 대단해, 습관이 완성되고 있어 🔥`;
  if (hours >= 5) return '오늘 5시간 넘겼어! 충분히 쉬면서 내일도 화이팅 💕';
  if (hours >= 3) return '좋은 하루였어! 내일은 밀도를 조금 더 올려볼까? ✨';
  if (density < 60 && hours > 1) return '오늘은 좀 힘들었지? 괜찮아, 내일은 10분만 더 집중해보자 💧';
  if (hours < 1) return '시작한 것만으로도 대단해! 내일은 조금 더 해볼까? 💕';
  return '오늘도 수고했어! 내일도 함께하자 💕';
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: '900' },
  tabRow: { flexDirection: 'row', borderRadius: 8, padding: 2, gap: 2 },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 },
  tabText: { fontSize: 11, fontWeight: '700' },

  summaryRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  summaryCard: { flex: 1, borderRadius: 12, padding: 10, borderWidth: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 9, fontWeight: '600' },
  summaryValue: { fontSize: 16, fontWeight: '900', marginTop: 2 },

  tierCard: { borderRadius: 14, padding: 12, borderWidth: 1, marginBottom: 8 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  tierBig: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tierBigText: { fontSize: 22, fontWeight: '900' },
  tierScore: { fontSize: 16, fontWeight: '800' },
  tierMsg: { fontSize: 11, fontWeight: '600', marginTop: 1 },

  chartCard: { borderRadius: 14, padding: 12, borderWidth: 1, marginBottom: 8 },
  sectionLabel: { fontSize: 10, fontWeight: '700', marginBottom: 8 },

  // 7일 막대
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, gap: 6 },
  barDay: { width: 14, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  barTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barTime: { width: 35, fontSize: 10, fontWeight: '600', textAlign: 'right' },

  // 밀도 추이
  densityChart: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 80 },
  densityCol: { alignItems: 'center', gap: 3 },
  densityBar: { width: 16 },
  densityDay: { fontSize: 9, fontWeight: '700' },
  densityTier: { fontSize: 8, fontWeight: '800' },

  // 타임라인
  timelineRow: { flexDirection: 'row', alignItems: 'flex-end', height: 50, gap: 1 },
  timelineCol: { flex: 1, alignItems: 'center' },
  timelineBar: { width: '100%', borderRadius: 1, minWidth: 2 },
  timelineLabel: { fontSize: 7, marginTop: 2 },

  // 과목 비율
  stackBar: { height: 8, borderRadius: 4, flexDirection: 'row', overflow: 'hidden', marginBottom: 8 },
  stackSegment: { height: '100%' },
  subjRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  subjDot: { width: 8, height: 8, borderRadius: 4 },
  subjName: { flex: 1, fontSize: 11, fontWeight: '600' },
  subjPct: { fontSize: 10 },
  subjTime: { fontSize: 10, fontWeight: '700', width: 35, textAlign: 'right' },

  // D-Day
  ddayRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  ddayStar: { fontSize: 12 },
  ddayLabel: { flex: 1, fontSize: 12, fontWeight: '700' },
  ddayDate: { fontSize: 10 },
  ddayBadge: { fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },

  // 인사이트
  insightCard: { borderRadius: 14, padding: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  insightText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
});
