// src/screens/SubjectsScreen.js
// v23: 학습법 탭 + 고등 수능 탭
import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, StyleSheet, Platform, KeyboardAvoidingView, Dimensions, useWindowDimensions } from 'react-native';
import { useApp } from '../hooks/useAppState';

const { width: SW } = Dimensions.get('window');
const isTablet = SW >= 600;
import { LIGHT, DARK, SUBJECT_COLORS, getTheme } from '../constants/colors';
import { SUBJECT_PRESETS, getTier } from '../constants/presets';
import { CHARACTERS, CHARACTER_LIST } from '../constants/characters';
import { formatShort, formatTime } from '../utils/format';
import CharacterAvatar from '../components/CharacterAvatar';
import RunningTimersBar from '../components/RunningTimersBar';
import { Ionicons } from '@expo/vector-icons';

// ═══ 추천 루틴 ═══
const ROUTINES = {
  elementary_lower: [
    { id: 'lr1', icon: 'bag-outline', name: '방과후 기본', color: '#4A90D9', items: [{ label: '숙제', color: '#F5A623', min: 20 }, { label: '국어', color: '#E8575A', min: 20 }, { label: '수학', color: '#4A90D9', min: 20 }], breakMin: 5 },
    { id: 'lr2', icon: 'flash-outline', name: '빠르게 끝내기', color: '#F5A623', items: [{ label: '숙제', color: '#F5A623', min: 20 }, { label: '수학', color: '#4A90D9', min: 20 }], breakMin: 5 },
    { id: 'lr3', icon: 'book-outline', name: '독서 + 공부', color: '#9B6FC3', items: [{ label: '독서', color: '#9B6FC3', min: 20 }, { label: '숙제', color: '#F5A623', min: 20 }, { label: '수학', color: '#4A90D9', min: 20 }], breakMin: 5 },
  ],
  elementary_upper: [
    { id: 'ur1', icon: 'bag-outline', name: '방과후 기본', color: '#4A90D9', items: [{ label: '숙제', color: '#00B894', min: 25 }, { label: '수학', color: '#4A90D9', min: 25 }, { label: '영어', color: '#5CB85C', min: 25 }], breakMin: 5 },
    { id: 'ur2', icon: 'flame-outline', name: '집중 모드', color: '#E17055', items: [{ label: '수학', color: '#4A90D9', min: 25 }, { label: '영어', color: '#5CB85C', min: 25 }, { label: '독서', color: '#E17055', min: 20 }, { label: '복습', color: '#9B6FC3', min: 20 }], breakMin: 5 },
    { id: 'ur3', icon: 'flash-outline', name: '빠르게 끝내기', color: '#F5A623', items: [{ label: '숙제', color: '#00B894', min: 25 }, { label: '수학', color: '#4A90D9', min: 25 }], breakMin: 5 },
    { id: 'ur4', icon: 'sunny-outline', name: '주말/방학', color: '#E8575A', items: [{ label: '국어', color: '#E8575A', min: 25 }, { label: '수학', color: '#4A90D9', min: 25 }, { label: '영어', color: '#5CB85C', min: 25 }, { label: '사회/과학', color: '#F5A623', min: 25 }, { label: '독서', color: '#E17055', min: 20 }], breakMin: 5 },
  ],
  middle: [
    { id: 'mr1', icon: 'book-outline', name: '평일 기본', color: '#4A90D9', items: [{ label: '숙제', color: '#F5A623', min: 30 }, { label: '국어', color: '#E8575A', min: 30 }, { label: '수학', color: '#4A90D9', min: 30 }, { label: '영어', color: '#5CB85C', min: 30 }], breakMin: 10 },
    { id: 'mr2', icon: 'flame-outline', name: '시험 집중', color: '#E17055', items: [{ label: '수학', color: '#4A90D9', min: 40 }, { label: '영어', color: '#5CB85C', min: 35 }, { label: '과학', color: '#F5A623', min: 35 }, { label: '사회', color: '#9B6FC3', min: 30 }], breakMin: 10 },
    { id: 'mr3', icon: 'flash-outline', name: '빠르게 끝내기', color: '#F5A623', items: [{ label: '숙제', color: '#F5A623', min: 30 }, { label: '수학', color: '#4A90D9', min: 30 }], breakMin: 10 },
    { id: 'mr4', icon: 'calendar-outline', name: '주말/휴일', color: '#E8575A', items: [{ label: '국어', color: '#E8575A', min: 30 }, { label: '수학', color: '#4A90D9', min: 40 }, { label: '영어', color: '#5CB85C', min: 30 }, { label: '과학', color: '#F5A623', min: 30 }, { label: '사회', color: '#9B6FC3', min: 30 }, { label: '역사', color: '#E17055', min: 25 }], breakMin: 10 },
  ],
  high: [
    { id: 'hr1', icon: 'book-outline', name: '평일 기본', color: '#4A90D9', items: [{ label: '국어', color: '#E8575A', min: 60 }, { label: '수학', color: '#4A90D9', min: 60 }, { label: '영어', color: '#5CB85C', min: 60 }], breakMin: 10 },
    { id: 'hr2', icon: 'flame-outline', name: '시험 집중', color: '#E17055', items: [{ label: '수학', color: '#4A90D9', min: 70 }, { label: '영어', color: '#5CB85C', min: 50 }, { label: '과학', color: '#F5A623', min: 50 }, { label: '사회', color: '#9B6FC3', min: 50 }], breakMin: 10 },
    { id: 'hr3', icon: 'flash-outline', name: '빠르게 끝내기', color: '#F5A623', items: [{ label: '수학', color: '#4A90D9', min: 60 }, { label: '영어', color: '#5CB85C', min: 50 }], breakMin: 10 },
    { id: 'hr4', icon: 'calendar-outline', name: '주말/휴일', color: '#E8575A', items: [{ label: '국어', color: '#E8575A', min: 60 }, { label: '수학', color: '#4A90D9', min: 70 }, { label: '영어', color: '#5CB85C', min: 60 }, { label: '과학', color: '#F5A623', min: 50 }, { label: '한국사', color: '#E17055', min: 50 }], breakMin: 10 },
  ],
  nsuneung: [
    { id: 'nr1', icon: 'book-outline', name: '평일 기본', color: '#4A90D9', items: [{ label: '국어', color: '#E8575A', min: 80 }, { label: '수학', color: '#4A90D9', min: 90 }, { label: '영어', color: '#5CB85C', min: 60 }], breakMin: 15 },
    { id: 'nr2', icon: 'flame-outline', name: '수능 올인', color: '#E17055', items: [{ label: '국어', color: '#E8575A', min: 100 }, { label: '수학', color: '#4A90D9', min: 120 }, { label: '영어', color: '#5CB85C', min: 80 }, { label: '탐구', color: '#F5A623', min: 60 }], breakMin: 15 },
    { id: 'nr3', icon: 'flash-outline', name: '단과 몰입', color: '#F5A623', items: [{ label: '수학', color: '#4A90D9', min: 120 }], breakMin: 10 },
    { id: 'nr4', icon: 'calendar-outline', name: '주말/휴일', color: '#E8575A', items: [{ label: '국어', color: '#E8575A', min: 90 }, { label: '수학', color: '#4A90D9', min: 120 }, { label: '영어', color: '#5CB85C', min: 80 }, { label: '탐구 1', color: '#F5A623', min: 70 }, { label: '탐구 2', color: '#9B6FC3', min: 60 }], breakMin: 15 },
  ],
  university: [
    { id: 'unr1', icon: 'folder-outline', name: '평일 기본', color: '#4A90D9', items: [{ label: '전공', color: '#4A90D9', min: 60 }, { label: '전공 2', color: '#6C5CE7', min: 50 }, { label: '교양', color: '#00B894', min: 40 }], breakMin: 10 },
    { id: 'unr2', icon: 'flame-outline', name: '시험 기간', color: '#E17055', items: [{ label: '전공', color: '#4A90D9', min: 90 }, { label: '전공 2', color: '#6C5CE7', min: 70 }, { label: '복습', color: '#E17055', min: 50 }], breakMin: 15 },
    { id: 'unr3', icon: 'flash-outline', name: '과제 집중', color: '#F5A623', items: [{ label: '과제', color: '#F5A623', min: 80 }, { label: '복습', color: '#9B6FC3', min: 30 }], breakMin: 10 },
    { id: 'unr4', icon: 'calendar-outline', name: '주말/휴일', color: '#E8575A', items: [{ label: '전공', color: '#4A90D9', min: 80 }, { label: '전공 2', color: '#6C5CE7', min: 70 }, { label: '교양', color: '#00B894', min: 50 }, { label: '복습', color: '#9B6FC3', min: 40 }], breakMin: 15 },
  ],
  exam_prep: [
    { id: 'er1', icon: 'folder-outline', name: '평일 기본', color: '#4A90D9', items: [{ label: '핵심 과목', color: '#4A90D9', min: 80 }, { label: '보조 과목', color: '#6C5CE7', min: 60 }, { label: '문제풀이', color: '#E17055', min: 50 }], breakMin: 10 },
    { id: 'er2', icon: 'flame-outline', name: '집중 학습', color: '#E17055', items: [{ label: '핵심 과목', color: '#4A90D9', min: 100 }, { label: '보조 과목', color: '#6C5CE7', min: 80 }, { label: '문제풀이', color: '#E17055', min: 60 }], breakMin: 15 },
    { id: 'er3', icon: 'flash-outline', name: '문제풀이 집중', color: '#F5A623', items: [{ label: '문제풀이', color: '#E17055', min: 90 }, { label: '오답 정리', color: '#F5A623', min: 40 }], breakMin: 10 },
    { id: 'er4', icon: 'calendar-outline', name: '주말/휴일', color: '#E8575A', items: [{ label: '핵심 과목', color: '#4A90D9', min: 100 }, { label: '보조 과목', color: '#6C5CE7', min: 80 }, { label: '문제풀이', color: '#E17055', min: 70 }, { label: '암기', color: '#00B894', min: 50 }], breakMin: 15 },
  ],
};

