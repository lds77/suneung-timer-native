// App.js
// 열공 멀티타이머 — 메인 진입점

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, Image, ActivityIndicator,
  TextInput, ScrollView,
} from 'react-native';
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


// ── 온보딩 (3단계) ──
function OnboardingScreen() {
  const app = useApp();
  const T = LIGHT;
  const [step, setStep] = useState(0); // 0=캐릭터, 1=D-Day, 2=과목
  const [selected, setSelected] = useState('toru');

  // D-Day
  const [ddLabel, setDdLabel] = useState('');
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [pickerSelected, setPickerSelected] = useState(null);
  const today = new Date().toISOString().split('T')[0];
  const PRESETS = [
    { label: '수능 2026', date: '2026-11-19' },
    { label: '중간고사', date: null },
    { label: '기말고사', date: null },
    { label: '모의고사', date: null },
  ];
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
  const SUBJ_PRESETS = [
    { name: '국어', color: '#E8575A' }, { name: '수학', color: '#4A90D9' },
    { name: '영어', color: '#5CB85C' }, { name: '과학', color: '#F5A623' },
    { name: '사회', color: '#9B6FC3' }, { name: '역사', color: '#E17055' },
  ];

  const handleFinish = () => {
    app.updateSettings({ mainCharacter: selected, onboardingDone: true });
  };

  return (
    <SafeAreaView style={[styles.onboarding, { backgroundColor: T.bg }]}>
      <StatusBar barStyle="dark-content" />
      {/* 진행 표시 */}
      <View style={styles.obProgress}>
        {[0, 1, 2].map(i => (
          <View key={i} style={[styles.obDot, { backgroundColor: i <= step ? T.accent : T.border }]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.obScroll} showsVerticalScrollIndicator={false}>

      {/* ═══ Step 0: 캐릭터 선택 ═══ */}
      {step === 0 && (
        <View style={styles.obStep}>
          <Text style={[styles.obEmoji]}>💕</Text>
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
            <Text style={styles.obBtnT}>다음 →</Text></TouchableOpacity>
        </View>
      )}

      {/* ═══ Step 1: D-Day ═══ */}
      {step === 1 && (
        <View style={styles.obStep}>
          <Text style={[styles.obEmoji]}>📅</Text>
          <Text style={[styles.obTitle, { color: T.text }]}>시험 D-Day를 설정해!</Text>
          <Text style={[styles.obSub, { color: T.sub }]}>나중에 설정에서 추가/수정할 수 있어</Text>

          {/* 프리셋 */}
          <View style={styles.obPresetRow}>
            {PRESETS.map(p => (
              <TouchableOpacity key={p.label} style={[styles.obPreset, { borderColor: ddLabel === p.label ? T.accent : T.border, backgroundColor: ddLabel === p.label ? T.accent + '15' : T.card }]}
                onPress={() => { setDdLabel(p.label); if (p.date) setPickerSelected(p.date); }}>
                <Text style={[styles.obPresetT, { color: ddLabel === p.label ? T.accent : T.sub }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput value={ddLabel} onChangeText={setDdLabel} placeholder="이름 (예: 중간고사)" placeholderTextColor={T.sub}
            style={[styles.obInput, { borderColor: T.border, backgroundColor: T.card, color: T.text }]} />

          {/* 달력 */}
          <View style={[styles.obCalendar, { backgroundColor: T.card, borderColor: T.border }]}>
            <View style={styles.obCalNav}>
              <TouchableOpacity onPress={() => setPickerMonth(p => { const d = new Date(p); d.setMonth(d.getMonth()-1); return d; })}>
                <Text style={{ color: T.accent, fontSize: 16, paddingHorizontal: 10 }}>◀</Text></TouchableOpacity>
              <Text style={{ color: T.text, fontSize: 14, fontWeight: '800' }}>{pickerStr}</Text>
              <TouchableOpacity onPress={() => setPickerMonth(p => { const d = new Date(p); d.setMonth(d.getMonth()+1); return d; })}>
                <Text style={{ color: T.accent, fontSize: 16, paddingHorizontal: 10 }}>▶</Text></TouchableOpacity>
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
            <TouchableOpacity style={[styles.obBtnSec, { borderColor: T.border }]} onPress={() => setStep(0)}>
              <Text style={{ color: T.sub, fontWeight: '700', fontSize: 14 }}>← 이전</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.obBtn, { backgroundColor: T.accent, flex: 1 }]} onPress={() => setStep(2)}>
              <Text style={styles.obBtnT}>{app.ddays.length > 0 ? '다음 →' : '건너뛰기 →'}</Text></TouchableOpacity>
          </View>
        </View>
      )}

      {/* ═══ Step 2: 과목 추가 ═══ */}
      {step === 2 && (
        <View style={styles.obStep}>
          <Text style={[styles.obEmoji]}>📚</Text>
          <Text style={[styles.obTitle, { color: T.text }]}>공부할 과목을 추가해!</Text>
          <Text style={[styles.obSub, { color: T.sub }]}>탭하면 바로 추가돼. 나중에 수정 가능!</Text>

          {/* 프리셋 과목 */}
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

          {/* 직접 입력 */}
          <View style={styles.obSubjInputRow}>
            <TextInput value={subjName} onChangeText={setSubjName} placeholder="직접 입력 (예: 한국사)" placeholderTextColor={T.sub}
              style={[styles.obInput, { borderColor: T.border, backgroundColor: T.card, color: T.text, flex: 1 }]} />
            <TouchableOpacity style={[styles.obSubjAddBtn, { backgroundColor: T.accent }]}
              onPress={() => { if (subjName.trim()) { app.addSubject({ name: subjName.trim(), color: '#FF6B9D' }); setSubjName(''); } }}>
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>추가</Text></TouchableOpacity>
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

          <View style={styles.obBtnRow}>
            <TouchableOpacity style={[styles.obBtnSec, { borderColor: T.border }]} onPress={() => setStep(1)}>
              <Text style={{ color: T.sub, fontWeight: '700', fontSize: 14 }}>← 이전</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.obBtn, { backgroundColor: T.accent, flex: 1 }]} onPress={handleFinish}>
              <Text style={styles.obBtnT}>🎉 시작하기!</Text></TouchableOpacity>
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
          if (props.style) {
            let flat = StyleSheet.flatten(props.style) || {};
            if (fontId !== 'default') {
              // weight가 있으면 Bold variant로 대체
              const w = flat.fontWeight;
              if (w && (w === 'bold' || parseInt(w, 10) >= 700)) {
                flat.fontFamily = baseFamily + '-Bold';
              } else {
                flat.fontFamily = baseFamily;
              }
            }
            origin.props.style = flat;
          }
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
  return <AppProvider><Root /></AppProvider>;
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

  // Step 1: D-Day
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
