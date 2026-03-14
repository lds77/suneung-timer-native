// src/screens/SettingsScreen.js
// 탭 4: 설정

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Switch, Modal, Alert, StyleSheet, Platform, Linking, KeyboardAvoidingView, findNodeHandle,
  Keyboard, Dimensions,
} from 'react-native';
import { useApp } from '../hooks/useAppState';
import { LIGHT, DARK, getTheme } from '../constants/colors';
import { CHARACTERS, CHARACTER_LIST } from '../constants/characters';
import { DAILY_GOAL_OPTIONS } from '../constants/presets';
import { formatDDay } from '../utils/format';
import CharacterAvatar from '../components/CharacterAvatar';
import RunningTimersBar from '../components/RunningTimersBar';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
// 폰트 미리보기용 맵
import { FONT_FAMILY_MAP } from '../constants/fonts';
import ScheduleEditorScreen from './ScheduleEditorScreen';

const { width: SW } = Dimensions.get('window');
const isTablet = SW >= 600;
const TABLET_MAX_W = 680;

// 가이드 섹션 컴포넌트
function GuideSection({ title, color, T, children }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 10 }}>
      <TouchableOpacity onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: color + '10', borderRadius: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '900', color, flex: 1, marginRight: 8 }}>{title}</Text>
        <Text style={{ fontSize: 14, color: T.sub }}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
          <Text style={{ fontSize: 13, color: T.text, lineHeight: 18 }}>{children}</Text>
        </View>
      )}
    </View>
  );
}

function Section({ title, children, T }) {
  return (
    <View style={[styles.section, { borderColor: T.border }]}>
      <Text style={[styles.sectionTitle, { color: T.sub }]}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, right, onPress, T }) {
  return (
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
}

// 챌린지 입력을 독립된 컴포넌트로 분리하여 부모 리렌더로 인한 포커스 손실 방지
// React.memo + 색상값 비교 → T 객체 참조가 바뀌어도 실제 색상이 같으면 리렌더 안 함
const ChallengeInput = React.memo(function ChallengeInput({ initial, onSave, onFocus, T }) {
  const [text, setText] = useState(initial || '');
  const inputRef = useRef(null);
  useEffect(() => { setText(initial || ''); }, [initial]);
  const handleSave = () => {
    onSave(text);
    inputRef.current?.blur();
  };
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TextInput
          ref={inputRef}
          style={{ flex: 1, borderWidth: 1, borderColor: T.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: T.text, backgroundColor: T.bg }}
          value={text}
          onChangeText={(v) => { if (!v.includes('\n')) setText(v); }}
          placeholder="예: 서울대 가자!"
          placeholderTextColor={T.sub}
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={handleSave}
          blurOnSubmit={true}
          onFocus={onFocus}
        />
        <TouchableOpacity onPress={handleSave} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: T.accent, borderRadius: 8 }}>
          <Text style={{ color: 'white', fontWeight: '700' }}>저장</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>
        {text?.trim() ? `이탈 시 "${text.trim()}" 입력해야 해제돼요` : '비워두면 기본 응원 문구가 나와요'}
      </Text>
    </>
  );
}, (prev, next) =>
  prev.initial === next.initial &&
  prev.T.border === next.T.border &&
  prev.T.text === next.T.text &&
  prev.T.bg === next.T.bg &&
  prev.T.sub === next.T.sub &&
  prev.T.accent === next.T.accent
);

export default function SettingsScreen() {
  const app = useApp();
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale);
  const scrollRef = useRef(null);
  const challengeViewRef = useRef(null);
  const kbHeightRef = useRef(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => { kbHeightRef.current = e.endCoordinates.height; });
    const hide = Keyboard.addListener('keyboardDidHide', () => { kbHeightRef.current = 0; });
    return () => { show.remove(); hide.remove(); };
  }, []);
  const handleChallengeInputFocus = useCallback(() => {
    setTimeout(() => {
      if (!challengeViewRef.current || !scrollRef.current) return;
      challengeViewRef.current.measureLayout(
        findNodeHandle(scrollRef.current),
        (_x, y, _w, h) => {
          const screenH = Dimensions.get('window').height;
          const kbH = kbHeightRef.current || 300;
          // 입력창 하단이 키보드 바로 위(+54px 여백 ≈ 1cm 추가)에 오도록 스크롤
          const targetY = y - (screenH - kbH) + h + 54;
          scrollRef.current.scrollTo({ y: Math.max(0, targetY), animated: true });
        },
        () => {}
      );
    }, 200);
  }, []);

  // D-Day 추가/수정 모달 (캘린더 방식)
  const [showDDayModal, setShowDDayModal] = useState(false);
  const [editingDDay, setEditingDDay] = useState(null); // null=추가, dd객체=수정
  const [showGuide, setShowGuide] = useState(false);
  const [showScheduleEditor, setShowScheduleEditor] = useState(false);

