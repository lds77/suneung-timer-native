// src/screens/SubjectsScreen.js
// 탭 2: 과목 (자유공부 + 시험연습)

import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, StyleSheet } from 'react-native';
import { useApp } from '../hooks/useAppState';
import { LIGHT, DARK, SUBJECT_COLORS } from '../constants/colors';
import { SUBJECT_PRESETS } from '../constants/presets';
import { CHARACTERS, CHARACTER_LIST } from '../constants/characters';
import { formatShort } from '../utils/format';
import { getTier } from '../constants/presets';
import Stepper from '../components/Stepper';
import CharacterAvatar from '../components/CharacterAvatar';

// 시험 프리셋
const EXAM_PRESETS = {
  middle: {
    label: '중학교 내신',
    emoji: '🏫',
    defaultMin: 45,
    subjects: [
      { name: '국어', min: 45, color: '#E8575A' },
      { name: '수학', min: 45, color: '#4A90D9' },
      { name: '영어', min: 45, color: '#5CB85C' },
      { name: '과학', min: 45, color: '#F5A623' },
      { name: '사회', min: 45, color: '#9B6FC3' },
      { name: '역사', min: 45, color: '#E17055' },
    ],
  },
  high: {
    label: '고등학교 내신',
    emoji: '🎓',
    defaultMin: 50,
    subjects: [
      { name: '국어', min: 50, color: '#E8575A' },
      { name: '수학', min: 70, color: '#4A90D9' },
      { name: '영어', min: 50, color: '#5CB85C' },
      { name: '과학', min: 50, color: '#F5A623' },
      { name: '사회', min: 50, color: '#9B6FC3' },
      { name: '한국사', min: 50, color: '#E17055' },
      { name: '제2외국어', min: 40, color: '#00B894' },
    ],
  },
};

