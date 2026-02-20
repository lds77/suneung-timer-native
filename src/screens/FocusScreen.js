// src/screens/FocusScreen.js
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, StyleSheet, Dimensions } from 'react-native';
import { useApp } from '../hooks/useAppState';
import { LIGHT, DARK } from '../constants/colors';
import { formatTime, formatDuration, formatDDay } from '../utils/format';
import Stepper from '../components/Stepper';
import CharacterAvatar from '../components/CharacterAvatar';

const SW = Dimensions.get('window').width;
const GAP = 8;
const CARD_W = (SW - 32 - GAP) / 2;

export default function FocusScreen() {
  const app = useApp();
  const T = app.settings.darkMode ? DARK : LIGHT;
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState('free');
  const [addMin, setAddMin] = useState(25);
  const [addSubject, setAddSubject] = useState(null);
  const [addPomoWork, setAddPomoWork] = useState(app.settings.pomodoroWorkMin || 25);
  const [addPomoBreak, setAddPomoBreak] = useState(app.settings.pomodoroBreakMin || 5);
  const [newTodo, setNewTodo] = useState('');

  const primaryDD = app.ddays.find(d => d.isPrimary);
  const activeTimers = app.timers.filter(t => t.status === 'running' || t.status === 'paused');
  const completedTimers = app.timers.filter(t => t.status === 'completed');
  const maxRunning = activeTimers.length > 0 ? Math.max(...activeTimers.map(t => t.elapsedSec)) : 0;
  const realToday = app.todayTotalSec + maxRunning;
  const goalPct = Math.min(100, Math.round((realToday / (app.settings.dailyGoalMin * 60)) * 100));

  const recommendation = (() => {
    if (app.subjects.length === 0) return null;
    const map = {};
    app.todaySessions.forEach(s => { if (s.subjectId) map[s.subjectId] = (map[s.subjectId] || 0) + s.durationSec; });
    let min = null, minSec = Infinity;
    app.subjects.forEach(s => { const sec = map[s.id] || 0; if (sec < minSec) { minSec = sec; min = s; } });
    return min;
  })();

  const handleAddTimer = () => {
    const subj = addSubject ? app.subjects.find(s => s.id === addSubject) : null;
    const label = subj ? subj.name : (addType === 'countdown' ? `${addMin}분` : addType === 'pomodoro' ? `뽀모 ${addPomoWork}+${addPomoBreak}` : '자유');
    app.addTimer({ type: addType, label, subjectId: addSubject, color: subj ? subj.color : '#FF6B9D', totalSec: addType === 'countdown' ? addMin * 60 : 0, pomoWorkMin: addPomoWork, pomoBreakMin: addPomoBreak });
    setShowAdd(false);
  };

  const quickStart = (type, min, subjId) => {
    const subj = subjId ? app.subjects.find(s => s.id === subjId) : null;
    app.addTimer({ type, label: subj ? subj.name : (type === 'countdown' ? `${min}분` : '자유'), subjectId: subjId, color: subj ? subj.color : '#FF6B9D', totalSec: type === 'countdown' ? min * 60 : 0, pomoWorkMin: app.settings.pomodoroWorkMin, pomoBreakMin: app.settings.pomodoroBreakMin });
  };

  const getDisplay = (t) => {
    if (t.type === 'free') return t.elapsedSec;
    if (t.type === 'countdown') return Math.max(0, t.totalSec - t.elapsedSec);
    return Math.max(0, (t.pomoPhase === 'work' ? t.pomoWorkMin * 60 : t.pomoBreakMin * 60) - t.elapsedSec);
  };

  const getProgress = (t) => {
    if (t.type === 'free') return Math.min(100, (t.elapsedSec / 3600) * 100);
    if (t.type === 'countdown') return (t.elapsedSec / Math.max(1, t.totalSec)) * 100;
    return (t.elapsedSec / Math.max(1, (t.pomoPhase === 'work' ? t.pomoWorkMin * 60 : t.pomoBreakMin * 60))) * 100;
  };

  const renderTimerCard = (t, isSingle) => {
    const isActive = t.status === 'running';
    const isPaused = t.status === 'paused';
    const isCompleted = t.status === 'completed';
    const icon = t.type === 'pomodoro' ? (t.pomoPhase === 'work' ? '🍅' : '☕') : t.type === 'countdown' ? '⏰' : '⏱';
    const display = isCompleted ? 0 : getDisplay(t);
    const progress = isCompleted ? 100 : getProgress(t);

    return (
      <View key={t.id} style={[styles.tc, {
        backgroundColor: isCompleted ? (t.result?.tier?.color || T.accent) + '10' : T.card,
        borderColor: isCompleted ? (t.result?.tier?.color || T.accent) + '60' : isActive ? t.color : T.border,
        borderWidth: isActive ? 1.5 : 1,
        width: isSingle ? '100%' : CARD_W,
      }]}>
        {/* 헤더 */}
        <View style={styles.tcTop}>
          <Text style={styles.tcIcon}>{icon}</Text>
          <Text style={[styles.tcLabel, { color: T.text }]} numberOfLines={1}>{t.label}</Text>
          <TouchableOpacity onPress={() => app.removeTimer(t.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.tcClose, { color: T.sub }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* 뽀모 페이즈 */}
        {t.type === 'pomodoro' && !isCompleted && (
          <Text style={[styles.tcPhase, { color: t.pomoPhase === 'work' ? t.color : T.green }]}>
            {t.pomoPhase === 'work' ? `집중 · ${t.pomoSet + 1}세트` : '휴식'}
          </Text>
        )}

        {/* 완료 결과 카드 */}
        {isCompleted ? (
          <View style={styles.resultArea}>
            <Text style={[styles.resultEmoji]}>🎉</Text>
            {t.result?.tier && (
              <View style={[styles.resultTier, { backgroundColor: t.result.tier.color + '20' }]}>
                <Text style={[styles.resultTierText, { color: t.result.tier.color }]}>
                  {t.result.tier.label}
                </Text>
              </View>
            )}
            <Text style={[styles.resultDensity, { color: T.text }]}>
              밀도 {t.result?.density || 0}점
            </Text>
            <Text style={[styles.resultTime, { color: T.sub }]}>
              {formatDuration(t.type === 'countdown' ? t.totalSec : t.elapsedSec)}
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.tcTime, {
              color: isActive ? t.color : T.sub,
              fontSize: isSingle ? 38 : 26,
            }]}>{formatTime(display)}</Text>
            {t.type !== 'free' && <Text style={[styles.tcElapsed, { color: T.sub }]}>{formatTime(t.elapsedSec)}</Text>}
            <View style={[styles.tcTrack, { backgroundColor: T.surface2 }]}>
              <View style={[styles.tcFill, { width: `${Math.min(100, progress)}%`, backgroundColor: isPaused ? T.sub : t.color }]} />
            </View>
          </>
        )}

        {/* 컨트롤 버튼 */}
        <View style={styles.tcControls}>
          {isActive && (
            <>
              <TouchableOpacity style={[styles.tcBtn, { backgroundColor: T.surface2 }]} onPress={() => app.resetTimer(t.id)}>
                <Text style={[styles.tcBtnText, { color: T.text }]}>↺</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tcBtn, { backgroundColor: '#E8404720', flex: 2 }]} onPress={() => app.pauseTimer(t.id)}>
                <Text style={[styles.tcBtnText, { color: '#E84047' }]}>⏸</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tcBtn, { backgroundColor: T.surface2 }]} onPress={() => app.stopTimer(t.id)}>
                <Text style={[styles.tcBtnText, { color: T.sub }]}>■</Text>
              </TouchableOpacity>
            </>
          )}
          {isPaused && (
            <>
              <TouchableOpacity style={[styles.tcBtn, { backgroundColor: T.surface2 }]} onPress={() => app.resetTimer(t.id)}>
                <Text style={[styles.tcBtnText, { color: T.text }]}>↺</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tcBtn, { backgroundColor: t.color, flex: 2 }]} onPress={() => app.resumeTimer(t.id)}>
                <Text style={styles.tcBtnText}>▶</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tcBtn, { backgroundColor: T.surface2 }]} onPress={() => app.stopTimer(t.id)}>
                <Text style={[styles.tcBtnText, { color: T.sub }]}>■</Text>
              </TouchableOpacity>
            </>
          )}
          {isCompleted && (
            <>
              <TouchableOpacity style={[styles.tcBtn, { backgroundColor: t.color, flex: 1 }]} onPress={() => app.restartTimer(t.id)}>
                <Text style={styles.tcBtnText}>▶ 다시</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tcBtn, { backgroundColor: T.surface2 }]} onPress={() => app.removeTimer(t.id)}>
                <Text style={[styles.tcBtnText, { color: T.sub }]}>삭제</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  const allTimers = [...activeTimers, ...completedTimers];

  return (
    <View style={[styles.container, { backgroundColor: T.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* 헤더 */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <CharacterAvatar characterId={app.settings.mainCharacter} size={36} mood={app.mood} />
            <View style={{ marginLeft: 8 }}>
              <Text style={[styles.title, { color: T.text }]}>열공 멀티타이머</Text>
              <Text style={[styles.headerSub, { color: T.sub }]}>
                {primaryDD ? `${primaryDD.label} ${formatDDay(primaryDD.date)}` : ''}
                {app.settings.streak > 0 ? ` · 🔥${app.settings.streak}일` : ''}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.darkBtn, { borderColor: T.border, backgroundColor: T.card }]}
            onPress={() => app.updateSettings({ darkMode: !app.settings.darkMode })}>
            <Text>{app.settings.darkMode ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
        </View>

        {/* 진행률 */}
        <View style={[styles.progressCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={styles.progressRow}>
            <Text style={[styles.progressLabel, { color: T.sub }]}>오늘 공부</Text>
            <Text style={[styles.progressValue, { color: T.accent }]}>{formatDuration(realToday)}</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: T.surface2 }]}>
            <View style={[styles.progressFill, { width: `${goalPct}%`, backgroundColor: goalPct >= 100 ? T.gold : T.accent }]} />
          </View>
        </View>

        {/* 빠른 시작 */}
        <View style={[styles.addSection, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={styles.addHeader}>
            <Text style={[styles.sectionTitle, { color: T.text }]}>⚡ 빠른 시작</Text>
            <TouchableOpacity style={[styles.customBtn, { backgroundColor: T.accent }]} onPress={() => setShowAdd(true)}>
              <Text style={styles.customBtnText}>+ 커스텀</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.quickRow}>
            <TouchableOpacity style={[styles.qb, { backgroundColor: T.accentLight, borderColor: T.accent + '30' }]} onPress={() => { app.addTimer({ type: 'countdown', label: '5분만!', color: '#FF6B9D', totalSec: 300 }); app.showToastCustom('5분만! 💕', 'toru'); }}>
              <Text style={[styles.qbT, { color: T.accent }]}>🐻 5분</Text>
            </TouchableOpacity>
            {[{ m: 25, c: '#00B894' }, { m: 60, c: '#6C5CE7' }, { m: 120, c: '#E17055' }].map(x => (
              <TouchableOpacity key={x.m} style={[styles.qb, { backgroundColor: x.c + '18', borderColor: x.c + '40' }]} onPress={() => quickStart('countdown', x.m, null)}>
                <Text style={[styles.qbT, { color: x.c }]}>⏰ {x.m >= 60 ? `${x.m / 60}시간` : `${x.m}분`}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {app.subjects.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
              <View style={styles.subjRow}>
                {app.subjects.map(s => (
                  <TouchableOpacity key={s.id} style={[styles.sjb, { backgroundColor: s.color + '18', borderColor: s.color + '40' }]} onPress={() => quickStart('free', 0, s.id)}>
                    <Text style={[styles.sjbT, { color: s.color }]}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}
        </View>

        {/* 추천 */}
        {recommendation && allTimers.length === 0 && (
          <TouchableOpacity style={[styles.recCard, { backgroundColor: T.surface, borderColor: T.border }]} onPress={() => quickStart('free', 0, recommendation.id)}>
            <CharacterAvatar characterId={recommendation.character || 'toru'} size={22} />
            <Text style={[styles.recText, { color: T.text }]}><Text style={{ fontWeight: '800', color: recommendation.color }}>{recommendation.name}</Text> 시작하기</Text>
          </TouchableOpacity>
        )}

        {/* 타이머 그리드 */}
        {allTimers.length > 0 && (
          <View style={styles.timerSection}>
            <Text style={[styles.sectionTitle, { color: T.sub, marginBottom: 6 }]}>
              타이머 ({activeTimers.length}실행{completedTimers.length > 0 ? ` · ${completedTimers.length}완료` : ''})
            </Text>
            <View style={styles.timerGrid}>
              {allTimers.map(t => renderTimerCard(t, allTimers.length === 1))}
            </View>
          </View>
        )}

        {/* 화이트노이즈 */}
        <View style={[styles.noiseCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <Text style={[styles.noiseLabel, { color: T.sub }]}>🎧 배경음</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.noiseRow}>
              {[{ id: 'none', i: '🔇', n: '끄기' }, { id: 'rain', i: '🌧️', n: '빗소리' }, { id: 'cafe', i: '☕', n: '카페' }, { id: 'fire', i: '🔥', n: '모닥불' }, { id: 'wave', i: '🌊', n: '파도' }, { id: 'forest', i: '🌲', n: '숲속' }].map(s => (
                <TouchableOpacity key={s.id} style={[styles.nb, { borderColor: app.settings.soundId === s.id ? T.accent : T.border, backgroundColor: app.settings.soundId === s.id ? T.accent : T.card }]} onPress={() => app.updateSettings({ soundId: s.id })}>
                  <Text style={[styles.nbT, { color: app.settings.soundId === s.id ? 'white' : T.text }]}>{s.i} {s.n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* 할 일 */}
        <View style={[styles.todoCard, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={styles.todoHeader}>
            <Text style={[styles.todoTitle, { color: T.text }]}>📝 할 일</Text>
            <Text style={[styles.todoCount, { color: T.sub }]}>{app.todos.filter(x => x.done).length}/{app.todos.length}</Text>
          </View>
          <TextInput value={newTodo} onChangeText={setNewTodo} onSubmitEditing={() => { if (newTodo.trim()) { app.addTodo(newTodo.trim()); setNewTodo(''); } }}
            placeholder="할 일 추가" placeholderTextColor={T.sub} returnKeyType="done"
            style={[styles.todoInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text }]} />
          {app.todos.map(t => (
            <View key={t.id} style={styles.todoItem}>
              <TouchableOpacity onPress={() => app.toggleTodo(t.id)} style={[styles.todoCk, { borderColor: t.done ? T.accent : T.border, backgroundColor: t.done ? T.accent : 'transparent' }]}>
                {t.done && <Text style={styles.todoCkM}>✓</Text>}
              </TouchableOpacity>
              <Text style={[styles.todoText, { color: t.done ? T.sub : T.text }, t.done && { textDecorationLine: 'line-through' }]} numberOfLines={1}>{t.text}</Text>
              <TouchableOpacity onPress={() => app.removeTodo(t.id)}><Text style={[styles.todoDel, { color: T.sub }]}>×</Text></TouchableOpacity>
            </View>
          ))}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* 커스텀 모달 */}
      <Modal visible={showAdd} transparent animationType="fade">
        <View style={styles.mo}>
          <ScrollView contentContainerStyle={styles.moScroll}>
            <View style={[styles.modal, { backgroundColor: T.card, borderColor: T.border }]}>
              <Text style={[styles.modalTitle, { color: T.text }]}>커스텀 타이머</Text>
              <View style={[styles.typeRow, { backgroundColor: T.surface2 }]}>
                {[{ id: 'free', l: '자유 ⏱' }, { id: 'countdown', l: '타임어택 ⏰' }, { id: 'pomodoro', l: '뽀모도로 🍅' }].map(m => (
                  <TouchableOpacity key={m.id} style={[styles.typeBtn, addType === m.id && { backgroundColor: T.card }]} onPress={() => setAddType(m.id)}>
                    <Text style={[styles.typeBtnT, { color: addType === m.id ? T.text : T.sub }]}>{m.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {addType === 'countdown' && (
                <View style={styles.ms}>
                  <Text style={[styles.ml, { color: T.sub }]}>시간 설정</Text>
                  <Stepper value={addMin} onChange={setAddMin} min={1} max={300} step={5} unit="분" colors={T} />
                  <View style={styles.presetRow}>
                    {[5, 10, 15, 25, 30, 45, 60, 90, 120].map(m => (
                      <TouchableOpacity key={m} style={[styles.pc, { borderColor: addMin === m ? T.accent : T.border, backgroundColor: addMin === m ? T.accent : 'transparent' }]} onPress={() => setAddMin(m)}>
                        <Text style={[styles.pcT, { color: addMin === m ? 'white' : T.sub }]}>{m}분</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              {addType === 'pomodoro' && (
                <View style={styles.ms}>
                  <Text style={[styles.ml, { color: T.sub }]}>🍅 집중 시간</Text>
                  <Stepper value={addPomoWork} onChange={setAddPomoWork} min={5} max={90} step={5} unit="분" colors={T} />
                  <View style={{ height: 12 }} />
                  <Text style={[styles.ml, { color: T.sub }]}>☕ 휴식 시간</Text>
                  <Stepper value={addPomoBreak} onChange={setAddPomoBreak} min={1} max={30} step={1} unit="분" colors={T} />
                  <Text style={[styles.pomoInfo, { color: T.sub }]}>{addPomoWork}분 집중 → {addPomoBreak}분 휴식 (4세트마다 긴 휴식)</Text>
                </View>
              )}
              {app.subjects.length > 0 && (
                <View style={styles.ms}>
                  <Text style={[styles.ml, { color: T.sub }]}>과목 (선택)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      <TouchableOpacity style={[styles.ssb, { borderColor: !addSubject ? T.accent : T.border, backgroundColor: !addSubject ? T.accentLight : 'transparent' }]} onPress={() => setAddSubject(null)}>
                        <Text style={[styles.ssbT, { color: !addSubject ? T.accent : T.sub }]}>없음</Text>
                      </TouchableOpacity>
                      {app.subjects.map(s => (
                        <TouchableOpacity key={s.id} style={[styles.ssb, { borderColor: addSubject === s.id ? s.color : T.border, backgroundColor: addSubject === s.id ? s.color + '18' : 'transparent' }]} onPress={() => setAddSubject(s.id)}>
                          <Text style={[styles.ssbT, { color: addSubject === s.id ? s.color : T.sub }]}>{s.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}
              <View style={styles.mBtns}>
                <TouchableOpacity style={[styles.mCancel, { borderColor: T.border }]} onPress={() => setShowAdd(false)}>
                  <Text style={[styles.mCancelT, { color: T.sub }]}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.mConfirm, { backgroundColor: T.accent }]} onPress={handleAddTimer}>
                  <Text style={styles.mConfirmT}>▶ 시작</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, scroll: { paddingHorizontal: 16, paddingTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '800' }, headerSub: { fontSize: 9, marginTop: 1 },
  darkBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  progressCard: { borderRadius: 12, padding: 10, borderWidth: 1, marginBottom: 8 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  progressLabel: { fontSize: 10, fontWeight: '600' }, progressValue: { fontSize: 15, fontWeight: '900' },
  progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  addSection: { borderRadius: 14, padding: 10, borderWidth: 1, marginBottom: 8 },
  addHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '800' },
  customBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  customBtnText: { color: 'white', fontSize: 10, fontWeight: '800' },
  quickRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  qb: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  qbT: { fontSize: 10, fontWeight: '700' },
  subjRow: { flexDirection: 'row', gap: 5 },
  sjb: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  sjbT: { fontSize: 10, fontWeight: '700' },
  recCard: { borderRadius: 10, padding: 8, borderWidth: 1, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  recText: { fontSize: 11, fontWeight: '600' },
  timerSection: { marginBottom: 8 },
  timerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },

  // 타이머 카드
  tc: { borderRadius: 12, padding: 10 },
  tcTop: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  tcIcon: { fontSize: 12 }, tcLabel: { flex: 1, fontSize: 10, fontWeight: '700' },
  tcClose: { fontSize: 13, fontWeight: '600' },
  tcPhase: { fontSize: 8, fontWeight: '700', marginBottom: 1 },
  tcTime: { fontWeight: '900', fontVariant: ['tabular-nums'], textAlign: 'center', marginVertical: 3 },
  tcElapsed: { fontSize: 8, textAlign: 'center', marginBottom: 2 },
  tcTrack: { height: 3, borderRadius: 2, overflow: 'hidden', marginBottom: 5 },
  tcFill: { height: '100%', borderRadius: 2 },
  tcControls: { flexDirection: 'row', gap: 4 },
  tcBtn: { flex: 1, paddingVertical: 6, borderRadius: 7, alignItems: 'center' },
  tcBtnText: { color: 'white', fontSize: 11, fontWeight: '800' },

  // 결과 카드
  resultArea: { alignItems: 'center', paddingVertical: 4 },
  resultEmoji: { fontSize: 20, marginBottom: 2 },
  resultTier: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, marginBottom: 2 },
  resultTierText: { fontSize: 16, fontWeight: '900' },
  resultDensity: { fontSize: 11, fontWeight: '700' },
  resultTime: { fontSize: 9, marginTop: 1 },

  // 노이즈
  noiseCard: { borderRadius: 12, padding: 8, borderWidth: 1, marginBottom: 8 },
  noiseLabel: { fontSize: 9, fontWeight: '700', marginBottom: 4 },
  noiseRow: { flexDirection: 'row', gap: 4 },
  nb: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  nbT: { fontSize: 9, fontWeight: '600' },

  // 할 일
  todoCard: { borderRadius: 12, padding: 10, borderWidth: 1 },
  todoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  todoTitle: { fontSize: 12, fontWeight: '700' }, todoCount: { fontSize: 9 },
  todoInput: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, fontSize: 11, marginBottom: 4 },
  todoItem: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3 },
  todoCk: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  todoCkM: { color: 'white', fontSize: 10, fontWeight: '800' },
  todoText: { flex: 1, fontSize: 11 }, todoDel: { fontSize: 14, paddingHorizontal: 3 },

  // 모달
  mo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  moScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  modal: { borderRadius: 20, padding: 18, borderWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 12 },
  ms: { marginBottom: 14 }, ml: { fontSize: 10, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  typeRow: { flexDirection: 'row', borderRadius: 10, padding: 2, gap: 2, marginBottom: 14 },
  typeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  typeBtnT: { fontSize: 10, fontWeight: '700' },
  pomoInfo: { fontSize: 9, textAlign: 'center', marginTop: 8, lineHeight: 14 },
  presetRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 },
  pc: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  pcT: { fontSize: 9, fontWeight: '700' },
  ssb: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  ssbT: { fontSize: 10, fontWeight: '600' },
  mBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  mCancel: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  mCancelT: { fontSize: 13, fontWeight: '600' },
  mConfirm: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  mConfirmT: { color: 'white', fontSize: 13, fontWeight: '800' },
});
