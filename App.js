// App.js
// 열공 멀티타이머 — 메인 진입점

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Modal,
  TextInput, ScrollView, Platform, Dimensions,
} from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { AppProvider, useApp } from './src/hooks/useAppState';
import { LIGHT, DARK, getTheme } from './src/constants/colors';
import { CHARACTERS, CHARACTER_LIST } from './src/constants/characters';
import { DEFAULT_SCHEDULES } from './src/constants/presets';
import { generateId } from './src/utils/format';
import { FONT_MAP, FONT_FAMILY_MAP } from './src/constants/fonts';
import CharacterAvatar from './src/components/CharacterAvatar';
import Toast from './src/components/Toast';

import FocusScreen from './src/screens/FocusScreen';
import SubjectsScreen from './src/screens/SubjectsScreen';
import StatsScreen from './src/screens/StatsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PlannerScreen from './src/screens/PlannerScreen';

const Tab = createBottomTabNavigator();

// 폰트 설정 데이터를 별도 파일로 분리했습니다.
// 필요 시 FONT_MAP, FONT_FAMILY_MAP를 가져다 쓰면 됩니다.

// 기본 글꼴로 복원할 때 사용하기 위해 원본 Text.render를 저장
const _originalTextRender = Text.render;
// 태블릿(iPad) 전용 텍스트 스케일 — 폰 대비 15% 크게
const _isTablet = Dimensions.get('window').width >= 600;
const _TABLET_FONT_SCALE = 1.15;