// ═══ 학습법 (과학적 근거) ═══
const STUDY_METHODS = {
  elementary_lower: [
    { id: 'sl1', icon: 'bulb-outline', name: '두뇌 워밍업', color: '#FF6B9D',
      desc: '쉬운 과목으로 뇌를 깨운 후 어려운 과목 도전',
      source: '인지 부하 이론 · Sweller',
      items: [{ label: '쉬운 과목', color: '#5CB85C', min: 10 }, { label: '어려운 과목', color: '#E8575A', min: 20 }], breakMin: 5 },
    { id: 'sl2', icon: 'game-controller-outline', name: '미션 스프린트', color: '#4A90D9',
      desc: '짧은 미션 3개를 연속 클리어!',
      source: '게이미피케이션 · Deterding, 2011',
      items: [{ label: '미션 1', color: '#E8575A', min: 15 }, { label: '미션 2', color: '#4A90D9', min: 15 }, { label: '미션 3', color: '#5CB85C', min: 15 }], breakMin: 3 },
    { id: 'sl3', icon: 'book-outline', name: '소리 + 묵독', color: '#9B6FC3',
      desc: '소리내어 읽으면 기억력이 2배!',
      source: '프로덕션 효과 · MacLeod, 2011',
      items: [{ label: '소리내어 읽기', color: '#E8575A', min: 10 }, { label: '묵독', color: '#9B6FC3', min: 15 }], breakMin: 5 },
  ],
  elementary_upper: [
    { id: 'su1', icon: 'bulb-outline', name: '두뇌 워밍업', color: '#FF6B9D',
      desc: '쉬운 과목으로 뇌를 깨운 후 어려운 과목 도전',
      source: '인지 부하 이론 · Sweller',
      items: [{ label: '쉬운 과목', color: '#5CB85C', min: 15 }, { label: '어려운 과목', color: '#E8575A', min: 25 }], breakMin: 5 },
    { id: 'su2', icon: 'game-controller-outline', name: '미션 스프린트', color: '#4A90D9',
      desc: '짧은 미션 3개를 연속 클리어!',
      source: '게이미피케이션 · Deterding, 2011',
      items: [{ label: '미션 1', color: '#E8575A', min: 20 }, { label: '미션 2', color: '#4A90D9', min: 20 }, { label: '미션 3', color: '#5CB85C', min: 20 }], breakMin: 5 },
    { id: 'su3', icon: 'book-outline', name: '소리 + 묵독', color: '#9B6FC3',
      desc: '소리내어 읽으면 기억력이 2배!',
      source: '프로덕션 효과 · MacLeod, 2011',
      items: [{ label: '소리내어 읽기', color: '#E8575A', min: 15 }, { label: '묵독', color: '#9B6FC3', min: 20 }], breakMin: 5 },
  ],
  middle: [
    { id: 'sm1', icon: 'shuffle-outline', name: '인터리빙 학습', color: '#6C5CE7',
      desc: '과목을 섞으면 기억력 43% 향상!',
      source: 'UCLA · Rohrer & Taylor, 2007',
      items: [{ label: '과목 A', color: '#E8575A', min: 25 }, { label: '과목 B', color: '#4A90D9', min: 25 }, { label: '과목 A', color: '#E8575A', min: 25 }, { label: '과목 B', color: '#4A90D9', min: 25 }], breakMin: 5 },
    { id: 'sm2', icon: 'flask-outline', name: '40-10 법칙', color: '#00B894',
      desc: '상위 10% 학생의 집중 패턴',
      source: 'DeskTime 생산성 연구 (학생 버전)',
      items: [{ label: '집중', color: '#00B894', min: 40 }, { label: '완전 휴식', color: '#B2BEC3', min: 10 }], breakMin: 0 },
    { id: 'sm3', icon: 'repeat-outline', name: '시험 루프', color: '#E17055',
      desc: '시험 보는 행위 자체가 기억을 75% 강화',
      source: '테스트 효과 · Roediger & Karpicke, 2006',
      items: [{ label: '문제 풀기', color: '#E8575A', min: 30 }, { label: '채점/오답', color: '#F5A623', min: 10 }, { label: '문제 풀기', color: '#4A90D9', min: 30 }, { label: '채점/오답', color: '#F5A623', min: 10 }], breakMin: 5 },
  ],
  high: [
    { id: 'sh1', icon: 'flash-outline', name: '52-17 법칙', color: '#E17055',
      desc: '생산성 상위 10%의 비밀',
      source: 'DeskTime · 550만 건 작업 데이터 분석',
      items: [{ label: '집중', color: '#E17055', min: 52 }, { label: '완전 휴식', color: '#B2BEC3', min: 17 }], breakMin: 0 },
    { id: 'sh2', icon: 'water-outline', name: '울트라디안 90', color: '#4A90D9',
      desc: '인간의 자연적 90분 각성-휴식 주기',
      source: '수면과학자 Nathaniel Kleitman',
      items: [{ label: '깊은 집중', color: '#4A90D9', min: 90 }, { label: '완전 휴식', color: '#B2BEC3', min: 20 }], breakMin: 0 },
    { id: 'sh3', icon: 'snow-outline', name: '하드 스타트', color: '#6C5CE7',
      desc: '어려운 것 먼저! 뇌가 백그라운드에서 풀어줌',
      source: 'MIT · Barbara Oakley "A Mind for Numbers"',
      items: [{ label: '어려운 과목', color: '#E8575A', min: 25 }, { label: '쉬운 과목', color: '#5CB85C', min: 25 }, { label: '어려운 과목', color: '#E8575A', min: 25 }], breakMin: 5 },
  ],
};

