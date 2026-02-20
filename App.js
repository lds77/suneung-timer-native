// App.js
// 열공 멀티타이머 — 메인 진입점

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, Image, ActivityIndicator,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AppProvider, useApp } from './src/hooks/useAppState';
import { LIGHT, DARK } from './src/constants/colors';
import { CHARACTERS, CHARACTER_LIST } from './src/constants/characters';
import CharacterAvatar from './src/components/CharacterAvatar';
import Toast from './src/components/Toast';
import RunningTimersBar from './src/components/RunningTimersBar';

import FocusScreen from './src/screens/FocusScreen';
import SubjectsScreen from './src/screens/SubjectsScreen';
import StatsScreen from './src/screens/StatsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

// ── 온보딩 ──
function OnboardingScreen() {
  const app = useApp();
  const T = LIGHT;
  const [selected, setSelected] = useState('toru');

  return (
    <SafeAreaView style={[styles.onboarding, { backgroundColor: T.bg }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.onboardingContent}>
        <Image source={require('./assets/characters/group.png')} style={styles.groupImage} resizeMode="contain" />
        <Text style={[styles.onboardingTitle, { color: T.text }]}>안녕! 나를 골라줘 💕</Text>
        <Text style={[styles.onboardingSub, { color: T.sub }]}>공부할 때 함께할 캐릭터를 선택해</Text>
        <View style={styles.charSelectRow}>
          {CHARACTER_LIST.map(cId => {
            const c = CHARACTERS[cId];
            const active = selected === cId;
            return (
              <TouchableOpacity key={cId}
                style={[styles.charSelectCard, { backgroundColor: active ? c.bgColor : T.card, borderColor: active ? T.accent : T.border, borderWidth: active ? 2.5 : 1 }]}
                onPress={() => setSelected(cId)}>
                <CharacterAvatar characterId={cId} size={52} mood={active ? 'happy' : 'normal'} />
                <Text style={[styles.charSelectName, { color: active ? T.accent : T.sub }]}>{c.name}</Text>
                <Text style={[styles.charSelectDesc, { color: T.sub }]} numberOfLines={1}>{c.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity style={[styles.onboardingBtn, { backgroundColor: T.accent }]}
          onPress={() => app.updateSettings({ mainCharacter: selected, onboardingDone: true })}>
          <Text style={styles.onboardingBtnText}>좋아! 시작하자 💕</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── 메인 ──
function MainApp() {
  const app = useApp();
  const T = app.settings.darkMode ? DARK : LIGHT;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar barStyle={app.settings.darkMode ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />
      <SafeAreaView style={{ flex: 1 }}>
        {/* 글로벌 실행 중 타이머 바 */}
        <RunningTimersBar />

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
  if (app.loading) return (
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
  onboarding: { flex: 1 },
  onboardingContent: { flex: 1, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  groupImage: { width: 260, height: 160, marginBottom: 20 },
  onboardingTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  onboardingSub: { fontSize: 13, textAlign: 'center', marginBottom: 24 },
  charSelectRow: { flexDirection: 'row', gap: 6, marginBottom: 30 },
  charSelectCard: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderRadius: 14 },
  charSelectName: { fontSize: 11, fontWeight: '800', marginTop: 6 },
  charSelectDesc: { fontSize: 7, marginTop: 2, textAlign: 'center' },
  onboardingBtn: { paddingHorizontal: 40, paddingVertical: 14, borderRadius: 16 },
  onboardingBtnText: { color: 'white', fontSize: 16, fontWeight: '900' },
});
