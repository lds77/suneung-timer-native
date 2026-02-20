// src/screens/SettingsScreen.js
// 탭 4: 설정

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Switch, Modal, Alert, StyleSheet, Platform,
} from 'react-native';
import { useApp } from '../hooks/useAppState';
import { LIGHT, DARK } from '../constants/colors';
import { CHARACTERS, CHARACTER_LIST } from '../constants/characters';
import { DAILY_GOAL_OPTIONS } from '../constants/presets';
import { formatDDay, generateId } from '../utils/format';
import { clearAllData } from '../utils/storage';
import CharacterAvatar from '../components/CharacterAvatar';

export default function SettingsScreen() {
  const app = useApp();
  const T = app.settings.darkMode ? DARK : LIGHT;

  // D-Day 추가 모달
  const [showDDayModal, setShowDDayModal] = useState(false);
  const [ddLabel, setDdLabel] = useState('');
  const [ddDate, setDdDate] = useState('');

  const handleAddDDay = () => {
    if (!ddLabel.trim() || !ddDate.trim()) return;
    // 날짜 유효성 간단 검사 (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ddDate.trim())) {
      app.showToastCustom('날짜 형식: 2025-11-13', 'paengi');
      return;
    }
    if (app.ddays.length >= 10) {
      app.showToastCustom('D-Day는 최대 10개까지!', 'paengi');
      return;
    }
    app.addDDay({ label: ddLabel.trim(), date: ddDate.trim() });
    setDdLabel('');
    setDdDate('');
    setShowDDayModal(false);
    app.showToastCustom('D-Day 추가 완료!', 'taco');
  };

  const handleDeleteDDay = (dd) => {
    Alert.alert('D-Day 삭제', `"${dd.label}"을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => app.removeDDay(dd.id) },
    ]);
  };

  const handleReset = () => {
    Alert.alert(
      '전체 데이터 초기화',
      '모든 과목, 세션 기록, 설정이 삭제됩니다.\n이 작업은 되돌릴 수 없어요!',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            app.showToastCustom('초기화 완료. 앱을 다시 시작해주세요.', 'totoru');
          },
        },
      ],
    );
  };

  // 설정 아이템 렌더링
  const Section = ({ title, children }) => (
    <View style={[styles.section, { borderColor: T.border }]}>
      <Text style={[styles.sectionTitle, { color: T.sub }]}>{title}</Text>
      {children}
    </View>
  );

  const Row = ({ label, right, onPress }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.6 : 1}
    >
      <Text style={[styles.rowLabel, { color: T.text }]}>{label}</Text>
      <View style={styles.rowRight}>{right}</View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: T.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={[styles.headerTitle, { color: T.text }]}>⚙️ 설정</Text>

        {/* 캐릭터 */}
        <Section title="캐릭터">
          <View style={styles.charGrid}>
            {CHARACTER_LIST.map(cId => {
              const c = CHARACTERS[cId];
              const isActive = app.settings.mainCharacter === cId;
              return (
                <TouchableOpacity
                  key={cId}
                  style={[
                    styles.charCard,
                    {
                      backgroundColor: isActive ? c.bgColor : T.card,
                      borderColor: isActive ? T.accent : T.border,
                      borderWidth: isActive ? 2 : 1,
                    },
                  ]}
                  onPress={() => app.updateSettings({ mainCharacter: cId })}
                >
                  <CharacterAvatar characterId={cId} size={40} mood={isActive ? 'happy' : 'normal'} />
                  <Text style={[
                    styles.charName,
                    { color: isActive ? T.accent : T.sub, fontWeight: isActive ? '800' : '600' },
                  ]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* 목표 */}
        <Section title="목표">
          <Text style={[styles.goalLabel, { color: T.sub }]}>일일 목표 시간</Text>
          <View style={styles.goalRow}>
            {DAILY_GOAL_OPTIONS.map(min => (
              <TouchableOpacity
                key={min}
                style={[
                  styles.goalBtn,
                  {
                    borderColor: app.settings.dailyGoalMin === min ? T.accent : T.border,
                    backgroundColor: app.settings.dailyGoalMin === min ? T.accent : T.card,
                  },
                ]}
                onPress={() => app.updateSettings({ dailyGoalMin: min })}
              >
                <Text style={[
                  styles.goalBtnText,
                  { color: app.settings.dailyGoalMin === min ? 'white' : T.sub },
                ]}>
                  {min / 60}시간
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* D-Day */}
        <Section title={`D-Day (${app.ddays.length}/10)`}>
          {app.ddays.map(dd => (
            <View key={dd.id} style={[styles.ddayRow, { borderColor: T.border }]}>
              <TouchableOpacity
                onPress={() => app.setPrimaryDDay(dd.id)}
                style={styles.ddayStar}
              >
                <Text style={{ color: dd.isPrimary ? T.gold : T.border, fontSize: 16 }}>★</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[styles.ddayLabel, { color: T.text }]}>{dd.label}</Text>
                <Text style={[styles.ddayDate, { color: T.sub }]}>{dd.date}</Text>
              </View>
              <Text style={[styles.ddayBadge, { color: T.accent }]}>{formatDDay(dd.date)}</Text>
              <TouchableOpacity onPress={() => handleDeleteDDay(dd)}>
                <Text style={[styles.ddayDel, { color: T.red }]}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          {app.ddays.length < 10 && (
            <TouchableOpacity
              style={[styles.ddayAddBtn, { borderColor: T.border }]}
              onPress={() => setShowDDayModal(true)}
            >
              <Text style={[styles.ddayAddText, { color: T.accent }]}>+ D-Day 추가</Text>
            </TouchableOpacity>
          )}
        </Section>

        {/* 타이머 기본값 */}
        <Section title="타이머 기본값">
          <Row
            label="뽀모도로 집중"
            right={<Text style={[styles.rowValue, { color: T.accent }]}>{app.settings.pomodoroWorkMin}분</Text>}
          />
          <Row
            label="뽀모도로 휴식"
            right={<Text style={[styles.rowValue, { color: T.accent }]}>{app.settings.pomodoroBreakMin}분</Text>}
          />
        </Section>

        {/* 알림 */}
        <Section title="알림">
          <Row
            label="타이머 완료 알림"
            right={
              <Switch
                value={app.settings.notifEnabled}
                onValueChange={(v) => app.updateSettings({ notifEnabled: v })}
                trackColor={{ true: T.accent }}
                thumbColor="white"
              />
            }
          />
        </Section>

        {/* 울트라 포커스 */}
        <Section title="울트라 포커스">
          <Row
            label="엄격 모드"
            right={
              <Switch
                value={app.settings.ultraFocusStrict}
                onValueChange={(v) => app.updateSettings({ ultraFocusStrict: v })}
                trackColor={{ true: T.accent }}
                thumbColor="white"
              />
            }
          />
          <Text style={[styles.hint, { color: T.sub }]}>
            엄격: 폰 들어올리면 즉시 이탈 / 일반: 30초 유예
          </Text>
        </Section>

        {/* 테마 */}
        <Section title="테마">
          <Row
            label="다크 모드"
            right={
              <Switch
                value={app.settings.darkMode}
                onValueChange={(v) => app.updateSettings({ darkMode: v })}
                trackColor={{ true: T.accent }}
                thumbColor="white"
              />
            }
          />
        </Section>

        {/* 데이터 */}
        <Section title="데이터">
          <TouchableOpacity style={styles.dangerBtn} onPress={handleReset}>
            <Text style={[styles.dangerText, { color: T.red }]}>전체 데이터 초기화</Text>
          </TouchableOpacity>
        </Section>

        {/* 정보 */}
        <Section title="정보">
          <Row label="버전" right={<Text style={[styles.rowValue, { color: T.sub }]}>1.0.0</Text>} />
          <Row label="개인정보 처리방침" right={<Text style={{ color: T.sub }}>→</Text>} />
          <Row label="피드백 보내기" right={<Text style={{ color: T.sub }}>→</Text>} />
        </Section>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* D-Day 추가 모달 */}
      <Modal visible={showDDayModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[styles.modalTitle, { color: T.text }]}>D-Day 추가</Text>
            <TextInput
              value={ddLabel}
              onChangeText={setDdLabel}
              placeholder="이름 (예: 수능)"
              placeholderTextColor={T.sub}
              maxLength={15}
              style={[styles.modalInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text }]}
              autoFocus
            />
            <TextInput
              value={ddDate}
              onChangeText={setDdDate}
              placeholder="날짜 (예: 2025-11-13)"
              placeholderTextColor={T.sub}
              maxLength={10}
              keyboardType="numbers-and-punctuation"
              style={[styles.modalInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text }]}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalCancel, { borderColor: T.border }]}
                onPress={() => { setShowDDayModal(false); setDdLabel(''); setDdDate(''); }}
              >
                <Text style={[styles.modalCancelText, { color: T.sub }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, { backgroundColor: T.accent }]}
                onPress={handleAddDDay}
              >
                <Text style={styles.modalConfirmText}>추가</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  headerTitle: { fontSize: 20, fontWeight: '900', marginBottom: 12 },

  section: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1 },
  sectionTitle: { fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },

  // 캐릭터 선택
  charGrid: { flexDirection: 'row', gap: 6 },
  charCard: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  charName: { fontSize: 10, marginTop: 4 },

  // 목표
  goalLabel: { fontSize: 10, marginBottom: 6 },
  goalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  goalBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  goalBtnText: { fontSize: 10, fontWeight: '700' },

  // D-Day
  ddayRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, borderBottomWidth: 0.5 },
  ddayStar: { padding: 2 },
  ddayLabel: { fontSize: 13, fontWeight: '700' },
  ddayDate: { fontSize: 10, marginTop: 1 },
  ddayBadge: { fontSize: 11, fontWeight: '800' },
  ddayDel: { fontSize: 18, paddingHorizontal: 4 },
  ddayAddBtn: { paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', marginTop: 6 },
  ddayAddText: { fontSize: 12, fontWeight: '700' },

  // Row
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  rowLabel: { fontSize: 13, fontWeight: '600' },
  rowRight: {},
  rowValue: { fontSize: 13, fontWeight: '700' },

  hint: { fontSize: 9, marginTop: -4, marginBottom: 4 },

  // 위험 버튼
  dangerBtn: { paddingVertical: 10, alignItems: 'center' },
  dangerText: { fontSize: 13, fontWeight: '600' },

  // 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 30 },
  modal: { borderRadius: 20, padding: 20, borderWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 14 },
  modalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10 },
  modalBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  modalCancel: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  modalCancelText: { fontSize: 13, fontWeight: '600' },
  modalConfirm: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  modalConfirmText: { color: 'white', fontSize: 13, fontWeight: '800' },
});
