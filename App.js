// App.js
// 열공 멀티타이머 — 메인 진입점

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Modal,
  TextInput, ScrollView, Platform, Dimensions,
  Animated, PanResponder, useWindowDimensions, Linking,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { enableFreeze } from 'react-native-screens';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { AppProvider, useApp } from './src/hooks/useAppState';
import { LIGHT, DARK, getTheme } from './src/constants/colors';
import { CHARACTERS, CHARACTER_LIST } from './src/constants/characters';
import { DEFAULT_SCHEDULES } from './src/constants/presets';
import { generateId } from './src/utils/format';
import { openExactAlarmSettings } from './src/utils/permissions';
import { FONT_MAP, FONT_FAMILY_MAP } from './src/constants/fonts';
import CharacterAvatar from './src/components/CharacterAvatar';
import Toast from './src/components/Toast';
import { getSchoolDefaultFavs } from './src/screens/focus/helpers';

import FocusScreen from './src/screens/FocusScreen';
import SubjectsScreen from './src/screens/SubjectsScreen';
import StatsScreen from './src/screens/StatsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PlannerScreen from './src/screens/PlannerScreen';

// 비활성 탭 화면 동결 — 타이머 실행 중 매초 Context가 갱신될 때 보이지 않는 탭
// (StatsScreen 등 무거운 화면)까지 리렌더되는 것을 차단 (배터리/버벅임 개선)
enableFreeze(true);

const Tab = createBottomTabNavigator();

// 폰트 설정 데이터를 별도 파일로 분리했습니다.
// 필요 시 FONT_MAP, FONT_FAMILY_MAP를 가져다 쓰면 됩니다.

// 태블릿(iPad) 전용 텍스트 스케일 — 폰 대비 15% 크게
const _isTablet = Dimensions.get('window').width >= 600;
const _TABLET_FONT_SCALE = 1.15;

// RN 0.81에서 Text는 순수 함수 컴포넌트 — Text.render 패치 불가.
// React.createElement를 가로채 Text/TextInput 생성 시 fontFamily를 주입한다.
const _origCreateElement = React.createElement.bind(React);
let _globalFont = null; // null = 시스템 폰트 | { base, bold, customFamilies, fontId }
React.createElement = function (type, props, ...children) {
  // 커스텀 폰트(_globalFont) 주입 또는 태블릿 폰트 보정(_isTablet) 둘 중 하나라도 필요하면 가로챈다.
  if ((_globalFont || _isTablet) && (type === Text || type === TextInput) && props) {
    const { testID } = props;
    if (testID !== 'timer-text' && testID !== 'chevron' && testID !== 'font-preview') {
      const flat = StyleSheet.flatten(props.style) || {};
      const scaledSize = _isTablet && flat.fontSize ? Math.round(flat.fontSize * _TABLET_FONT_SCALE) : undefined;
      if (_globalFont) {
        // 커스텀 폰트: family 주입 + (태블릿이면) fontSize 보정
        if (!flat.fontFamily || _globalFont.customFamilies.has(flat.fontFamily)) {
          const isBold = flat.fontWeight && (flat.fontWeight === 'bold' || parseInt(flat.fontWeight, 10) >= 700);
          const family = isBold ? _globalFont.bold : _globalFont.base;
          const lineHeightFix = _globalFont.fontId === 'nanumSquare' && flat.fontSize && !flat.lineHeight
            ? { lineHeight: Math.ceil((scaledSize || flat.fontSize) * 1.35) } : {};
          return _origCreateElement(type, {
            ...props,
            style: { ...flat, fontFamily: family, fontWeight: 'normal', ...(scaledSize && { fontSize: scaledSize }), ...lineHeightFix },
          }, ...children);
        }
      } else if (scaledSize) {
        // 기본 폰트 + 태블릿: family는 건드리지 않고 fontSize만 1.15배 보정 (6fcb6f5 원래 동작 복원)
        return _origCreateElement(type, {
          ...props,
          style: { ...flat, fontSize: scaledSize },
        }, ...children);
      }
    }
  }
  return _origCreateElement(type, props, ...children);
};


