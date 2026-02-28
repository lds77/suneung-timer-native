// src/screens/SettingsScreen.js
// 탭 4: 설정

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Switch, Modal, Alert, StyleSheet, Platform, Linking,
} from 'react-native';
import { useApp } from '../hooks/useAppState';
import { LIGHT, DARK, getTheme } from '../constants/colors';
import { CHARACTERS, CHARACTER_LIST } from '../constants/characters';
import { DAILY_GOAL_OPTIONS } from '../constants/presets';
import { formatDDay, generateId } from '../utils/format';
import CharacterAvatar from '../components/CharacterAvatar';
import RunningTimersBar from '../components/RunningTimersBar';
// 폰트 미리보기용 맵
import { FONT_FAMILY_MAP } from '../constants/fonts';

// 가이드 섹션 컴포넌트
function GuideSection({ title, color, T, children }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 10 }}>
      <TouchableOpacity onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: color + '10', borderRadius: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '900', color }}>{title}</Text>
        <Text style={{ fontSize: 12, color: T.sub }}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
          <Text style={{ fontSize: 11, color: T.text, lineHeight: 18 }}>{children}</Text>
        </View>
      )}
    </View>
  );
}

// 챌린지 입력을 독립된 컴포넌트로 분리하여 부모 리렌더로 인한 포커스 손실 방지
function ChallengeInput({ initial, onSave, T }) {
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
          style={{ flex: 1, borderWidth: 1, borderColor: T.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: T.text, backgroundColor: T.bg }}
          value={text}
          onChangeText={(v) => { if (!v.includes('\n')) setText(v); }}
          onBlur={handleSave}
          placeholder="예: 서울대 가자!"
          placeholderTextColor={T.sub}
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={handleSave}
          blurOnSubmit={true}
        />
        <TouchableOpacity onPress={handleSave} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: T.accent, borderRadius: 8 }}>
          <Text style={{ color: 'white', fontWeight: '700' }}>저장</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 9, color: T.sub, marginTop: 4 }}>
        {text?.trim() ? `이탈 시 "${text.trim()}" 입력해야 해제돼요` : '비워두면 기본 응원 문구가 나와요'}
      </Text>
    </>
  );
}

