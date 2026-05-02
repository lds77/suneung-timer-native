// src/screens/SettingsScreen.js
// 탭 4: 설정

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Switch, Modal, Alert, StyleSheet, Platform, Linking, KeyboardAvoidingView, useWindowDimensions,
  Keyboard, Dimensions,
} from 'react-native';
import { useApp } from '../hooks/useAppState';
import { LIGHT, DARK, getTheme, HEADER_BG_PRESETS } from '../constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { DAILY_GOAL_OPTIONS } from '../constants/presets';

import RunningTimersBar from '../components/RunningTimersBar';
import Constants from 'expo-constants';
// IntentLauncher — 가이드에서 필요 시 복원 가능
// import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { exportBackupData, importBackupData } from '../utils/storage';
// 폰트 미리보기용 맵
import { FONT_FAMILY_MAP } from '../constants/fonts';
import { Ionicons } from '@expo/vector-icons';
import TimePickerGrid from '../components/TimePickerGrid';


// 모듈 레벨 스타일 참조 — SettingsScreen 렌더 시 갱신
let _styles = null;

const FOCUS_LEVELS = [
  { id: 'normal', label: '일반',       desc: '자동 편한모드 · 이탈 감지 없이 자유롭게 공부해요', color: '#4CAF50' },
  { id: 'focus',  label: '집중',       desc: '모드 선택 가능 · 1분 이탈 시 챌린지 문구 입력 필요', color: '#FFB74D' },
  { id: 'exam',   label: '울트라집중',  desc: '자동 집중모드 · 일시정지/잠깐 쉬기 불가 · 10초 이탈 시 타이머 정지 + 챌린지', color: '#FF6B6B' },
];

const THEME_COLORS = [
  { id: 'pink',   color: '#FF6B9D', label: '핑크' },
  { id: 'purple', color: '#6C5CE7', label: '퍼플' },
  { id: 'blue',   color: '#4A90D9', label: '블루' },
  { id: 'mint',   color: '#00B894', label: '민트' },
  { id: 'navy',   color: '#2C5F9E', label: '네이비' },
  { id: 'coral',  color: '#E07050', label: '코랄' },
  { id: 'slate',  color: '#64748B', label: '슬레이트' },
];

const SCHOOL_LEVELS = [
  { id: 'elementary_lower', label: '초등 저학년', sub: '1~3학년' },
  { id: 'elementary_upper', label: '초등 고학년', sub: '4~6학년' },
  { id: 'middle',           label: '중학생',      sub: '중1~3' },
  { id: 'high',             label: '고등학생',    sub: '고1~3' },
  { id: 'nsuneung',         label: 'N수생',       sub: '수능 재도전' },
  { id: 'university',       label: '대학생',      sub: '대학 재학' },
  { id: 'exam_prep',        label: '공시생/자격증', sub: '공무원·자격증' },
];

// 가이드 섹션 컴포넌트
function GuideSection({ id, title, color, T, children, openId, onOpen, scrollRef }) {
  const open = openId === id;
  const isOpeningRef = React.useRef(false);

  const handlePress = () => {
    const next = open ? null : id;
    if (next !== null) isOpeningRef.current = true;
    onOpen(next);
  };

  // 텍스트를 파싱해서 소제목/본문 구분 렌더링
  const renderContent = (text) => {
    if (typeof text !== 'string') return <Text style={{ fontSize: 13, color: T.text, lineHeight: 21 }}>{text}</Text>;
    const blocks = text.split('\n\n');
    return blocks.map((block, bi) => {
      const lines = block.split('\n');
      return (
        <View key={bi} style={bi > 0 ? { marginTop: 12 } : {}}>
          {lines.map((line, li) => {
            const isSub = !line.startsWith('•') && !line.startsWith('→') && !line.startsWith('-') && li === 0 && lines.length > 1 && !line.match(/^[①②③④⑤⑥]/);
            const isStep = line.match(/^[①②③④⑤⑥]/);
            const isBullet = line.startsWith('•') || line.startsWith('→') || line.startsWith('-');
            if (isStep) return <Text key={li} style={{ fontSize: 13, fontWeight: '700', color: T.accent, lineHeight: 21, marginTop: li > 0 ? 6 : 0 }}>{line}</Text>;
            if (isSub) return <Text key={li} style={{ fontSize: 13.5, fontWeight: '800', color: T.text, lineHeight: 21, marginBottom: 2 }}>{line}</Text>;
            if (isBullet) return <Text key={li} style={{ fontSize: 13, color: T.sub, lineHeight: 21, paddingLeft: 4 }}>{line}</Text>;
            return <Text key={li} style={{ fontSize: 13, color: T.text, lineHeight: 21 }}>{line}</Text>;
          })}
        </View>
      );
    });
  };

  return (
    <View
      onLayout={(e) => {
        if (isOpeningRef.current) {
          isOpeningRef.current = false;
          scrollRef?.current?.scrollTo({ y: e.nativeEvent.layout.y, animated: true });
        }
      }}
      style={{ marginBottom: 10 }}
    >
      <TouchableOpacity onPress={handlePress}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: open ? color + '15' : T.surface2, borderRadius: open ? 0 : 10, borderTopLeftRadius: 10, borderTopRightRadius: 10, borderLeftWidth: 3, borderLeftColor: color }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: open ? color : T.text, flex: 1, marginRight: 8 }}>{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={open ? color : T.sub} />
      </TouchableOpacity>
      {open && (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, backgroundColor: T.card, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, borderLeftWidth: 3, borderLeftColor: color, borderWidth: 1, borderTopWidth: 0, borderColor: T.border }}>
          {renderContent(children)}
        </View>
      )}
    </View>
  );
}

function Section({ title, icon, children, T }) {
  return (
    <View style={[_styles.section, { borderColor: T.border }]}>
      {icon ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name={icon} size={13} color={T.sub} />
          <Text style={[_styles.sectionTitle, { color: T.sub }]}>{title}</Text>
        </View>
      ) : (
        <Text style={[_styles.sectionTitle, { color: T.sub }]}>{title}</Text>
      )}
      {children}
    </View>
  );
}