// ── 온보딩 (5단계) ──
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
  const fmtMD = (dateStr) => { if (!dateStr) return ''; const [, m, d] = dateStr.split('-'); return `${parseInt(m)}/${parseInt(d)}`; };
  const ddDateLabel = ddSelectedDates.size === 0 ? '' : ddSelectedDates.size === 1 ? fmtMD(ddStartDate) : `${fmtMD(ddStartDate)} ~ ${fmtMD(ddEndDate)} (${ddComputedDays}일)`;
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

  // getSchoolDefaultFavs는 src/screens/focus/helpers.js와 공유 (초등 고학년 20/30/45 기준으로 통일)

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
      widgetGuideSeen: true, // 신규 사용자는 1회성 팝업 제외 (설정탭 안내로 대체)
      iosWidgetGuideSeen: true, // iOS 신규 사용자도 1회성 팝업 제외 (설정탭 안내로 대체)
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
      {/* 진행 표시 (5단계) */}
      <View style={styles.obProgress}>
        {[0,1,2,3,4].map(i => (
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
                {ddLabel} · {ddDateLabel}
              </Text>
            </View>
          ) : ddSelectedDates.size > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8 }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: T.accent + '15' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: T.accent }}>{ddDateLabel}</Text>
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
              타이머 완료 알림이 자동으로 켜져 있어요.{'\n'}알림이 오지 않으면 설정 탭 {'>'} 사용 가이드를 확인해주세요.
            </Text>
          </View>
          <View style={styles.obBtnRow}>
            <TouchableOpacity style={[styles.obBtnSec, { borderColor: T.border }]} onPress={() => setStep(3)}>
              <Text style={{ color: T.sub, fontWeight: '700', fontSize: 14 }}>← 이전</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.obBtn, { backgroundColor: T.accent, flex: 1 }]} onPress={handleFinish}>
              <Text style={styles.obBtnT}>시작하기!</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── 잠금 오버레이 — Root 레벨에 배치하여 MainApp 리마운트(폰트 변경 등)에 영향받지 않음 ──