// ═══ 🎯 수능 과목 ═══
const SUNEUNG_SUBJECTS = [
  { name: '국어', min: 80, color: '#E8575A', order: 1 },
  { name: '수학', min: 100, color: '#4A90D9', order: 2 },
  { name: '영어', min: 70, color: '#5CB85C', order: 3 },
  { name: '한국사', min: 30, color: '#E17055', order: 4 },
  { name: '탐구 1', min: 30, color: '#F5A623', order: 5 },
  { name: '탐구 2', min: 30, color: '#9B6FC3', order: 6 },
  { name: '제2외국어', min: 40, color: '#00B894', order: 7 },
];

const SCHOOL_LABELS = {
  elementary_lower: '초등 저', elementary_upper: '초등 고',
  middle: '중등', high: '고등',
  nsuneung: 'N수생', university: '대학생', exam_prep: '공시생',
};
const ELEM_GRADE_KEY = (school) => school;

export default function SubjectsScreen({ navigation }) {
  const { width: winW } = useWindowDimensions();
  const tabletMaxW = isTablet ? Math.round(winW * 0.83) : winW;
  const app = useApp();
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale, app.settings.stylePreset);
  const school = app.settings.schoolLevel || 'high';
  const isHigh = school === 'high' || school === 'nsuneung';
  const [tab, setTab] = useState('subjects');
  const [editMode, setEditMode] = useState(false);
  const changeTab = (t) => { setTab(t); setEditMode(false); };
  useFocusEffect(useCallback(() => { setTab('subjects'); setEditMode(false); }, []));
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addColor, setAddColor] = useState(SUBJECT_COLORS[0]);
  const [addChar, setAddChar] = useState('toru');
  // 수능 선택
  const [suneungSelected, setSuneungSelected] = useState([]);
  const toggleSuneung = (name) => setSuneungSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);

  const key = ELEM_GRADE_KEY(school);
  const routines = ROUTINES[key] || ROUTINES.high;
  const methods = STUDY_METHODS[key] || STUDY_METHODS.high;
  const sorted = [...app.subjects].sort((a, b) => {
    if (!!b.isFavorite !== !!a.isFavorite) return b.isFavorite ? 1 : -1;
    return (b.totalElapsedSec || 0) - (a.totalElapsedSec || 0);
  });
  const toggleFavorite = (subj) => app.updateSubject(subj.id, { isFavorite: !subj.isFavorite });

  // 탭 목록: 고등만 수능 포함
  const tabs = isHigh
    ? [{ id: 'subjects', icon: 'list-outline', label: '내 과목' }, { id: 'method', icon: 'bulb-outline', label: '학습법' }, { id: 'routine', icon: 'clipboard-outline', label: '추천 루틴' }, { id: 'suneung', icon: 'flag-outline', label: '수능' }]
    : [{ id: 'subjects', icon: 'list-outline', label: '내 과목' }, { id: 'method', icon: 'bulb-outline', label: '학습법' }, { id: 'routine', icon: 'clipboard-outline', label: '추천 루틴' }];

  const startRoutine = (routine) => {
    const items = routine.items.map(it => ({ label: it.label, color: it.color, totalSec: it.min * 60, type: 'countdown' }));
    const ok = app.startSequence({ items, breakSec: routine.breakMin * 60, seqName: routine.name, seqIcon: routine.icon, seqColor: routine.color || items[0]?.color || '#4A90D9' });
    if (ok) navigation.navigate('Focus');
  };

  const startMethod = (method) => {
    const items = method.items.map(it => ({ label: it.label, color: it.color, totalSec: it.min * 60, type: 'countdown' }));
    const ok = app.startSequence({ items, breakSec: method.breakMin * 60, seqName: method.name, seqIcon: method.icon, seqColor: method.color });
    if (ok) navigation.navigate('Focus');
  };

  const defMin = school === 'elementary_lower' ? 20 : school === 'elementary_upper' ? 25 : school === 'middle' ? 50 : 60;

  const startSingle = (subj) => {
    navigation.navigate('Focus');
    setTimeout(() => app.addTimer({ type: 'countdown', label: subj.name, color: subj.color, totalSec: defMin * 60, subjectId: subj.id }), 350);
  };
  const startCountup = (subj) => {
    navigation.navigate('Focus');
    setTimeout(() => app.addTimer({ type: 'free', label: subj.name, color: subj.color, subjectId: subj.id }), 350);
  };
  const deleteSubject = (subj) => {
    Alert.alert('과목 삭제', `'${subj.name}'을(를) 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => app.removeSubject(subj.id) },
    ]);
  };

  const startSuneungSingle = (subj) => {
    app.addTimer({ type: 'countdown', label: `수능 ${subj.name}`, color: subj.color, totalSec: subj.min * 60 });
  };

  const startSuneungSequence = () => {
    if (suneungSelected.length === 0) { app.showToastCustom('과목을 선택하세요!', 'paengi'); return; }
    const ordered = suneungSelected.map(name => SUNEUNG_SUBJECTS.find(s => s.name === name)).filter(Boolean).sort((a, b) => a.order - b.order);
    const items = ordered.map(s => ({ label: `수능 ${s.name}`, color: s.color, totalSec: s.min * 60, type: 'countdown' }));
    const ok = app.startSequence({ items, breakSec: 20 * 60, seqName: '수능 시뮬레이션', seqIcon: 'flag-outline', seqColor: '#E8575A' });
    if (ok) setSuneungSelected([]);
  };


  const handleAdd = () => {
    if (!addName.trim()) return;
    app.addSubject({ name: addName.trim(), color: addColor, character: addChar });
    setAddName(''); setShowAdd(false);
  };

  return (
    <View style={[S.container, { backgroundColor: T.bg }]}>
      <RunningTimersBar />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[S.scroll, isTablet && { maxWidth: tabletMaxW, alignSelf: 'center', width: '100%' }]}>

        {/* 헤더 */}
        <View style={S.header}>
          <View style={[S.schoolBadge, { backgroundColor: T.accent + '15' }]}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: T.accent }}>{SCHOOL_LABELS[school] || '고등'}</Text>
          </View>
        </View>

        {/* 초등: 학년 정보 */}
        {(school === 'elementary_lower' || school === 'elementary_upper') && (
          <View style={[S.gradeRow, { backgroundColor: T.surface2 }]}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: T.sub, paddingHorizontal: 10 }}>
              {school === 'elementary_lower' ? '1~3학년' : '4~6학년'} · 학년 변경은 설정에서
            </Text>
          </View>
        )}

        {/* 탭 (3개 or 4개) */}
        <View style={[S.tabRow, { backgroundColor: T.surface2 }]}>
          {tabs.map(t => (
            <TouchableOpacity key={t.id} style={[S.tabBtn, tab === t.id && { backgroundColor: T.card, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4 }]}
              onPress={() => changeTab(t.id)}>
              <Ionicons name={t.icon} size={isHigh ? 14 : 16} color={tab === t.id ? T.text : T.sub} style={{ marginBottom: 1 }} />
              <Text style={{ fontSize: isHigh ? 9 : 11, fontWeight: tab === t.id ? '900' : '600', color: tab === t.id ? T.text : T.sub }}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>


        {/* ═══ 탭: 추천 루틴 ═══ */}
        {tab === 'routine' && (
          <>
            {routines.map(routine => {
              const totalMin = routine.items.reduce((s, it) => s + it.min, 0) + (routine.items.length - 1) * routine.breakMin;
              return (
                <View key={routine.id} style={[S.routineCard, { backgroundColor: T.card, borderColor: T.border }]}>
                  <View style={S.routineTop}>
                    <Ionicons name={routine.icon} size={28} color={routine.color} />
                    <View style={{ flex: 1 }}>
                      <Text style={[S.routineName, { color: T.text }]}>{routine.name}</Text>
                    </View>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 11, borderRadius: 10, backgroundColor: T.surface2, borderWidth: 1, borderColor: routine.color + '60' }}
                      onPress={() => startRoutine(routine)}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                      <Ionicons name="alarm-outline" size={13} color={routine.color} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: routine.color }}>{totalMin}분</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={S.methodFlow}>
                    {routine.items.map((it, i) => (
                      <React.Fragment key={i}>
                        <View style={[S.methodChip, { backgroundColor: it.color + '18' }]}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: it.color }}>{it.label} {it.min}분</Text>
                        </View>
                        {i < routine.items.length - 1 && <Text style={{ fontSize: 11, color: T.sub }}>→</Text>}
                      </React.Fragment>
                    ))}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ═══ 탭: 🧠 학습법 ═══ */}
        {tab === 'method' && (
          <>
            <Text style={[S.secLabel, { color: T.sub }]}>과학적으로 검증된 학습법</Text>
            {methods.map(method => {
              const totalMin = method.items.reduce((s, it) => s + it.min, 0) + (method.items.length - 1) * method.breakMin;
              return (
                <View key={method.id} style={[S.methodCard, { backgroundColor: T.card, borderColor: T.border }]}>
                  <View style={S.methodTop}>
                    <View style={[S.methodIconWrap, { backgroundColor: method.color + '15' }]}>
                      <Ionicons name={method.icon} size={24} color={method.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: T.text, marginBottom: 2 }}>{method.name}</Text>
                      <Text style={{ fontSize: 13, color: T.sub, lineHeight: 18 }}>{method.desc}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
                        <Ionicons name="link-outline" size={10} color={T.sub} />
                        <Text style={{ fontSize: 11, color: T.sub }}>{method.source}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 11, borderRadius: 10, backgroundColor: T.surface2, borderWidth: 1, borderColor: method.color + '60', alignSelf: 'flex-start' }}
                      onPress={() => startMethod(method)}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                      <Ionicons name="alarm-outline" size={13} color={method.color} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: method.color }}>{totalMin}분</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={S.methodFlow}>
                    {method.items.map((it, i) => (
                      <React.Fragment key={i}>
                        <View style={[S.methodChip, { backgroundColor: T.surface2 }]}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: T.text }}>{it.label} {it.min}분</Text>
                        </View>
                        {i < method.items.length - 1 && <Text style={{ fontSize: 11, color: T.sub }}>→</Text>}
                      </React.Fragment>
                    ))}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ═══ 탭: 🎯 수능 (고등만) ═══ */}
        {tab === 'suneung' && isHigh && (
          <>
            <Text style={[S.secLabel, { color: T.sub }]}>실제 수능 시험시간 · 개별 또는 순차 시작</Text>
            {SUNEUNG_SUBJECTS.map(subj => {
              const sel = suneungSelected.includes(subj.name);
              return (
                <View key={subj.name} style={[S.suneungCard, { backgroundColor: T.card, borderColor: sel ? T.accent : T.border }]}>
                  <TouchableOpacity style={S.suneungSelect} onPress={() => toggleSuneung(subj.name)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }}>
                    <View style={[S.selectDot, { borderColor: sel ? T.accent : T.border, backgroundColor: sel ? T.accent : 'transparent' }]}>
                      {sel && <Text style={{ color: 'white', fontSize: 12, fontWeight: '800' }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                  <View style={[S.colorBar, { backgroundColor: subj.color }]} />
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: T.text }}>{subj.name}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: T.accent, minWidth: 44, textAlign: 'center' }}>{subj.min}분</Text>
                  <TouchableOpacity style={[S.playBtnSm, { backgroundColor: subj.color }]}
                    onPress={() => startSuneungSingle(subj)}>
                    <Ionicons name="caret-forward" size={13} color="white" />
                  </TouchableOpacity>
                </View>
              );
            })}

            {/* 순차 시작 바 */}
            {suneungSelected.length > 0 && (
              <View style={[S.seqBar, { backgroundColor: T.card, borderColor: T.accent }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <Ionicons name="flag-outline" size={16} color={T.accent} />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>{suneungSelected.length}과목 선택</Text>
                </View>
                <Text style={{ fontSize: 11, color: T.sub, marginBottom: 8 }}>
                  수능 순서: {suneungSelected.map(n => SUNEUNG_SUBJECTS.find(s => s.name === n)).filter(Boolean).sort((a, b) => a.order - b.order).map(s => s.name).join(' → ')}
                </Text>
                <TouchableOpacity style={[S.seqStartBtn, { backgroundColor: T.accent }]} onPress={startSuneungSequence}>
                  <Text style={{ color: 'white', fontSize: 14, fontWeight: '800' }}>▶ 수능 시뮬레이션 시작</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* ═══ 탭: 내 과목 ═══ */}
        {tab === 'subjects' && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[S.secLabel, { color: T.sub, marginBottom: 0 }]}>
                {editMode ? '삭제할 과목을 선택하세요' : '과목별 타이머 바로 시작'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {sorted.length > 0 && (
                  <TouchableOpacity
                    style={[S.addBtn, editMode
                      ? { backgroundColor: T.accent + '18', borderWidth: 1, borderColor: T.accent }
                      : { backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border }]}
                    onPress={() => setEditMode(e => !e)}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: editMode ? T.accent : T.sub }}>
                      {editMode ? '완료' : '편집'}
                    </Text>
                  </TouchableOpacity>
                )}
                {!editMode && (
                  <TouchableOpacity style={[S.addBtn, { backgroundColor: T.accent }]} onPress={() => setShowAdd(true)}>
                    <Text style={{ color: 'white', fontSize: 13, fontWeight: '800' }}>+ 추가</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {sorted.length === 0 && (
              <View style={[S.emptyCard, { backgroundColor: T.card, borderColor: T.border }]}>
                <CharacterAvatar characterId="paengi" size={40} mood="sad" />
                <Text style={{ fontSize: 14, color: T.sub, marginTop: 6 }}>과목을 추가해보세요!</Text>
              </View>
            )}

            {sorted.map(subj => {
              const running = app.timers.some(t => t.subjectId === subj.id && t.status === 'running');
              const todaySec = app.todaySessions.filter(s => s.subjectId === subj.id).reduce((a, s) => a + (s.durationSec || 0), 0);
              return (
                <TouchableOpacity key={subj.id}
                  style={[S.subjCard, { backgroundColor: T.card, borderColor: editMode ? T.border : (running ? subj.color : T.border), borderWidth: running && !editMode ? 1.5 : 1 }]}
                  onPress={() => !editMode && startSingle(subj)}
                  activeOpacity={editMode ? 1 : 0.7}
                  disabled={editMode}>
                  <View style={[S.subjDot, { backgroundColor: subj.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>{subj.name}</Text>
                    <Text style={{ fontSize: 11, color: T.sub }}>
                      누적 {formatShort(subj.totalElapsedSec || 0)}{todaySec > 0 ? ` · 오늘 ${formatShort(todaySec)}` : ''}
                    </Text>
                  </View>
                  {editMode ? (
                    <TouchableOpacity
                      style={[S.delBtn]}
                      onPress={() => deleteSubject(subj)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ color: 'white', fontSize: 16, fontWeight: '900' }}>−</Text>
                    </TouchableOpacity>
                  ) : running ? (
                    <View style={[S.runBadge, { backgroundColor: subj.color + '18' }]}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: subj.color }}>실행중</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <TouchableOpacity onPress={() => toggleFavorite(subj)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={{ fontSize: 16 }}>{subj.isFavorite ? '⭐' : '☆'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[S.labelBtn, { backgroundColor: T.surface2, borderWidth: 1, borderColor: subj.color + '60' }]}
                        onPress={() => startCountup(subj)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Ionicons name="trending-up-outline" size={11} color={subj.color} />
                          <Text style={{ fontSize: 12, fontWeight: '800', color: subj.color, lineHeight: 18 }}>자유</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity style={[S.labelBtn, { backgroundColor: T.surface2, borderWidth: 1, borderColor: subj.color + '60' }]} onPress={() => startSingle(subj)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Ionicons name="timer-outline" size={11} color={subj.color} />
                          <Text style={{ color: subj.color, fontSize: 12, fontWeight: '800', lineHeight: 18 }}>{defMin}분</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            {/* 빠른 추가 */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub, marginTop: 12, marginBottom: 6 }}>빠른 추가</Text>
            <View style={S.presetWrap}>
              {SUBJECT_PRESETS.map(p => {
                const exists = app.subjects.some(s => s.name === p.name);
                return (
                  <TouchableOpacity key={p.name} style={[S.presetChip, { borderColor: T.border, backgroundColor: exists ? T.surface2 : T.card }]}
                    onPress={() => !exists && app.addSubject({ name: p.name, color: p.color, character: p.character || 'toru' })} disabled={exists}>
                    <View style={[S.prDot, { backgroundColor: p.color }]} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: exists ? T.sub : T.text }}>{p.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* 과목 추가 모달 */}
      <Modal visible={showAdd} transparent animationType="fade">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={S.mo}><View style={[S.modal, { backgroundColor: T.card, borderColor: T.border }, isTablet && { width: 540, alignSelf: 'center' }]}>
          <Text style={[S.modalTitle, { color: T.text }]}>과목 추가</Text>
          <TextInput value={addName} onChangeText={setAddName} placeholder="과목 이름" placeholderTextColor={T.sub} maxLength={10}
            style={[S.mInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text }]} autoFocus />
          <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub, marginBottom: 5 }}>색상</Text>
          <View style={S.colorRow}>{SUBJECT_COLORS.map(c => (
            <TouchableOpacity key={c} style={[S.colorBtn, { backgroundColor: c }, addColor === c && S.colorActive]} onPress={() => setAddColor(c)} />
          ))}</View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub, marginBottom: 5 }}>캐릭터</Text>
          <View style={S.charRow}>{CHARACTER_LIST.map(cId => (
            <TouchableOpacity key={cId} style={[S.charBtn, { borderColor: addChar === cId ? T.accent : T.border }]} onPress={() => setAddChar(cId)}>
              <CharacterAvatar characterId={cId} size={28} />
              <Text style={{ fontSize: 11, fontWeight: '700', marginTop: 2, color: addChar === cId ? T.accent : T.sub }}>{CHARACTERS[cId].name}</Text>
            </TouchableOpacity>
          ))}</View>
          <View style={S.mBtns}>
            <TouchableOpacity style={[S.mCancel, { borderColor: T.border }]} onPress={() => { setShowAdd(false); setAddName(''); }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: T.sub }}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={[S.mConfirm, { backgroundColor: T.accent }]} onPress={handleAdd}>
              <Text style={{ color: 'white', fontSize: 14, fontWeight: '800' }}>추가</Text></TouchableOpacity>
          </View>
        </View></View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  headerTitle: { fontSize: 20, fontWeight: '900' },
  schoolBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  gradeRow: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3, marginBottom: 8 },
  gradeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },

  tabRow: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3, marginBottom: 12 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },

  queueBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  secLabel: { fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 2 },

  // 루틴
  routineCard: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 8 },
  routineTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routineName: { fontSize: 15, fontWeight: '900', marginBottom: 3 },
  routineFlow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  timeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },

  // 학습법
  methodCard: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 10 },
  methodTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  methodIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sourceBadge: { marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  methodFlow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  methodChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },

  // 수능
  suneungCard: { borderRadius: 10, padding: 10, borderWidth: 1.5, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  suneungSelect: { padding: 2 },
  selectDot: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  colorBar: { width: 4, height: 30, borderRadius: 2 },
  playBtnSm: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  seqBar: { borderRadius: 14, padding: 14, borderWidth: 1.5, marginTop: 10 },
  seqStartBtn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center' },

  // 내 과목
  subjCard: { borderRadius: 10, padding: 12, borderWidth: 1, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  subjDot: { width: 4, height: 30, borderRadius: 2 },
  runBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  labelBtn: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8, borderRadius: 7, alignItems: 'center' },
  addBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  delBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#FF4757', alignItems: 'center', justifyContent: 'center' },
  emptyCard: { borderRadius: 14, padding: 24, borderWidth: 1, alignItems: 'center', marginBottom: 10 },
  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  presetChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 7, borderWidth: 1 },
  prDot: { width: 7, height: 7, borderRadius: 4 },

  mo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 30 },
  modal: { borderRadius: 20, padding: 18, borderWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 14 },
  mInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 12 },
  colorRow: { flexDirection: 'row', gap: 7, marginBottom: 10 },
  colorBtn: { width: 24, height: 24, borderRadius: 12 },
  colorActive: { borderWidth: 3, borderColor: 'white', elevation: 4 },
  charRow: { flexDirection: 'row', gap: 5, marginBottom: 14 },
  charBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, borderWidth: 1.5 },
  mBtns: { flexDirection: 'row', gap: 8 },
  mCancel: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  mConfirm: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
});