function Row({ label, sub, right, onPress, T }) {
  return (
    <TouchableOpacity
      style={_styles.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.6 : 1}
    >
      <View style={{ flex: 1 }}>
        <Text style={[_styles.rowLabel, { color: T.text }]}>{label}</Text>
        {sub ? <Text style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <View style={_styles.rowRight}>{right}</View>
    </TouchableOpacity>
  );
}

// 닉네임/한마디 입력 컴포넌트
const ProfileInput = React.memo(function ProfileInput({ nickname, motto, onSave, T }) {
  const [nick, setNick] = useState(nickname || '');
  const [mot, setMot] = useState(motto || '');
  useEffect(() => { setNick(nickname || ''); }, [nickname]);
  useEffect(() => { setMot(motto || ''); }, [motto]);
  const handleSave = () => { onSave(nick.trim(), mot.trim()); };
  return (
    <View style={{ gap: 10 }}>
      <View>
        <Text style={{ fontSize: 12, fontWeight: '600', color: T.sub, marginBottom: 5 }}>닉네임 <Text style={{ fontWeight: '400' }}>({nick.length}/12)</Text></Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TextInput
            style={{ flex: 1, borderWidth: 1, borderColor: T.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: T.text, backgroundColor: T.bg }}
            value={nick}
            onChangeText={v => { if (!v.includes('\n')) setNick(v); }}
            placeholder="이름 또는 닉네임"
            placeholderTextColor={T.sub}
            maxLength={12}
            returnKeyType="done"
            onSubmitEditing={() => onSave(nick.trim(), mot.trim())}
          />
          <TouchableOpacity onPress={() => onSave(nick.trim(), mot.trim())} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: T.accent, borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>저장</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View>
        <Text style={{ fontSize: 12, fontWeight: '600', color: T.sub, marginBottom: 5 }}>오늘의 한마디 <Text style={{ fontWeight: '400' }}>({mot.length}/20)</Text></Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TextInput
            style={{ flex: 1, borderWidth: 1, borderColor: T.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: T.text, backgroundColor: T.bg }}
            value={mot}
            onChangeText={v => { if (!v.includes('\n')) setMot(v); }}
            placeholder="오늘의 다짐 (예: 3시간 집중!)"
            placeholderTextColor={T.sub}
            maxLength={20}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          <TouchableOpacity onPress={handleSave} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: T.accent, borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>저장</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}, (prev, next) =>
  prev.nickname === next.nickname &&
  prev.motto === next.motto &&
  prev.T.border === next.T.border &&
  prev.T.text === next.T.text &&
  prev.T.bg === next.T.bg &&
  prev.T.accent === next.T.accent &&
  prev.T.sub === next.T.sub
);

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
  const { width: winW, height: winH } = useWindowDimensions();
  const isTablet = winW >= 600; // 동적 판별 — 회전 시 재계산 (모듈레벨 정적값 덮어쓰기)
  const tabletMaxW = isTablet ? Math.round(winW * 0.83) : winW;
  const isLandscape = isTablet && winW > winH;
  const app = useApp();
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale, app.settings.stylePreset);
  const fs = T.fontScale * (isTablet ? 1.1 : 1.0);
  const styles = useMemo(() => createStyles(fs), [fs]);
  _styles = styles;
  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);
  const challengeViewRef = useRef(null);
  const kbHeightRef = useRef(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const show = Keyboard.addListener(showEvent, (e) => { kbHeightRef.current = e.endCoordinates.height; });
    const hide = Keyboard.addListener('keyboardDidHide', () => { kbHeightRef.current = 0; });
    return () => { show.remove(); hide.remove(); };
  }, []);
  const handleChallengeInputFocus = useCallback(() => {
    if (!challengeViewRef.current || !scrollRef.current) return;
    // adjustPan이 view 위치를 바꾸기 전에 즉시 측정
    challengeViewRef.current.measure((_x, _y, _w, h, _px, pageY) => {
      const snapPageY = pageY;
      const snapH = h;
      const snapScrollY = scrollYRef.current;
      // 키보드가 완전히 올라온 후 스크롤 적용
      setTimeout(() => {
        if (!scrollRef.current) return;
        const screenH = Dimensions.get('window').height;
        const kbH = kbHeightRef.current || 300;
        const delta = (snapPageY + snapH) - (screenH - kbH - 16);
        if (delta > 0) {
          scrollRef.current.scrollTo({ y: snapScrollY + delta, animated: true });
        }
      }, Platform.OS === 'ios' ? 50 : 350);
    });
  }, []);

  const [showGuide, setShowGuide] = useState(false);
  const [openGuideId, setOpenGuideId] = useState(null);
  const guideScrollRef = useRef(null);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [showSchoolPicker, setShowSchoolPicker] = useState(false);
  const [showFocusPicker, setShowFocusPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHeaderBgPicker, setShowHeaderBgPicker] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [reminderTime, setReminderTime] = useState('21:00');

  // 모달 닫힐 때 키보드 자동 dismiss (배경 TextInput 포커스 방지)
  const prevModalOpen = useRef(false);
  useEffect(() => {
    const anyOpen = showGuide || showGoalPicker || showSchoolPicker || showFocusPicker || showColorPicker || showHeaderBgPicker || showStylePicker || showFontPicker;
    if (!anyOpen && prevModalOpen.current) Keyboard.dismiss();
    prevModalOpen.current = anyOpen;
  }, [showGuide, showGoalPicker, showSchoolPicker, showFocusPicker, showColorPicker, showHeaderBgPicker, showStylePicker, showFontPicker]);


  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: T.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <RunningTimersBar />
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, isTablet && { maxWidth: tabletMaxW, alignSelf: 'center', width: '100%' }]}
        keyboardShouldPersistTaps="always" keyboardDismissMode="none"
        onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}>
        {/* 닉네임 / 한마디 / 헤더 배경 */}
        <Section T={T} title="내 정보">
          <ProfileInput
            nickname={app.settings.nickname}
            motto={app.settings.motto}
            onSave={(nick, mot) => {
              app.updateSettings({ nickname: nick, motto: mot });
              app.showToastCustom('저장됐어요!', app.settings.mainCharacter || 'toru');
            }}
            T={T}
          />
          <View style={{ height: 1, backgroundColor: T.border, marginTop: 8, marginBottom: 4 }} />
          {(() => {
            const cur = HEADER_BG_PRESETS[app.settings.headerBgPreset ?? 0] || HEADER_BG_PRESETS[0];
            return (
              <Row T={T} label="집중탭 헤더 배경"
                right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {cur.type === 'gradient' ? (
                    <LinearGradient colors={cur.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={{ width: 20, height: 20, borderRadius: 10 }} />
                  ) : cur.type === 'solid' ? (
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: cur.color }} />
                  ) : (
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border }} />
                  )}
                  <Text style={{ fontSize: 14, fontWeight: '700', color: T.accent }}>{cur.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={T.sub} />
                </View>}
                onPress={() => setShowHeaderBgPicker(true)}
              />
            );
          })()}
        </Section>

        {/* 목표 (목표시간 + 학교급) */}
        <Section T={T} title="목표">
          <Row T={T} label="일일 목표 시간"
            right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: T.accent }}>{app.settings.dailyGoalMin / 60}시간</Text>
              <Text testID="chevron" style={{ fontSize: 16, color: T.sub }}>›</Text>
            </View>}
            onPress={() => setShowGoalPicker(true)}
          />
          <Row T={T} label="학교급"
            right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: T.accent }}>
                {SCHOOL_LEVELS.find(s => s.id === (app.settings.schoolLevel || 'high'))?.label ?? '고등학생'}
              </Text>
              <Text testID="chevron" style={{ fontSize: 16, color: T.sub }}>›</Text>
            </View>}
            onPress={() => setShowSchoolPicker(true)}
          />
        </Section>

        {/* 🔥 집중 도전 모드 */}
        <Section T={T} title="집중 도전 모드" icon="flame-outline">
          {(() => {
            const lv = FOCUS_LEVELS.find(l => l.id === (app.settings.ultraFocusLevel || 'normal')) || FOCUS_LEVELS[0];
            const isExam = lv.id === 'exam';
            const isNormal = lv.id === 'normal';
            return (
              <TouchableOpacity
                onPress={() => {
                  const hasActive = app.timers?.some(t => t.status === 'running' || t.status === 'paused');
                  if (hasActive) { Alert.alert('변경 불가', '타이머가 실행 중일 때는 잠금 강도를 바꿀 수 없어요.\n모든 타이머를 먼저 종료해주세요.'); return; }
                  setShowFocusPicker(true);
                }}
                style={{ marginHorizontal: 16, marginVertical: 8, padding: 14, borderRadius: 14, backgroundColor: lv.color + '12', borderWidth: 1.5, borderColor: lv.color + '40' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: lv.color + '25', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={isExam ? 'flame' : isNormal ? 'leaf' : 'shield-half'} size={18} color={lv.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: lv.color }}>{lv.label}</Text>
                      <Text style={{ fontSize: 11.5, color: T.sub, marginTop: 2, lineHeight: 16 }}>{lv.desc}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={lv.color} />
                </View>
                {isNormal && (
                  <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: lv.color + '20' }}>
                    <Text style={{ fontSize: 12, color: '#FF6B6B', fontWeight: '600', textAlign: 'center' }}>울트라집중에 도전해보세요! 공부의 밀도가 올라갑니다.</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })()}
          {(app.settings.ultraStreak > 0 || app.settings.ultraStreakBest > 0) && (
            <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FF6B6B10', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#FF6B6B30' }}>
                <Ionicons name="flame" size={18} color="#FF6B6B" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#FF6B6B' }}>울트라집중 {app.settings.ultraStreak || 0}일 연속</Text>
                  <Text style={{ fontSize: 11, color: T.sub, marginTop: 1 }}>최장 기록 {app.settings.ultraStreakBest || 0}일</Text>
                </View>
              </View>
            </View>
          )}
          <View ref={challengeViewRef} style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, marginBottom: 6 }}>
              <Ionicons name="pencil-outline" size={13} color={T.text} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.text }}>나만의 챌린지 문구</Text>
            </View>
            <ChallengeInput
              initial={app.settings.challengeText}
              onSave={(v) => { app.updateSettings({ challengeText: v }); app.showToastCustom('챌린지 문구가 저장됐어요!', 'toru'); }}
              onFocus={handleChallengeInputFocus}
              T={T}
            />
          </View>
        </Section>

        {/* 알림 */}
        <Section T={T} title="알림">
          <Row
            T={T}
            label="알림"
            sub="타이머 완료, 리마인더, 연속 끊김 알림"
            right={
              <Switch
                value={app.settings.notifEnabled}
                onValueChange={(v) => app.updateSettings({ notifEnabled: v })}
                trackColor={{ true: T.accent }}
                thumbColor="white"
              />
            }
          />
          {app.settings.notifEnabled && (
            <>
              <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub, marginBottom: 4 }}>세부 설정</Text>
              </View>
              <Row
                T={T}
                label="공부 리마인더"
                sub="설정 시간에 공부 안 했으면 알려줘요"
                right={
                  <Switch
                    value={app.settings.dailyReminderEnabled}
                    onValueChange={(v) => app.updateSettings({ dailyReminderEnabled: v })}
                    trackColor={{ true: T.accent }}
                    thumbColor="white"
                  />
                }
              />
              {app.settings.dailyReminderEnabled && (
                <Row T={T} label="알림 시각"
                  right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: T.accent }}>
                      {app.settings.dailyReminderHour > 12
                        ? `오후 ${app.settings.dailyReminderHour - 12}시`
                        : app.settings.dailyReminderHour === 12 ? '오후 12시' : `오전 ${app.settings.dailyReminderHour}시`}
                      {app.settings.dailyReminderMin > 0 ? ` ${app.settings.dailyReminderMin}분` : ''}
                    </Text>
                    <Text testID="chevron" style={{ fontSize: 16, color: T.sub }}>›</Text>
                  </View>}
                  onPress={() => setShowReminderPicker(true)}
                />
              )}
              <Row
                T={T}
                label="연속 끊김 위기 알림"
                sub="5일 이상 연속 중인데 오늘 안 했으면 밤 9:30에 알림"
                right={
                  <Switch
                    value={app.settings.streakReminderEnabled}
                    onValueChange={(v) => app.updateSettings({ streakReminderEnabled: v })}
                    trackColor={{ true: T.accent }}
                    thumbColor="white"
                  />
                }
              />
              <Row
                T={T}
                label="주간 공부 리포트"
                sub="매주 일요일 밤 이번 주 공부 리포트를 보내줘요"
                right={
                  <Switch
                    value={app.settings.weeklyReportEnabled}
                    onValueChange={(v) => app.updateSettings({ weeklyReportEnabled: v })}
                    trackColor={{ true: T.accent }}
                    thumbColor="white"
                  />
                }
              />
              <Row
                T={T}
                label="월간 공부 리포트"
                sub="매월 마지막 날 밤 이번 달 공부 리포트를 보내줘요"
                right={
                  <Switch
                    value={app.settings.monthlyReportEnabled}
                    onValueChange={(v) => app.updateSettings({ monthlyReportEnabled: v })}
                    trackColor={{ true: T.accent }}
                    thumbColor="white"
                  />
                }
              />
            </>
          )}
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

          {(() => {
            const tc = THEME_COLORS.find(t => t.id === (app.settings.accentColor || 'pink')) || THEME_COLORS[0];
            return (
              <Row T={T} label="테마 컬러"
                right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: tc.color }} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: T.accent }}>{tc.label}</Text>
                  <Text testID="chevron" style={{ fontSize: 16, color: T.sub }}>›</Text>
                </View>}
                onPress={() => setShowColorPicker(true)}
              />
            );
          })()}
          {(() => {
            const sp = app.settings.stylePreset || 'cute';
            const spLabel = sp === 'minimal' ? '✦ 미니멀' : '귀여운';
            return (
              <Row T={T} label="타이머 스타일"
                right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: T.accent, lineHeight: 20 }}>{spLabel}</Text>
                  <Text testID="chevron" style={{ fontSize: 16, color: T.sub }}>›</Text>
                </View>}
                onPress={() => setShowStylePicker(true)}
              />
            );
          })()}

          {(() => {
            const FONTS = [
              { id: 'default', label: '기본' }, { id: 'pretendard', label: 'Pretendard' },
              { id: 'gowunDodum', label: '고운돋움' }, { id: 'nanumSquare', label: '나눔스퀘어' },
              { id: 'cookieRun', label: '쿠키런' }, { id: 'maplestory', label: '메이플스토리' },
            ];
            const curFont = FONTS.find(f => f.id === (app.settings.fontFamily || 'default')) || FONTS[0];
            const fam = curFont.id === 'default' ? undefined : FONT_FAMILY_MAP[curFont.id];
            return (
              <Row T={T} label="글꼴"
                right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text testID="font-preview" style={{ fontSize: 14, fontWeight: '700', color: T.accent, fontFamily: fam }}>{curFont.label}</Text>
                  <Text testID="chevron" style={{ fontSize: 16, color: T.sub }}>›</Text>
                </View>}
                onPress={() => setShowFontPicker(true)}
              />
            );
          })()}
        </Section>