export default function SettingsScreen() {
  const app = useApp();
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale);

  // D-Day 추가 모달 (캘린더 방식)
  const [showDDayModal, setShowDDayModal] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const resetGuides = () => {
    app.updateSettings({ guideMode: false, guideDensity: false, guideHeatmap: false, guideLock: false });
    app.showToastCustom('가이드가 초기화됐어요!', 'toru');
  };
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

  const handleAddDDay = () => {
    if (!ddLabel.trim() || !pickerSelected) { app.showToastCustom('이름과 날짜를 선택하세요', 'paengi'); return; }
    if (app.ddays.length >= 10) { app.showToastCustom('D-Day는 최대 10개까지!', 'paengi'); return; }
    app.addDDay({ label: ddLabel.trim(), date: pickerSelected, days: ddDays });
    setDdLabel(''); setPickerSelected(null); setDdDays(1);
    setShowDDayModal(false);
    app.showToastCustom('D-Day 추가 완료!', 'taco');
  };

  const handleDeleteDDay = (dd) => {
    Alert.alert('D-Day 삭제', `"${dd.label}"을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => app.removeDDay(dd.id) },
    ]);
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
      <RunningTimersBar />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="always" keyboardDismissMode="none">
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
                  <Text style={{ fontSize: 11, fontWeight: isActive ? '900' : '600', color: isActive ? T.accent : T.sub }}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* 목표 (목표시간 + 학교급) */}
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
          <Text style={[styles.goalLabel, { color: T.sub, marginTop: 8 }]}>학교급</Text>
          <View style={styles.schoolRow}>
            {[
              { id: 'elementary', label: '초등' },
              { id: 'middle', label: '중등' },
              { id: 'high', label: '고등' },
            ].map(s => {
              const sel = (app.settings.schoolLevel || 'high') === s.id;
              return (
                <TouchableOpacity key={s.id} onPress={() => app.updateSettings({ schoolLevel: s.id })}
                  style={[styles.schoolBtn, sel && { backgroundColor: T.accent, borderColor: T.accent }]}
                >
                  <Text style={{ fontSize: 13, fontWeight: sel ? '900' : '600', color: sel ? 'white' : T.text }}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* D-Day */}
        <Section title={`D-Day (${app.ddays.length}/10)`}>
          {app.ddays.map(dd => (
            <View key={dd.id} style={[styles.ddayRow, { borderColor: T.border }]}>
              <TouchableOpacity onPress={() => app.setPrimaryDDay(dd.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: dd.isPrimary ? T.gold : T.border, fontSize: 16 }}>★</Text>
                <View><Text style={[styles.ddayLabel, { color: T.text }]}>{dd.label}</Text>
                  <Text style={[styles.ddayDate, { color: T.sub }]}>{dd.date}{dd.days > 1 ? ` (${dd.days}일간)` : ''}</Text></View>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
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

        {/* 🔥 집중 도전 모드 */}
        <Section title="🔥 집중 도전 모드">
          <Text style={[styles.hint, { color: T.text, fontWeight: '700', marginBottom: 4 }]}>🔥모드 잠금 강도</Text>
          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 8 }}>
            {/* desc: 문구=챌린지 도전 문구, 정지=타이머 일시정지 */}
            {[
              { id: 'normal', label: '🟢 일반', desc: '알림만' },
              { id: 'focus', label: '🟡 집중', desc: '챌린지 문구' },
              { id: 'exam', label: '🔴 시험', desc: '정지 + 문구' },
            ].map(lv => {
              const sel = (app.settings.ultraFocusLevel || 'focus') === lv.id;
              return (
                <TouchableOpacity key={lv.id} onPress={() => app.updateSettings({ ultraFocusLevel: lv.id })}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: sel ? (lv.id === 'exam' ? '#FF6B6B' : lv.id === 'focus' ? '#FFB74D' : '#4CAF50') : T.border, backgroundColor: sel ? (lv.id === 'exam' ? '#FF6B6B15' : lv.id === 'focus' ? '#FFB74D15' : '#4CAF5015') : 'transparent', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: sel ? T.text : T.sub }}>{lv.label}</Text>
                  <Text style={{ fontSize: 9, color: T.sub, marginTop: 2 }}>{lv.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: T.sub }]}>
            {(app.settings.ultraFocusLevel || 'focus') === 'normal' ? '🔥모드에서 이탈 시 알림만 보내요' :
             (app.settings.ultraFocusLevel || 'focus') === 'focus' ? '🔥모드에서 1분 이상 이탈 시 챌린지 문구 입력' :
             '🔥모드에서 이탈 즉시 타이머 일시정지 + 챌린지 문구 입력'}
          </Text>
          <Text style={[styles.hint, { color: T.sub, marginTop: 4 }]}>
            💡 타이머 시작 시 🔥집중 도전 / 📖편하게 공부 중 선택해요
          </Text>
          <Text style={[styles.hint, { color: T.sub, marginTop: 4 }]}>💡 문구 = 챌린지 도전 문구, 정지 = 타이머 일시정지</Text>
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: T.text, marginTop: 10, marginBottom: 6 }}>✏️ 나만의 챌린지 문구</Text>
            <ChallengeInput
              initial={app.settings.challengeText}
              onSave={(v) => { app.updateSettings({ challengeText: v }); app.showToastCustom('챌린지 문구가 저장됐어요!', 'toru'); }}
              T={T}
            />
          </View>
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
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: T.text, marginBottom: 6 }}>테마 컬러</Text>
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
                    <Text style={{ fontSize: 8, fontWeight: sel ? '800' : '500', color: sel ? T.text : T.sub }}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: T.text, marginBottom: 6 }}>글꼴</Text>
            <View style={styles.fontGrid}>
              {[
                { id: 'default',     label: '기본', sample: '시스템 기본 글꼴', ready: true },
                { id: 'pretendard',  label: 'Pretendard', sample: '깔끔한 고딕체', ready: true },
                { id: 'gowunDodum',  label: '고운돋움', sample: '부드러운 느낌', ready: true },
                { id: 'nanumSquare', label: '나눔스퀘어', sample: '단정한 느낌', ready: true },
                { id: 'cookieRun',   label: '쿠키런', sample: '귀여운 느낌', ready: true },
                { id: 'maplestory',  label: '메이플스토리', sample: '재밌는 느낌', ready: true },
              ].map(f => {
                const sel = (app.settings.fontFamily || 'default') === f.id;
                // 현재 옵션에 맞는 fontFamily 문자열 계산
                const fam = f.id === 'default' ? undefined : FONT_FAMILY_MAP[f.id];
                const famStyle = fam ? { fontFamily: fam } : {};
                return (
                  <TouchableOpacity key={f.id}
                    onPress={() => f.ready ? app.updateSettings({ fontFamily: f.id }) : app.showToastCustom('다음 업데이트에서 만나요! 🎨', 'toru')}
                    style={[styles.fontItem, sel && { borderColor: T.accent, backgroundColor: T.accent + '10' }, !sel && { borderColor: T.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[{ fontSize: 13, fontWeight: '800', color: sel ? T.accent : T.text }, famStyle]}>{f.label}</Text>
                      <Text style={[{ fontSize: 10, color: T.sub, marginTop: 1 }, famStyle]}>{f.sample}</Text>
                    </View>
                    {sel && <Text style={{ fontSize: 14 }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ fontSize: 9, color: T.sub, marginTop: 6 }}>💡 폰트를 변경하면 앱이 잠시 다시 로딩돼요</Text>
          </View>
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

        {/* 사용 가이드 */}
        <Section title="도움말">
          <TouchableOpacity onPress={() => setShowGuide(true)}>
            <Row label="📖 사용 가이드" right={<Text style={{ color: T.sub }}>→</Text>} />
          </TouchableOpacity>
          <TouchableOpacity onPress={resetGuides}>
            <Row label="💡 한줄 가이드 다시 보기" right={<Text style={{ fontSize: 10, color: T.sub }}>초기화</Text>} />
          </TouchableOpacity>
        </Section>

        {/* 정보 */}
        <Section title="정보">
          <Row label="버전" right={<Text style={[styles.rowValue, { color: T.sub }]}>1.0.0</Text>} />
          <TouchableOpacity onPress={() => Linking.openURL('https://lds77.github.io/suneung-timer-native/privacy-policy.html')}>
            <Row label="개인정보 처리방침" right={<Text style={{ color: T.sub }}>→</Text>} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL('mailto:dongsikl51@gmail.com?subject=열공 멀티타이머 피드백')}>
            <Row label="피드백 보내기" right={<Text style={{ color: T.sub }}>→</Text>} />
          </TouchableOpacity>
        </Section>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* D-Day 추가 모달 (캘린더 피커) */}
      <Modal visible={showDDayModal} transparent animationType="fade">
        <View style={styles.modalOverlay}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}><View style={[styles.modal, { backgroundColor: T.card, borderColor: T.border }]}>
            <Text style={[styles.modalTitle, { color: T.text }]}>📅 D-Day 추가</Text>
            {/* 프리셋 */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>{DDAY_PRESETS.map(p => (
              <TouchableOpacity key={p.label} style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: ddLabel === p.label ? T.accent : T.border }}
                onPress={() => { setDdLabel(p.label); if (p.date) setPickerSelected(p.date); }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: ddLabel === p.label ? T.accent : T.sub }}>{p.label}</Text></TouchableOpacity>
            ))}</View>
            <TextInput value={ddLabel} onChangeText={setDdLabel} placeholder="이름 (예: 중간고사)" placeholderTextColor={T.sub} maxLength={15}
              style={[styles.modalInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text }]} />
            {/* 캘린더 */}
            <View style={{ backgroundColor: T.surface, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: T.border, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <TouchableOpacity onPress={() => setPickerMonth(p => { const d = new Date(p); d.setMonth(d.getMonth()-1); return d; })}><Text style={{ color: T.accent, fontSize: 16, paddingHorizontal: 8 }}>◀</Text></TouchableOpacity>
                <Text style={{ color: T.text, fontSize: 13, fontWeight: '800' }}>{pickerStr}</Text>
                <TouchableOpacity onPress={() => setPickerMonth(p => { const d = new Date(p); d.setMonth(d.getMonth()+1); return d; })}><Text style={{ color: T.accent, fontSize: 16, paddingHorizontal: 8 }}>▶</Text></TouchableOpacity></View>
              <View style={{ flexDirection: 'row', marginBottom: 2 }}>{'일월화수목금토'.split('').map(d => <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: T.sub, fontWeight: '600' }}>{d}</Text>)}</View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{pickerCells.map((cell, i) => {
                if (!cell) return <View key={`e${i}`} style={{ width: '14.28%', height: 32 }} />;
                const sel = pickerSelected === cell.date, past = cell.date < today;
                return (<TouchableOpacity key={cell.date} style={{ width: '14.28%', height: 32, alignItems: 'center', justifyContent: 'center' }} onPress={() => !past && setPickerSelected(cell.date)} disabled={past}>
                  <View style={[{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, sel && { backgroundColor: T.accent }, past && { opacity: 0.3 }]}>
                    <Text style={{ fontSize: 11, fontWeight: sel ? '800' : '500', color: sel ? 'white' : T.text }}>{cell.day}</Text></View></TouchableOpacity>);
              })}</View>
            </View>
            {pickerSelected && <Text style={{ fontSize: 10, color: T.accent, textAlign: 'center', marginBottom: 6, fontWeight: '700' }}>선택: {pickerSelected}</Text>}
            {/* 날짜 직접 입력 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Text style={{ fontSize: 10, color: T.sub }}>직접 입력:</Text>
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
                style={{ flex: 1, borderWidth: 1, borderColor: T.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, color: T.text, backgroundColor: T.surface2 }}
                maxLength={10}
              />
            </View>
            {/* 기간 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Text style={{ fontSize: 11, color: T.sub }}>시험 기간</Text>
              <View style={{ flexDirection: 'row', gap: 3 }}>{[1,2,3,4,5].map(n => (
                <TouchableOpacity key={n} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: ddDays === n ? T.accent : T.border, backgroundColor: ddDays === n ? T.accent : 'transparent' }}
                  onPress={() => setDdDays(n)}><Text style={{ fontSize: 10, fontWeight: '700', color: ddDays === n ? 'white' : T.sub }}>{n}일</Text></TouchableOpacity>
              ))}</View></View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalCancel, { borderColor: T.border }]} onPress={() => { setShowDDayModal(false); setDdLabel(''); setPickerSelected(null); setDdDays(1); }}>
                <Text style={[styles.modalCancelText, { color: T.sub }]}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, { backgroundColor: T.accent }]} onPress={handleAddDDay}>
                <Text style={styles.modalConfirmText}>추가</Text></TouchableOpacity></View>
          </View></ScrollView></View>
      </Modal>

      {/* 📖 사용 가이드 모달 */}
      <Modal visible={showGuide} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 40 }}>
            <View style={[styles.modal, { backgroundColor: T.card, borderColor: T.border }]}>
              <Text style={[styles.modalTitle, { color: T.text }]}>📖 사용 가이드</Text>

              {/* 기본 사용법 */}
              <GuideSection title="⏰ 기본 사용법" color={T.accent} T={T}>
                {'1. 집중탭에서 즐겨찾기 또는 + 버튼으로 타이머 시작\n2. 🔥/📖 공부 모드를 선택\n3. 타이머가 끝나면 집중밀도 점수 확인!\n4. 통계탭에서 오늘/주간 기록을 확인해요'}
              </GuideSection>

              {/* 즐겨찾기 팁 */}
              <GuideSection title="⭐ 즐겨찾기 사용법" color="#FFD700" T={T}>
                {'• 리스트에 없는 타이머는 **실행 중일 때** 집중탭에서 꾹 누르면 즐겨찾기에 추가할 수 있어요\n• 울트라디안, 수능 시뮬레이션 같은 특별한 설정도 동일하게 등록됩니다\n• 즐겨찾기는 길게 눌러 삭제하거나 순서를 바꿀 수 있어요'}
              </GuideSection>

              {/* 집중 모드 */}
              <GuideSection title="🔥 집중 도전 vs 📖 편하게 공부" color="#FF6B6B" T={T}>
                {'🔥 집중 도전: 화면을 켜둔 채 공부해요.\n→ 화면이 자동으로 어두워지고 잠금 화면이 떠요\n→ 앱을 나가면 "이탈"로 기록돼요\n→ 이탈 0회 달성하면 🏆 Verified + 보너스 점수!\n\n📖 편하게 공부: 화면을 꺼도 괜찮아요.\n→ 알림이나 감지 없이 조용히 타이머만 돌아요\n→ 부담 없이 공부하고 싶을 때 추천!'}
              </GuideSection>

              {/* 집중밀도 */}
              <GuideSection title="📊 집중밀도란?" color="#6C5CE7" T={T}>
                {'같은 1시간을 공부해도 집중한 정도가 달라요.\n집중밀도는 "얼마나 몰입했는지"를 점수로 보여줘요.\n\n점수를 높이는 방법:\n• 타이머를 끝까지 완주하기 (중간에 안 끄기)\n• 일시정지 적게 하기\n• 🔥모드로 이탈 0회 달성하기\n• 매일 꾸준히 공부하기\n\n등급: S+ (전설) > S > A+ > A > B > C > D > F'}
              </GuideSection>

              {/* 잔디 */}
              <GuideSection title="🌱 365일 잔디" color="#4CAF50" T={T}>
                {'통계 > 잔디 탭에서 확인할 수 있어요.\n공부한 날은 칸이 색칠돼요!\n\n색상 의미:\n• 연한색 = 📖 편하게 공부한 날\n• 진한 초록 = 🔥 집중 도전한 날\n• 금색 ⭐ = 🏆 Verified 달성한 날!\n\n매일 채워서 365일 풀잔디에 도전해보세요!'}
              </GuideSection>

              {/* 학습법 */}
              <GuideSection title="🧠 학습법 — 왜 이 방법들인가요?" color="#E07050" T={T}>
                {'모든 학습법은 교육학·심리학 연구에서 효과가 검증된 방법이에요.\n\n🎮 미션 스프린트 (15분×3)\n게이미피케이션 연구(Deterding, 2011)에서 짧은 목표를 반복하면 동기부여가 30% 이상 높아진다는 결과가 있어요.\n\n📖 소리+묵독\n소리 내어 읽으면 기억력이 높아지는 "프로덕션 효과"(MacLeod, 2011). 읽는 것만으로도 기억이 77% 향상돼요.\n\n🔄 인터리빙\n한 과목만 계속하는 것보다 과목을 번갈아 공부하면 기억력이 43% 향상된다는 UCLA 연구 결과예요.\n\n⚡ 52-17 법칙\nDeskTime이 550만 건의 데이터를 분석한 결과, 52분 집중 + 17분 휴식이 가장 생산성이 높았어요.\n\n🌊 울트라디안 90\n수면과학자 Kleitman의 연구. 인간의 집중력은 90분 주기로 움직여요. 90분 집중 후 충분히 쉬면 다음 사이클도 높은 집중력 유지!\n\n🧊 하드 스타트\nMIT Barbara Oakley 교수의 방법. 어려운 걸 먼저 하면 뇌가 무의식적으로 계속 처리해요. 쉬운 걸 하는 동안에도!'}
              </GuideSection>

              {/* 닫기 */}
              <TouchableOpacity onPress={() => setShowGuide(false)} style={[styles.modalCancel, { borderColor: T.border, marginTop: 14 }]}>
                <Text style={[styles.modalCancelText, { color: T.sub }]}>닫기</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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

  // 학교급 선택 row (목표 섹션 내)
  schoolRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  schoolBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignItems: 'center' },

  // 폰트 선택 그리드
  fontGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fontItem: { width: '48%', flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5 },

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