export default function SubjectsScreen() {
  const app = useApp();
  const T = app.settings.darkMode ? DARK : LIGHT;
  const [mode, setMode] = useState('free'); // 'free' | 'exam'
  const [examType, setExamType] = useState('middle'); // 'middle' | 'high'
  const [examMin, setExamMin] = useState(45);
  const [breakMin, setBreakMin] = useState(10);

  // 과목 추가 모달
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addColor, setAddColor] = useState(SUBJECT_COLORS[0]);
  const [addChar, setAddChar] = useState('toru');

  const sorted = [...app.subjects].sort((a, b) => (b.totalElapsedSec || 0) - (a.totalElapsedSec || 0));

  const getDensity = (id) => {
    const s = app.todaySessions.filter(x => x.subjectId === id);
    if (!s.length) return null;
    return Math.round(s.reduce((a, x) => a + (x.focusDensity || 0), 0) / s.length);
  };

  const isRunning = (id) => app.timers.some(t => t.subjectId === id && t.status === 'running');

  const startSubject = (subj) => {
    app.addTimer({ type: 'free', label: subj.name, subjectId: subj.id, color: subj.color });
  };

  const handleAdd = () => {
    if (!addName.trim()) return;
    if (app.subjects.length >= 12) { app.showToastCustom('최대 12개!', 'paengi'); return; }
    app.addSubject({ name: addName.trim(), color: addColor, character: addChar });
    setAddName(''); setShowAdd(false);
  };

  const addPreset = (p) => {
    if (app.subjects.some(s => s.name === p.name)) return;
    app.addSubject({ name: p.name, color: p.color, character: p.character || 'toru' });
  };

  // 시험 과목 시작
  const startExamSubject = (subj) => {
    app.addTimer({
      type: 'countdown',
      label: `${EXAM_PRESETS[examType].emoji} ${subj.name}`,
      color: subj.color,
      totalSec: subj.min * 60,
    });
    app.showToastCustom(`${subj.name} 시험 시작! ${subj.min}분 ⏰`, 'paengi');
  };

  // 연속 시험 시작 (선택된 과목들 순차)
  const [selectedExamSubjs, setSelectedExamSubjs] = useState([]);

  const toggleExamSubj = (name) => {
    setSelectedExamSubjs(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const startExamSequence = () => {
    if (selectedExamSubjs.length === 0) { app.showToastCustom('과목을 선택해주세요!', 'paengi'); return; }
    const preset = EXAM_PRESETS[examType];
    selectedExamSubjs.forEach((name, i) => {
      const subj = preset.subjects.find(s => s.name === name);
      if (subj) {
        // 각 과목을 개별 카운트다운 타이머로 추가
        app.addTimer({
          type: 'countdown',
          label: `${preset.emoji} ${subj.name}`,
          color: subj.color,
          totalSec: subj.min * 60,
        });
      }
    });
    app.showToastCustom(`${selectedExamSubjs.length}과목 시험 시작!`, 'taco');
    setSelectedExamSubjs([]);
  };

  return (
    <View style={[styles.container, { backgroundColor: T.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: T.text }]}>📚 과목</Text>
          {mode === 'free' && (
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: T.accent }]} onPress={() => setShowAdd(true)}>
              <Text style={styles.addBtnText}>+ 추가</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 모드 전환 */}
        <View style={[styles.modeRow, { backgroundColor: T.surface2 }]}>
          <TouchableOpacity style={[styles.modeBtn, mode === 'free' && { backgroundColor: T.card }]} onPress={() => setMode('free')}>
            <Text style={[styles.modeBtnT, { color: mode === 'free' ? T.text : T.sub }]}>📝 자유 공부</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modeBtn, mode === 'exam' && { backgroundColor: T.card }]} onPress={() => setMode('exam')}>
            <Text style={[styles.modeBtnT, { color: mode === 'exam' ? T.text : T.sub }]}>📋 시험 연습</Text>
          </TouchableOpacity>
        </View>

        {/* ═══ 자유 공부 모드 ═══ */}
        {mode === 'free' && (
          <>
            {app.subjects.length === 0 && (
              <View style={[styles.emptyCard, { backgroundColor: T.card, borderColor: T.border }]}>
                <CharacterAvatar characterId="paengi" size={50} mood="sad" />
                <Text style={[styles.emptyText, { color: T.sub }]}>아래에서 과목을 추가하세요!</Text>
              </View>
            )}

            {sorted.map(subj => {
              const density = getDensity(subj.id);
              const tier = density !== null ? getTier(density) : null;
              const todaySec = app.todaySessions.filter(s => s.subjectId === subj.id).reduce((a, s) => a + (s.durationSec || 0), 0);
              const running = isRunning(subj.id);
              return (
                <TouchableOpacity key={subj.id} style={[styles.card, { backgroundColor: T.card, borderColor: running ? subj.color : T.border }]}
                  onLongPress={() => Alert.alert(`${subj.name} 삭제`, '삭제할까요?', [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => app.removeSubject(subj.id) }])}
                  activeOpacity={0.9}>
                  <View style={styles.cardTop}>
                    <CharacterAvatar characterId={subj.character || 'toru'} size={32} showBg />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[styles.cardName, { color: T.text }]}>{subj.name}</Text>
                        {running && <Text style={[styles.runBadge, { backgroundColor: subj.color }]}>실행중</Text>}
                      </View>
                      <Text style={[styles.cardSub, { color: T.sub }]}>
                        누적 {formatShort(subj.totalElapsedSec || 0)}{todaySec > 0 ? ` · 오늘 ${formatShort(todaySec)}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity style={[styles.startBtn, { backgroundColor: running ? T.surface2 : subj.color }]}
                      onPress={() => !running && startSubject(subj)} disabled={running}>
                      <Text style={[styles.startBtnT, running && { color: T.sub }]}>{running ? '실행중' : '▶'}</Text>
                    </TouchableOpacity>
                  </View>
                  {tier && (
                    <View style={styles.cardBottom}>
                      <View style={[styles.densityTrack, { backgroundColor: T.surface2 }]}>
                        <View style={[styles.densityFill, { width: `${Math.min(100, (todaySec / Math.max(1, (app.settings.dailyGoalMin * 60) / Math.max(1, app.subjects.length))) * 100)}%`, backgroundColor: subj.color }]} />
                      </View>
                      <View style={[styles.tierBadge, { backgroundColor: tier.color + '20' }]}>
                        <Text style={[styles.tierText, { color: tier.color }]}>{tier.label}</Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            {/* 프리셋 */}
            <View style={[styles.presetSection, { borderColor: T.border }]}>
              <Text style={[styles.presetTitle, { color: T.sub }]}>빠른 추가</Text>
              <View style={styles.presetRow}>
                {SUBJECT_PRESETS.map(p => {
                  const exists = app.subjects.some(s => s.name === p.name);
                  return (
                    <TouchableOpacity key={p.name} style={[styles.presetBtn, { borderColor: T.border, backgroundColor: exists ? T.surface2 : T.card }]}
                      onPress={() => addPreset(p)} disabled={exists}>
                      <View style={[styles.presetDot, { backgroundColor: p.color }]} />
                      <Text style={[styles.presetBtnT, { color: exists ? T.sub : T.text }]}>{p.name}</Text>
                      {exists && <Text style={{ color: T.sub, fontSize: 9 }}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {/* ═══ 시험 연습 모드 ═══ */}
        {mode === 'exam' && (
          <>
            {/* 학교급 선택 */}
            <View style={[styles.examTypeRow, { backgroundColor: T.surface2 }]}>
              <TouchableOpacity style={[styles.examTypeBtn, examType === 'middle' && { backgroundColor: T.card }]}
                onPress={() => { setExamType('middle'); setExamMin(45); setSelectedExamSubjs([]); }}>
                <Text style={[styles.examTypeBtnT, { color: examType === 'middle' ? T.text : T.sub }]}>🏫 중학교</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.examTypeBtn, examType === 'high' && { backgroundColor: T.card }]}
                onPress={() => { setExamType('high'); setExamMin(50); setSelectedExamSubjs([]); }}>
                <Text style={[styles.examTypeBtnT, { color: examType === 'high' ? T.text : T.sub }]}>🎓 고등학교</Text>
              </TouchableOpacity>
            </View>

            {/* 설명 */}
            <View style={[styles.examInfo, { backgroundColor: T.surface, borderColor: T.border }]}>
              <CharacterAvatar characterId="paengi" size={28} />
              <Text style={[styles.examInfoText, { color: T.text }]}>
                {examType === 'middle'
                  ? '중학교 내신 기본 45분\n과목별 시간 조절 가능!'
                  : '고등학교 내신\n과목별 시험 시간이 달라요'}
              </Text>
            </View>

            {/* 개별 과목 시작 */}
            <Text style={[styles.examSectionLabel, { color: T.sub }]}>과목별 시작 (탭하면 바로 시작)</Text>
            {EXAM_PRESETS[examType].subjects.map(subj => (
              <View key={subj.name} style={[styles.examCard, { backgroundColor: T.card, borderColor: T.border }]}>
                <View style={[styles.examDot, { backgroundColor: subj.color }]} />
                <Text style={[styles.examName, { color: T.text }]}>{subj.name}</Text>
                <Text style={[styles.examTime, { color: T.sub }]}>{subj.min}분</Text>
                <TouchableOpacity style={[styles.examStartBtn, { backgroundColor: subj.color }]}
                  onPress={() => startExamSubject(subj)}>
                  <Text style={styles.examStartBtnT}>▶</Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* 연속 시험 */}
            <View style={[styles.seqSection, { backgroundColor: T.card, borderColor: T.border }]}>
              <Text style={[styles.seqTitle, { color: T.text }]}>📋 연속 시험 모드</Text>
              <Text style={[styles.seqDesc, { color: T.sub }]}>과목을 선택하면 동시에 타이머가 시작돼요</Text>

              <View style={styles.seqGrid}>
                {EXAM_PRESETS[examType].subjects.map(subj => {
                  const sel = selectedExamSubjs.includes(subj.name);
                  return (
                    <TouchableOpacity key={subj.name}
                      style={[styles.seqChip, { borderColor: sel ? subj.color : T.border, backgroundColor: sel ? subj.color + '18' : 'transparent' }]}
                      onPress={() => toggleExamSubj(subj.name)}>
                      <Text style={[styles.seqChipT, { color: sel ? subj.color : T.sub }]}>
                        {sel ? '✓ ' : ''}{subj.name} ({subj.min}분)
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {selectedExamSubjs.length > 0 && (
                <TouchableOpacity style={[styles.seqStartBtn, { backgroundColor: T.accent }]} onPress={startExamSequence}>
                  <Text style={styles.seqStartBtnT}>
                    ▶ {selectedExamSubjs.length}과목 시험 시작
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* 과목 추가 모달 */}
      <Modal visible={showAdd} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[styles.modalTitle, { color: T.text }]}>과목 추가</Text>
            <TextInput value={addName} onChangeText={setAddName} placeholder="과목 이름" placeholderTextColor={T.sub} maxLength={10}
              style={[styles.modalInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text }]} autoFocus />
            <Text style={[styles.modalLabel, { color: T.sub }]}>색상</Text>
            <View style={styles.colorRow}>
              {SUBJECT_COLORS.map(c => (
                <TouchableOpacity key={c} style={[styles.colorBtn, { backgroundColor: c }, addColor === c && styles.colorBtnActive]} onPress={() => setAddColor(c)} />
              ))}
            </View>
            <Text style={[styles.modalLabel, { color: T.sub }]}>캐릭터</Text>
            <View style={styles.charRow}>
              {CHARACTER_LIST.map(cId => (
                <TouchableOpacity key={cId} style={[styles.charBtn, { borderColor: addChar === cId ? T.accent : T.border }]} onPress={() => setAddChar(cId)}>
                  <CharacterAvatar characterId={cId} size={30} />
                  <Text style={[styles.charBtnN, { color: addChar === cId ? T.accent : T.sub }]}>{CHARACTERS[cId].name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.mCancel, { borderColor: T.border }]} onPress={() => { setShowAdd(false); setAddName(''); }}>
                <Text style={[styles.mCancelT, { color: T.sub }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mConfirm, { backgroundColor: T.accent }]} onPress={handleAdd}>
                <Text style={styles.mConfirmT}>추가</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, scroll: { paddingHorizontal: 16, paddingTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: '900' },
  addBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10 },
  addBtnText: { color: 'white', fontSize: 12, fontWeight: '800' },

  // 모드
  modeRow: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3, marginBottom: 10 },
  modeBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  modeBtnT: { fontSize: 12, fontWeight: '700' },

  // 자유 공부
  emptyCard: { borderRadius: 16, padding: 24, borderWidth: 1, alignItems: 'center', marginBottom: 12 },
  emptyText: { textAlign: 'center', fontSize: 12, marginTop: 8 },
  card: { borderRadius: 12, padding: 10, borderWidth: 1.5, marginBottom: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 13, fontWeight: '800' },
  cardSub: { fontSize: 9, marginTop: 1 },
  runBadge: { fontSize: 7, color: 'white', fontWeight: '800', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, overflow: 'hidden' },
  startBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  startBtnT: { color: 'white', fontSize: 13, fontWeight: '800' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  densityTrack: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  densityFill: { height: '100%', borderRadius: 2 },
  tierBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  tierText: { fontSize: 8, fontWeight: '800' },
  presetSection: { marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  presetTitle: { fontSize: 10, fontWeight: '700', marginBottom: 6 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  presetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  presetDot: { width: 7, height: 7, borderRadius: 4 },
  presetBtnT: { fontSize: 10, fontWeight: '600' },

  // 시험 연습
  examTypeRow: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3, marginBottom: 10 },
  examTypeBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  examTypeBtnT: { fontSize: 12, fontWeight: '700' },
  examInfo: { borderRadius: 12, padding: 10, borderWidth: 1, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  examInfoText: { flex: 1, fontSize: 11, fontWeight: '600', lineHeight: 16 },
  examSectionLabel: { fontSize: 10, fontWeight: '700', marginBottom: 6 },
  examCard: { borderRadius: 10, padding: 10, borderWidth: 1, marginBottom: 5, flexDirection: 'row', alignItems: 'center', gap: 8 },
  examDot: { width: 10, height: 10, borderRadius: 5 },
  examName: { flex: 1, fontSize: 13, fontWeight: '700' },
  examTime: { fontSize: 11, fontWeight: '600' },
  examStartBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  examStartBtnT: { color: 'white', fontSize: 12, fontWeight: '800' },

  // 연속 시험
  seqSection: { borderRadius: 14, padding: 12, borderWidth: 1, marginTop: 10 },
  seqTitle: { fontSize: 13, fontWeight: '800', marginBottom: 3 },
  seqDesc: { fontSize: 9, marginBottom: 8 },
  seqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  seqChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  seqChipT: { fontSize: 10, fontWeight: '700' },
  seqStartBtn: { marginTop: 10, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  seqStartBtnT: { color: 'white', fontSize: 13, fontWeight: '800' },

  // 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 30 },
  modal: { borderRadius: 20, padding: 18, borderWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 14 },
  modalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },
  modalLabel: { fontSize: 10, fontWeight: '700', marginBottom: 5 },
  colorRow: { flexDirection: 'row', gap: 7, marginBottom: 10 },
  colorBtn: { width: 26, height: 26, borderRadius: 13 },
  colorBtnActive: { borderWidth: 3, borderColor: 'white', elevation: 4 },
  charRow: { flexDirection: 'row', gap: 5, marginBottom: 14 },
  charBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 10, borderWidth: 1.5 },
  charBtnN: { fontSize: 8, fontWeight: '700', marginTop: 2 },
  modalBtns: { flexDirection: 'row', gap: 8 },
  mCancel: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  mCancelT: { fontSize: 13, fontWeight: '600' },
  mConfirm: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  mConfirmT: { color: 'white', fontSize: 13, fontWeight: '800' },
});