{/* 사용 가이드 */}
        <Section T={T} title="도움말">
          <TouchableOpacity onPress={() => setShowGuide(true)}>
            <Row T={T} label="사용 가이드" right={<Text testID="chevron" style={{ color: T.sub }}>→</Text>} />
          </TouchableOpacity>
        </Section>

        {/* 데이터 관리 */}
        <Section T={T} title="데이터 관리" icon="folder-outline">
          <TouchableOpacity onPress={async () => {
            try {
              const data = await exportBackupData();
              const json = JSON.stringify(data, null, 2);
              const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
              const path = `${FileSystem.cacheDirectory}yeolgong_backup_${date}.json`;
              await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
              await Sharing.shareAsync(path, { mimeType: 'application/json', UTI: 'public.json' });
            } catch (e) {
              Alert.alert('백업 실패', '데이터를 내보내는 중 오류가 발생했습니다.');
            }
          }}>
            <Row T={T} label="데이터 백업" sub="JSON 파일로 내보내기" right={<Ionicons name="cloud-upload-outline" size={18} color={T.accent} />} />
          </TouchableOpacity>
          <TouchableOpacity onPress={async () => {
            try {
              const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
              if (result.canceled) return;
              const file = result.assets?.[0];
              if (!file) return;
              const raw = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
              const data = JSON.parse(raw);
              if (!data._meta || data._meta.app !== 'yeolgong') {
                Alert.alert('복원 실패', '열공메이트 백업 파일이 아닙니다.');
                return;
              }
              Alert.alert(
                '데이터 복원',
                `${data._meta.exportedAt?.slice(0, 10) || ''} 백업을 복원하면 현재 데이터가 덮어씌워집니다. 계속할까요?`,
                [
                  { text: '취소', style: 'cancel' },
                  { text: '복원', style: 'destructive', onPress: async () => {
                    try {
                      await importBackupData(data);
                      await app.reloadAllData();
                      Alert.alert('복원 완료', '데이터가 성공적으로 복원되었습니다.');
                    } catch {
                      Alert.alert('복원 실패', '데이터를 복원하는 중 오류가 발생했습니다.');
                    }
                  }},
                ]
              );
            } catch {
              Alert.alert('복원 실패', '파일을 읽는 중 오류가 발생했습니다.');
            }
          }}>
            <Row T={T} label="데이터 복원" sub="백업 파일에서 불러오기" right={<Ionicons name="cloud-download-outline" size={18} color={T.accent} />} />
          </TouchableOpacity>
        </Section>

        {/* 정보 */}
        <Section T={T} title="정보">
          <Row T={T} label="버전" right={<Text style={[styles.rowValue, { color: T.sub }]}>{Constants.expoConfig?.version ?? '1.0.0'}</Text>} />
          <TouchableOpacity onPress={() => Linking.openURL('https://lds77.github.io/suneung-timer-native/privacy-policy.html')}>
            <Row T={T} label="개인정보 처리방침" right={<Text testID="chevron" style={{ color: T.sub }}>→</Text>} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL('mailto:dongsikl51@gmail.com?subject=열공메이트 피드백')}>
            <Row T={T} label="피드백 보내기" right={<Text testID="chevron" style={{ color: T.sub }}>→</Text>} />
          </TouchableOpacity>
        </Section>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* 📖 사용 가이드 모달 */}
      <Modal visible={showGuide} transparent animationType="fade">
        <View style={{ flex: 1 }}>
          <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} activeOpacity={1} onPress={() => setShowGuide(false)} />
          <View style={{ position: 'absolute', bottom: 0, left: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, right: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, maxHeight: isLandscape ? '95%' : '92%', backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="book-outline" size={16} color={T.accent} />
              <Text style={[styles.modalTitle, { color: T.text }]}>사용 가이드</Text>
            </View>
            <ScrollView ref={guideScrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>

              {/* 기본 사용법 */}
              <GuideSection id="basic" title="기본 사용법" color={T.accent} T={T} openId={openGuideId} onOpen={setOpenGuideId} scrollRef={guideScrollRef}>
                {'열공메이트에 오신 걸 환영해요!\n\n① 집중탭 하단의 + 버튼으로 타이머를 만들어요\n② 잠금 강도에 따라 모드가 자동 선택되거나 직접 선택해요\n③ 타이머가 끝나면 집중밀도 점수와 등급을 확인해요\n④ 통계탭에서 오늘·이번 주·이번 달 기록을 분석해요\n\n잠금 강도 (설정에서 변경):\n• 일반 — 편하게 공부 모드 자동 시작\n• 집중 — 집중 도전 / 편하게 공부 중 선택\n• 울트라집중 — 집중 도전 모드 자동 시작\n\n처음엔 즐겨찾기에 자주 쓰는 타이머를 저장해두면 빠르게 시작할 수 있어요!'}
              </GuideSection>

              {/* 타이머 종류 */}
              <GuideSection id="timers" title="타이머 4가지" color="#00B4D8" T={T} openId={openGuideId} onOpen={setOpenGuideId} scrollRef={guideScrollRef}>
                {'카운트다운\n목표 시간을 정해놓고 카운트다운해요. 끝나면 완료 알림!\n\n자유(카운트업)\n시간 제한 없이 올라가는 스톱워치예요. 원할 때 직접 종료해요.\n\n뽀모도로\n집중(25분) → 휴식(5분)을 자동으로 반복해요.\n설정에서 집중·휴식 시간을 자유롭게 바꿀 수 있어요.\n\n연속모드\n여러 과목을 순서대로 이어서 실행해요.\n예) 수학 40분 → 영어 30분 → 국어 20분\n각 과목이 끝날 때마다 알림이 울리고 자동으로 다음으로 넘어가요.\n\n랩 스톱워치\n랩(구간) 기록을 남길 수 있는 스톱워치예요.\n문제 풀이 속도를 측정할 때 유용해요!'}
              </GuideSection>

              {/* 즐겨찾기 팁 */}
              <GuideSection id="fav" title="즐겨찾기 사용법" color="#FFD700" T={T} openId={openGuideId} onOpen={setOpenGuideId} scrollRef={guideScrollRef}>
                {'자주 쓰는 타이머를 즐겨찾기에 저장하면 한 번의 탭으로 바로 시작할 수 있어요!\n\n저장 방법:\n• 실행 중인 타이머 이름 왼쪽 별표 탭 → 즐겨찾기 추가\n• 편집 버튼으로 직접 추가·수정도 가능해요\n\n관리:\n• 즐겨찾기 셀을 길게 누르면 삭제 메뉴가 나와요'}
              </GuideSection>

              {/* 집중 모드 */}
              <GuideSection id="focus" title="집중 도전 vs 편하게 공부" color="#FF6B6B" T={T} openId={openGuideId} onOpen={setOpenGuideId} scrollRef={guideScrollRef}>
                {'타이머를 시작할 때 잠금 강도에 따라 공부 모드가 결정돼요.\n\n집중 도전 — 화면을 켠 채 공부\n→ 화면이 자동으로 어두워지고 잠금 화면이 나타나요\n→ 앱을 나가거나 다른 앱을 열면 "이탈"로 기록돼요\n→ 이탈 0회를 달성하면 Verified 인증 + 보너스 점수!\n→ 스스로에게 도전하고 싶을 때 추천!\n\n편하게 공부 — 화면을 꺼도 OK\n→ 화면을 꺼도 타이머가 계속 돌아가요\n→ 이탈 체크 없이 조용히 공부할 수 있어요\n→ 음악 들으며, 또는 부담 없이 공부하고 싶을 때 추천!\n\n모드 자동 선택:\n• 일반 강도 → 편하게 공부가 자동 시작돼요\n• 집중 강도 → 매번 직접 선택할 수 있어요\n• 울트라집중 → 집중 도전이 자동 시작돼요'}
              </GuideSection>

              {/* 잠금화면 */}
              <GuideSection id="lock" title="잠금화면 & 집중 강도" color="#E17055" T={T} openId={openGuideId} onOpen={setOpenGuideId} scrollRef={guideScrollRef}>
                {'집중 도전 모드에서는 잠금화면이 활성화돼요.\n\n잠금화면 사용법:\n• 화면이 어두워지면 잠금 화면 상태예요\n• 하단 "잠금 해제" 버튼을 눌러야 앱으로 돌아올 수 있어요\n• 잠금 해제 시 "이탈" 횟수가 올라가요\n\n집중 강도 3단계 (설정에서 변경 가능):\n\n일반: 편하게 공부가 자동 시작돼요.\n이탈 감지 없이 자유롭게 공부할 수 있어요.\n\n집중: 집중 도전 / 편하게 공부를 직접 선택해요.\n1분 이상 이탈 시 챌린지 문구를 입력해야 잠금이 해제돼요.\n\n울트라집중: 집중 도전이 자동 시작돼요.\n일시정지와 잠깐 쉬기가 불가능해요!\n10초 이상 앱을 나가면 타이머가 즉시 정지돼요.\n돌아올 때 챌린지 문구를 입력해야만 재개돼요.\n울트라 연속 기록이 별도로 쌓여요!\n\n챌린지 문구는 설정 > 집중 강도에서 직접 바꿀 수 있어요\n타이머 실행 중에는 잠금 강도를 변경할 수 없어요'}
              </GuideSection>

              {/* 오늘의 계획 */}
              <GuideSection id="plan" title="오늘의 계획 & 주간 플래너" color="#00CEC9" T={T} openId={openGuideId} onOpen={setOpenGuideId} scrollRef={guideScrollRef}>
                {'집중탭 상단 "오늘의 계획" 카드에서 그날의 공부 계획을 관리해요.\n\n주간 플래너 설정:\n① 설정 > 주간 플래너에서 요일별 계획을 만들어요\n② 각 계획에 과목·목표 시간·아이콘을 설정해요\n③ 매일 해당 요일의 계획이 자동으로 불러와져요\n\n계획 타이머 사용법:\n• 재생 버튼을 누르면 해당 과목의 타이머가 바로 시작돼요\n• 목표 시간의 80% 이상 달성하면 완료 표시\n• 진행 상황은 통계 > 주간 탭에서 달성률로 확인할 수 있어요\n\n계획 없는 날도 탭에서 직접 추가할 수 있어요'}
              </GuideSection>

              {/* 집중밀도 */}
              <GuideSection id="density" title="집중밀도란?" color="#6C5CE7" T={T} openId={openGuideId} onOpen={setOpenGuideId} scrollRef={guideScrollRef}>
                {'같은 1시간을 공부해도 집중한 정도는 다를 수 있어요.\n집중밀도는 "얼마나 몰입했는지"를 56~103점으로 측정해요.\n어떤 세션이든 최소 C등급이 보장돼요\n\n5분 미만은 통계에 저장되지 않아요\n짧은 태스크는 기록 대신 할 일 체크로 관리해요!\n\n점수를 높이는 핵심:\n• 타이머를 완주할수록 완료 점수 UP\n• 일시정지를 줄일수록 습관 점수 UP\n• 집중 도전 이탈 0회 → Verified 최대 +15점\n• 편하게 공부 완료 시에도 +5점 보너스\n• 세션 후 자가평가 최고 선택 시 +3점\n\n등급:\nSS (100+) > S+ (93+) > S (86+) > A (76+) > B (66+) > C (56+)\n\n메모와 자가평가를 남기면 나중에 돌아봤을 때 도움이 많이 돼요!'}
              </GuideSection>

              {/* 통계 */}
              <GuideSection id="stats" title="통계 탭 활용법" color="#A29BFE" T={T} openId={openGuideId} onOpen={setOpenGuideId} scrollRef={guideScrollRef}>
                {'공부 기록을 다양한 방식으로 분석할 수 있어요.\n\n일간\n오늘 공부한 시간, 목표 달성률, 간트 차트(시간대별 공부 블록)를 볼 수 있어요. 세션을 탭하면 메모를 수정할 수 있어요.\n\n주간\n이번 주 공부량 그래프와 시간대별 집중 패턴을 확인해요.\n← → 버튼으로 지난 주 기록도 볼 수 있고, 주간 플래너 달성률도 표시돼요.\n주간 리포트에서 울트라집중 세션 수도 확인할 수 있어요.\n\n월간\n달력 형식으로 매일 공부 시간을 한눈에 확인해요.\n날짜를 탭하면 그날의 세션 상세 내역이 나와요.\n\n잔디\n최근 6개월의 공부 기록을 한눈에 볼 수 있어요.\n칸을 탭하면 그날의 상세 내역, 아래엔 공부 일기(메모 모음)도 확인할 수 있어요.\n\n과목\n과목별 공부 시간을 7일·30일·전체 기간으로 비교해볼 수 있어요.\n\n세션 뱃지:\n• Verified — 이탈 0회 달성\n• Ultra — 울트라집중 모드로 완료'}
              </GuideSection>

              {/* 잔디 */}
              <GuideSection id="heatmap" title="365일 잔디" color="#4CAF50" T={T} openId={openGuideId} onOpen={setOpenGuideId} scrollRef={guideScrollRef}>
                {'통계 > 잔디 탭에서 확인할 수 있어요.\n공부한 날은 칸이 색칠돼요!\n\n색상 의미:\n• 연한색 = 편하게 공부한 날\n• 초록 = 집중 도전한 날\n• 금색 = Verified 달성한 날!\n• 빨강 = 울트라집중 모드로 공부한 날\n\n상단 요약 카드:\n• 올해 총 공부 시간\n• 현재 연속 공부 일수\n• 역대 최장 연속 기록\n\n공부 일기\n메모를 남긴 세션이 날짜별로 모여서 표시돼요.\n탭하면 메모를 수정할 수 있어요.\n\n매일 칸을 채워서 풀잔디에 도전해보세요!'}
              </GuideSection>

              {/* 과목 & 할 일 */}
              <GuideSection id="subject" title="과목 관리" color="#FDCB6E" T={T} openId={openGuideId} onOpen={setOpenGuideId} scrollRef={guideScrollRef}>
                {'과목 탭:\n• + 버튼으로 과목을 추가하고 색상을 지정할 수 있어요\n• 과목별 총 공부 시간이 자동으로 쌓여요\n• 즐겨찾기 버튼으로 즐겨찾기 과목을 상단에 고정해요\n\nD-Day·일정은 플래너 탭 > 월간에서 관리해요\n• 시험, 모의고사, 과제 제출일 등을 캘린더에 등록해요\n• 별(★)로 고정한 일정은 집중탭 상단에 항상 표시돼요\n• D-14 이내로 다가오는 일정은 집중탭에 자동으로 표시돼요'}
              </GuideSection>

              {/* 플래너 탭 */}
              <GuideSection id="planner" title="플래너 탭" color="#00CEC9" T={T} openId={openGuideId} onOpen={setOpenGuideId} scrollRef={guideScrollRef}>
                {'플래너 탭에서 오늘·주간·월간 일정을 한눈에 파악해요.\n\n오늘 뷰\n• 오늘 시간표 블록과 계획을 시각적으로 확인해요\n• 공부 계획 옆 재생 버튼으로 바로 타이머를 시작해요\n• 배치 버튼으로 빈 시간에 미배치 계획을 넣을 수 있어요\n\n주간 뷰\n• 요일별 시간표를 그리드로 확인해요\n• 블록을 탭하면 바로 타이머를 시작할 수 있어요\n\n월간 뷰 (D-Day·일정 관리)\n• 날짜를 탭하면 그날의 공부 기록과 일정을 확인해요\n• 날짜를 길게 누르면 새 일정을 바로 추가해요\n• 과거 날짜에는 공부량에 따라 색상 도트가 표시돼요\n• 시험·일정에 별(★)을 고정하면 집중탭에 상시 표시돼요\n\n⚙ 버튼\n• 주간 플래너 편집 화면이 열려요\n• 요일별 고정 일정(학교·식사 등)과 공부 계획을 설정해요\n• 기본 시간표 초기화로 학교급에 맞는 시간표를 불러올 수 있어요'}
              </GuideSection>

              {/* 스마트 할 일 */}
              <GuideSection id="todo" title="스마트 할 일" color="#00B894" T={T} openId={openGuideId} onOpen={setOpenGuideId} scrollRef={guideScrollRef}>
                {'집중탭 하단의 할 일 카드에서 사용해요.\n\n빠른 추가\n• 내 과목 칩을 탭하면 과목이 미리 선택된 상태로 입력 모달이 열려요\n• 추가 후 모달이 닫히지 않아 연속으로 여러 개를 빠르게 추가할 수 있어요\n\n기한 설정\n• [오늘] — 오늘 완료할 할 일\n• [이번주] — 이번 주 안에 할 일\n• [시험] — D-Day에 연결된 체크리스트. 시험 탭에서 D-Day별로 묶여 보여요\n\n반복 할 일\n• [매일], [주중], [주말], [직접선택]으로 반복 주기를 설정할 수 있어요\n• 해당 요일에 자동으로 오늘 할 일에 추가돼요\n\n시험이 7일 이내로 다가오면 집중탭에 경고 배너가 표시돼요'}
              </GuideSection>

              {/* 알림 팁 */}
              <GuideSection id="notif" title="알림이 안 울려요?" color="#74B9FF" T={T} openId={openGuideId} onOpen={setOpenGuideId} scrollRef={guideScrollRef}>
                {'타이머 완료 알림이 오지 않는다면 아래를 확인해주세요!\n\n① 알림 권한 확인\n설정 앱 > 앱 > 열공메이트 > 알림을 허용해주세요.\n\n② 정확한 알람 권한 (Android 12+)\n설정 > 앱 > 특별한 앱 권한 > 알람 및 알림에서 이 앱을 허용해주세요.\n\n③ 배터리 최적화 해제 (일부 기기)\n대부분의 기기에서는 위 설정만으로 충분해요.\n만약 그래도 알림이 안 온다면:\n• Android: 설정 > 앱 > 열공메이트 > 배터리 > "제한 없음" 선택\n• 일부 제조사(Xiaomi, Huawei 등): "자동 실행" 또는 "백그라운드 활동" 허용 필요\n• iPhone: 설정 > 알림 > 열공메이트 > 알림 허용 확인'}
              </GuideSection>

              {/* 학습법 */}
              <GuideSection id="method" title="학습법 — 왜 이 방법들인가요?" color="#E07050" T={T} openId={openGuideId} onOpen={setOpenGuideId} scrollRef={guideScrollRef}>
                {'과목 탭의 학습법은 모두 연구로 검증된 방법들이에요!\n\n미션 스프린트 (15분×3)\n짧은 목표를 반복하면 동기부여가 30% 이상 높아져요.\n\n소리+묵독\n소리 내어 읽으면 묵독보다 기억이 77% 향상되는 "프로덕션 효과"가 있어요.\n\n인터리빙\n한 과목만 계속하는 것보다 과목을 번갈아 공부하면 기억력이 43% 향상돼요.\n\n52-17 법칙\n52분 집중 + 17분 휴식이 생산성이 가장 높은 황금 비율이에요.\n\n울트라디안 90\n인간의 집중력은 90분 주기로 움직여요. 90분 집중 후 충분히 쉬면 다음 사이클도 고효율!\n\n하드 스타트\n어려운 문제를 먼저 시작하면 쉬운 걸 하는 동안에도 뇌가 무의식적으로 계속 처리해요.'}
              </GuideSection>

              {/* 닫기 */}
              <TouchableOpacity onPress={() => setShowGuide(false)} style={[styles.modalCancel, { borderColor: T.border, marginTop: 14 }]}>
                <Text style={[styles.modalCancelText, { color: T.sub }]}>닫기</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 잠금 강도 피커 */}
      <Modal visible={showFocusPicker} transparent animationType="slide">
        <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} activeOpacity={1} onPress={() => setShowFocusPicker(false)} />
        <View style={{ position: 'absolute', bottom: 0, left: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, right: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, maxHeight: isLandscape ? '95%' : '92%', backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: T.text }}>잠금 강도</Text>
            <TouchableOpacity onPress={() => setShowFocusPicker(false)}><Text style={{ fontSize: 14, color: T.sub }}>닫기</Text></TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 24, marginBottom: 12 }}>
            <Ionicons name="information-circle-outline" size={13} color={T.sub} />
            <Text style={{ fontSize: 12, color: T.sub }}>타이머 시작 시 적용돼요</Text>
          </View>
          {FOCUS_LEVELS.map(lv => {
            const sel = (app.settings.ultraFocusLevel || 'normal') === lv.id;
            const isExam = lv.id === 'exam';
            const isNormal = lv.id === 'normal';
            const icon = isExam ? 'flame' : isNormal ? 'leaf' : 'shield-half';
            return (
              <TouchableOpacity key={lv.id} onPress={() => { app.updateSettings({ ultraFocusLevel: lv.id }); setShowFocusPicker(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 20, marginHorizontal: 12, marginBottom: 6, backgroundColor: sel ? lv.color + '15' : T.surface2, borderRadius: 12, borderWidth: sel ? 1.5 : 1, borderColor: sel ? lv.color + '50' : T.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: sel ? lv.color + '25' : T.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={icon} size={17} color={sel ? lv.color : T.sub} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: sel ? '800' : '500', color: sel ? lv.color : T.text }}>{lv.label}</Text>
                      {isExam && !sel && <View style={{ backgroundColor: '#FF6B6B20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}><Text style={{ fontSize: 10, fontWeight: '700', color: '#FF6B6B' }}>도전!</Text></View>}
                    </View>
                    <Text style={{ fontSize: 12, color: sel ? lv.color + 'BB' : T.sub, marginTop: 3, lineHeight: 16 }}>{lv.desc}</Text>
                  </View>
                </View>
                {sel && <Ionicons name="checkmark-circle" size={20} color={lv.color} />}
              </TouchableOpacity>
            );
          })}
          {(app.settings.ultraFocusLevel || 'normal') !== 'exam' && (
            <View style={{ marginHorizontal: 24, marginTop: 6, marginBottom: 4 }}>
              <Text style={{ fontSize: 11.5, color: '#FF6B6B', textAlign: 'center', fontWeight: '500', lineHeight: 17 }}>울트라집중에 도전해보세요! 공부의 밀도가 올라갑니다.</Text>
            </View>
          )}
        </View>
      </Modal>

      {/* 테마 컬러 피커 */}
      <Modal visible={showColorPicker} transparent animationType="slide">
        <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} activeOpacity={1} onPress={() => setShowColorPicker(false)} />
        <View style={{ position: 'absolute', bottom: 0, left: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, right: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, maxHeight: isLandscape ? '95%' : '92%', backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: T.text }}>테마 컬러</Text>
            <TouchableOpacity onPress={() => setShowColorPicker(false)}><Text style={{ fontSize: 14, color: T.sub }}>닫기</Text></TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, paddingBottom: 8, gap: 12 }}>
            {THEME_COLORS.map(tc => {
              const sel = (app.settings.accentColor || 'pink') === tc.id;
              return (
                <TouchableOpacity key={tc.id} onPress={() => { app.updateSettings({ accentColor: tc.id }); setShowColorPicker(false); }}
                  style={{ width: (winW - (isTablet ? (winW - tabletMaxW) : 0) - 40 - 72) / 7, alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tc.color, borderWidth: sel ? 3 : 1.5, borderColor: sel ? T.text : tc.color + '60' }} />
                  <Text style={{ fontSize: 12, fontWeight: sel ? '800' : '500', color: sel ? T.text : T.sub }}>{tc.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* 헤더 배경 피커 */}
      <Modal visible={showHeaderBgPicker} transparent animationType="slide">
        <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} activeOpacity={1} onPress={() => setShowHeaderBgPicker(false)} />
        <View style={{ position: 'absolute', bottom: 0, left: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, right: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, maxHeight: isLandscape ? '95%' : '92%', backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: T.text }}>헤더 배경</Text>
            <TouchableOpacity onPress={() => setShowHeaderBgPicker(false)}><Text style={{ fontSize: 14, color: T.sub }}>닫기</Text></TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, paddingBottom: 8, gap: 12 }}>
            {HEADER_BG_PRESETS.map(preset => {
              const sel = (app.settings.headerBgPreset ?? 0) === preset.id;
              return (
                <TouchableOpacity key={preset.id}
                  onPress={() => { app.updateSettings({ headerBgPreset: preset.id }); setShowHeaderBgPicker(false); }}
                  style={{ width: (winW - (isTablet ? (winW - tabletMaxW) : 0) - 40 - 72) / 7, alignItems: 'center', gap: 6 }}>
                  {preset.type === 'gradient' ? (
                    <LinearGradient colors={preset.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: sel ? 3 : 1.5, borderColor: sel ? T.text : 'transparent' }} />
                  ) : preset.type === 'solid' ? (
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: preset.color, borderWidth: sel ? 3 : 1.5, borderColor: sel ? T.text : preset.color + '60' }} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: T.surface2, borderWidth: sel ? 3 : 1.5, borderColor: sel ? T.text : T.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16, color: T.sub }}>✕</Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 12, fontWeight: sel ? '800' : '500', color: sel ? T.text : T.sub }}>{preset.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* 스타일 프리셋 피커 */}
      <Modal visible={showStylePicker} transparent animationType="slide">
        <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} activeOpacity={1} onPress={() => setShowStylePicker(false)} />
        <View style={{ position: 'absolute', bottom: 0, left: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, right: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, maxHeight: isLandscape ? '95%' : '92%', backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: T.text }}>타이머 스타일</Text>
            <TouchableOpacity onPress={() => setShowStylePicker(false)}><Text style={{ fontSize: 14, color: T.sub }}>닫기</Text></TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 20, paddingBottom: 8, gap: 10 }}>
            {[
              { id: 'cute',    label: '귀여운',  desc: '둥글고 컬러풀한 스타일' },
              { id: 'minimal', label: '✦ 미니멀',   desc: '각지고 단정한 스타일' },
            ].map(p => {
              const sel = (app.settings.stylePreset || 'cute') === p.id;
              return (
                <TouchableOpacity key={p.id} onPress={() => { app.updateSettings({ stylePreset: p.id }); setShowStylePicker(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: sel ? 2 : 1, borderColor: sel ? T.accent : T.border, backgroundColor: sel ? T.accent + '12' : 'transparent' }}>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: sel ? T.accent : T.text }}>{p.label}</Text>
                    <Text style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>{p.desc}</Text>
                  </View>
                  {sel && <Text style={{ fontSize: 18, color: T.accent }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* 글꼴 피커 */}
      <Modal visible={showFontPicker} transparent animationType="slide">
        <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} activeOpacity={1} onPress={() => setShowFontPicker(false)} />
        <View style={{ position: 'absolute', bottom: 0, left: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, right: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, maxHeight: isLandscape ? '95%' : '92%', backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: T.text }}>글꼴</Text>
            <TouchableOpacity onPress={() => setShowFontPicker(false)}><Text style={{ fontSize: 14, color: T.sub }}>닫기</Text></TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 20, paddingBottom: 8, gap: 8 }}>
            {[
              { id: 'default',     label: '기본',         sample: '시스템 기본 글꼴' },
              { id: 'pretendard',  label: 'Pretendard',   sample: '깔끔한 고딕체' },
              { id: 'gowunDodum',  label: '고운돋움',     sample: '부드러운 느낌' },
              { id: 'nanumSquare', label: '나눔스퀘어',   sample: '단정한 느낌' },
              { id: 'cookieRun',   label: '쿠키런',       sample: '귀여운 느낌' },
              { id: 'maplestory',  label: '메이플스토리', sample: '재밌는 느낌' },
            ].map(f => {
              const sel = (app.settings.fontFamily || 'default') === f.id;
              const fam = f.id === 'default' ? undefined : FONT_FAMILY_MAP[f.id];
              return (
                <TouchableOpacity key={f.id} onPress={() => { app.updateSettings({ fontFamily: f.id }); setShowFontPicker(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, borderWidth: sel ? 2 : 1, borderColor: sel ? T.accent : T.border, backgroundColor: sel ? T.accent + '12' : 'transparent' }}>
                  <View>
                    <Text testID="font-preview" style={{ fontSize: 15, fontWeight: '700', color: sel ? T.accent : T.text, fontFamily: fam }}>{f.label}</Text>
                    <Text testID="font-preview" style={{ fontSize: 12, color: T.sub, marginTop: 1, fontFamily: fam }}>{f.sample}</Text>
                  </View>
                  {sel && <Text style={{ fontSize: 18, color: T.accent }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={{ fontSize: 11, color: T.sub, textAlign: 'center', paddingBottom: 4 }}>폰트를 변경하면 앱이 잠시 다시 로딩돼요</Text>
        </View>
      </Modal>

      {/* 일일 목표 시간 피커 */}
      <Modal visible={showGoalPicker} transparent animationType="slide">
        <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} activeOpacity={1} onPress={() => setShowGoalPicker(false)} />
        <View style={{ position: 'absolute', bottom: 0, left: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, right: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, maxHeight: isLandscape ? '95%' : '92%', backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: T.text }}>일일 목표 시간</Text>
            <TouchableOpacity onPress={() => setShowGoalPicker(false)}><Text style={{ fontSize: 14, color: T.sub }}>닫기</Text></TouchableOpacity>
          </View>
          {DAILY_GOAL_OPTIONS.map(min => {
            const sel = app.settings.dailyGoalMin === min;
            return (
              <TouchableOpacity key={min} onPress={() => { app.updateSettings({ dailyGoalMin: min }); setShowGoalPicker(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 24, backgroundColor: sel ? T.accent + '15' : 'transparent' }}>
                <Text style={{ fontSize: 15, fontWeight: sel ? '900' : '600', color: sel ? T.accent : T.text }}>{min / 60}시간</Text>
                {sel && <Text style={{ fontSize: 16, color: T.accent }}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>

      {/* 학교급 피커 */}
      <Modal visible={showSchoolPicker} transparent animationType="slide">
        <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} activeOpacity={1} onPress={() => setShowSchoolPicker(false)} />
        <View style={{ position: 'absolute', bottom: 0, left: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, right: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, maxHeight: isLandscape ? '95%' : '92%', backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: T.text }}>학교급</Text>
            <TouchableOpacity onPress={() => setShowSchoolPicker(false)}><Text style={{ fontSize: 14, color: T.sub }}>닫기</Text></TouchableOpacity>
          </View>
          {SCHOOL_LEVELS.map(s => {
            const sel = (app.settings.schoolLevel || 'high') === s.id;
            return (
              <TouchableOpacity key={s.id} onPress={() => { app.updateSettings({ schoolLevel: s.id }); setShowSchoolPicker(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 24, backgroundColor: sel ? T.accent + '15' : 'transparent' }}>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: sel ? '900' : '600', color: sel ? T.accent : T.text }}>{s.label}</Text>
                  <Text style={{ fontSize: 12, color: sel ? T.accent + 'AA' : T.sub, marginTop: 1 }}>{s.sub}</Text>
                </View>
                {sel && <Text style={{ fontSize: 16, color: T.accent }}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>

      {/* 리마인더 시간 피커 */}
      <Modal visible={showReminderPicker} transparent animationType="slide"
        onShow={() => {
          const h = app.settings.dailyReminderHour ?? 21;
          const m = app.settings.dailyReminderMin ?? 0;
          setReminderTime(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
        }}
      >
        <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} activeOpacity={1} onPress={() => setShowReminderPicker(false)} />
        <View style={{ position: 'absolute', bottom: 0, left: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, right: isTablet ? Math.max(0, (winW - tabletMaxW) / 2) : 0, backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: T.text }}>리마인더 시각</Text>
            <TouchableOpacity onPress={() => setShowReminderPicker(false)}>
              <Ionicons name="close" size={22} color={T.sub} />
            </TouchableOpacity>
          </View>
          <TimePickerGrid label="" value={reminderTime} onChange={setReminderTime} T={T} />
          <TouchableOpacity
            onPress={() => {
              const [h, m] = reminderTime.split(':').map(Number);
              app.updateSettings({ dailyReminderHour: h, dailyReminderMin: m });
              setShowReminderPicker(false);
            }}
            style={{ marginTop: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: T.accent }}
          >
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>확인</Text>
          </TouchableOpacity>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

function createStyles(fs) { return StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  headerTitle: { fontSize: Math.round(20 * fs), fontWeight: '900', marginBottom: 12 },

  section: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1 },
  sectionTitle: { fontSize: Math.round(13 * fs), fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },

  // 캐릭터 선택
  charGrid: { flexDirection: 'row', gap: 6 },
  charCard: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  charName: { fontSize: Math.round(12 * fs), marginTop: 4 },

  // 목표
  goalLabel: { fontSize: Math.round(12 * fs), marginBottom: 6 },
  goalRow: { flexDirection: 'row', gap: 5 },
  goalBtn: { flex: 1, paddingVertical: 7, borderRadius: 6, borderWidth: 1, alignItems: 'center' },
  goalBtnText: { fontSize: Math.round(12 * fs), fontWeight: '700' },

  // 학교급 선택 row (목표 섹션 내)
  schoolRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  schoolBtn: { flex: 1, paddingVertical: 4, borderRadius: 8, borderWidth: 1, alignItems: 'center' },

  // 폰트 선택 그리드
  fontGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fontItem: { flex: 1, height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderRadius: 10, borderWidth: 1.5 },

  // D-Day
  ddayRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, borderBottomWidth: 0.5 },
  ddayStar: { padding: 2 },
  ddayLabel: { fontSize: Math.round(14 * fs), fontWeight: '700' },
  ddayDate: { fontSize: Math.round(12 * fs), marginTop: 1 },
  ddayBadge: { fontSize: Math.round(13 * fs), fontWeight: '800' },
  ddayDel: { fontSize: Math.round(18 * fs), paddingHorizontal: 4 },
  ddayAddBtn: { paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', marginTop: 6 },
  ddayAddText: { fontSize: Math.round(14 * fs), fontWeight: '700' },

  // Row
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  rowLabel: { fontSize: Math.round(14 * fs), fontWeight: '600', flex: 1 },
  rowRight: {},
  rowValue: { fontSize: Math.round(14 * fs), fontWeight: '700' },

  hint: { fontSize: Math.round(11 * fs), marginTop: -4, marginBottom: 4 },

  // 위험 버튼
  dangerBtn: { paddingVertical: 10, alignItems: 'center' },
  dangerText: { fontSize: Math.round(14 * fs), fontWeight: '600' },

  // 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 30 },
  modal: { borderRadius: 20, padding: 20, borderWidth: 1 },
  modalTitle: { fontSize: Math.round(16 * fs), fontWeight: '900', textAlign: 'center', marginBottom: 14 },
  modalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: Math.round(15 * fs), marginBottom: 10 },
  modalBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  modalCancel: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  modalCancelText: { fontSize: Math.round(14 * fs), fontWeight: '600' },
  modalConfirm: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  modalConfirmText: { color: 'white', fontSize: Math.round(14 * fs), fontWeight: '800' },
}); }