// ── 온보딩 (6단계) ──
function OnboardingScreen() {
  const app = useApp();
  const [step, setStep] = useState(0); // 0=캐릭터, 1=테마, 2=학교급, 3=D-Day, 4=과목, 5=15초체험
  const [selected, setSelected] = useState('toru');
  const [selectedAccent, setSelectedAccent] = useState('pink');
  const [selectedSchool, setSelectedSchool] = useState('high');
  const [selectedElemGrade, setSelectedElemGrade] = useState('upper');
  const [selectedGoalMin, setSelectedGoalMin] = useState(360);
  const T = getTheme(false, selectedAccent, 'medium'); // 선택한 테마 실시간 반영

  // ── 테마 옵션
  const ACCENT_OPTIONS = [
    { id: 'pink',   label: '로즈핑크', color: '#FF6B9D' },
    { id: 'purple', label: '퍼플',     color: '#6C5CE7' },
    { id: 'blue',   label: '블루',     color: '#4A90D9' },
    { id: 'mint',   label: '민트',     color: '#00B894' },
    { id: 'navy',   label: '네이비',   color: '#2C5F9E' },
    { id: 'coral',  label: '코랄',     color: '#E07050' },
  ];

  // ── 학교급 옵션
  const SCHOOL_OPTIONS = [
    { school: 'elementary', grade: 'lower', label: '초등 1~3학년', icon: 'leaf-outline', goal: 60 },
    { school: 'elementary', grade: 'upper', label: '초등 4~6학년', icon: 'flower-outline', goal: 120 },
    { school: 'middle',     grade: null,    label: '중학생',        icon: 'book-outline', goal: 240 },
    { school: 'high',       grade: null,    label: '고등학생',      icon: 'flame-outline', goal: 360 },
    { school: 'nsuneung',   grade: null,    label: 'N수생',         icon: 'library-outline', goal: 480 },
    { school: 'university', grade: null,    label: '대학생',        icon: 'school-outline', goal: 300 },
    { school: 'exam_prep',  grade: null,    label: '공시생/자격증', icon: 'document-text-outline', goal: 480 },
  ];
  const handleSchoolSelect = (opt) => {
    setSelectedSchool(opt.school);
    setSelectedElemGrade(opt.grade || 'upper');
    setSelectedGoalMin(opt.goal);
  };

  // D-Day
  const [ddLabel, setDdLabel] = useState('');
  const [ddSelectedDates, setDdSelectedDates] = useState(new Set());
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const today = new Date().toISOString().split('T')[0];
  const toggleDdDate = (dateStr) => {
    setDdSelectedDates(prev => { const next = new Set(prev); if (next.has(dateStr)) next.delete(dateStr); else next.add(dateStr); return next; });
  };
  const ddSortedDates = React.useMemo(() => [...ddSelectedDates].sort(), [ddSelectedDates]);
  const ddStartDate = ddSortedDates.length > 0 ? ddSortedDates[0] : null;
  const ddEndDate = ddSortedDates.length > 0 ? ddSortedDates[ddSortedDates.length - 1] : null;
  const ddComputedDays = ddStartDate && ddEndDate ? Math.round((new Date(ddEndDate + 'T00:00:00') - new Date(ddStartDate + 'T00:00:00')) / 86400000) + 1 : 0;
  const DDAY_PRESETS = (() => {
    if (selectedSchool === 'high') return [
      { label: '수능 2026', date: '2026-11-19' },
      { label: '중간고사', date: null },
      { label: '기말고사', date: null },
      { label: '모의고사', date: null },
    ];
    if (selectedSchool === 'nsuneung') return [
      { label: '수능 2026', date: '2026-11-19' },
      { label: '모의고사', date: null },
      { label: '원서접수', date: null },
    ];
    if (selectedSchool === 'middle') return [
      { label: '중간고사', date: null },
      { label: '기말고사', date: null },
      { label: '전국연합', date: null },
    ];
    if (selectedSchool === 'university') return [
      { label: '중간고사', date: null },
      { label: '기말고사', date: null },
      { label: '졸업', date: null },
    ];
    if (selectedSchool === 'exam_prep') return [
      { label: '필기시험', date: null },
      { label: '실기시험', date: null },
      { label: '면접', date: null },
    ];
    return [
      { label: '중간고사', date: null },
      { label: '기말고사', date: null },
      { label: '경시대회', date: null },
    ];
  })();
  const pickerStr = `${pickerMonth.getFullYear()}.${String(pickerMonth.getMonth() + 1).padStart(2, '0')}`;
  const pickerCells = React.useMemo(() => {
    const y = pickerMonth.getFullYear(), m = pickerMonth.getMonth();
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    const cells = Array(first.getDay()).fill(null);
    for (let d = 1; d <= last.getDate(); d++) cells.push({ day: d, date: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    return cells;
  }, [pickerMonth]);
  const addDDay = () => {
    if (!ddLabel.trim() || ddSelectedDates.size === 0) return;
    app.addDDay({ label: ddLabel.trim(), date: ddStartDate, days: ddComputedDays });
    setDdLabel(''); setDdSelectedDates(new Set());
  };

  // 과목
  const [subjName, setSubjName] = useState('');
  const SUBJ_PRESETS = (() => {
    if (selectedSchool === 'elementary') return [
      { name: '국어', color: '#E8575A' }, { name: '수학', color: '#4A90D9' },
      { name: '영어', color: '#5CB85C' }, { name: '과학', color: '#F5A623' },
      { name: '사회', color: '#9B6FC3' }, { name: '한자', color: '#E17055' },
    ];
    if (selectedSchool === 'university') return [
      { name: '전공', color: '#4A90D9' }, { name: '교양', color: '#5CB85C' },
      { name: '영어', color: '#E8575A' }, { name: '수학', color: '#F5A623' },
      { name: '자격증', color: '#9B6FC3' }, { name: '기타', color: '#E17055' },
    ];
    if (selectedSchool === 'exam_prep') return [
      { name: '국어', color: '#E8575A' }, { name: '영어', color: '#5CB85C' },
      { name: '한국사', color: '#F5A623' }, { name: '행정학', color: '#4A90D9' },
      { name: '행정법', color: '#9B6FC3' }, { name: '기타', color: '#E17055' },
    ];
    return [
      { name: '국어', color: '#E8575A' }, { name: '수학', color: '#4A90D9' },
      { name: '영어', color: '#5CB85C' }, { name: '과학', color: '#F5A623' },
      { name: '사회', color: '#9B6FC3' }, { name: '역사', color: '#E17055' },
    ];
  })();

  const getSchoolDefaultFavs = (school) => {
    const pomo = (w, b, label) => ({ id: `def_pomo_${w}`, label: label, icon: '🍅', type: 'pomodoro', color: '#E17055', totalSec: 0, pomoWorkMin: w, pomoBreakMin: b });
    const cd = (min, label, color) => ({ id: `def_cd_${min}`, label: label, icon: '⏰', type: 'countdown', color: color, totalSec: min * 60 });
    if (school === 'elementary_lower') return [pomo(10, 5, '뽀모 10+5'), cd(15, '15분', '#5CB85C'), cd(20, '20분', '#4A90D9'), cd(25, '25분', '#9B6FC3')];
    if (school === 'elementary' || school === 'elementary_upper') return [pomo(15, 5, '뽀모 15+5'), cd(20, '20분', '#5CB85C'), cd(30, '30분', '#4A90D9'), cd(45, '45분', '#9B6FC3')];
    if (school === 'middle') return [pomo(25, 5, '뽀모 25+5'), cd(30, '30분', '#5CB85C'), cd(45, '45분', '#4A90D9'), cd(60, '1시간', '#9B6FC3')];
    if (school === 'university') return [pomo(25, 5, '뽀모 25+5'), cd(45, '45분', '#5CB85C'), cd(60, '1시간', '#4A90D9'), cd(90, '90분', '#9B6FC3')];
    if (school === 'exam_prep') return [pomo(50, 10, '뽀모 50+10'), cd(60, '1시간', '#5CB85C'), cd(90, '90분', '#4A90D9'), cd(120, '2시간', '#9B6FC3')];
    return [pomo(25, 5, '뽀모 25+5'), cd(45, '45분', '#5CB85C'), cd(60, '1시간', '#4A90D9'), cd(90, '90분', '#9B6FC3')];
  };

  const handleFinish = () => {
    const schoolLevel = selectedSchool === 'elementary'
      ? `elementary_${selectedElemGrade}` : selectedSchool;
    app.updateSettings({
      mainCharacter: selected,
      accentColor: selectedAccent,
      schoolLevel,
      elemGrade: selectedElemGrade,
      dailyGoalMin: selectedGoalMin,
      onboardingDone: true,
    });
    app.setFavs?.(getSchoolDefaultFavs(schoolLevel));

    // 학교급 기본 시간표 자동 적용
    const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const template = DEFAULT_SCHEDULES[schoolLevel];
    if (template) {
      const newWs = { enabled: true };
      DAY_KEYS.forEach(key => {
        const src = weekdays.includes(key) ? template.weekday : template.weekend;
        newWs[key] = {
          fixed: (src.fixed || []).map(f => ({ ...f, id: generateId('f_') })),
          plans: (src.plans || []).map((p, idx) => ({ ...p, id: generateId('p_'), order: idx, subjectId: null })),
        };
      });
      app.setWeeklySchedule?.(newWs);
    }
  };

  return (
    <SafeAreaView style={[styles.onboarding, { backgroundColor: T.bg }]}>
      <StatusBar barStyle="dark-content" />
      {/* 진행 표시 (6단계) */}
      <View style={styles.obProgress}>
        {[0,1,2,3,4,5].map(i => (
          <View key={i} style={[styles.obDot, { backgroundColor: i <= step ? T.accent : T.border }]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.obScroll} showsVerticalScrollIndicator={false}>

      {/* ═══ Step 0: 캐릭터 ═══ */}
      {step === 0 && (
        <View style={styles.obStep}>
          <Ionicons name="people-outline" size={36} color={T.accent} />
          <Text style={[styles.obTitle, { color: T.text }]}>함께할 친구를 골라줘!</Text>
          <Text style={[styles.obSub, { color: T.sub }]}>공부할 때 응원해주는 캐릭터야</Text>
          <View style={styles.charGrid}>
            {CHARACTER_LIST.map(cId => {
              const c = CHARACTERS[cId];
              const active = selected === cId;
              return (
                <TouchableOpacity key={cId}
                  style={[styles.charCard, { backgroundColor: active ? c.bgColor : T.card, borderColor: active ? T.accent : T.border, borderWidth: active ? 2.5 : 1 }]}
                  onPress={() => setSelected(cId)}>
                  <CharacterAvatar characterId={cId} size={56} mood={active ? 'happy' : 'normal'} />
                  <Text style={[styles.charName, { color: active ? T.accent : T.text }]}>{c.name}</Text>
                  <Text style={[styles.charDesc, { color: T.sub }]} numberOfLines={1}>{c.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={[styles.obBtn, { backgroundColor: T.accent }]} onPress={() => setStep(1)}>
            <Text style={styles.obBtnT}>다음 →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ═══ Step 1: 테마 색상 ═══ */}
      {step === 1 && (
        <View style={styles.obStep}>
          <Ionicons name="color-palette-outline" size={36} color={T.accent} />
          <Text style={[styles.obTitle, { color: T.text }]}>테마 색상을 골라줘!</Text>
          <Text style={[styles.obSub, { color: T.sub }]}>앱 전체 색상이 바뀌어요</Text>
          <View style={styles.accentGrid}>
            {ACCENT_OPTIONS.map(opt => {
              const active = selectedAccent === opt.id;
              return (
                <TouchableOpacity key={opt.id}
                  style={[styles.accentCard, { backgroundColor: active ? opt.color + '20' : T.card, borderColor: active ? opt.color : T.border, borderWidth: active ? 2.5 : 1 }]}
                  onPress={() => setSelectedAccent(opt.id)}>
                  <View style={[styles.accentDot, { backgroundColor: opt.color }]} />
                  <Text style={[styles.accentLabel, { color: active ? opt.color : T.text }]}>{opt.label}</Text>
                  {active && <Text style={{ fontSize: 11, color: opt.color }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.obBtnRow}>
            <TouchableOpacity style={[styles.obBtnSec, { borderColor: T.border }]} onPress={() => setStep(0)}>
              <Text style={{ color: T.sub, fontWeight: '700', fontSize: 14 }}>← 이전</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.obBtn, { backgroundColor: T.accent, flex: 1 }]} onPress={() => setStep(2)}>
              <Text style={styles.obBtnT}>다음 →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ═══ Step 2: 학교급 ═══ */}
      {step === 2 && (
        <View style={styles.obStep}>
          <Ionicons name="school-outline" size={36} color={T.accent} />
          <Text style={[styles.obTitle, { color: T.text }]}>나는 어떤 학생이야?</Text>
          <Text style={[styles.obSub, { color: T.sub }]}>학습 단계에 맞게 추천이 달라져요</Text>
          <View style={styles.schoolGrid}>
            {SCHOOL_OPTIONS.map(opt => {
              const active = selectedSchool === opt.school && (opt.grade !== null ? selectedElemGrade === opt.grade : true);
              return (
                <TouchableOpacity key={opt.label}
                  style={[styles.schoolCard, { backgroundColor: active ? T.accent + '15' : T.card, borderColor: active ? T.accent : T.border, borderWidth: active ? 2.5 : 1 }]}
                  onPress={() => handleSchoolSelect(opt)}>
                  <Ionicons name={opt.icon} size={22} color={active ? T.accent : T.sub} />
                  <Text style={[styles.schoolLabel, { color: active ? T.accent : T.text }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.obBtnRow}>
            <TouchableOpacity style={[styles.obBtnSec, { borderColor: T.border }]} onPress={() => setStep(1)}>
              <Text style={{ color: T.sub, fontWeight: '700', fontSize: 14 }}>← 이전</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.obBtn, { backgroundColor: T.accent, flex: 1 }]} onPress={() => setStep(3)}>
              <Text style={styles.obBtnT}>다음 →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ═══ Step 3: D-Day ═══ */}
      {step === 3 && (
        <View style={styles.obStep}>
          <Ionicons name="calendar-outline" size={36} color={T.accent} />
          <Text style={[styles.obTitle, { color: T.text }]}>시험 D-Day를 설정해!</Text>
          <Text style={[styles.obSub, { color: T.sub }]}>나중에 설정에서 추가/수정할 수 있어</Text>
          <View style={styles.obPresetRow}>
            {DDAY_PRESETS.map(p => (
              <TouchableOpacity key={p.label} style={[styles.obPreset, { borderColor: ddLabel === p.label ? T.accent : T.border, backgroundColor: ddLabel === p.label ? T.accent + '15' : T.card }]}
                onPress={() => { setDdLabel(p.label); if (p.date) { setDdSelectedDates(new Set([p.date])); const d = new Date(p.date + 'T00:00:00'); setPickerMonth(new Date(d.getFullYear(), d.getMonth(), 1)); } }}>
                <Text style={[styles.obPresetT, { color: ddLabel === p.label ? T.accent : T.sub }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput value={ddLabel} onChangeText={setDdLabel} placeholder="이름 (예: 중간고사)" placeholderTextColor={T.sub}
            style={[styles.obInput, { borderColor: T.border, backgroundColor: T.card, color: T.text }]} />
          <View style={[styles.obCalendar, { backgroundColor: T.card, borderColor: T.border }]}>
            <View style={styles.obCalNav}>
              <TouchableOpacity onPress={() => setPickerMonth(p => { const d = new Date(p); d.setMonth(d.getMonth()-1); return d; })}>
                <Text style={{ color: T.accent, fontSize: 16, paddingHorizontal: 10 }}>◀</Text>
              </TouchableOpacity>
              <Text style={{ color: T.text, fontSize: 14, fontWeight: '800' }}>{pickerStr}</Text>
              <TouchableOpacity onPress={() => setPickerMonth(p => { const d = new Date(p); d.setMonth(d.getMonth()+1); return d; })}>
                <Text style={{ color: T.accent, fontSize: 16, paddingHorizontal: 10 }}>▶</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              {'일월화수목금토'.split('').map(d => <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: T.sub, fontWeight: '600' }}>{d}</Text>)}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {pickerCells.map((cell, i) => {
                if (!cell) return <View key={`e${i}`} style={{ width: '14.28%', height: 34 }} />;
                const sel = ddSelectedDates.has(cell.date);
                const inRange = ddStartDate && ddEndDate && cell.date >= ddStartDate && cell.date <= ddEndDate;
                const past = cell.date < today;
                return (
                  <TouchableOpacity key={cell.date} style={{ width: '14.28%', height: 34, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => !past && toggleDdDate(cell.date)} disabled={past}>
                    <View style={[
                      { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
                      sel && { backgroundColor: T.accent },
                      !sel && inRange && { backgroundColor: T.accent + '25' },
                      past && { opacity: 0.3 },
                    ]}>
                      <Text style={{ fontSize: 12, fontWeight: sel ? '800' : '500', color: sel ? 'white' : T.text }}>{cell.day}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {/* 선택된 날짜 요약 */}
          {ddSelectedDates.size > 0 && ddLabel.trim() ? (
            <View style={{ backgroundColor: T.accent + '10', borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: T.accent + '30' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.text, textAlign: 'center' }}>
                {ddLabel} · {ddSelectedDates.size === 1 ? ddStartDate : `${ddStartDate} ~ ${ddEndDate} (${ddComputedDays}일)`}
              </Text>
            </View>
          ) : ddSelectedDates.size > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8 }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: T.accent + '15' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: T.accent }}>
                  {ddSelectedDates.size === 1 ? ddStartDate : `${ddStartDate} ~ ${ddEndDate} (${ddComputedDays}일)`}
                </Text>
              </View>
            </View>
          ) : null}
          {app.ddays.length > 0 && (
            <View style={styles.obDDayList}>
              {app.ddays.map(dd => (
                <View key={dd.id} style={[styles.obDDayItem, { backgroundColor: T.card, borderColor: T.border }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: T.text }}>{dd.label}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: T.accent }}>{dd.date}{dd.days > 1 ? ` (${dd.days}일간)` : ''}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.obBtnRow}>
            <TouchableOpacity style={[styles.obBtnSec, { borderColor: T.border }]} onPress={() => setStep(2)}>
              <Text style={{ color: T.sub, fontWeight: '700', fontSize: 14 }}>← 이전</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.obBtn, { backgroundColor: T.accent, flex: 1 }]} onPress={() => {
              if (ddSelectedDates.size > 0 && ddLabel.trim()) addDDay();
              setStep(4);
            }}>
              <Text style={styles.obBtnT}>{app.ddays.length > 0 || (ddSelectedDates.size > 0 && ddLabel.trim()) ? '다음 →' : '건너뛰기 →'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ═══ Step 4: 과목 ═══ */}
      {step === 4 && (
        <View style={styles.obStep}>
          <Ionicons name="library-outline" size={36} color={T.accent} />
          <Text style={[styles.obTitle, { color: T.text }]}>공부할 과목을 추가해!</Text>
          <Text style={[styles.obSub, { color: T.sub }]}>탭하면 바로 추가돼. 나중에 수정 가능!</Text>
          <View style={styles.obSubjGrid}>
            {SUBJ_PRESETS.map(s => {
              const added = app.subjects.some(x => x.name === s.name);
              return (
                <TouchableOpacity key={s.name}
                  style={[styles.obSubjBtn, { backgroundColor: added ? s.color + '20' : T.card, borderColor: added ? s.color : T.border }]}
                  onPress={() => { if (!added) app.addSubject({ name: s.name, color: s.color }); }}>
                  <Ionicons name={added ? 'checkmark-circle' : 'add-circle-outline'} size={22} color={added ? s.color : T.sub} style={{ marginBottom: 2 }} />
                  <Text style={[styles.obSubjName, { color: added ? s.color : T.text }]}>{s.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.obSubjInputRow}>
            <TextInput value={subjName} onChangeText={setSubjName} placeholder="직접 입력 (예: 한국사)" placeholderTextColor={T.sub}
              style={[styles.obInput, { borderColor: T.border, backgroundColor: T.card, color: T.text, flex: 1 }]} />
            <TouchableOpacity style={[styles.obSubjAddBtn, { backgroundColor: T.accent }]}
              onPress={() => { if (subjName.trim()) { app.addSubject({ name: subjName.trim(), color: T.accent }); setSubjName(''); } }}>
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>추가</Text>
            </TouchableOpacity>
          </View>
          {app.subjects.length > 0 && (
            <View style={styles.obSubjList}>
              {app.subjects.map(s => (
                <View key={s.id} style={[styles.obSubjChip, { backgroundColor: s.color + '15', borderColor: s.color + '40' }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: s.color }}>{s.name}</Text>
                </View>
              ))}
            </View>
          )}
          {/* 알림 안내 */}
          <View style={{ marginHorizontal: 4, marginBottom: 14, padding: 14, borderRadius: 14, backgroundColor: T.accent + '12', borderWidth: 1, borderColor: T.accent + '30' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <Ionicons name="notifications-outline" size={14} color={T.accent} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: T.accent }}>알림 설정 완료!</Text>
            </View>
            <Text style={{ fontSize: 12, color: T.sub, lineHeight: 18 }}>
              타이머 완료 알림, 공부 리마인더가 자동으로 켜져 있어요.{'\n'}
              알림이 오지 않으면 설정 탭 {'>'} 사용 가이드에서 확인해주세요.
            </Text>
          </View>
          <View style={styles.obBtnRow}>
            <TouchableOpacity style={[styles.obBtnSec, { borderColor: T.border }]} onPress={() => setStep(3)}>
              <Text style={{ color: T.sub, fontWeight: '700', fontSize: 14 }}>← 이전</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.obBtn, { backgroundColor: T.accent, flex: 1 }]} onPress={() => setStep(5)}>
              <Text style={styles.obBtnT}>다음 →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ═══ Step 5: 15초 집중 체험 ═══ */}
      {step === 5 && <OnboardingTrial T={T} selected={selected} handleFinish={handleFinish} goBack={() => setStep(4)} />}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── 온보딩 15초 체험 컴포넌트 ──
function OnboardingTrial({ T, selected, handleFinish, goBack }) {
  const app = useApp();
  const TRIAL_SEC = 15;
  const [phase, setPhase] = useState('ready'); // ready → running → done
  const [remain, setRemain] = useState(TRIAL_SEC);
  const [elapsed, setElapsed] = useState(0);
  const [viewMode, setViewMode] = useState('default'); // mini | default | full
  const intervalRef = useRef(null);
  const startedAtRef = useRef(null);

  const startTrial = () => {
    setPhase('running');
    setRemain(TRIAL_SEC);
    setElapsed(0);
    startedAtRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const el = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const r = Math.max(0, TRIAL_SEC - el);
      setElapsed(el);
      setRemain(r);
      if (r <= 0) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setPhase('done');
      }
    }, 200);
  };

  const skipTrial = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    handleFinish();
  };

  const finishWithSession = () => {
    const firstSubject = app.subjects.length > 0 ? app.subjects[0] : null;
    app.recordSession({
      subjectId: firstSubject?.id || null,
      label: firstSubject?.name || '체험',
      startedAt: startedAtRef.current,
      durationSec: TRIAL_SEC,
      mode: 'countdown',
      timerType: 'countdown',
      completionRatio: 1,
      focusMode: 'screen_on',
      densityOverride: 95,
    });
    handleFinish();
  };

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const progress = elapsed / TRIAL_SEC;
  const timeStr = `0:${String(remain).padStart(2, '0')}`;

  const Svg = require('react-native-svg').default;
  const { Circle } = require('react-native-svg');

  const screenW = Dimensions.get('window').width;
  const onbTablet = screenW >= 600;
  // 실제 FocusScreen과 동일한 링 크기 (태블릿 대응)
  const RING_DEF = onbTablet ? Math.min(screenW * 0.38, 340) : Math.min(screenW - 72, 248);
  const STROKE_DEF = onbTablet ? 16 : 14;
  const R_DEF = (RING_DEF - STROKE_DEF) / 2;
  const C_DEF = 2 * Math.PI * R_DEF;

  const RING_FULL = onbTablet ? Math.min(screenW * 0.5, 460) : Math.min(screenW - 40, 300);
  const STROKE_FULL = onbTablet ? 20 : 16;
  const R_FULL = (RING_FULL - STROKE_FULL) / 2;
  const C_FULL = 2 * Math.PI * R_FULL;

  // 뷰 모드 전환 탭
  const ViewModeTab = () => (
    <View style={{ flexDirection: 'row', backgroundColor: T.surface2, borderRadius: 8, padding: 2, gap: 1 }}>
      {[{ id: 'mini', label: '미니' }, { id: 'default', label: '기본' }, { id: 'full', label: '전체' }].map(opt => (
        <TouchableOpacity key={opt.id} onPress={() => setViewMode(opt.id)}
          style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: viewMode === opt.id ? T.accent : 'transparent' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: viewMode === opt.id ? 'white' : T.sub }}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={[styles.obStep, phase === 'running' && { paddingHorizontal: 0 }]}>
      {phase === 'ready' && (
        <>
          <CharacterAvatar characterId={selected} size={72} mood="happy" />
          <Text style={[styles.obTitle, { color: T.text, marginTop: 12 }]}>15초 집중 체험</Text>
          <Text style={[styles.obSub, { color: T.sub, lineHeight: 20 }]}>
            타이머가 어떻게 동작하는지{'\n'}잠깐 체험해 볼까?
          </Text>
          <View style={{ marginTop: 20, gap: 10, width: '100%', paddingHorizontal: 20 }}>
            <TouchableOpacity style={[styles.obBtn, { backgroundColor: T.accent }]} onPress={startTrial}>
              <Text style={styles.obBtnT}>15초 집중 시작</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.obBtnSec, { borderColor: T.border }]} onPress={skipTrial}>
              <Text style={{ color: T.sub, fontWeight: '700', fontSize: 14 }}>건너뛰기</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={goBack} style={{ marginTop: 14 }}>
            <Text style={{ color: T.sub, fontSize: 13 }}>← 이전</Text>
          </TouchableOpacity>
        </>
      )}

      {phase === 'running' && (
        <View style={{ flex: 1, width: '100%' }}>
          {/* ── 미니 모드: 상단 1줄 바 ── */}
          {viewMode === 'mini' && (
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8,
                backgroundColor: T.card, borderBottomWidth: 1, borderBottomColor: T.border }}>
                <Ionicons name="alarm-outline" size={16} color={T.accent} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: T.text }} numberOfLines={1}>15초 체험</Text>
                <Text style={{ fontSize: 22, fontWeight: '900', color: T.accent, fontVariant: ['tabular-nums'], minWidth: 70, textAlign: 'right' }}>
                  {timeStr}
                </Text>
                <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#E8404720' }}>
                  <Text style={{ fontSize: 15, color: '#E84047' }}>||</Text>
                </View>
                <ViewModeTab />
              </View>
              {/* 미니 모드 아래 빈 공간 — 실제 앱에서는 과목 카드 등이 보이는 영역 */}
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
                <Text style={{ fontSize: 13, color: T.sub, textAlign: 'center', lineHeight: 20 }}>
                  미니 모드에서는 상단에 타이머가{'\n'}작게 표시되고 아래에 과목 카드가 보여요
                </Text>
              </View>
            </View>
          )}

          {/* ── 기본 모드: 카드 + 링 타이머 ── */}
          {viewMode === 'default' && (
            <View style={{ flex: 1 }}>
              <View style={{ backgroundColor: T.card, borderWidth: 1.5, borderColor: T.accent, borderRadius: T.cardRadius, margin: 10, padding: 16, paddingBottom: 14 }}>
                {/* 상단 행 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Ionicons name="alarm-outline" size={15} color={T.accent} />
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: T.text }}>15초 체험</Text>
                  <ViewModeTab />
                </View>
                {/* 원형 타이머 링 */}
                <View style={{ alignItems: 'center', marginBottom: 14 }}>
                  <View style={{ width: RING_DEF, height: RING_DEF, alignItems: 'center', justifyContent: 'center' }}>
                    <Svg width={RING_DEF} height={RING_DEF} style={{ position: 'absolute' }}>
                      <Circle cx={RING_DEF / 2} cy={RING_DEF / 2} r={R_DEF}
                        stroke={T.surface2} strokeWidth={STROKE_DEF} fill="transparent" />
                      <Circle cx={RING_DEF / 2} cy={RING_DEF / 2} r={R_DEF}
                        stroke={T.accent} strokeWidth={STROKE_DEF} fill="transparent"
                        strokeDasharray={C_DEF} strokeDashoffset={C_DEF * (1 - progress)}
                        strokeLinecap="round"
                        transform={`rotate(-90, ${RING_DEF / 2}, ${RING_DEF / 2})`} />
                    </Svg>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 50, fontWeight: T.timerFontWeight, color: T.accent, fontVariant: ['tabular-nums'], letterSpacing: 1 }}>
                        {timeStr}
                      </Text>
                      <Text style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>집중 중</Text>
                    </View>
                  </View>
                </View>
                {/* 컨트롤 버튼 */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: T.surface2, alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>↺ 리셋</Text>
                  </View>
                  <View style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: T.surface2, alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: T.sub }}>■ 종료</Text>
                  </View>
                  <View style={{ flex: 2, paddingVertical: 11, borderRadius: 10, backgroundColor: '#E8404720', alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#E84047' }}>|| 일시정지</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* ── 전체 모드: 화면 가득 채우는 큰 링 ── */}
          {viewMode === 'full' && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 24 }}>
              {/* 라벨 + 모드 전환 */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8, width: '100%' }}>
                <Ionicons name="alarm-outline" size={18} color={T.accent} />
                <Text style={{ fontSize: 17, fontWeight: '800', color: T.text, flex: 1, textAlign: 'center' }}>15초 체험</Text>
                <ViewModeTab />
              </View>
              {/* 큰 링 */}
              <View style={{ width: RING_FULL, height: RING_FULL, alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
                <Svg width={RING_FULL} height={RING_FULL} style={{ position: 'absolute' }}>
                  <Circle cx={RING_FULL / 2} cy={RING_FULL / 2} r={R_FULL}
                    stroke={T.surface2} strokeWidth={STROKE_FULL} fill="transparent" />
                  <Circle cx={RING_FULL / 2} cy={RING_FULL / 2} r={R_FULL}
                    stroke={T.accent} strokeWidth={STROKE_FULL} fill="transparent"
                    strokeDasharray={C_FULL} strokeDashoffset={C_FULL * (1 - progress)}
                    strokeLinecap="round"
                    transform={`rotate(-90, ${RING_FULL / 2}, ${RING_FULL / 2})`} />
                </Svg>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 60, fontWeight: T.timerFontWeight, color: T.accent, fontVariant: ['tabular-nums'], letterSpacing: 2 }}>
                    {timeStr}
                  </Text>
                  <Text style={{ fontSize: 14, color: T.sub, marginTop: 4 }}>집중 중</Text>
                </View>
              </View>
              {/* 컨트롤 */}
              <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
                <View style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: T.surface2, alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: T.text }}>↺ 리셋</Text>
                </View>
                <View style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: T.surface2, alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: T.sub }}>■ 종료</Text>
                </View>
                <View style={{ flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: '#E8404720', alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#E84047' }}>|| 일시정지</Text>
                </View>
              </View>
            </View>
          )}

          {/* 건너뛰기 */}
          <TouchableOpacity onPress={skipTrial} style={{ alignSelf: 'center', paddingVertical: 12 }}>
            <Text style={{ color: T.sub, fontSize: 13 }}>건너뛰기 →</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'done' && (
        <>
          <Ionicons name="trophy" size={44} color={T.accent} style={{ marginBottom: 6 }} />
          <CharacterAvatar characterId={selected} size={64} mood="happy" />
          <Text style={[styles.obTitle, { color: T.text, marginTop: 10 }]}>첫 집중 완료!</Text>
          <Text style={[styles.obSub, { color: T.sub, lineHeight: 20 }]}>
            이렇게 매일 기록이 쌓이면{'\n'}잔디도 채워지고 실력도 올라가!
          </Text>
          <View style={{ flexDirection: 'row', gap: 20, marginTop: 16, marginBottom: 20 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: T.accent }}>30초</Text>
              <Text style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>공부시간</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#4CAF50' }}>95점</Text>
              <Text style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>집중밀도</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#FF7F50' }}>1일</Text>
              <Text style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>연속 공부</Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.obBtn, { backgroundColor: T.accent, width: '100%', marginHorizontal: 20 }]} onPress={finishWithSession}>
            <Text style={styles.obBtnT}>시작하기!</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ── 메인 ──
function MainApp() {
  const app = useApp();
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale);

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar barStyle={app.settings.darkMode ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <NavigationContainer>
          <Tab.Navigator screenOptions={{
            headerShown: false,
            tabBarStyle: { backgroundColor: T.tabBar, borderTopColor: T.tabBarBorder, borderTopWidth: 1, paddingTop: 4 },
            tabBarActiveTintColor: T.accent, tabBarInactiveTintColor: T.sub,
            tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: -2 },
          }}>
            <Tab.Screen name="Focus" component={FocusScreen}
              options={{ tabBarLabel: '집중', tabBarIcon: ({ color, size }) => <Ionicons name="timer-outline" size={size} color={color} /> }} />
            <Tab.Screen name="Subjects" component={SubjectsScreen}
              options={{ tabBarLabel: '과목', tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} /> }} />
            <Tab.Screen name="Planner" component={PlannerScreen}
              options={{ tabBarLabel: '플래너', tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} /> }} />
            <Tab.Screen name="Stats" component={StatsScreen}
              options={{ tabBarLabel: '통계', tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} /> }} />
            <Tab.Screen name="Settings" component={SettingsScreen}
              options={{ tabBarLabel: '설정', tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} /> }} />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaView>

      <Toast message={app.toast.message} characterId={app.toast.char} visible={app.toast.visible} colors={T} />

      {/* ⏰ 정확한 알람 권한 안내 모달 (Android 12+, 최초 1회) */}
      <Modal visible={!!app.showExactAlarmModal} transparent animationType="fade" onRequestClose={app.dismissExactAlarmModal}>
        <View style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: T.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 }}>
            <Text style={{ fontSize: 22, textAlign: 'center', marginBottom: 8 }}>⏰</Text>
            <Text style={{ fontSize: 17, fontWeight: '900', color: T.text, textAlign: 'center', marginBottom: 10 }}>정확한 알람 권한 필요</Text>
            <Text style={{ fontSize: 14, color: T.sub, textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
              {'타이머가 정확한 시간에 알림을 보내려면\n정확한 알람 권한이 필요해요.\n\n허용하지 않으면 알림이 늦게 오거나\n오지 않을 수 있어요.'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                app.dismissExactAlarmModal();
                IntentLauncher.startActivityAsync('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', { data: 'package:com.yeolgong.timer' }).catch(() => {});
              }}
              style={{ backgroundColor: T.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: 'white' }}>설정하기 →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={app.dismissExactAlarmModal} style={{ paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: T.sub }}>나중에 하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 전역 집중모드 선택 오버레이 (Modal 대신 absolute View — iOS Modal 중첩 freeze 방지) */}
      {!!app.pendingModeAction && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#00000088', justifyContent: 'center', alignItems: 'center', padding: 24, zIndex: 9999 }}>
          <View style={{ backgroundColor: T.card, borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center' }}>
            <CharacterAvatar characterId={app.settings.mainCharacter} size={54} mood="happy" />
            <Text style={{ fontSize: 18, fontWeight: '900', color: T.text, marginTop: 12, marginBottom: 4 }}>어떤 공부할래?</Text>
            <Text style={{ fontSize: 12, color: T.sub, marginBottom: 20, textAlign: 'center' }}>집중 방식을 선택하면 타이머가 시작돼요</Text>

            <TouchableOpacity
              style={{ width: '100%', padding: 16, borderRadius: 14, backgroundColor: '#FF6B6B15', borderWidth: 1.5, borderColor: '#FF6B6B60', marginBottom: 10 }}
              onPress={() => app.resolveModeSelect('screen_on')}
              activeOpacity={0.8}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Ionicons name="flash" size={15} color="#FF6B6B" />
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#FF6B6B' }}>화면 켜두고 집중 도전!</Text>
              </View>
              <Text style={{ fontSize: 11, color: T.sub }}>집중 점수 보너스에 도전해요</Text>
              <Text style={{ fontSize: 10, color: '#FF6B6B99', marginTop: 2 }}>이탈 0회 시 +15점! · 다크모드 자동 전환</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ width: '100%', padding: 16, borderRadius: 14, backgroundColor: '#4CAF5015', borderWidth: 1.5, borderColor: '#4CAF5060', marginBottom: 16 }}
              onPress={() => app.resolveModeSelect('screen_off')}
              activeOpacity={0.8}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Ionicons name="book-outline" size={15} color="#4CAF50" />
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#4CAF50' }}>화면 끄고 편하게 공부</Text>
              </View>
              <Text style={{ fontSize: 11, color: T.sub }}>집중 점수 없이 편하게 공부해요</Text>
              <Text style={{ fontSize: 10, color: '#4CAF5099', marginTop: 2 }}>화면 꺼도 OK · 알림 없음 · 기본 점수</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={app.cancelModeSelect}>
              <Text style={{ fontSize: 13, color: T.sub, fontWeight: '600' }}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function Root() {
  const app = useApp();
  // 폰트 로딩
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [loadedFont, setLoadedFont] = useState('default');

  useEffect(() => {
    const loadFont = async () => {
      const fontId = app.settings.fontFamily || 'default';
      if (fontId === 'default' || !FONT_MAP[fontId]) {
        // 시스템 폰트 — 태블릿이면 fontSize만 스케일, 아니면 원상복구
        if (_isTablet) {
          Text.render = function (...args) {
            const origin = _originalTextRender.call(this, ...args);
            const props = origin.props;
            if (props.testID === 'timer-text') return origin;
            if (props.testID === 'chevron') return origin;
            const flat = StyleSheet.flatten(props.style) || {};
            if (flat.fontFamily || !flat.fontSize) return origin;
            return React.cloneElement(origin, { style: { ...flat, fontSize: Math.round(flat.fontSize * _TABLET_FONT_SCALE) } });
          };
        } else {
          Text.render = _originalTextRender;
        }
        Text.defaultProps = Text.defaultProps || {};
        Text.defaultProps.style = undefined;
        TextInput.defaultProps = TextInput.defaultProps || {};
        TextInput.defaultProps.style = undefined;
        if (fontId !== 'default' && !FONT_MAP[fontId]) {
          // 폰트 파일이 아직 없음 → 기본으로 폴백
          app.updateSettings({ fontFamily: 'default' });
        }
        setLoadedFont('default');
        setFontsLoaded(true);
        return;
      }
      try {
        // 새로운 폰트를 로드하면 이름이 같아도 이전 것이 캐시되거나 덮어쓰기되지 않는 문제가 있으므로
        // 각 폰트마다 고유한 family 이름을 사용합니다. FONT_MAP의 키가 곧 alias가 됩니다.
        await Font.loadAsync(FONT_MAP[fontId]);
        // 전역 텍스트 렌더링을 가로채서 weight에 따라 올바른 패밀리를 지정하도록 패치
        const baseFamily = FONT_FAMILY_MAP[fontId];
        // Android(Fabric)에서 cloneElement 이후 재렌더링 시 flat.fontFamily에 이전 폰트가 남음.
        // → 우리 커스텀 폰트 family 목록을 만들어 두고, 해당 폰트는 새 폰트로 덮어씌움.
        // → 아이콘 등 외부 폰트(Ionicons 등)는 Set에 없으므로 자동으로 건너뜀.
        const _customFamilies = new Set(
          Object.values(FONT_FAMILY_MAP).flatMap(f => [f, f + '-Bold'])
        );
        // 항상 원본 render에서 시작 (중첩 방지), cloneElement로 props 불변성 유지
        Text.render = function (...args) {
          const origin = _originalTextRender.call(this, ...args);
          const props = origin.props;
          // testID="timer-text" 인 텍스트는 전역 폰트 적용 건너뜀 (타이머 숫자)
          if (props.testID === 'timer-text') return origin;
          // testID="chevron" 인 텍스트는 전역 폰트 적용 건너뜀 (화살표 기호 — 일부 폰트에 글리프 없음)
          if (props.testID === 'chevron') return origin;
          // testID="font-preview" 인 텍스트는 건너뜀 (폰트 피커 미리보기 — 자체 fontFamily 유지)
          if (props.testID === 'font-preview') return origin;
          const flat = StyleSheet.flatten(props.style) || {};
          // fontFamily가 있을 때: 우리 커스텀 폰트면 새 폰트로 교체, 외부 폰트(아이콘 등)면 건너뜀
          if (flat.fontFamily && !_customFamilies.has(flat.fontFamily)) return origin;
          const w = flat.fontWeight;
          const isBold = w && (w === 'bold' || parseInt(w, 10) >= 700);
          const family = isBold ? baseFamily + '-Bold' : baseFamily;
          // Android: fontFamily(Bold 변형) + fontWeight(700) 동시 적용 시 텍스트 사라짐
          // Bold 폰트 파일이 weight를 이미 내포하므로 fontWeight는 normal로 정규화
          const scaledSize = _isTablet && flat.fontSize ? Math.round(flat.fontSize * _TABLET_FONT_SCALE) : flat.fontSize;
          return React.cloneElement(origin, { style: { ...flat, fontFamily: family, fontWeight: 'normal', ...(scaledSize && { fontSize: scaledSize }) } });
        };
        setLoadedFont(fontId);
      } catch (e) {
        console.log('폰트 로딩 실패:', e);
        app.updateSettings({ fontFamily: 'default' });
      }
      setFontsLoaded(true);
    };
    setFontsLoaded(false);
    loadFont();
  }, [app.settings.fontFamily]);

  // 폰트 파일이 아직 없으면 기본으로 시작
  if (app.loading) return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#FF6B9D" />
      <Text style={styles.loadingText}>로딩 중...</Text>
    </View>
  );
  if (!app.settings.onboardingDone) return <OnboardingScreen />;
  // 폰트 로딩 중에는 MainApp을 언마운트하지 않고 오버레이만 씌움
  // (FocusScreen이 언마운트되면 screenLocked 상태가 초기화되어 집중모드 재잠금 버그 발생)
  // key={loadedFont}: 폰트 로드 완료 시 MainApp 전체 재마운트 → 모든 Text 컴포넌트가
  // 새로 렌더링되어 몽키패치된 Text.render 적용 보장. 오버레이가 가리는 동안 처리됨.
  return (
    <>
      <MainApp key={loadedFont} />
      {!fontsLoaded && (
        <View style={[StyleSheet.absoluteFill, styles.loading]}>
          <ActivityIndicator size="large" color="#FF6B9D" />
          <Text style={styles.loadingText}>로딩 중...</Text>
        </View>
      )}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider><Root /></AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F5FC' },
  loadingText: { marginTop: 12, fontSize: 13, color: '#8B8599', fontWeight: '600' },

  // 온보딩
  onboarding: { flex: 1 },
  obProgress: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 16, paddingBottom: 8 },
  obDot: { width: 28, height: 4, borderRadius: 2 },
  obScroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40 },
  obStep: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 10 },
  obTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  obSub: { fontSize: 13, textAlign: 'center', marginBottom: 20 },

  // Step 0: 캐릭터
  charGrid: { flexDirection: 'row', gap: 8, marginBottom: 24, width: '100%' },
  charCard: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14 },
  charName: { fontSize: 12, fontWeight: '800', marginTop: 6 },
  charDesc: { fontSize: 10, marginTop: 2, textAlign: 'center' },

  // Step 1: 테마 색상
  accentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24, width: '100%' },
  accentCard: { width: '30%', alignItems: 'center', paddingVertical: 14, borderRadius: 12, gap: 6 },
  accentDot: { width: 28, height: 28, borderRadius: 14 },
  accentLabel: { fontSize: 12, fontWeight: '800' },

  // Step 2: 학교급
  schoolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24, width: '100%' },
  schoolCard: { width: '47%', alignItems: 'center', paddingVertical: 18, borderRadius: 14, gap: 6 },
  schoolLabel: { fontSize: 14, fontWeight: '800' },

  // Step 3: 목표 시간
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24, width: '100%', justifyContent: 'center' },
  goalCard: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, minWidth: '28%', alignItems: 'center' },
  goalCardText: { fontSize: 15, fontWeight: '900' },

  // Step 4: D-Day
  obPresetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12, width: '100%' },
  obPreset: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  obPresetT: { fontSize: 11, fontWeight: '700' },
  obInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10, width: '100%' },
  obCalendar: { borderRadius: 12, padding: 10, borderWidth: 1, marginBottom: 10, width: '100%' },
  obCalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  obAddBtn: { paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center', width: '100%', marginBottom: 8 },
  obDDayList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, width: '100%' },
  obDDayItem: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignItems: 'center' },

  // Step 2: 과목
  obSubjGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14, width: '100%' },
  obSubjBtn: { width: '30%', alignItems: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1.5 },
  obSubjName: { fontSize: 13, fontWeight: '800' },
  obSubjInputRow: { flexDirection: 'row', gap: 8, width: '100%', marginBottom: 12 },
  obSubjAddBtn: { paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center' },
  obSubjList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12, width: '100%' },
  obSubjChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },

  // 공통 버튼
  obBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', width: '100%' },
  obBtnT: { color: 'white', fontSize: 16, fontWeight: '900' },
  obBtnRow: { flexDirection: 'row', gap: 8, width: '100%', marginTop: 8 },
  obBtnSec: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
});
