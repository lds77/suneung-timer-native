// App.js
// 열공 멀티타이머 — 메인 진입점

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator,
  TextInput, ScrollView, Platform,
} from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Font from 'expo-font';
import { AppProvider, useApp } from './src/hooks/useAppState';
import { LIGHT, DARK, getTheme } from './src/constants/colors';
import { CHARACTERS, CHARACTER_LIST } from './src/constants/characters';
import { FONT_MAP, FONT_FAMILY_MAP } from './src/constants/fonts';
import CharacterAvatar from './src/components/CharacterAvatar';
import Toast from './src/components/Toast';

import FocusScreen from './src/screens/FocusScreen';
import SubjectsScreen from './src/screens/SubjectsScreen';
import StatsScreen from './src/screens/StatsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

// 폰트 설정 데이터를 별도 파일로 분리했습니다.
// 필요 시 FONT_MAP, FONT_FAMILY_MAP를 가져다 쓰면 됩니다.


// ── 온보딩 (6단계) ──
function OnboardingScreen() {
  const app = useApp();
  const [step, setStep] = useState(0); // 0=캐릭터, 1=테마, 2=학교급, 3=목표, 4=D-Day, 5=과목
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
    { school: 'elementary', grade: 'lower', label: '초등 1~3학년', emoji: '🌱', goal: 60 },
    { school: 'elementary', grade: 'upper', label: '초등 4~6학년', emoji: '🌿', goal: 120 },
    { school: 'middle',     grade: null,    label: '중학생',        emoji: '📘', goal: 240 },
    { school: 'high',       grade: null,    label: '고등/N수',      emoji: '🔥', goal: 360 },
  ];
  const handleSchoolSelect = (opt) => {
    setSelectedSchool(opt.school);
    setSelectedElemGrade(opt.grade || 'upper');
    setSelectedGoalMin(opt.goal);
  };

  // ── 목표 시간 옵션 (학교급에 따라)
  const GOAL_OPTIONS = (() => {
    if (selectedSchool === 'elementary' && selectedElemGrade === 'lower') return [30, 60, 90];
    if (selectedSchool === 'elementary') return [60, 120, 180];
    if (selectedSchool === 'middle') return [120, 180, 240, 360];
    return [180, 240, 360, 480, 600];
  })();
  const formatGoal = (min) => {
    if (min < 60) return `${min}분`;
    if (min % 60 === 0) return `${min / 60}시간`;
    return `${Math.floor(min / 60)}시간${min % 60}분`;
  };

  // D-Day
  const [ddLabel, setDdLabel] = useState('');
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [pickerSelected, setPickerSelected] = useState(null);
  const today = new Date().toISOString().split('T')[0];
  const DDAY_PRESETS = (() => {
    if (selectedSchool === 'high') return [
      { label: '수능 2026', date: '2026-11-19' },
      { label: '중간고사', date: null },
      { label: '기말고사', date: null },
      { label: '모의고사', date: null },
    ];
    if (selectedSchool === 'middle') return [
      { label: '중간고사', date: null },
      { label: '기말고사', date: null },
      { label: '전국연합', date: null },
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
    if (!ddLabel.trim() || !pickerSelected) return;
    app.addDDay({ label: ddLabel.trim(), date: pickerSelected });
    setDdLabel(''); setPickerSelected(null);
  };

  // 과목
  const [subjName, setSubjName] = useState('');
  const SUBJ_PRESETS = (() => {
    if (selectedSchool === 'elementary') return [
      { name: '국어', color: '#E8575A' }, { name: '수학', color: '#4A90D9' },
      { name: '영어', color: '#5CB85C' }, { name: '과학', color: '#F5A623' },
      { name: '사회', color: '#9B6FC3' }, { name: '한자', color: '#E17055' },
    ];
    return [
      { name: '국어', color: '#E8575A' }, { name: '수학', color: '#4A90D9' },
      { name: '영어', color: '#5CB85C' }, { name: '과학', color: '#F5A623' },
      { name: '사회', color: '#9B6FC3' }, { name: '역사', color: '#E17055' },
    ];
  })();

  const handleFinish = () => {
    app.updateSettings({
      mainCharacter: selected,
      accentColor: selectedAccent,
      schoolLevel: selectedSchool,
      elemGrade: selectedElemGrade,
      dailyGoalMin: selectedGoalMin,
      onboardingDone: true,
    });
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
          <Text style={styles.obEmoji}>💕</Text>
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
          <Text style={styles.obEmoji}>🎨</Text>
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
          <Text style={styles.obEmoji}>🏫</Text>
          <Text style={[styles.obTitle, { color: T.text }]}>지금 몇 학년이야?</Text>
          <Text style={[styles.obSub, { color: T.sub }]}>학교급에 맞게 과목이 추천돼요</Text>
          <View style={styles.schoolGrid}>
            {SCHOOL_OPTIONS.map(opt => {
              const active = selectedSchool === opt.school && (opt.grade !== null ? selectedElemGrade === opt.grade : true);
              return (
                <TouchableOpacity key={opt.label}
                  style={[styles.schoolCard, { backgroundColor: active ? T.accent + '15' : T.card, borderColor: active ? T.accent : T.border, borderWidth: active ? 2.5 : 1 }]}
                  onPress={() => handleSchoolSelect(opt)}>
                  <Text style={styles.schoolEmoji}>{opt.emoji}</Text>
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

      {/* ═══ Step 3: 일일 목표 ═══ */}
      {step === 3 && (
        <View style={styles.obStep}>
          <Text style={styles.obEmoji}>🎯</Text>
          <Text style={[styles.obTitle, { color: T.text }]}>하루 목표 시간은?</Text>
          <Text style={[styles.obSub, { color: T.sub }]}>설정에서 언제든 바꿀 수 있어요</Text>
          <View style={styles.goalGrid}>
            {GOAL_OPTIONS.map(min => {
              const active = selectedGoalMin === min;
              return (
                <TouchableOpacity key={min}
                  style={[styles.goalCard, { backgroundColor: active ? T.accent : T.card, borderColor: active ? T.accent : T.border, borderWidth: active ? 2.5 : 1 }]}
                  onPress={() => setSelectedGoalMin(min)}>
                  <Text style={[styles.goalCardText, { color: active ? 'white' : T.text }]}>{formatGoal(min)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.obBtnRow}>
            <TouchableOpacity style={[styles.obBtnSec, { borderColor: T.border }]} onPress={() => setStep(2)}>
              <Text style={{ color: T.sub, fontWeight: '700', fontSize: 14 }}>← 이전</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.obBtn, { backgroundColor: T.accent, flex: 1 }]} onPress={() => setStep(4)}>
              <Text style={styles.obBtnT}>다음 →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ═══ Step 4: D-Day ═══ */}
      {step === 4 && (
        <View style={styles.obStep}>
          <Text style={styles.obEmoji}>📅</Text>
          <Text style={[styles.obTitle, { color: T.text }]}>시험 D-Day를 설정해!</Text>
          <Text style={[styles.obSub, { color: T.sub }]}>나중에 설정에서 추가/수정할 수 있어</Text>
          <View style={styles.obPresetRow}>
            {DDAY_PRESETS.map(p => (
              <TouchableOpacity key={p.label} style={[styles.obPreset, { borderColor: ddLabel === p.label ? T.accent : T.border, backgroundColor: ddLabel === p.label ? T.accent + '15' : T.card }]}
                onPress={() => { setDdLabel(p.label); if (p.date) setPickerSelected(p.date); }}>
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
                const sel = pickerSelected === cell.date, past = cell.date < today;
                return (
                  <TouchableOpacity key={cell.date} style={{ width: '14.28%', height: 34, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => !past && setPickerSelected(cell.date)} disabled={past}>
                    <View style={[{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, sel && { backgroundColor: T.accent }, past && { opacity: 0.3 }]}>
                      <Text style={{ fontSize: 12, fontWeight: sel ? '800' : '500', color: sel ? 'white' : T.text }}>{cell.day}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {pickerSelected && ddLabel.trim() ? (
            <TouchableOpacity style={[styles.obAddBtn, { backgroundColor: T.accent + '15', borderColor: T.accent }]} onPress={addDDay}>
              <Text style={{ color: T.accent, fontWeight: '800', fontSize: 13 }}>+ {ddLabel} ({pickerSelected}) 추가</Text>
            </TouchableOpacity>
          ) : null}
          {app.ddays.length > 0 && (
            <View style={styles.obDDayList}>
              {app.ddays.map(dd => (
                <View key={dd.id} style={[styles.obDDayItem, { backgroundColor: T.card, borderColor: T.border }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: T.text }}>{dd.label}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: T.accent }}>{dd.date}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.obBtnRow}>
            <TouchableOpacity style={[styles.obBtnSec, { borderColor: T.border }]} onPress={() => setStep(3)}>
              <Text style={{ color: T.sub, fontWeight: '700', fontSize: 14 }}>← 이전</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.obBtn, { backgroundColor: T.accent, flex: 1 }]} onPress={() => setStep(5)}>
              <Text style={styles.obBtnT}>{app.ddays.length > 0 ? '다음 →' : '건너뛰기 →'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ═══ Step 5: 과목 ═══ */}
      {step === 5 && (
        <View style={styles.obStep}>
          <Text style={styles.obEmoji}>📚</Text>
          <Text style={[styles.obTitle, { color: T.text }]}>공부할 과목을 추가해!</Text>
          <Text style={[styles.obSub, { color: T.sub }]}>탭하면 바로 추가돼. 나중에 수정 가능!</Text>
          <View style={styles.obSubjGrid}>
            {SUBJ_PRESETS.map(s => {
              const added = app.subjects.some(x => x.name === s.name);
              return (
                <TouchableOpacity key={s.name}
                  style={[styles.obSubjBtn, { backgroundColor: added ? s.color + '20' : T.card, borderColor: added ? s.color : T.border }]}
                  onPress={() => { if (!added) app.addSubject({ name: s.name, color: s.color }); }}>
                  <Text style={{ fontSize: 20, marginBottom: 2 }}>{added ? '✓' : '+'}</Text>
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
          {/* 배터리 최적화 안내 (Android 전용) */}
          {Platform.OS === 'android' && (
            <View style={{ marginHorizontal: 4, marginBottom: 14, padding: 14, borderRadius: 14, backgroundColor: T.accent + '12', borderWidth: 1, borderColor: T.accent + '30' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: T.accent, marginBottom: 4 }}>⚡ 정확한 타이머 알림을 위해</Text>
              <Text style={{ fontSize: 12, color: T.sub, lineHeight: 18, marginBottom: 10 }}>
                배터리 최적화가 켜져 있으면 알림이 늦게 오거나 오지 않을 수 있어요.{'\n'}
                설정에서 이 앱을 <Text style={{ fontWeight: '800', color: T.text }}>'제한 없음'</Text>으로 바꿔주세요!
              </Text>
              <TouchableOpacity
                onPress={() => IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS)}
                style={{ alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 16, borderRadius: 20, backgroundColor: T.accent }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: 'white' }}>배터리 설정 바로가기 →</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.obBtnRow}>
            <TouchableOpacity style={[styles.obBtnSec, { borderColor: T.border }]} onPress={() => setStep(4)}>
              <Text style={{ color: T.sub, fontWeight: '700', fontSize: 14 }}>← 이전</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.obBtn, { backgroundColor: T.accent, flex: 1 }]} onPress={handleFinish}>
              <Text style={styles.obBtnT}>🎉 시작하기!</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── 메인 ──
function MainApp() {
  const app = useApp();
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale);

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar barStyle={app.settings.darkMode ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />
      <SafeAreaView style={{ flex: 1 }}>
        <NavigationContainer>
          <Tab.Navigator screenOptions={{
            headerShown: false,
            tabBarStyle: { backgroundColor: T.tabBar, borderTopColor: T.tabBarBorder, borderTopWidth: 1, paddingBottom: 4, paddingTop: 4, height: 56 },
            tabBarActiveTintColor: T.accent, tabBarInactiveTintColor: T.sub,
            tabBarLabelStyle: { fontSize: 9, fontWeight: '700', marginTop: -2 },
          }}>
            <Tab.Screen name="Focus" component={FocusScreen}
              options={{ tabBarLabel: '집중', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>🎯</Text> }} />
            <Tab.Screen name="Subjects" component={SubjectsScreen}
              options={{ tabBarLabel: '과목', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>📚</Text> }} />
            <Tab.Screen name="Stats" component={StatsScreen}
              options={{ tabBarLabel: '통계', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>📊</Text> }} />
            <Tab.Screen name="Settings" component={SettingsScreen}
              options={{ tabBarLabel: '설정', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>⚙️</Text> }} />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaView>

      <Toast message={app.toast.message} characterId={app.toast.char} visible={app.toast.visible} colors={T} />
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
        // 시스템 폰트 또는 아직 활성화 안 된 폰트
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
        const baseFamily = FONT_FAMILY_MAP[fontId] || FONT_FAMILY_MAP[fontId];
        const origRender = Text.render;
        Text.render = function (...args) {
          const origin = origRender.call(this, ...args);
          const props = origin.props;
          // style 유무와 관계없이 모든 Text에 폰트 적용
          let flat = StyleSheet.flatten(props.style) || {};
          const w = flat.fontWeight;
          if (w && (w === 'bold' || parseInt(w, 10) >= 700)) {
            flat.fontFamily = baseFamily + '-Bold';
          } else {
            flat.fontFamily = baseFamily;
          }
          origin.props.style = flat;
          return origin;
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
  if (app.loading || !fontsLoaded) return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#FF6B9D" />
      <Text style={styles.loadingText}>로딩 중...</Text>
    </View>
  );
  if (!app.settings.onboardingDone) return <OnboardingScreen />;
  return <MainApp />;
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
  obEmoji: { fontSize: 40, marginBottom: 8 },
  obTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  obSub: { fontSize: 13, textAlign: 'center', marginBottom: 20 },

  // Step 0: 캐릭터
  charGrid: { flexDirection: 'row', gap: 8, marginBottom: 24, width: '100%' },
  charCard: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14 },
  charName: { fontSize: 12, fontWeight: '800', marginTop: 6 },
  charDesc: { fontSize: 7, marginTop: 2, textAlign: 'center' },

  // Step 1: 테마 색상
  accentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24, width: '100%' },
  accentCard: { width: '30%', alignItems: 'center', paddingVertical: 14, borderRadius: 12, gap: 6 },
  accentDot: { width: 28, height: 28, borderRadius: 14 },
  accentLabel: { fontSize: 12, fontWeight: '800' },

  // Step 2: 학교급
  schoolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24, width: '100%' },
  schoolCard: { width: '47%', alignItems: 'center', paddingVertical: 18, borderRadius: 14, gap: 6 },
  schoolEmoji: { fontSize: 28 },
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