// 업데이트 후 1회성 안내 — 홈 화면 위젯 (Android 전용, 기존 사용자에게만)
function WidgetIntroOverlay() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale);

  const isIos = Platform.OS === 'ios';
  if (Platform.OS !== 'android' && !isIos) return null;
  const seen = isIos ? app.settings.iosWidgetGuideSeen : app.settings.widgetGuideSeen;
  if (!app.settings.onboardingDone || seen) return null;

  const dismiss = () => app.updateSettings(isIos ? { iosWidgetGuideSeen: true } : { widgetGuideSeen: true });
  const WIDGETS = [
    { icon: 'today-outline', title: '오늘 공부', desc: '오늘·이번 주 공부량과 목표 달성률' },
    { icon: 'calendar-number-outline', title: 'D-Day', desc: '시험까지 남은 일수를 한눈에' },
    { icon: 'play-circle-outline', title: '과목 바로 시작', desc: '탭 한 번으로 그 과목 타이머 시작' },
    { icon: 'checkbox-outline', title: '오늘 계획', desc: '플래너의 오늘 계획을 눌러서 바로 시작' },
    { icon: 'checkmark-done-outline', title: '오늘 할 일', desc: isIos ? '오늘 할 일 진행률과 다음 할 일을 한눈에' : '남은 할 일을 위젯에서 바로 체크' },
  ];
  const STEPS = isIos ? [
    '홈 화면 빈 곳을 길게 누르세요',
    '왼쪽 위 "+" 버튼을 누르세요',
    '"열공메이트"를 검색해 원하는 위젯을 추가하세요',
  ] : [
    '홈 화면 빈 곳을 길게 누르세요',
    '"위젯"을 누르고 목록에서 열공메이트를 찾으세요',
    '원하는 위젯을 홈 화면으로 끌어다 놓으세요',
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={dismiss}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
        <View style={{ backgroundColor: T.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 22 + insets.bottom }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <View style={{ backgroundColor: T.accent + '20', borderRadius: 9, padding: 6, marginRight: 9 }}>
              <Ionicons name="apps" size={18} color={T.accent} />
            </View>
            <Text style={{ fontSize: 12, fontWeight: '800', color: T.accent }}>새 기능</Text>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '900', color: T.text, marginBottom: 6 }}>홈 화면 위젯</Text>
          <Text style={{ fontSize: 14, color: T.sub, lineHeight: 20, marginBottom: 18 }}>
            앱을 열지 않아도 홈 화면에서 바로 공부 현황을 확인하고 타이머를 시작할 수 있어요.
          </Text>

          {WIDGETS.map((w) => (
            <View key={w.title} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Ionicons name={w.icon} size={20} color={T.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>{w.title}</Text>
                <Text style={{ fontSize: 12, color: T.sub, marginTop: 1 }}>{w.desc}</Text>
              </View>
            </View>
          ))}

          <View style={{ backgroundColor: T.surface, borderRadius: 14, padding: 14, marginTop: 6, marginBottom: 18 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: T.text, marginBottom: 8 }}>추가하는 법</Text>
            {STEPS.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: i < STEPS.length - 1 ? 7 : 0 }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: '#fff' }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 13, color: T.text, lineHeight: 19 }}>{s}</Text>
              </View>
            ))}
            {isIos && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.border }}>
                <Ionicons name="lock-closed-outline" size={14} color={T.accent} style={{ marginRight: 6, marginTop: 2 }} />
                <Text style={{ flex: 1, fontSize: 12, color: T.sub, lineHeight: 18 }}>
                  잠금화면에도 넣을 수 있어요. 홈 화면이 아니라 시계가 보이는 잠금화면을 길게 누르고 사용자화 → 시계 아래 위젯 영역을 탭해 열공메이트를 추가하세요.
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity onPress={dismiss} style={{ backgroundColor: T.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>확인했어요</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function LockOverlay() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const isTabletLock = winW >= 600;
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale);
  const fs = T.fontScale;

  const SLIDE_WIDTH = isTabletLock ? Math.min(winW - 80, 360) : winW - 80;
  const THUMB_SIZE = 56;
  const SLIDE_THRESHOLD = SLIDE_WIDTH - THUMB_SIZE - 10;
  const slideThresholdRef = useRef(SLIDE_THRESHOLD);
  slideThresholdRef.current = SLIDE_THRESHOLD;
  const slideX = useRef(new Animated.Value(0)).current;
  const slideOpacity = useRef(new Animated.Value(1)).current;

  // 함수 refs — panResponder 내부에서 항상 최신 함수 참조
  const restoreBrightnessRef = useRef(null);
  restoreBrightnessRef.current = app.restoreBrightness;
  const setScreenLockedRef = useRef(null);
  setScreenLockedRef.current = app.setScreenLocked;
  const allowPauseRef = useRef(null);
  allowPauseRef.current = app.allowPause;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderMove: (_, gs) => {
        const threshold = slideThresholdRef.current;
        const x = Math.max(0, Math.min(gs.dx, threshold));
        slideX.setValue(x);
        slideOpacity.setValue(1 - (x / threshold) * 0.8);
      },
      onPanResponderRelease: (_, gs) => {
        const threshold = slideThresholdRef.current;
        if (gs.dx >= threshold) {
          Animated.timing(slideX, { toValue: threshold, duration: 100, useNativeDriver: false }).start(() => {
            try { restoreBrightnessRef.current?.(); } catch {}
            setScreenLockedRef.current?.(false);
            slideX.setValue(0);
            slideOpacity.setValue(1);
          });
        } else {
          Animated.spring(slideX, { toValue: 0, useNativeDriver: false }).start();
          Animated.timing(slideOpacity, { toValue: 1, duration: 200, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  if (!app.screenLocked) return null;

  const rt = app.timers?.find(t => t.status === 'running');
  let timerDisplay = '--:--';
  if (rt) {
    let d;
    if (rt.type === 'countdown') d = Math.max(0, rt.totalSec - rt.elapsedSec);
    else if (rt.type === 'sequence') {
      const seqTarget = rt.seqPhase === 'break' ? rt.seqBreakSec : rt.totalSec;
      d = Math.max(0, seqTarget - rt.elapsedSec);
    } else if (rt.type === 'pomodoro') {
      const target = (rt.pomoPhase === 'work' ? rt.pomoWorkMin : rt.pomoBreakMin) * 60;
      d = Math.max(0, target - rt.elapsedSec);
    } else {
      d = rt.elapsedSec;
    }
    const m = Math.floor(d / 60); const s = d % 60;
    timerDisplay = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const avatarSize = isTabletLock ? 160 : 110;
  const timerFontSize = Math.round((isTabletLock ? 72 : 52) * fs);
  const bodyFontSize = Math.round((isTabletLock ? 20 : 16) * fs);
  const subFontSize = Math.round((isTabletLock ? 17 : 14) * fs);
  const CONTENT_MAX_WIDTH = isTabletLock ? 520 : undefined;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* 컨텐츠 래퍼 — 태블릿에서 maxWidth로 중앙 정렬 */}
      <View style={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignItems: 'center' }}>
        {/* 첫 사용 한 줄 가이드 */}
        {!app.settings.guideLock && (
          <TouchableOpacity onPress={() => app.updateSettings({ guideLock: true })}
            style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="lock-closed" size={isTabletLock ? 16 : 13} color="rgba(255,255,255,0.8)" />
              <Text style={{ fontSize: isTabletLock ? 15 : 13, color: 'rgba(255,255,255,0.8)', fontWeight: '700', textAlign: 'center' }}>화면을 덮어두고 공부하세요! 옆으로 밀면 해제돼요</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* 캐릭터 + 메시지 */}
        <View style={{ alignItems: 'center', marginBottom: 30 }}>
          <CharacterAvatar characterId={app.settings.mainCharacter} size={avatarSize} />
          <Text style={{ fontSize: bodyFontSize, fontWeight: '800', color: 'white', marginTop: 14, textAlign: 'center' }}>
            {app.ultraFocus?.exitCount === 0 ? '집중 잘하고 있어!' : `이탈 ${app.ultraFocus?.exitCount}회... 다시 집중!`}
          </Text>
        </View>

        {/* 타이머 표시 */}
        <Text style={{ fontSize: timerFontSize, fontWeight: '900', color: 'white', letterSpacing: 4, marginBottom: 6 }}>
          {timerDisplay}
        </Text>
        {/* Verified 상태 — 이탈 0회면 '진행 중'(얻을 것), 이탈하면 '놓침'(잃은 것)을 명시해 손실 회피 자극 */}
        {(app.ultraFocus?.exitCount || 0) === 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 20 }}>
            <Ionicons name="shield-checkmark" size={isTabletLock ? 18 : 14} color="#4CAF50" />
            <Text style={{ fontSize: subFontSize, fontWeight: '700', color: '#4CAF50' }}>Verified 진행 중 · 이탈 없이 완료하면 인증 획득</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 20 }}>
            <Ionicons name="alert-circle" size={isTabletLock ? 18 : 14} color="#FF6B6B" />
            <Text style={{ fontSize: subFontSize, fontWeight: '700', color: '#FF6B6B' }}>Verified 놓침 · 이탈 {app.ultraFocus?.exitCount}회 · 밀도 감점 중</Text>
          </View>
        )}

        {/* 잠깐 쉬기 */}
        {!app.ultraFocus?.pauseAllowed && app.settings.ultraFocusLevel !== 'exam' && (
          <TouchableOpacity onPress={() => { allowPauseRef.current?.(); setScreenLockedRef.current?.(false); }}
            style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#FFB74D60', marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="pause" size={isTabletLock ? 18 : 14} color="#FFB74D" />
              <Text style={{ fontSize: subFontSize, fontWeight: '700', color: '#FFB74D' }}>잠깐 쉬기 (60초)</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* 슬라이드 해제 */}
      <View style={{ alignItems: 'center', position: 'absolute', left: 0, right: 0, bottom: Math.max(80, insets.bottom + 40) }}>
        <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, opacity: slideOpacity }}>
          <Ionicons name="lock-open-outline" size={isTabletLock ? 16 : 13} color="rgba(255,255,255,0.5)" />
          <Text style={{ fontSize: subFontSize, fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginBottom: 14, letterSpacing: 1 }}>옆으로 밀어서 잠금 해제</Text>
        </Animated.View>
        <View style={{ height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', width: SLIDE_WIDTH }}>
          <Animated.View style={{ width: 56, height: 54, borderRadius: 27, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', transform: [{ translateX: slideX }] }} {...panResponder.panHandlers}>
            <Text style={{ fontSize: 22, color: '#000000', fontWeight: '900' }}>→</Text>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

// ── 위젯 딥링크 ──
// 위젯 탭 → 탭 이동 (+ 타이머 시작)
//  yeolgong://start?subjectId=...           : 해당 과목 자유 타이머 시작
//  yeolgong://start?planId=...              : 오늘 계획 블록에서 남은 시간 카운트다운 시작
//  yeolgong://open?tab=planner&view=monthly : 플래너탭 특정 뷰로 이동 (D-Day 위젯)
//  yeolgong://open?tab=focus&section=plans|todos : 집중탭 해당 카드로 스크롤 (오늘계획/오늘할일 위젯)
const navigationRef = createNavigationContainerRef();

function parseDeepLink(url) {
  if (!url || typeof url !== 'string') return null;
  const q = (name) => {
    const m = url.match(new RegExp(`[?&]${name}=([^&]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  };
  if (/:\/\/start(\b|\/|\?|$)/.test(url)) {
    const subjectId = q('subjectId');
    if (subjectId) return { action: 'start', subjectId };
    const planId = q('planId');
    if (planId) return { action: 'startPlan', planId };
    return null;
  }
  if (/:\/\/open(\b|\/|\?|$)/.test(url)) {
    const tab = q('tab');
    if (!tab) return null; // 순수 yeolgong://open은 앱만 열기 (기존 iOS 위젯 호환)
    return { action: 'open', tab, view: q('view'), section: q('section') };
  }
  return null;
}

// ── 메인 ──
function MainApp() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale);

  // 위젯 딥링크 처리 (콜드스타트 + 실행 중 수신)
  const appRef = useRef(app);
  appRef.current = app;
  useEffect(() => {
    const handleUrl = (url) => {
      const link = parseDeepLink(url);
      if (!link) return;
      const a = appRef.current;
      let go = null;
      if (link.action === 'start') {
        const subj = (a.subjects || []).find(s => s.id === link.subjectId);
        if (!subj) return;
        go = () => {
          if (navigationRef.isReady()) navigationRef.navigate('Focus');
          a.addTimer({ type: 'free', subjectId: subj.id, label: subj.name, color: subj.color });
        };
      } else if (link.action === 'startPlan') {
        // 오늘 계획 위젯 탭 → 해당 계획으로 시작 (남은 시간 카운트다운, 달성 시 토스트는 startFromPlan이 처리)
        const plan = (a.getTodaySchedule?.()?.plans || []).find(p => p.id === link.planId);
        if (!plan) return;
        go = () => {
          if (navigationRef.isReady()) navigationRef.navigate('Focus');
          a.startFromPlan?.(plan);
        };
      } else if (link.action === 'open') {
        // 위젯 탭 → 특정 탭/카드로 이동 (타이머 시작 없음)
        go = () => {
          if (!navigationRef.isReady()) return;
          if (link.tab === 'planner') {
            navigationRef.navigate('Planner', link.view ? { tab: link.view } : undefined);
          } else if (link.tab === 'focus') {
            navigationRef.navigate('Focus', link.section ? { section: link.section } : undefined);
          }
        };
      }
      if (!go) return;
      // 네비게이터가 아직 준비 전일 수 있어 약간 지연
      setTimeout(go, navigationRef.isReady() ? 0 : 300);
    };
    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); }).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar barStyle={app.settings.darkMode ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <NavigationContainer ref={navigationRef}>
          <Tab.Navigator screenOptions={{
            headerShown: false,
            // 태블릿에서는 폰트/아이콘이 1.15배 확대되므로(_TABLET_FONT_SCALE) 탭바 높이도 키워 잘림 방지
            tabBarStyle: {
              backgroundColor: T.tabBar, borderTopColor: T.tabBarBorder, borderTopWidth: 1,
              paddingTop: _isTablet ? 8 : 4,
              height: (_isTablet ? 64 : 50) + insets.bottom,
              paddingBottom: insets.bottom,
            },
            tabBarActiveTintColor: T.accent, tabBarInactiveTintColor: T.sub,
            tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: _isTablet ? 0 : -2 },
            // 태블릿: 폰트 인터셉터가 아이콘 글리프도 1.15배(25→29pt)로 키우는데,
            // 아이패드 beside-icon 레이아웃의 아이콘 래퍼는 minWidth 25뿐이라 우측이 잘림 → 래퍼를 30pt로 명시
            tabBarIconStyle: _isTablet ? { marginTop: 2, width: 30, height: 30 } : undefined,
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
          <View style={[{ backgroundColor: T.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 }, _isTablet && { maxWidth: 540, alignSelf: 'center', width: '100%' }]}>
            <Text style={{ fontSize: 22, textAlign: 'center', marginBottom: 8 }}>⏰</Text>
            <Text style={{ fontSize: 17, fontWeight: '900', color: T.text, textAlign: 'center', marginBottom: 10 }}>정확한 알람 권한 필요</Text>
            <Text style={{ fontSize: 14, color: T.sub, textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
              {'타이머가 정확한 시간에 알림을 보내려면\n정확한 알람 권한이 필요해요.\n\n허용하지 않으면 알림이 늦게 오거나\n오지 않을 수 있어요.'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                app.dismissExactAlarmModal();
                openExactAlarmSettings();
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
        // 시스템 폰트로 리셋
        _globalFont = null;
        if (fontId !== 'default' && !FONT_MAP[fontId]) {
          app.updateSettings({ fontFamily: 'default' });
        }
        setLoadedFont('default');
        setFontsLoaded(true);
        return;
      }
      try {
        await Font.loadAsync(FONT_MAP[fontId]);
        const baseFamily = FONT_FAMILY_MAP[fontId];
        const customFamilies = new Set(
          Object.values(FONT_FAMILY_MAP).flatMap(f => [f, f + '-Bold'])
        );
        _globalFont = { base: baseFamily, bold: baseFamily + '-Bold', customFamilies, fontId };
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
      {/* LockOverlay는 MainApp 밖에 배치 — 폰트 변경으로 MainApp이 리마운트되어도 잠금화면 유지 */}
      <LockOverlay />
      <WidgetIntroOverlay />
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
  obStep: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 10, maxWidth: 540, width: '100%', alignSelf: 'center' },
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
