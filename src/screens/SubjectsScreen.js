// src/screens/SubjectsScreen.js
// v23: 학습법 탭 + 고등 수능 탭
import React, { useState, useCallback, useMemo } from 'react';
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

// 실제 수능 시간표 (2025학년도 기준)
// 교시 · 시작 · 종료 · 쉬는시간(다음 교시까지)
const SUNEUNG_TIMETABLE = [
  { order: 1, period: '1교시', name: '국어',      min: 80,  start: '08:40', end: '10:00', breakMin: 30, color: '#E8575A' },
  { order: 2, period: '2교시', name: '수학',      min: 100, start: '10:30', end: '12:10', breakMin: 60, color: '#4A90D9' },  // 점심 포함
  { order: 3, period: '3교시', name: '영어',      min: 70,  start: '13:10', end: '14:20', breakMin: 30, color: '#5CB85C' },
  { order: 4, period: '4교시', name: '한국사',    min: 30,  start: '14:50', end: '15:20', breakMin: 15, color: '#E17055' },
  { order: 5, period: '4교시', name: '탐구 1',    min: 30,  start: '15:35', end: '16:05', breakMin: 2,  color: '#F5A623' },
  { order: 6, period: '4교시', name: '탐구 2',    min: 30,  start: '16:07', end: '16:37', breakMin: 28, color: '#9B6FC3' },
  { order: 7, period: '5교시', name: '제2외국어', min: 40,  start: '17:05', end: '17:45', breakMin: 0,  color: '#00B894' },
];

const SCHOOL_LABELS = {
  elementary_lower: '초등 저', elementary_upper: '초등 고',
  middle: '중등', high: '고등',
  nsuneung: 'N수생', university: '대학생', exam_prep: '공시생',
};
const ELEM_GRADE_KEY = (school) => school;