const [ddLabel, setDdLabel] = useState('');
  const [ddDays, setDdDays] = useState(1);
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [pickerSelected, setPickerSelected] = useState(null);
  const today = new Date().toISOString().split('T')[0];

  

  const DDAY_PRESETS = [
    { label: '수능 2026', date: '2026-11-19' },
    { label: '중간고사', date: null }, { label: '기말고사', date: null }, { label: '모의고사', date: null },
  ];

  const pickerStr = `${pickerMonth.getFullYear()}.${String(pickerMonth.getMonth() + 1).padStart(2, '0')}`;
  const pickerCells = useMemo(() => {
    const y = pickerMonth.getFullYear(), m = pickerMonth.getMonth();
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    const cells = Array(first.getDay()).fill(null);
    for (let d = 1; d <= last.getDate(); d++) cells.push({ day: d, date: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    return cells;
  }, [pickerMonth]);

  const openAddDDay = () => {
    setEditingDDay(null);
    setDdLabel(''); setPickerSelected(null); setDdDays(1);
    setShowDDayModal(true);
  };

  const openEditDDay = (dd) => {
    setEditingDDay(dd);
    setDdLabel(dd.label);
    setPickerSelected(dd.date);
    setDdDays(dd.days || 1);
    if (dd.date) {
      const d = new Date(dd.date + 'T00:00:00');
      setPickerMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    setShowDDayModal(true);
  };

  const handleAddDDay = () => {
    if (!ddLabel.trim() || !pickerSelected) { app.showToastCustom('이름과 날짜를 선택하세요', 'paengi'); return; }
    if (editingDDay) {
      app.updateDDay(editingDDay.id, { label: ddLabel.trim(), date: pickerSelected, days: ddDays });
      app.showToastCustom('D-Day 수정 완료!', 'taco');
    } else {
      if (app.ddays.length >= 10) { app.showToastCustom('D-Day는 최대 10개까지!', 'paengi'); return; }
      app.addDDay({ label: ddLabel.trim(), date: pickerSelected, days: ddDays });
      app.showToastCustom('D-Day 추가 완료!', 'taco');
    }
    setDdLabel(''); setPickerSelected(null); setDdDays(1); setEditingDDay(null);
    setShowDDayModal(false);
  };

  const handleDeleteDDay = (dd) => {
    Alert.alert('D-Day 삭제', `"${dd.label}"을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => app.removeDDay(dd.id) },
    ]);
  };



  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: T.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <RunningTimersBar />
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, isTablet && { maxWidth: TABLET_MAX_W, alignSelf: 'center', width: '100%' }]}
        keyboardShouldPersistTaps="always" keyboardDismissMode="none">
        <Text style={[styles.headerTitle, { color: T.text }]}>⚙️ 설정</Text>

        {/* 캐릭터 */}
        <Section T={T} title="캐릭터">
          <View style={styles.charGrid}>
            {CHARACTER_LIST.map(cId => {
              const c = CHARACTERS[cId];
              const isActive = app.settings.mainCharacter === cId;
              return (
                <TouchableOpacity
                  key={cId}
                  style={{ flex: 1, alignItems: 'center', gap: 4 }}
                  onPress={() => app.updateSettings({ mainCharacter: cId })}
                >
                  <View style={{
                    width: 60, height: 60, borderRadius: 30,
                    borderWidth: isActive ? 2.5 : 1.5,
                    borderColor: isActive ? T.accent : T.border,
                    overflow: 'hidden', backgroundColor: c.bgColor,
                  }}>
                    <CharacterAvatar characterId={cId} size={60} mood={isActive ? 'happy' : 'normal'} />
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: isActive ? '900' : '600', color: isActive ? T.accent : T.sub }}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* 목표 (목표시간 + 학교급) */}
        <Section T={T} title="목표">
          <Text style={[styles.goalLabel, { color: T.sub }]}>일일 목표 시간</Text>
          {[DAILY_GOAL_OPTIONS.slice(0, 6), DAILY_GOAL_OPTIONS.slice(6, 12)].map((row, ri) => (
            <View key={ri} style={[styles.goalRow, ri === 0 && { marginBottom: 5 }]}>
              {row.map(min => (
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
          ))}
          <Text style={[styles.goalLabel, { color: T.sub, marginTop: 8 }]}>학교급</Text>
          {[
            [
              { id: 'elementary_lower', label: '초등 저학년', sub: '1~3학년' },
              { id: 'elementary_upper', label: '초등 고학년', sub: '4~6학년' },
              { id: 'middle', label: '중학생', sub: '중1~3' },
              { id: 'high', label: '고등학생', sub: '고1~3' },
            ],
            [
              { id: 'nsuneung', label: 'N수생', sub: '수능 재도전' },
              { id: 'university', label: '대학생', sub: '대학 재학' },
              { id: 'exam_prep', label: '공시생/자격증', sub: '공무원·자격증' },
            ],
          ].map((row, ri) => (
            <View key={ri} style={[styles.schoolRow, ri === 0 && { marginBottom: 5 }]}>
              {row.map(s => {
                const sel = (app.settings.schoolLevel || 'high') === s.id;
                return (
                  <TouchableOpacity key={s.id} onPress={() => {
                    app.updateSettings({ schoolLevel: s.id });
                  }}
                    style={[styles.schoolBtn, { flex: 1 }, sel && { backgroundColor: T.accent, borderColor: T.accent }]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: sel ? '900' : '600', color: sel ? 'white' : T.text, textAlign: 'center' }}>{s.label}</Text>
                    <Text style={{ fontSize: 10, color: sel ? 'rgba(255,255,255,0.8)' : T.sub, textAlign: 'center', marginTop: 1 }}>{s.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </Section>

        {/* 주간 플래너 배너 */}
        <TouchableOpacity
          onPress={() => setShowScheduleEditor(true)}
          activeOpacity={0.75}
          style={{
            marginBottom: 16,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: T.accent,
            backgroundColor: T.accent + '14',
            overflow: 'hidden',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 }}>
            <View style={{
              width: 48, height: 48, borderRadius: 14,
              backgroundColor: T.accent + '25',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 26 }}>📅</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: T.accent }}>주간 플래너</Text>
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: T.accent }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: 'white' }}>추천</Text>
                </View>
              </View>
              <Text style={{ fontSize: 13, color: T.text, fontWeight: '600', lineHeight: 16 }}>
                요일별 공부 계획을 미리 짜두면{'\n'}매일 자동으로 불러와서 바로 시작할 수 있어요!
              </Text>
            </View>
            <Text style={{ fontSize: 22, color: T.accent, fontWeight: '700' }}>›</Text>
          </View>
        </TouchableOpacity>

        {/* D-Day */}
        <Section T={T} title={`D-Day (${app.ddays.length}/10)`}>
          {app.ddays.map(dd => (
            <View key={dd.id} style={[styles.ddayRow, { borderColor: T.border }]}>
              <TouchableOpacity onPress={() => app.setPrimaryDDay(dd.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: dd.isPrimary ? T.gold : T.border, fontSize: 16 }}>★</Text>
                <View><Text style={[styles.ddayLabel, { color: T.text }]}>{dd.label}</Text>
                  <Text style={[styles.ddayDate, { color: T.sub }]}>{dd.date}{dd.days > 1 ? ` (${dd.days}일간)` : ''}</Text></View>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <Text style={[styles.ddayBadge, { color: T.accent }]}>{formatDDay(dd.date)}</Text>
              <TouchableOpacity onPress={() => openEditDDay(dd)} style={{ paddingHorizontal: 6 }}>
                <Text style={{ fontSize: 15, color: T.sub }}>🖊️</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteDDay(dd)}>
                <Text style={[styles.ddayDel, { color: T.red }]}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          {app.ddays.length < 10 && (
            <TouchableOpacity
              style={[styles.ddayAddBtn, { borderColor: T.border }]}
              onPress={openAddDDay}
            >
              <Text style={[styles.ddayAddText, { color: T.accent }]}>+ D-Day 추가</Text>
            </TouchableOpacity>
          )}
        </Section>

        {/* 알림 */}
        <Section T={T} title="알림">
          <Row
            T={T}
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
          {Platform.OS === 'android' && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 6 }}>
              <Text style={{ fontSize: 14, color: T.sub }}>
                알림이 늦게 오거나 오지 않는다면 배터리 최적화를 해제하세요.
              </Text>
              <TouchableOpacity
                onPress={() => IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS)}
                style={{ alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, backgroundColor: T.accent + '20', borderWidth: 1, borderColor: T.accent }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.accent }}>⚡ 배터리 최적화 설정 바로가기</Text>
              </TouchableOpacity>
            </View>
          )}
        </Section>

        {/* 🔥 집중 도전 모드 */}
        <Section T={T} title="🔥 집중 도전 모드">
          <Text style={[styles.hint, { color: T.text, fontWeight: '700', marginBottom: 4 }]}>🔥모드 잠금 강도</Text>
          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 8 }}>
            {/* desc: 문구=챌린지 도전 문구, 정지=타이머 일시정지 */}
            {[
              { id: 'normal', label: '🟢 일반',      desc: '알림만 전송',          color: '#4CAF50' },
              { id: 'focus', label: '🟡 집중',      desc: '이탈 시 문구 입력',     color: '#FFB74D' },
              { id: 'exam',  label: '🔴 울트라집중', desc: '10초 이탈 시 타이머 정지', color: '#FF6B6B' },
            ].map(lv => {
              const sel = (app.settings.ultraFocusLevel || 'focus') === lv.id;
              return (
                <TouchableOpacity key={lv.id} onPress={() => app.updateSettings({ ultraFocusLevel: lv.id })}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: sel ? 2 : 1.5, borderColor: sel ? lv.color : T.border, backgroundColor: sel ? lv.color + '30' : 'transparent', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: sel ? lv.color : T.sub }}>{lv.label}</Text>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 10, color: sel ? lv.color + 'CC' : T.sub, marginTop: 2 }}>{lv.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: T.sub }]}>
            {(app.settings.ultraFocusLevel || 'focus') === 'normal'
              ? '🟢 앱을 나가도 타이머는 계속 진행돼요. 이탈 횟수만 기록에 남아요.'
              : (app.settings.ultraFocusLevel || 'focus') === 'focus'
              ? '🟡 1분 이상 자리를 비우면 돌아올 때 챌린지 문구를 입력해야 잠금이 해제돼요.'
              : '🔴 10초 이상 앱을 나가면 타이머가 정지돼요. 돌아올 때 챌린지 문구를 입력해야 재개할 수 있어요.'}
          </Text>
          <Text style={[styles.hint, { color: T.sub, marginTop: 4 }]}>
            💡 타이머 시작 시 🔥집중 도전 / 📖편하게 공부 중 선택해요
          </Text>
          <View ref={challengeViewRef} style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: T.text, marginTop: 10, marginBottom: 6 }}>🖊️ 나만의 챌린지 문구</Text>
            <ChallengeInput
              initial={app.settings.challengeText}
              onSave={(v) => { app.updateSettings({ challengeText: v }); app.showToastCustom('챌린지 문구가 저장됐어요!', 'toru'); }}
              onFocus={handleChallengeInputFocus}
              T={T}
            />
          </View>
        </Section>


        {/* 테마 */}
        <Section T={T} title="테마">
          <Row
            T={T}
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

          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: T.text, marginBottom: 6 }}>테마 컬러</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {[
                { id: 'pink',   color: '#FF6B9D', label: '핑크' },
                { id: 'purple', color: '#6C5CE7', label: '퍼플' },
                { id: 'blue',   color: '#4A90D9', label: '블루' },
                { id: 'mint',   color: '#00B894', label: '민트' },
                { id: 'navy',   color: '#2C5F9E', label: '네이비' },
                { id: 'coral',  color: '#E07050', label: '코랄' },
              ].map(t => {
                const sel = (app.settings.accentColor || 'pink') === t.id;
                return (
                  <TouchableOpacity key={t.id} onPress={() => app.updateSettings({ accentColor: t.id })}
                    style={{ alignItems: 'center', gap: 3 }}>
                    <View style={{
                      width: 28, height: 28, borderRadius: 14,
                      backgroundColor: t.color,
                      borderWidth: sel ? 2.5 : 1,
                      borderColor: sel ? T.text : t.color + '60',
                    }} />
                    <Text style={{ fontSize: 11, fontWeight: sel ? '800' : '500', color: sel ? T.text : T.sub }}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: T.text, marginBottom: 6 }}>글꼴</Text>
            {[
              [
                { id: 'default',     label: '기본', sample: '시스템 기본 글꼴', ready: true },
                { id: 'pretendard',  label: 'Pretendard', sample: '깔끔한 고딕체', ready: true },
                { id: 'gowunDodum',  label: '고운돋움', sample: '부드러운 느낌', ready: true },
              ],
              [
                { id: 'nanumSquare', label: '나눔스퀘어', sample: '단정한 느낌', ready: true },
                { id: 'cookieRun',   label: '쿠키런', sample: '귀여운 느낌', ready: true },
                { id: 'maplestory',  label: '메이플스토리', sample: '재밌는 느낌', ready: true },
              ],
            ].map((row, ri) => (
              <View key={ri} style={[styles.fontGrid, ri === 0 && { marginBottom: 6 }]}>
                {row.map(f => {
                  const sel = (app.settings.fontFamily || 'default') === f.id;
                  const fam = f.id === 'default' ? undefined : FONT_FAMILY_MAP[f.id];
                  const famStyle = fam ? { fontFamily: fam } : {};
                  return (
                    <TouchableOpacity key={f.id}
                      onPress={() => f.ready ? app.updateSettings({ fontFamily: f.id }) : app.showToastCustom('다음 업데이트에서 만나요! 🎨', 'toru')}
                      style={[styles.fontItem,
                        sel && { borderColor: T.accent, backgroundColor: T.accent + '28', borderWidth: 2 },
                        !sel && { borderColor: T.border }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[{ fontSize: 12, fontWeight: '800', color: sel ? T.accent : T.text }, famStyle]}>{f.label}</Text>
                        <Text style={[{ fontSize: 10, color: T.sub, marginTop: 1 }, famStyle]}>{f.sample}</Text>
                      </View>
                      {sel && <Text style={{ fontSize: 12 }}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            <Text style={{ fontSize: 11, color: T.sub, marginTop: 6 }}>폰트를 변경하면 앱이 잠시 다시 로딩돼요</Text>
          </View>
        </Section>

{/* 사용 가이드 */}
        <Section T={T} title="도움말">
          <TouchableOpacity onPress={() => setShowGuide(true)}>
            <Row T={T} label="📖 사용 가이드" right={<Text style={{ color: T.sub }}>→</Text>} />
          </TouchableOpacity>
        </Section>

        {/* 정보 */}
        <Section T={T} title="정보">
          <Row T={T} label="버전" right={<Text style={[styles.rowValue, { color: T.sub }]}>{Constants.expoConfig?.version ?? '1.0.0'}</Text>} />
          <TouchableOpacity onPress={() => Linking.openURL('https://lds77.github.io/suneung-timer-native/privacy-policy.html')}>
            <Row T={T} label="개인정보 처리방침" right={<Text style={{ color: T.sub }}>→</Text>} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL('mailto:dongsikl51@gmail.com?subject=열공메이트 피드백')}>
            <Row T={T} label="피드백 보내기" right={<Text style={{ color: T.sub }}>→</Text>} />
          </TouchableOpacity>
        </Section>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* D-Day 추가/수정 모달 (캘린더 피커) */}
      <Modal visible={showDDayModal} transparent animationType="fade">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalOverlay}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}><View style={[styles.modal, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[styles.modalTitle, { color: T.text }]}>{editingDDay ? '📅 D-Day 수정' : '📅 D-Day 추가'}</Text>
            {/* 프리셋 */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>{DDAY_PRESETS.map(p => (
              <TouchableOpacity key={p.label} style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: ddLabel === p.label ? T.accent : T.border }}
                onPress={() => { setDdLabel(p.label); if (p.date) setPickerSelected(p.date); }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: ddLabel === p.label ? T.accent : T.sub }}>{p.label}</Text></TouchableOpacity>
            ))}</View>
            <TextInput value={ddLabel} onChangeText={setDdLabel} placeholder="이름 (예: 중간고사)" placeholderTextColor={T.sub} maxLength={15}
              style={[styles.modalInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text }]} />
            {/* 캘린더 */}
            <View style={{ backgroundColor: T.surface, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: T.border, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <TouchableOpacity onPress={() => setPickerMonth(p => { const d = new Date(p); d.setMonth(d.getMonth()-1); return d; })}><Text style={{ color: T.accent, fontSize: 16, paddingHorizontal: 8 }}>◀</Text></TouchableOpacity>
                <Text style={{ color: T.text, fontSize: 14, fontWeight: '800' }}>{pickerStr}</Text>
                <TouchableOpacity onPress={() => setPickerMonth(p => { const d = new Date(p); d.setMonth(d.getMonth()+1); return d; })}><Text style={{ color: T.accent, fontSize: 16, paddingHorizontal: 8 }}>▶</Text></TouchableOpacity></View>
              <View style={{ flexDirection: 'row', marginBottom: 2 }}>{'일월화수목금토'.split('').map(d => <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: T.sub, fontWeight: '600' }}>{d}</Text>)}</View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{pickerCells.map((cell, i) => {
                if (!cell) return <View key={`e${i}`} style={{ width: '14.28%', height: 32 }} />;
                const sel = pickerSelected === cell.date, past = cell.date < today;
                return (<TouchableOpacity key={cell.date} style={{ width: '14.28%', height: 32, alignItems: 'center', justifyContent: 'center' }} onPress={() => !past && setPickerSelected(cell.date)} disabled={past}>
                  <View style={[{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, sel && { backgroundColor: T.accent }, past && { opacity: 0.3 }]}>
                    <Text style={{ fontSize: 13, fontWeight: sel ? '800' : '500', color: sel ? 'white' : T.text }}>{cell.day}</Text></View></TouchableOpacity>);
              })}</View>
            </View>
            {pickerSelected && <Text style={{ fontSize: 12, color: T.accent, textAlign: 'center', marginBottom: 6, fontWeight: '700' }}>선택: {pickerSelected}</Text>}
            {/* 날짜 직접 입력 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: T.sub }}>직접 입력:</Text>
              <TextInput
                placeholder="2026-06-15"
                placeholderTextColor={T.sub}
                value={pickerSelected || ''}
                onChangeText={(v) => {
                  if (/^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v+'T00:00:00').getTime())) {
                    setPickerSelected(v);
                    const d = new Date(v+'T00:00:00');
                    setPickerMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                  } else if (v.length <= 10) {
                    setPickerSelected(v);
                  }
                }}
                style={{ flex: 1, borderWidth: 1, borderColor: T.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 14, color: T.text, backgroundColor: T.surface2 }}
                maxLength={10}
              />
            </View>
            {/* 기간 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Text style={{ fontSize: 13, color: T.sub }}>시험 기간</Text>
              <View style={{ flexDirection: 'row', gap: 3 }}>{[1,2,3,4,5].map(n => (
                <TouchableOpacity key={n} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: ddDays === n ? T.accent : T.border, backgroundColor: ddDays === n ? T.accent : 'transparent' }}
                  onPress={() => setDdDays(n)}><Text style={{ fontSize: 12, fontWeight: '700', color: ddDays === n ? 'white' : T.sub }}>{n}일</Text></TouchableOpacity>
              ))}</View></View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalCancel, { borderColor: T.border }]} onPress={() => { setShowDDayModal(false); setDdLabel(''); setPickerSelected(null); setDdDays(1); setEditingDDay(null); }}>
                <Text style={[styles.modalCancelText, { color: T.sub }]}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, { backgroundColor: T.accent }]} onPress={handleAddDDay}>
                <Text style={styles.modalConfirmText}>{editingDDay ? '수정' : '추가'}</Text></TouchableOpacity></View>
          </View></ScrollView></View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 📖 사용 가이드 모달 */}
      <Modal visible={showGuide} transparent animationType="fade">
        <View style={{ flex: 1 }}>
          <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} activeOpacity={1} onPress={() => setShowGuide(false)} />
          <View style={{ position: 'absolute', bottom: 0, left: isTablet ? (SW - Math.min(SW, TABLET_MAX_W)) / 2 : 0, right: isTablet ? (SW - Math.min(SW, TABLET_MAX_W)) / 2 : 0, maxHeight: '92%', backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 }}>
            <Text style={[styles.modalTitle, { color: T.text }]}>📖 사용 가이드</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* 기본 사용법 */}
              <GuideSection title="⏰ 기본 사용법" color={T.accent} T={T}>
                {'열공메이트에 오신 걸 환영해요! 🎉\n\n① 집중탭 하단의 + 버튼으로 타이머를 만들어요\n② 🔥 집중 도전 또는 📖 편하게 공부 중 모드를 선택해요\n③ 타이머가 끝나면 집중밀도 점수와 등급을 확인해요\n④ 통계탭에서 오늘·이번 주·이번 달 기록을 분석해요\n\n💡 처음엔 즐겨찾기에 자주 쓰는 타이머를 저장해두면 빠르게 시작할 수 있어요!'}
              </GuideSection>

              {/* 타이머 종류 */}
              <GuideSection title="🏷️ 타이머 4가지" color="#00B4D8" T={T}>
                {'⏱ 카운트다운\n목표 시간을 정해놓고 카운트다운해요. 끝나면 완료 알림!\n\n♾️ 자유(카운트업)\n시간 제한 없이 올라가는 스톱워치예요. 원할 때 직접 종료해요.\n\n🍅 뽀모도로\n집중(25분) → 휴식(5분)을 자동으로 반복해요.\n설정에서 집중·휴식 시간을 자유롭게 바꿀 수 있어요.\n\n📋 연속모드\n여러 과목을 순서대로 이어서 실행해요.\n예) 수학 40분 → 영어 30분 → 국어 20분\n각 과목이 끝날 때마다 알림이 울리고 자동으로 다음으로 넘어가요.\n\n🏁 랩 스톱워치\n랩(구간) 기록을 남길 수 있는 스톱워치예요.\n문제 풀이 속도를 측정할 때 유용해요!'}
              </GuideSection>

              {/* 즐겨찾기 팁 */}
              <GuideSection title="⭐ 즐겨찾기 사용법" color="#FFD700" T={T}>
                {'자주 쓰는 타이머를 즐겨찾기에 저장하면 한 번의 탭으로 바로 시작할 수 있어요!\n\n저장 방법:\n• 실행 중인 타이머 이름 왼쪽 ☆ 탭 → 즐겨찾기 추가\n• 편집 버튼으로 직접 추가·수정도 가능해요\n\n관리 방법:\n• 즐겨찾기 셀을 길게 누르면 삭제 메뉴가 나와요\n• 카운트다운·뽀모도로·연속모드·랩 스톱워치 모두 저장 가능해요\n\n📌 카운트업(자유) 즐겨찾기는 하단에 별도로 표시돼요'}
              </GuideSection>

              {/* 집중 모드 */}
              <GuideSection title="🔥 집중 도전 vs 📖 편하게 공부" color="#FF6B6B" T={T}>
                {'타이머를 시작할 때 공부 방식을 선택해요.\n\n🔥 집중 도전 — 화면을 켠 채 공부\n→ 화면이 자동으로 어두워지고 잠금 화면이 나타나요\n→ 앱을 나가거나 다른 앱을 열면 "이탈"로 기록돼요\n→ 이탈 0회를 달성하면 🏆 Verified 인증 + 보너스 점수!\n→ 스스로에게 도전하고 싶을 때 추천!\n\n📖 편하게 공부 — 화면을 꺼도 OK\n→ 화면을 꺼도 타이머가 계속 돌아가요\n→ 이탈 체크 없이 조용히 공부할 수 있어요\n→ 음악 들으며, 또는 부담 없이 공부하고 싶을 때 추천!'}
              </GuideSection>

              {/* 잠금화면 */}
              <GuideSection title="🔒 잠금화면 & 집중 강도" color="#E17055" T={T}>
                {'🔥 집중 도전 모드에서는 잠금화면이 활성화돼요.\n\n잠금화면 사용법:\n• 화면이 어두워지면 잠금 화면 상태예요\n• 하단 "잠금 해제" 버튼을 눌러야 앱으로 돌아올 수 있어요\n• 잠금 해제 시 "이탈" 횟수가 올라가요\n\n집중 강도 3단계 (설정에서 변경 가능):\n\n🟢 일반: 알림만 표시. 이탈해도 타이머는 계속 진행돼요.\n\n🟡 집중: 이탈해도 타이머는 계속 진행돼요.\n단, 1분 이상 자리를 비우면 돌아올 때 챌린지 문구를 입력해야 잠금이 해제돼요.\n\n🔴 시험: 이탈하면 타이머가 즉시 일시정지돼요!\n5초 이상 자리를 비우면 챌린지 문구를 입력해야만 잠금 해제 및 타이머가 재개돼요.\n진짜 시험처럼 집중하고 싶을 때!\n\n챌린지 문구는 설정 > 집중 강도에서 직접 바꿀 수 있어요 ✏️'}
              </GuideSection>

              {/* 오늘의 계획 */}
              <GuideSection title="📅 오늘의 계획 & 주간 플래너" color="#00CEC9" T={T}>
                {'집중탭 상단 "오늘의 계획" 카드에서 그날의 공부 계획을 관리해요.\n\n주간 플래너 설정:\n① 설정 > 주간 플래너에서 요일별 계획을 만들어요\n② 각 계획에 과목·목표 시간·이모지를 설정해요\n③ 매일 해당 요일의 계획이 자동으로 불러와져요\n\n계획 타이머 사용법:\n• ▶ 버튼을 누르면 해당 과목의 카운트다운 타이머가 바로 시작돼요\n• 공부한 시간이 진행 바로 표시돼요\n• 중간에 종료했다가 다시 ▶ 누르면 이어서 시작해요! (남은 시간부터 카운트다운)\n• 목표 시간의 80% 이상 달성하면 ✅ 완료 표시\n• 100% 달성하면 버튼이 사라지고 완전 완료!\n\n💡 계획 없는 날도 탭에서 직접 추가할 수 있어요'}
              </GuideSection>

              {/* 집중밀도 */}
              <GuideSection title="📊 집중밀도란?" color="#6C5CE7" T={T}>
                {'같은 1시간을 공부해도 집중한 정도는 다를 수 있어요.\n집중밀도는 "얼마나 몰입했는지"를 56~103점으로 측정해요.\n어떤 세션이든 최소 C등급이 보장돼요 😊\n\n⚠️ 5분 미만은 통계에 저장되지 않아요\n짧은 태스크는 기록 대신 할 일 체크로 관리해요!\n\n점수 구성 (최대 103점):\n• 완료 점수 (최대 40점) — 타이머 완주할수록 높아요\n  (자유모드는 학교급별 기준 시간 자동 적용)\n• 습관 점수 (최대 30점) — 일시정지를 적게 할수록 높아요\n• 지속력 보너스 (최대 15점) — 학교급에 맞는 기준으로 자동 조정\n  초등 저학년 20분 / 초등 고학년 30분 / 중등 60분 / 고등+ 90분\n• 선언 보너스 (최대 15점) — 🔥모드 이탈 0회 Verified 달성!\n• 자가평가 보너스 (0~+3점) — 🔥⚡ 선택 시 +3점 보너스\n\n등급:\nSS (100+) ✨ > S+ (93+) 🏆 > S (86+) > A (76+) > B (66+) > C (56+)\n\n💡 세션이 끝난 후 메모와 자가평가를 남기면 나중에 돌아봤을 때 도움이 많이 돼요!'}
              </GuideSection>

              {/* 통계 */}
              <GuideSection title="📈 통계 탭 활용법" color="#A29BFE" T={T}>
                {'공부 기록을 다양한 방식으로 분석할 수 있어요.\n\n📅 일간\n오늘 공부한 시간, 목표 달성률, 간트 차트(시간대별 공부 블록)를 볼 수 있어요. 세션을 탭하면 메모를 수정할 수 있어요.\n\n📆 주간\n이번 주 과목별 공부 시간과 그래프를 확인해요.\n← → 버튼으로 지난 주 기록도 볼 수 있어요.\n베스트 날에는 👑 왕관이 표시돼요!\n\n🗓️ 월간\n달력 형식으로 매일 공부 시간을 한눈에 확인해요.\n날짜를 탭하면 그날의 세션 상세 내역이 나와요.\n\n🌱 잔디\n최근 6개월의 공부 기록을 한눈에 볼 수 있어요.\n칸을 탭하면 그날의 상세 내역도 확인 가능해요.'}
              </GuideSection>

              {/* 잔디 */}
              <GuideSection title="🌱 365일 잔디" color="#4CAF50" T={T}>
                {'통계 > 잔디 탭에서 확인할 수 있어요.\n공부한 날은 칸이 색칠돼요!\n\n색상 의미:\n• 연한색 = 📖 편하게 공부한 날\n• 진한 초록 = 🔥 집중 도전한 날\n• 금색 ⭐ = 🏆 Verified 달성한 날!\n\n요약 카드에서 확인할 수 있는 것:\n• 총 공부일 수\n• 현재 연속 공부 일수 🔥\n• 역대 최장 연속 기록\n• 올해 총 공부 시간\n\n매일 칸을 채워서 풀잔디에 도전해보세요! 🌿'}
              </GuideSection>

              {/* 과목 & 할 일 */}
              <GuideSection title="📚 과목·D-Day" color="#FDCB6E" T={T}>
                {'과목 탭:\n• + 버튼으로 과목을 추가하고 색상을 지정할 수 있어요\n• 과목별 총 공부 시간이 자동으로 쌓여요\n• ♡ 버튼으로 즐겨찾기 과목을 상단에 고정해요\n\nD-Day (설정 탭):\n• 수능, 시험, 목표일을 등록하면 남은 날수를 표시해요\n• 여러 개를 등록하고 대표 D-Day를 설정할 수 있어요\n• 집중탭 상단에 D-Day 카운터가 표시돼요'}
              </GuideSection>

              {/* 스마트 할 일 */}
              <GuideSection title="📝 스마트 할 일" color="#00B894" T={T}>
                {'집중탭 하단의 할 일 카드에서 사용해요.\n\n⚡ 빠른 추가\n• 내 과목 칩을 탭하면 과목이 미리 선택된 상태로 입력 모달이 열려요\n• [+ 직접입력] 버튼으로 과목을 직접 고를 수도 있어요\n• 추가 버튼을 눌러도 모달이 닫히지 않아 연속으로 여러 개를 빠르게 추가할 수 있어요\n\n📌 기한 설정\n• [오늘] — 오늘 완료할 할 일\n• [이번주] — 이번 주 안에 할 일\n• [시험] — 특정 D-Day(시험)에 연결된 체크리스트\n  시험 탭에서 D-Day별로 묶여 진행률 바와 함께 보여요\n\n🔴 우선순위\n• 중요(🔴) 로 설정하면 목록 상단에 빨간 점으로 표시돼요\n• 각 과목 그룹 안에서 중요 → 보통 → 낮음 → 완료 순으로 정렬돼요\n\n📎 메모\n• 부가 설명이 필요한 할 일엔 메모를 추가할 수 있어요\n• 항목을 탭하면 메모가 펼쳐져요 (📎 아이콘으로 확인 가능)\n\n🔁 반복 할 일\n• [매일], [주중], [주말], [직접선택]으로 반복 주기를 설정할 수 있어요\n• 반복 설정 시 템플릿으로 저장되어 해당 요일에 자동으로 오늘 할 일에 추가돼요\n• 할 일 카드 하단 "🔁 반복 할 일 템플릿" 섹션에서 관리할 수 있어요\n\n🎯 시험 체크리스트\n• 할 일 추가 시 기한을 [시험]으로 선택하고 D-Day를 연결하면 시험 탭에서 확인할 수 있어요\n• 시험이 7일 이내로 다가오면 집중탭에 경고 배너가 표시돼요\n• 시험이 지나면 "완료된 시험" 섹션으로 자동 이동해요\n\n💡 과목별 그룹핑\n• 같은 과목 할 일끼리 묶여 표시돼요\n• 미완료 할 일이 많은 과목이 자동으로 위로 정렬돼요\n• 완료된 항목엔 완료 시각이 함께 표시돼요 (예: 10:30)'}
              </GuideSection>

              {/* 알림 팁 */}
              <GuideSection title="🔔 알림이 안 울려요?" color="#74B9FF" T={T}>
                {'타이머 완료 알림이 오지 않는다면 아래를 확인해주세요!\n\n① 알림 권한 확인\n설정 앱 > 앱 > 열공메이트 > 알림을 허용해주세요.\n\n② 정확한 알람 권한 (Android 12+)\n설정 > 앱 > 특별한 앱 권한 > 알람 및 알림에서\n이 앱을 허용해주세요.\n\n③ 배터리 최적화 해제 (가장 중요!)\n배터리 최적화가 켜져 있으면 백그라운드에서 앱이 종료되어 알림이 오지 않을 수 있어요.\n설정 탭 > 알림 섹션 > "배터리 최적화 설정 바로가기"를 탭해서 이 앱을 "최적화 안 함"으로 설정해주세요.\n\n💡 위 설정을 완료하면 화면이 꺼진 상태에서도 정확하게 알림이 와요!'}
              </GuideSection>

              {/* 학습법 */}
              <GuideSection title="🧠 학습법 — 왜 이 방법들인가요?" color="#E07050" T={T}>
                {'과목 탭의 학습법은 모두 연구로 검증된 방법들이에요!\n\n🎮 미션 스프린트 (15분×3)\n짧은 목표를 반복하면 동기부여가 30% 이상 높아진다는 연구 결과가 있어요. (Deterding, 2011)\n\n📖 소리+묵독\n소리 내어 읽으면 기억력이 높아지는 "프로덕션 효과"가 있어요. 묵독보다 기억이 77% 향상! (MacLeod, 2011)\n\n🔄 인터리빙\n한 과목만 계속하는 것보다 과목을 번갈아 공부하면 기억력이 43% 향상돼요. (UCLA 연구)\n\n⚡ 52-17 법칙\n550만 건의 데이터 분석 결과, 52분 집중 + 17분 휴식이 생산성이 가장 높았어요. (DeskTime)\n\n🌊 울트라디안 90\n인간의 집중력은 90분 주기로 움직여요. 90분 집중 후 충분히 쉬면 다음 사이클도 높은 집중력 유지! (Kleitman)\n\n🧊 하드 스타트\n어려운 문제를 먼저 시작하면 쉬운 걸 하는 동안에도 뇌가 무의식적으로 계속 처리해요. (Barbara Oakley, MIT)'}
              </GuideSection>

              {/* 닫기 */}
              <TouchableOpacity onPress={() => setShowGuide(false)} style={[styles.modalCancel, { borderColor: T.border, marginTop: 14 }]}>
                <Text style={[styles.modalCancelText, { color: T.sub }]}>닫기</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ScheduleEditorScreen visible={showScheduleEditor} onClose={() => setShowScheduleEditor(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  headerTitle: { fontSize: 20, fontWeight: '900', marginBottom: 12 },

  section: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },

  // 캐릭터 선택
  charGrid: { flexDirection: 'row', gap: 6 },
  charCard: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  charName: { fontSize: 12, marginTop: 4 },

  // 목표
  goalLabel: { fontSize: 12, marginBottom: 6 },
  goalRow: { flexDirection: 'row', gap: 5 },
  goalBtn: { flex: 1, paddingVertical: 7, borderRadius: 6, borderWidth: 1, alignItems: 'center' },
  goalBtnText: { fontSize: 12, fontWeight: '700' },

  // 학교급 선택 row (목표 섹션 내)
  schoolRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  schoolBtn: { flex: 1, paddingVertical: 4, borderRadius: 8, borderWidth: 1, alignItems: 'center' },

  // 폰트 선택 그리드
  fontGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fontItem: { flex: 1, height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderRadius: 10, borderWidth: 1.5 },

  // D-Day
  ddayRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, borderBottomWidth: 0.5 },
  ddayStar: { padding: 2 },
  ddayLabel: { fontSize: 14, fontWeight: '700' },
  ddayDate: { fontSize: 12, marginTop: 1 },
  ddayBadge: { fontSize: 13, fontWeight: '800' },
  ddayDel: { fontSize: 18, paddingHorizontal: 4 },
  ddayAddBtn: { paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', marginTop: 6 },
  ddayAddText: { fontSize: 14, fontWeight: '700' },

  // Row
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  rowLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
  rowRight: {},
  rowValue: { fontSize: 14, fontWeight: '700' },

  hint: { fontSize: 11, marginTop: -4, marginBottom: 4 },

  // 위험 버튼
  dangerBtn: { paddingVertical: 10, alignItems: 'center' },
  dangerText: { fontSize: 14, fontWeight: '600' },

  // 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 30 },
  modal: { borderRadius: 20, padding: 20, borderWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 14 },
  modalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 10 },
  modalBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  modalCancel: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  modalCancelText: { fontSize: 14, fontWeight: '600' },
  modalConfirm: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  modalConfirmText: { color: 'white', fontSize: 14, fontWeight: '800' },
});