export default function SubjectsScreen({ navigation }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const tabletMaxW = isTablet ? Math.round(winW * 0.83) : winW;
  const isLandscape = isTablet && winW > winH;
  const app = useApp();
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale, app.settings.stylePreset);
  const fs = T.fontScale * (isTablet ? 1.1 : 1.0);
  const S = useMemo(() => createStyles(fs), [fs]);
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
  const [suneungMode, setSuneungMode] = useState('timetable'); // 'timetable' | 'free'

  // 주간 목표 설정 모달
  const [goalSubj, setGoalSubj] = useState(null); // 목표 설정 대상 과목
  const [goalInput, setGoalInput] = useState('');

  const key = ELEM_GRADE_KEY(school);
  const routines = ROUTINES[key] || ROUTINES.high;
  const methods = STUDY_METHODS[key] || STUDY_METHODS.high;
  const sorted = [...app.subjects].sort((a, b) => {
    if (!!b.isFavorite !== !!a.isFavorite) return b.isFavorite ? 1 : -1;
    return (b.totalElapsedSec || 0) - (a.totalElapsedSec || 0);
  });
  const toggleFavorite = (subj) => app.updateSubject(subj.id, { isFavorite: !subj.isFavorite });

  // 이번 주 과목별 공부 시간 계산
  const weekSubjSec = useMemo(() => {
    const now = new Date();
    const day = now.getDay(); // 0=일
    const mon = new Date(now);
    mon.setDate(mon.getDate() - ((day + 6) % 7)); // 이번 주 월요일
    const monStr = mon.toISOString().slice(0, 10);
    const map = {};
    (app.sessions || []).forEach(s => {
      if (s.date >= monStr && s.subjectId) {
        map[s.subjectId] = (map[s.subjectId] || 0) + (s.durationSec || 0);
      }
    });
    return map;
  }, [app.sessions]);

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

  const hasActiveTimer = () => app.timers.some(t => t.type !== 'lap' && (t.status === 'running' || t.status === 'paused'));
  const startSingle = (subj) => {
    if (hasActiveTimer()) { app.showToastCustom('실행 중인 타이머가 있어요!', 'paengi'); return; }
    app.addTimer({ type: 'countdown', label: subj.name, color: subj.color, totalSec: defMin * 60, subjectId: subj.id });
    navigation.navigate('Focus');
  };
  const startCountup = (subj) => {
    if (hasActiveTimer()) { app.showToastCustom('실행 중인 타이머가 있어요!', 'paengi'); return; }
    app.addTimer({ type: 'free', label: subj.name, color: subj.color, subjectId: subj.id });
    navigation.navigate('Focus');
  };
  const deleteSubject = (subj) => {
    Alert.alert('과목 삭제', `'${subj.name}'을(를) 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => app.removeSubject(subj.id) },
    ]);
  };

  const startSuneungSingle = (subj) => {
    if (hasActiveTimer()) { app.showToastCustom('실행 중인 타이머가 있어요!', 'paengi'); return; }
    app.addTimer({ type: 'countdown', label: `수능 ${subj.name}`, color: subj.color, totalSec: subj.min * 60 });
    navigation.navigate('Focus');
  };

  const startSuneungSequence = () => {
    if (suneungSelected.length === 0) { app.showToastCustom('과목을 선택하세요!', 'paengi'); return; }
    const ordered = suneungSelected.map(name => SUNEUNG_SUBJECTS.find(s => s.name === name)).filter(Boolean).sort((a, b) => a.order - b.order);

    if (suneungMode === 'timetable') {
      // 실제 시간표 모드: 교시별 실제 쉬는시간을 break 아이템으로 삽입
      const items = [];
      ordered.forEach((s, i) => {
        const tt = SUNEUNG_TIMETABLE.find(t => t.name === s.name);
        items.push({ label: `${tt?.period || ''} ${s.name}`, color: s.color, totalSec: s.min * 60, type: 'countdown' });
        // 마지막이 아니면 쉬는시간 삽입
        if (i < ordered.length - 1 && tt && tt.breakMin > 0) {
          const nextSubj = ordered[i + 1];
          const nextTt = SUNEUNG_TIMETABLE.find(t => t.name === nextSubj.name);
          // 현재 과목 종료 ~ 다음 과목 시작 사이 실제 쉬는시간 계산
          let actualBreak = tt.breakMin;
          if (tt && nextTt) {
            const [eh, em] = tt.end.split(':').map(Number);
            const [sh, sm] = nextTt.start.split(':').map(Number);
            actualBreak = (sh * 60 + sm) - (eh * 60 + em);
          }
          if (actualBreak > 0) {
            const breakLabel = actualBreak >= 40 ? '점심시간' : '쉬는시간';
            items.push({ label: breakLabel, color: '#27AE60', totalSec: actualBreak * 60, type: 'countdown', isBreak: true });
          }
        }
      });
      const ok = app.startSequence({ items, breakSec: 0, seqName: '수능 시뮬레이션 (실제 시간표)', seqIcon: 'flag-outline', seqColor: '#E8575A' });
      if (ok) { navigation.navigate('Focus'); setSuneungSelected([]); }
    } else {
      // 자유 모드: 기존 로직 (고정 20분 쉬는시간)
      const items = ordered.map(s => ({ label: `수능 ${s.name}`, color: s.color, totalSec: s.min * 60, type: 'countdown' }));
      const ok = app.startSequence({ items, breakSec: 20 * 60, seqName: '수능 시뮬레이션', seqIcon: 'flag-outline', seqColor: '#E8575A' });
      if (ok) { navigation.navigate('Focus'); setSuneungSelected([]); }
    }
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
          <View style={isLandscape ? { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } : {}}>
            {routines.map(routine => {
              const totalMin = routine.items.reduce((s, it) => s + it.min, 0) + (routine.items.length - 1) * routine.breakMin;
              return (
                <View key={routine.id} style={[S.routineCard, { backgroundColor: T.card, borderColor: T.border }, isLandscape && { flex: 1, minWidth: '45%' }]}>
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
          </View>
        )}

        {/* ═══ 탭: 학습법 ═══ */}
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
            {/* 모드 토글 */}
            <View style={{ flexDirection: 'row', marginBottom: 10, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: T.border }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 9, alignItems: 'center', backgroundColor: suneungMode === 'timetable' ? T.accent : T.surface2 }}
                onPress={() => { setSuneungMode('timetable'); setSuneungSelected([]); }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="time-outline" size={14} color={suneungMode === 'timetable' ? 'white' : T.sub} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: suneungMode === 'timetable' ? 'white' : T.sub }}>실제 시간표</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 9, alignItems: 'center', backgroundColor: suneungMode === 'free' ? T.accent : T.surface2 }}
                onPress={() => { setSuneungMode('free'); setSuneungSelected([]); }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="shuffle-outline" size={14} color={suneungMode === 'free' ? 'white' : T.sub} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: suneungMode === 'free' ? 'white' : T.sub }}>자유 선택</Text>
                </View>
              </TouchableOpacity>
            </View>

            {suneungMode === 'timetable' ? (
              <>
                {/* 실제 시간표 타임라인 */}
                <Text style={[S.secLabel, { color: T.sub }]}>2025학년도 수능 시간표 · 실제 쉬는시간 반영</Text>
                {SUNEUNG_TIMETABLE.map((tt, i) => {
                  const sel = suneungSelected.includes(tt.name);
                  const prevTt = i > 0 ? SUNEUNG_TIMETABLE[i - 1] : null;
                  // 이전 과목과의 쉬는시간 표시
                  let breakBefore = 0;
                  if (prevTt) {
                    const [eh, em] = prevTt.end.split(':').map(Number);
                    const [sh, sm] = tt.start.split(':').map(Number);
                    breakBefore = (sh * 60 + sm) - (eh * 60 + em);
                  }
                  const showBreak = breakBefore > 0 && (i === 0 || suneungSelected.includes(prevTt?.name) || sel);
                  return (
                    <React.Fragment key={tt.order}>
                      {/* 쉬는시간 표시 */}
                      {showBreak && i > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 4, gap: 8 }}>
                          <View style={{ width: 1, height: 20, backgroundColor: T.border, marginLeft: 18 }} />
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: T.surface2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Ionicons name={breakBefore >= 40 ? 'restaurant-outline' : 'cafe-outline'} size={11} color={T.sub} />
                            <Text style={{ fontSize: 11, color: T.sub, fontWeight: '600' }}>
                              {breakBefore >= 40 ? '점심' : '쉬는시간'} {breakBefore}분
                            </Text>
                          </View>
                        </View>
                      )}
                      {/* 과목 카드 */}
                      <TouchableOpacity
                        style={[S.suneungCard, { backgroundColor: T.card, borderColor: sel ? T.accent : T.border }]}
                        onPress={() => toggleSuneung(tt.name)} activeOpacity={0.7}>
                        <View style={[S.selectDot, { borderColor: sel ? T.accent : T.border, backgroundColor: sel ? T.accent : 'transparent' }]}>
                          {sel && <Text style={{ color: 'white', fontSize: 12, fontWeight: '800' }}>✓</Text>}
                        </View>
                        <View style={[S.colorBar, { backgroundColor: tt.color }]} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }}>{tt.name}</Text>
                            <View style={{ backgroundColor: tt.color + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: tt.color }}>{tt.period}</Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{tt.start} ~ {tt.end}</Text>
                        </View>
                        <Text style={{ fontSize: 15, fontWeight: '900', color: T.accent, minWidth: 44, textAlign: 'center' }}>{tt.min}분</Text>
                        <TouchableOpacity style={[S.playBtnSm, { backgroundColor: tt.color }]}
                          onPress={() => startSuneungSingle({ name: tt.name, min: tt.min, color: tt.color })}>
                          <Ionicons name="caret-forward" size={13} color="white" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}

                {/* 전체 선택 / 해제 */}
                <TouchableOpacity
                  style={{ alignSelf: 'center', marginTop: 6, marginBottom: 2, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: T.surface2 }}
                  onPress={() => {
                    const allNames = SUNEUNG_TIMETABLE.map(t => t.name);
                    setSuneungSelected(prev => prev.length === allNames.length ? [] : allNames);
                  }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: T.accent }}>
                    {suneungSelected.length === SUNEUNG_TIMETABLE.length ? '전체 해제' : '전체 선택'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* 자유 선택 모드 (기존) */}
                <Text style={[S.secLabel, { color: T.sub }]}>과목별 시험시간 · 개별 또는 순차 시작</Text>
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
              </>
            )}

            {/* 순차 시작 바 */}
            {suneungSelected.length > 0 && (
              <View style={[S.seqBar, { backgroundColor: T.card, borderColor: T.accent }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="flag-outline" size={16} color={T.accent} />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>{suneungSelected.length}과목 선택</Text>
                  </View>
                  {suneungMode === 'timetable' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: T.accent + '14', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                      <Ionicons name="time-outline" size={11} color={T.accent} />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: T.accent }}>실제 시간표</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 11, color: T.sub, marginBottom: 4 }}>
                  {suneungSelected.map(n => (SUNEUNG_TIMETABLE.find(s => s.name === n) || SUNEUNG_SUBJECTS.find(s => s.name === n))).filter(Boolean).sort((a, b) => a.order - b.order).map(s => s.name).join(' → ')}
                </Text>
                {suneungMode === 'timetable' && (() => {
                  // 선택된 과목의 총 시간 + 쉬는시간 계산
                  const orderedSel = suneungSelected.map(n => SUNEUNG_TIMETABLE.find(t => t.name === n)).filter(Boolean).sort((a, b) => a.order - b.order);
                  const studyMin = orderedSel.reduce((s, t) => s + t.min, 0);
                  let breakMin = 0;
                  for (let i = 0; i < orderedSel.length - 1; i++) {
                    const [eh, em] = orderedSel[i].end.split(':').map(Number);
                    const [sh, sm] = orderedSel[i + 1].start.split(':').map(Number);
                    breakMin += (sh * 60 + sm) - (eh * 60 + em);
                  }
                  const totalMin = studyMin + breakMin;
                  const h = Math.floor(totalMin / 60);
                  const m = totalMin % 60;
                  return (
                    <Text style={{ fontSize: 11, color: T.sub, marginBottom: 6 }}>
                      공부 {Math.floor(studyMin / 60)}시간{studyMin % 60 > 0 ? ` ${studyMin % 60}분` : ''} + 쉬는시간 {breakMin}분 = 총 {h}시간{m > 0 ? ` ${m}분` : ''}
                    </Text>
                  );
                })()}
                <TouchableOpacity style={[S.seqStartBtn, { backgroundColor: T.accent }]} onPress={startSuneungSequence}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="caret-forward" size={15} color="white" />
                    <Text style={{ color: 'white', fontSize: 14, fontWeight: '800' }}>수능 시뮬레이션 시작</Text>
                  </View>
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

            {/* 주간 목표 가이드 — 과목이 있고, 아직 안 본 사용자에게만 */}
            {sorted.length > 0 && !app.settings.subjectGoalGuideShown && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => app.updateSettings({ subjectGoalGuideShown: true })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.accent + '12', borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: T.accent + '30' }}>
                <Ionicons name="bulb-outline" size={16} color={T.accent} />
                <Text style={{ flex: 1, fontSize: 12, color: T.text, lineHeight: 17 }}>
                  <Text style={{ fontWeight: '800' }}>과목을 길게 누르면</Text> 주간 목표를 설정할 수 있어요!
                </Text>
                <Ionicons name="close" size={14} color={T.sub} />
              </TouchableOpacity>
            )}

            {sorted.map(subj => {
              const running = app.timers.some(t => t.subjectId === subj.id && t.status === 'running');
              const todaySec = app.todaySessions.filter(s => s.subjectId === subj.id).reduce((a, s) => a + (s.durationSec || 0), 0);
              const wSec = weekSubjSec[subj.id] || 0;
              const wGoal = subj.weeklyGoalMin ? subj.weeklyGoalMin * 60 : 0;
              const wPct = wGoal > 0 ? Math.min(100, Math.round(wSec / wGoal * 100)) : 0;
              return (
                <TouchableOpacity key={subj.id}
                  style={[S.subjCard, { backgroundColor: T.card, borderColor: editMode ? T.border : (running ? subj.color : T.border), borderWidth: running && !editMode ? 1.5 : 1 }]}
                  onLongPress={() => { if (!editMode) { setGoalSubj(subj); setGoalInput(subj.weeklyGoalMin ? String(subj.weeklyGoalMin / 60) : ''); } }}
                  activeOpacity={1}
                  disabled={editMode}>
                  <View style={[S.subjDot, { backgroundColor: subj.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>{subj.name}</Text>
                    <Text style={{ fontSize: 11, color: T.sub }}>
                      누적 {formatShort(subj.totalElapsedSec || 0)}{todaySec > 0 ? ` · 오늘 ${formatShort(todaySec)}` : ''}
                    </Text>
                    {wGoal > 0 && (
                      <View style={{ marginTop: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: wPct >= 100 ? T.green : T.sub }}>
                            주간 {formatShort(wSec)} / {subj.weeklyGoalMin >= 60 ? `${subj.weeklyGoalMin / 60}시간` : `${subj.weeklyGoalMin}분`}
                          </Text>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: wPct >= 100 ? T.green : subj.color }}>{wPct}%</Text>
                        </View>
                        <View style={{ height: 4, borderRadius: 2, backgroundColor: T.border, overflow: 'hidden' }}>
                          <View style={{ height: 4, borderRadius: 2, width: `${wPct}%`, backgroundColor: wPct >= 100 ? T.green : subj.color }} />
                        </View>
                      </View>
                    )}
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

      {/* 주간 목표 설정 모달 */}
      <Modal visible={!!goalSubj} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 30 }}>
          <View style={{ backgroundColor: T.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: T.border }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: T.text, textAlign: 'center', marginBottom: 4 }}>
              주간 목표 설정
            </Text>
            {goalSubj && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 14 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: goalSubj.color }} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }}>{goalSubj.name}</Text>
              </View>
            )}
            <Text style={{ fontSize: 12, color: T.sub, marginBottom: 8 }}>이번 주 목표 시간 (시간 단위)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {[1, 2, 3, 5, 7, 10].map(h => (
                <TouchableOpacity key={h}
                  onPress={() => setGoalInput(String(h))}
                  style={{ flex: 1, minWidth: 48, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5,
                    borderColor: goalInput === String(h) ? (goalSubj?.color || T.accent) : T.border,
                    backgroundColor: goalInput === String(h) ? (goalSubj?.color || T.accent) + '15' : T.surface2,
                    alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: goalInput === String(h) ? (goalSubj?.color || T.accent) : T.text }}>{h}시간</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={{ borderWidth: 1, borderColor: T.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: T.text, backgroundColor: T.surface2, textAlign: 'center', marginBottom: 12 }}
              value={goalInput}
              onChangeText={setGoalInput}
              placeholder="직접 입력 (시간)"
              placeholderTextColor={T.sub}
              keyboardType="numeric"
              maxLength={4}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {goalSubj?.weeklyGoalMin ? (
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: T.red, alignItems: 'center' }}
                  onPress={() => { app.updateSubject(goalSubj.id, { weeklyGoalMin: null }); setGoalSubj(null); }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: T.red }}>목표 해제</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: T.border, alignItems: 'center' }}
                  onPress={() => setGoalSubj(null)}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: T.sub }}>취소</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: goalSubj?.color || T.accent, alignItems: 'center' }}
                onPress={() => {
                  const h = parseFloat(goalInput);
                  if (!h || h <= 0) { Alert.alert('', '1시간 이상 입력해주세요'); return; }
                  app.updateSubject(goalSubj.id, { weeklyGoalMin: Math.round(h * 60) });
                  setGoalSubj(null);
                }}>
                <Text style={{ color: 'white', fontSize: 14, fontWeight: '800' }}>저장</Text>
              </TouchableOpacity>
            </View>
            {goalSubj?.weeklyGoalMin && (
              <TouchableOpacity style={{ marginTop: 8, alignItems: 'center' }} onPress={() => setGoalSubj(null)}>
                <Text style={{ fontSize: 13, color: T.sub }}>닫기</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

function createStyles(fs) { return StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  headerTitle: { fontSize: Math.round(20 * fs), fontWeight: '900' },
  schoolBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  gradeRow: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3, marginBottom: 8 },
  gradeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },

  tabRow: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3, marginBottom: 12 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },

  queueBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  secLabel: { fontSize: Math.round(13 * fs), fontWeight: '700', marginBottom: 8, marginTop: 2 },

  // 루틴
  routineCard: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 8 },
  routineTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routineName: { fontSize: Math.round(15 * fs), fontWeight: '900', marginBottom: 3 },
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
  modalTitle: { fontSize: Math.round(16 * fs), fontWeight: '900', textAlign: 'center', marginBottom: 14 },
  mInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: Math.round(15 * fs), marginBottom: 12 },
  colorRow: { flexDirection: 'row', gap: 7, marginBottom: 10 },
  colorBtn: { width: 24, height: 24, borderRadius: 12 },
  colorActive: { borderWidth: 3, borderColor: 'white', elevation: 4 },
  charRow: { flexDirection: 'row', gap: 5, marginBottom: 14 },
  charBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, borderWidth: 1.5 },
  mBtns: { flexDirection: 'row', gap: 8 },
  mCancel: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  mConfirm: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
}); }