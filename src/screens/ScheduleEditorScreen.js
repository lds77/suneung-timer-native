// src/screens/ScheduleEditorScreen.js
// 주간 플래너 편집 화면 — Modal로 SettingsScreen에서 진입

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Modal, TextInput, Switch, Alert, StyleSheet, Platform, KeyboardAvoidingView, Keyboard, Dimensions,
} from 'react-native';

const { width: SW } = Dimensions.get('window');
const isTablet = SW >= 600;
const TABLET_MAX_W = 680;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTheme } from '../constants/colors';
import { FIXED_TYPES, DEFAULT_SCHEDULES } from '../constants/presets';
import { generateId } from '../utils/format';
import { useApp } from '../hooks/useAppState';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

// 30분 단위 시간 옵션 00:00 ~ 24:00 (자정 이후 새벽 시간 포함)
const TIME_OPTIONS = (() => {
  const opts = [];
  for (let h = 0; h <= 23; h++) {
    opts.push(`${String(h).padStart(2, '0')}:00`);
    opts.push(`${String(h).padStart(2, '0')}:30`);
  }
  opts.push('24:00');
  return opts;
})();

const PLAN_COLORS = ['#E8575A', '#4A90D9', '#5CB85C', '#F5A623', '#9B6FC3', '#E17055', '#00B894', '#6C5CE7', '#FDCB6E'];
const PLAN_ICONS = ['📚', '📖', '📝', '📐', '📗', '📘', '📕', '🔬', '🧪', '📋', '🎯', '✏️', '🔥', '⭐'];

const getTodayKey = () => {
  const d = new Date().getDay(); // 0=일, 1=월 ... 6=토
  return DAY_KEYS[d === 0 ? 6 : d - 1];
};

const emptyDay = () => ({ fixed: [], plans: [] });

const formatMin = (min) => {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
};

const LEVEL_LABELS = {
  elementary_lower: '초등 저학년', elementary_upper: '초등 고학년',
  middle: '중학생', high: '고등학생', nsuneung: 'N수생',
  university: '대학생', exam_prep: '공시생/자격증',
};


const DROPDOWN_ITEM_H = 42;
const DROPDOWN_VISIBLE = 5;

function formatTimeOpt(opt) {
  const [h, m] = opt.split(':').map(Number);
  if (h === 24) return '자정';
  const isAM = h < 12;
  const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${isAM ? '오전' : '오후'} ${dh}:${String(m).padStart(2, '0')}`;
}

function TimeDropdownPicker({ label, value, onChange, open, onToggle, T }) {
  const scrollRef = useRef(null);
  const selectedIdx = Math.max(0, TIME_OPTIONS.indexOf(value || '08:00'));

  useEffect(() => {
    if (open) {
      const offset = Math.max(0, selectedIdx - 2) * DROPDOWN_ITEM_H;
      setTimeout(() => scrollRef.current?.scrollTo({ y: offset, animated: false }), 50);
    }
  }, [open]);

  return (
    <View style={{ flex: 1 }}>
      {/* 트리거 버튼 */}
      <TouchableOpacity
        onPress={onToggle}
        style={{
          borderWidth: 1.5, borderRadius: 10,
          borderColor: open ? T.accent : T.border,
          backgroundColor: open ? T.accent + '10' : T.card,
          paddingHorizontal: 10, paddingVertical: 11,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontSize: 11, color: T.sub, fontWeight: '600' }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color: open ? T.accent : T.text }}>
          {formatTimeOpt(value)} <Text style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</Text>
        </Text>
      </TouchableOpacity>
      {/* 드롭다운 */}
      {open && (
        <View style={{
          marginTop: 4, borderWidth: 1.5, borderColor: T.accent,
          borderRadius: 10, backgroundColor: T.card, overflow: 'hidden',
          height: DROPDOWN_ITEM_H * DROPDOWN_VISIBLE,
        }}>
          <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
            {TIME_OPTIONS.map(opt => {
              const isSel = opt === value;
              return (
                <TouchableOpacity
                  key={opt}
                  onPress={() => { onChange(opt); onToggle(); }}
                  style={{
                    height: DROPDOWN_ITEM_H, justifyContent: 'center', alignItems: 'center',
                    backgroundColor: isSel ? T.accent + '18' : 'transparent',
                    borderLeftWidth: isSel ? 3 : 0, borderLeftColor: T.accent,
                  }}
                >
                  <Text style={{
                    fontSize: 14, fontWeight: isSel ? '800' : '500',
                    color: isSel ? T.accent : T.text,
                  }}>
                    {formatTimeOpt(opt)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

export default function ScheduleEditorScreen({ visible, onClose }) {
  const app = useApp();
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const todayKey = getTodayKey();

  const [selectedDay, setSelectedDay] = useState(todayKey);

  // Sub-modal 표시 상태
  const [showAddFixed, setShowAddFixed] = useState(false);
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [showCopy, setShowCopy] = useState(false);

  // 편집 중인 항목 ID (null = 추가 모드)
  const [editingFixedId, setEditingFixedId] = useState(null);
  const [editingPlanId, setEditingPlanId] = useState(null);

  // 고정 일정 추가/수정 폼
  const [fixedType, setFixedType] = useState(FIXED_TYPES[0]);
  const [fixedLabel, setFixedLabel] = useState('');
  const [fixedStart, setFixedStart] = useState('08:00');
  const [fixedEnd, setFixedEnd] = useState('09:00');
  const [activeTimePicker, setActiveTimePicker] = useState(null); // 'start' | 'end' | null

  // 공부 계획 추가/수정 폼
  const [planTab, setPlanTab] = useState('subject'); // 'subject' | 'custom'
  const [planSubjectId, setPlanSubjectId] = useState(null);
  const [planLabel, setPlanLabel] = useState('');
  const [planIcon, setPlanIcon] = useState('📚');
  const [planColor, setPlanColor] = useState('#4A90D9');
  const [planTargetMin, setPlanTargetMin] = useState(30);

  // 요일 복사
  const [copyDays, setCopyDays] = useState({});

  const ws = app.weeklySchedule;

  // ── 기본 템플릿 적용 ──
  const applyDefaultTemplate = useCallback(() => {
    const level = app.settings.schoolLevel || 'high';
    const template = DEFAULT_SCHEDULES[level];
    if (!template) {
      const empty = { enabled: true };
      DAY_KEYS.forEach(k => { empty[k] = emptyDay(); });
      app.setWeeklySchedule(empty);
      return;
    }
    const newWs = { enabled: true };
    const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'];
    DAY_KEYS.forEach(key => {
      const src = weekdays.includes(key) ? template.weekday : template.weekend;
      newWs[key] = {
        fixed: (src.fixed || []).map(f => ({ ...f, id: generateId('f_') })),
        plans: (src.plans || []).map((p, idx) => ({ ...p, id: generateId('p_'), order: idx, subjectId: null })),
      };
    });
    app.setWeeklySchedule(newWs);
  }, [app.settings.schoolLevel]);

  // ── 플래너 ON/OFF ──
  const handleToggle = useCallback((val) => {
    if (val) {
      if (!ws) {
        const levelLabel = LEVEL_LABELS[app.settings.schoolLevel] || '고등학생';
        Alert.alert(
          '📅 주간 플래너 시작하기',
          `세팅 방식을 선택해주세요.\n\n🏫 기본 세팅 (추천)\n${levelLabel} 일과에 맞는 학교·식사·취침 시간이 자동으로 채워져요. 나중에 언제든 수정할 수 있어요.\n\n✏️ 직접 설정\n빈 시간표에서 고정 일정을 직접 하나씩 추가해요.`,
          [
            {
              text: '✏️ 직접 설정', onPress: () => {
                const newWs = { enabled: true };
                DAY_KEYS.forEach(k => { newWs[k] = emptyDay(); });
                app.setWeeklySchedule(newWs);
              },
            },
            { text: '🏫 기본 세팅', onPress: applyDefaultTemplate, style: 'default' },
          ]
        );
      } else {
        app.setWeeklySchedule({ ...ws, enabled: true });
      }
    } else {
      app.setWeeklySchedule(ws ? { ...ws, enabled: false } : { enabled: false });
    }
  }, [ws, app.settings.schoolLevel, applyDefaultTemplate]);

  // ── 현재 선택 요일 데이터 ──
  const dayData = useMemo(() => {
    if (!ws) return emptyDay();
    return ws[selectedDay] || emptyDay();
  }, [ws, selectedDay]);

  const availableMin = useMemo(() => {
    const fixed = dayData.fixed || [];
    if (!fixed.length) return 24 * 60;
    const fixedMin = fixed.reduce((sum, f) => {
      if (!f.start || !f.end) return sum;
      const [sh, sm] = f.start.split(':').map(Number);
      const [eh, em] = f.end.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      const dur = endMin > startMin ? endMin - startMin : (24 * 60 - startMin) + endMin;
      return sum + dur;
    }, 0);
    return Math.max(0, 24 * 60 - fixedMin);
  }, [dayData]);

  const planTotalMin = useMemo(() => {
    return (dayData.plans || []).reduce((sum, p) => sum + (p.targetMin || 0), 0);
  }, [dayData]);

  // ── 요일 데이터 업데이트 헬퍼 ──
  const updateDay = useCallback((updater) => {
    app.setWeeklySchedule(prev => {
      const current = prev || { enabled: true };
      const currentDay = current[selectedDay] || emptyDay();
      return { ...current, [selectedDay]: updater(currentDay) };
    });
  }, [selectedDay]);

  // ── 고정 일정 추가/수정 ──
  const resetFixedForm = useCallback(() => {
    setFixedLabel(''); setFixedStart('08:00'); setFixedEnd('09:00');
    setFixedType(FIXED_TYPES[0]); setEditingFixedId(null); setActiveTimePicker(null);
  }, []);

  const openAddFixed = useCallback(() => {
    resetFixedForm();
    setShowAddFixed(true);
  }, [resetFixedForm]);

  const openEditFixed = useCallback((f) => {
    setEditingFixedId(f.id);
    const ft = FIXED_TYPES.find(t => t.type === f.type) || FIXED_TYPES[0];
    setFixedType(ft);
    setFixedLabel(f.label);
    setFixedStart(f.start);
    setFixedEnd(f.end);
    setShowAddFixed(true);
  }, []);

  const handleAddFixed = useCallback(() => {
    if (!fixedLabel.trim()) {
      Alert.alert('이름을 입력해주세요.'); return;
    }
    const [sh, sm] = fixedStart.split(':').map(Number);
    const [eh, em] = fixedEnd.split(':').map(Number);
    if (eh * 60 + em === sh * 60 + sm) {
      Alert.alert('시간 오류', '시작과 종료 시간이 같아요.'); return;
    }
    // end < start 는 자정을 넘어가는 일정으로 허용 (ex: 23:00~07:00)
    if (editingFixedId) {
      updateDay(day => ({
        ...day,
        fixed: (day.fixed || []).map(f => f.id === editingFixedId
          ? { ...f, label: fixedLabel.trim(), start: fixedStart, end: fixedEnd, type: fixedType.type, icon: fixedType.icon, color: fixedType.color }
          : f
        ),
      }));
    } else {
      updateDay(day => ({
        ...day,
        fixed: [...(day.fixed || []), {
          id: generateId('f_'), label: fixedLabel.trim(),
          start: fixedStart, end: fixedEnd,
          type: fixedType.type, icon: fixedType.icon, color: fixedType.color,
        }],
      }));
    }
    setShowAddFixed(false);
    resetFixedForm();
  }, [fixedLabel, fixedStart, fixedEnd, fixedType, editingFixedId, updateDay, resetFixedForm]);

  const handleDeleteFixed = useCallback((id) => {
    Alert.alert('고정 일정 삭제', '이 일정을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => updateDay(day => ({ ...day, fixed: (day.fixed || []).filter(f => f.id !== id) })) },
    ]);
  }, [updateDay]);

  // ── 공부 계획 추가/수정 ──
  const resetPlanForm = useCallback(() => {
    setPlanLabel(''); setPlanTargetMin(30);
    setPlanSubjectId(null); setPlanTab('subject');
    setPlanIcon('📚'); setPlanColor('#4A90D9');
    setEditingPlanId(null);
  }, []);

  const openAddPlan = useCallback(() => {
    resetPlanForm();
    setShowAddPlan(true);
  }, [resetPlanForm]);

  const openEditPlan = useCallback((p) => {
    setEditingPlanId(p.id);
    setPlanTargetMin(p.targetMin || 30);
    if (p.subjectId) {
      setPlanTab('subject');
      setPlanSubjectId(p.subjectId);
    } else {
      setPlanTab('custom');
      setPlanLabel(p.label || '');
      setPlanIcon(p.icon || '📚');
      setPlanColor(p.color || '#4A90D9');
    }
    setShowAddPlan(true);
  }, []);

  const handleAddPlan = useCallback(() => {
    if (planTab === 'subject') {
      const subj = app.subjects.find(s => s.id === planSubjectId);
      if (!subj) { Alert.alert('과목을 선택해주세요.'); return; }
      if (editingPlanId) {
        updateDay(day => ({
          ...day,
          plans: (day.plans || []).map(p => p.id === editingPlanId
            ? { ...p, label: subj.name, icon: '📚', color: subj.color, subjectId: subj.id, targetMin: planTargetMin }
            : p
          ),
        }));
      } else {
        updateDay(day => {
          const plans = day.plans || [];
          return {
            ...day, plans: [...plans, {
              id: generateId('p_'), label: subj.name, icon: '📚',
              color: subj.color, subjectId: subj.id,
              targetMin: planTargetMin, order: plans.length,
            }],
          };
        });
      }
    } else {
      if (!planLabel.trim()) { Alert.alert('이름을 입력해주세요.'); return; }
      if (editingPlanId) {
        updateDay(day => ({
          ...day,
          plans: (day.plans || []).map(p => p.id === editingPlanId
            ? { ...p, label: planLabel.trim(), icon: planIcon, color: planColor, subjectId: null, targetMin: planTargetMin }
            : p
          ),
        }));
      } else {
        updateDay(day => {
          const plans = day.plans || [];
          return {
            ...day, plans: [...plans, {
              id: generateId('p_'), label: planLabel.trim(), icon: planIcon,
              color: planColor, subjectId: null,
              targetMin: planTargetMin, order: plans.length,
            }],
          };
        });
      }
    }
    setShowAddPlan(false);
    resetPlanForm();
  }, [planTab, planSubjectId, planLabel, planIcon, planColor, planTargetMin, editingPlanId, app.subjects, updateDay, resetPlanForm]);

  const handleDeletePlan = useCallback((id) => {
    Alert.alert('과목 삭제', '이 과목을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => updateDay(day => ({
        ...day,
        plans: (day.plans || []).filter(p => p.id !== id).map((p, i) => ({ ...p, order: i })),
      })) },
    ]);
  }, [updateDay]);

  const handleMovePlan = useCallback((id, dir) => {
    updateDay(day => {
      const plans = [...(day.plans || [])].sort((a, b) => a.order - b.order);
      const idx = plans.findIndex(p => p.id === id);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= plans.length) return day;
      [plans[idx], plans[newIdx]] = [plans[newIdx], plans[idx]];
      return { ...day, plans: plans.map((p, i) => ({ ...p, order: i })) };
    });
  }, [updateDay]);

  // ── 요일 복사 ──
  const handleCopy = useCallback(() => {
    const targets = Object.keys(copyDays).filter(k => copyDays[k]);
    if (!targets.length) { setShowCopy(false); return; }
    app.setWeeklySchedule(prev => {
      const current = prev || { enabled: true };
      const src = current[selectedDay] || emptyDay();
      const next = { ...current };
      targets.forEach(k => {
        next[k] = {
          fixed: (src.fixed || []).map(f => ({ ...f, id: generateId('f_') })),
          plans: (src.plans || []).map(p => ({ ...p, id: generateId('p_') })),
        };
      });
      return next;
    });
    setCopyDays({});
    setShowCopy(false);
    app.showToastCustom('요일 복사 완료!', 'toru');
  }, [copyDays, selectedDay]);

  const sortedFixed = useMemo(() =>
    [...(dayData.fixed || [])].sort((a, b) => a.start.localeCompare(b.start)),
    [dayData.fixed]
  );
  const sortedPlans = useMemo(() =>
    [...(dayData.plans || [])].sort((a, b) => a.order - b.order),
    [dayData.plans]
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: T.bg }}>

        {/* 헤더 */}
        <View style={[s.header, { borderBottomColor: T.border, backgroundColor: T.bg, paddingTop: insets.top + 12 }]}>
          <Text style={[s.headerTitle, { color: T.text }]}>📅 주간 플래너 설정</Text>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={[s.closeText, { color: T.accent }]}>닫기</Text>
          </TouchableOpacity>
        </View>

        <ScrollView key={visible ? 1 : 0} ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always" nestedScrollEnabled={true}>

          {/* ON/OFF */}
          <View style={[s.toggleRow, { backgroundColor: T.card, borderColor: T.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.toggleLabel, { color: T.text }]}>주간 플래너</Text>
              <Text style={[s.toggleSub, { color: T.sub }]}>켜면 매일 오늘의 공부 계획이 표시돼요</Text>
            </View>
            <Switch
              value={ws?.enabled === true}
              onValueChange={handleToggle}
              trackColor={{ true: T.accent }}
              thumbColor="white"
            />
          </View>

          {ws?.enabled ? (
            <>
              {/* 요일 탭 */}
              <View style={[s.dayTabScroll, { flexDirection: 'row', paddingHorizontal: 16, gap: 6 }]}>
                {DAY_KEYS.map((key, i) => {
                  const isToday = key === todayKey;
                  const isSel = key === selectedDay;
                  return (
                    <TouchableOpacity key={key} onPress={() => setSelectedDay(key)}
                      style={[s.dayTab, {
                        flex: 1,
                        borderColor: isSel ? T.accent : T.border,
                        backgroundColor: isSel ? T.accent : T.card,
                      }]}>
                      <Text style={[s.dayTabText, { color: isSel ? 'white' : T.text }]}>{DAY_LABELS[i]}</Text>
                      {isToday && <View style={[s.dayDot, { backgroundColor: isSel ? 'white' : T.accent }]} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 고정 일정 */}
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: T.sub }]}>고정 일정</Text>
                {sortedFixed.map(f => (
                  <View key={f.id} style={[s.fixedItem, { backgroundColor: T.card, borderColor: T.border }]}>
                    <Text style={s.itemIcon}>{f.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.itemLabel, { color: T.text }]}>{f.label}</Text>
                      <Text style={[s.itemSub, { color: T.sub }]}>{f.start} ~ {f.end}{(() => { const [sh,sm]=f.start.split(':').map(Number); const [eh,em]=f.end.split(':').map(Number); return eh*60+em < sh*60+sm ? ' (익일)' : ''; })()}</Text>
                    </View>
                    <TouchableOpacity onPress={() => openEditFixed(f)} style={s.editBtn}>
                      <Text style={[s.editText, { color: T.sub }]}>🖊️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteFixed(f.id)} style={s.delBtn}>
                      <Text style={[s.delText, { color: T.red }]}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity onPress={openAddFixed}
                  style={[s.addBtn, { borderColor: T.border }]}>
                  <Text style={[s.addBtnText, { color: T.accent }]}>+ 고정 일정 추가</Text>
                </TouchableOpacity>
              </View>

              {/* 가용 시간 */}
              <View style={[s.availRow, { backgroundColor: T.card, borderColor: T.border }]}>
                <Text style={[s.availText, { color: T.green }]}>
                  공부 가능 시간: {formatMin(availableMin)}
                </Text>
              </View>

              {/* 공부 계획 */}
              <View style={s.section}>
                <View style={s.sectionRow}>
                  <Text style={[s.sectionTitle, { color: T.sub }]}>공부 계획</Text>
                  <Text style={[s.planTotal, { color: T.accent }]}>합계: {formatMin(planTotalMin)}</Text>
                </View>
                {planTotalMin > availableMin && (
                  <View style={[s.warnRow, { backgroundColor: T.yellow + '25', borderColor: T.yellow }]}>
                    <Text style={[s.warnText, { color: T.text }]}>
                      계획 {formatMin(planTotalMin)} {'>'} 가용 {formatMin(availableMin)} — 조금 줄여볼까요?
                    </Text>
                  </View>
                )}
                {sortedPlans.map((p, idx) => (
                  <View key={p.id} style={[s.planItem, { backgroundColor: T.card, borderColor: T.border }]}>
                    <View style={[s.planBar, { backgroundColor: p.color }]} />
                    <Text style={s.itemIcon}>{p.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.itemLabel, { color: T.text }]}>{p.label}</Text>
                      <Text style={[s.itemSub, { color: T.sub }]}>{p.targetMin}분</Text>
                    </View>
                    <View style={s.moveGroup}>
                      <TouchableOpacity onPress={() => handleMovePlan(p.id, -1)} disabled={idx === 0}
                        style={{ opacity: idx === 0 ? 0.3 : 1, padding: 6 }}>
                        <Text style={{ color: T.sub, fontSize: 14 }}>▲</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleMovePlan(p.id, 1)} disabled={idx === sortedPlans.length - 1}
                        style={{ opacity: idx === sortedPlans.length - 1 ? 0.3 : 1, padding: 6 }}>
                        <Text style={{ color: T.sub, fontSize: 14 }}>▼</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => openEditPlan(p)} style={s.editBtn}>
                      <Text style={[s.editText, { color: T.sub }]}>🖊️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeletePlan(p.id)} style={s.delBtn}>
                      <Text style={[s.delText, { color: T.red }]}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity onPress={openAddPlan}
                  style={[s.addBtn, { borderColor: T.border }]}>
                  <Text style={[s.addBtnText, { color: T.accent }]}>+ 과목 추가</Text>
                </TouchableOpacity>
              </View>

              {/* 요일 복사 */}
              <TouchableOpacity onPress={() => { setCopyDays({}); setShowCopy(true); }}
                style={[s.copyBtn, { borderColor: T.border, backgroundColor: T.card }]}>
                <Text style={[s.copyBtnText, { color: T.text }]}>이 요일을 다른 요일에 복사</Text>
              </TouchableOpacity>

              {/* 기본 시간표로 초기화 */}
              <TouchableOpacity
                onPress={() => {
                  const levelLabel = LEVEL_LABELS[app.settings.schoolLevel] || '고등학생';
                  Alert.alert(
                    '기본 시간표로 초기화',
                    `${levelLabel} 기본 시간표로 초기화할까요?\n학교·식사·취침 시간이 자동으로 세팅돼요.\n지금까지 설정한 내용은 모두 사라져요.`,
                    [
                      { text: '취소', style: 'cancel' },
                      { text: '초기화', style: 'destructive', onPress: () => {
                        applyDefaultTemplate();
                        app.showToastCustom('기본 시간표로 초기화했어요', 'toru');
                      }},
                    ]
                  );
                }}
                style={[s.copyBtn, { borderColor: T.red + '60', backgroundColor: T.card, marginTop: 6 }]}
              >
                <Text style={[s.copyBtnText, { color: T.red }]}>기본 시간표로 초기화</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={s.offHint}>
              <Text style={[s.offHintText, { color: T.sub }]}>플래너를 켜면 매일 공부 계획을 관리할 수 있어요!</Text>
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>

        {/* ── 고정 일정 추가/수정 모달 ── */}
        <Modal visible={showAddFixed} transparent animationType="slide"
          onRequestClose={() => { setShowAddFixed(false); resetFixedForm(); }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.sheetBg}>
            <View style={[s.sheet, { backgroundColor: T.bg }]}>
              <Text style={[s.sheetTitle, { color: T.text }]}>{editingFixedId ? '고정 일정 수정' : '고정 일정 추가'}</Text>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={[s.fieldLabel, { color: T.sub }]}>유형</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {FIXED_TYPES.map(ft => {
                      const sel = fixedType.type === ft.type;
                      return (
                        <TouchableOpacity key={ft.type}
                          onPress={() => { Keyboard.dismiss(); setFixedType(ft); setFixedLabel(ft.label); }}
                          style={[s.typeChip, {
                            borderColor: sel ? T.accent : T.border,
                            backgroundColor: sel ? T.accent + '18' : T.card,
                          }]}>
                          <Text style={{ fontSize: 18 }}>{ft.icon}</Text>
                          <Text style={[s.typeChipText, { color: sel ? T.accent : T.text }]}>{ft.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>

                <Text style={[s.fieldLabel, { color: T.sub }]}>이름</Text>
                <TextInput value={fixedLabel} onChangeText={setFixedLabel}
                  style={[s.fieldInput, { borderColor: T.border, color: T.text, backgroundColor: T.card }]}
                  placeholder="일정 이름" placeholderTextColor={T.sub} />

                <Text style={[s.fieldLabel, { color: T.sub }]}>시간</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  <TimeDropdownPicker
                    label="시작" value={fixedStart} onChange={setFixedStart}
                    open={activeTimePicker === 'start'}
                    onToggle={() => { Keyboard.dismiss(); setActiveTimePicker(p => p === 'start' ? null : 'start'); }}
                    T={T}
                  />
                  <TimeDropdownPicker
                    label="종료" value={fixedEnd} onChange={setFixedEnd}
                    open={activeTimePicker === 'end'}
                    onToggle={() => { Keyboard.dismiss(); setActiveTimePicker(p => p === 'end' ? null : 'end'); }}
                    T={T}
                  />
                </View>
              </ScrollView>

              <View style={s.sheetBtnRow}>
                <TouchableOpacity onPress={() => { setShowAddFixed(false); resetFixedForm(); }}
                  style={[s.cancelBtn, { borderColor: T.border }]}>
                  <Text style={{ color: T.sub, fontWeight: '700' }}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAddFixed}
                  style={[s.okBtn, { backgroundColor: T.accent }]}>
                  <Text style={{ color: 'white', fontWeight: '800' }}>{editingFixedId ? '수정' : '추가'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── 공부 계획 추가/수정 모달 ── */}
        <Modal visible={showAddPlan} transparent animationType="slide"
          onRequestClose={() => { setShowAddPlan(false); resetPlanForm(); }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.sheetBg}>
            <View style={[s.sheet, { backgroundColor: T.bg }]}>
              <Text style={[s.sheetTitle, { color: T.text }]}>{editingPlanId ? '과목 수정' : '과목 추가'}</Text>

              {/* 탭: 내 과목 / 직접 입력 */}
              <View style={[s.tabRow, { backgroundColor: T.card, borderColor: T.border }]}>
                {[{ id: 'subject', label: '내 과목에서 선택' }, { id: 'custom', label: '직접 입력' }].map(tab => (
                  <TouchableOpacity key={tab.id} onPress={() => setPlanTab(tab.id)}
                    style={[s.tabBtn, planTab === tab.id && { backgroundColor: T.accent }]}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: planTab === tab.id ? 'white' : T.sub }}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {planTab === 'subject' ? (
                app.subjects.length === 0 ? (
                  <Text style={[s.emptyHint, { color: T.sub }]}>과목탭에서 과목을 먼저 추가해주세요</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 160, marginBottom: 14 }} showsVerticalScrollIndicator={false}>
                    {app.subjects.map(subj => {
                      const sel = planSubjectId === subj.id;
                      return (
                        <TouchableOpacity key={subj.id} onPress={() => setPlanSubjectId(subj.id)}
                          style={[s.subjRow, {
                            borderColor: sel ? subj.color : T.border,
                            backgroundColor: sel ? subj.color + '15' : T.card,
                          }]}>
                          <View style={[s.subjDot, { backgroundColor: subj.color }]} />
                          <Text style={[s.subjName, { color: sel ? subj.color : T.text, fontWeight: sel ? '800' : '600' }]}>
                            {subj.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )
              ) : (
                <>
                  <Text style={[s.fieldLabel, { color: T.sub }]}>이름</Text>
                  <TextInput value={planLabel} onChangeText={setPlanLabel}
                    style={[s.fieldInput, { borderColor: T.border, color: T.text, backgroundColor: T.card }]}
                    placeholder="과목 이름" placeholderTextColor={T.sub} />

                  <Text style={[s.fieldLabel, { color: T.sub }]}>아이콘</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {PLAN_ICONS.map(ic => (
                        <TouchableOpacity key={ic} onPress={() => { setPlanIcon(ic); Keyboard.dismiss(); }}
                          style={[s.iconChip, planIcon === ic && { backgroundColor: T.accent + '20', borderColor: T.accent }]}>
                          <Text style={{ fontSize: 20 }}>{ic}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  <Text style={[s.fieldLabel, { color: T.sub }]}>색상</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    {PLAN_COLORS.map(c => (
                      <TouchableOpacity key={c} onPress={() => { setPlanColor(c); Keyboard.dismiss(); }}
                        style={[s.colorDot, { backgroundColor: c }, planColor === c && s.colorDotSel]}>
                        {planColor === c && <Text style={{ color: 'white', fontSize: 12, fontWeight: '900' }}>✓</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Text style={[s.fieldLabel, { color: T.sub }]}>목표 시간</Text>
              <View style={s.stepperRow}>
                <TouchableOpacity onPress={() => setPlanTargetMin(m => Math.max(10, m - 5))}
                  style={[s.stepperBtn, { backgroundColor: T.card, borderColor: T.border }]}>
                  <Text style={{ color: T.text, fontSize: 20, fontWeight: '700' }}>−</Text>
                </TouchableOpacity>
                <Text style={[s.stepperVal, { color: T.text }]}>{planTargetMin}분</Text>
                <TouchableOpacity onPress={() => setPlanTargetMin(m => Math.min(180, m + 5))}
                  style={[s.stepperBtn, { backgroundColor: T.card, borderColor: T.border }]}>
                  <Text style={{ color: T.text, fontSize: 20, fontWeight: '700' }}>+</Text>
                </TouchableOpacity>
              </View>

              <View style={s.sheetBtnRow}>
                <TouchableOpacity onPress={() => { setShowAddPlan(false); resetPlanForm(); }}
                  style={[s.cancelBtn, { borderColor: T.border }]}>
                  <Text style={{ color: T.sub, fontWeight: '700' }}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAddPlan}
                  style={[s.okBtn, { backgroundColor: T.accent }]}>
                  <Text style={{ color: 'white', fontWeight: '800' }}>{editingPlanId ? '수정' : '추가'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── 요일 복사 모달 ── */}
        <Modal visible={showCopy} transparent animationType="slide"
          onRequestClose={() => setShowCopy(false)}>
          <View style={s.sheetBg}>
            <View style={[s.sheet, { backgroundColor: T.bg }]}>
              <Text style={[s.sheetTitle, { color: T.text }]}>요일 복사</Text>
              <Text style={[s.copyHint, { color: T.sub }]}>
                {DAY_LABELS[DAY_KEYS.indexOf(selectedDay)]}요일의 일정과 계획을 복사할 요일을 선택하세요.
              </Text>
              <View style={s.copyDayRow}>
                {DAY_KEYS.filter(k => k !== selectedDay).map(k => {
                  const label = DAY_LABELS[DAY_KEYS.indexOf(k)];
                  const checked = !!copyDays[k];
                  return (
                    <TouchableOpacity key={k}
                      onPress={() => setCopyDays(prev => ({ ...prev, [k]: !prev[k] }))}
                      style={[s.copyDayBtn, {
                        borderColor: checked ? T.accent : T.border,
                        backgroundColor: checked ? T.accent + '18' : T.card,
                      }]}>
                      <Text style={[s.copyDayText, { color: checked ? T.accent : T.text }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={s.sheetBtnRow}>
                <TouchableOpacity onPress={() => setShowCopy(false)}
                  style={[s.cancelBtn, { borderColor: T.border }]}>
                  <Text style={{ color: T.sub, fontWeight: '700' }}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCopy}
                  style={[s.okBtn, { backgroundColor: T.accent }]}>
                  <Text style={{ color: 'white', fontWeight: '800' }}>복사</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '900' },
  closeBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  closeText: { fontSize: 15, fontWeight: '700' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16, padding: 16, borderRadius: 14, borderWidth: 1,
  },
  toggleLabel: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  toggleSub: { fontSize: 13 },

  dayTabScroll: { marginBottom: 8, paddingVertical: 4 },
  dayTabContent: { paddingHorizontal: 16, gap: 6, paddingVertical: 4 },
  dayTab: {
    paddingHorizontal: 4, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, alignItems: 'center',
  },
  dayTabText: { fontSize: 14, fontWeight: '700' },
  dayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },

  section: { paddingHorizontal: 16, marginBottom: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  planTotal: { fontSize: 14, fontWeight: '700' },

  fixedItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  planItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  planBar: { width: 3, height: 32, borderRadius: 2, marginRight: 10 },
  itemIcon: { fontSize: 20, marginRight: 10 },
  itemLabel: { fontSize: 15, fontWeight: '700' },
  itemSub: { fontSize: 13, marginTop: 1 },
  moveGroup: { flexDirection: 'row', marginRight: 2 },
  editBtn: { padding: 6 },
  editText: { fontSize: 15 },
  delBtn: { padding: 6, marginLeft: 2 },
  delText: { fontSize: 20 },

  addBtn: {
    paddingVertical: 12, borderRadius: 12, borderWidth: 1,
    borderStyle: 'dashed', alignItems: 'center', marginBottom: 12,
  },
  addBtnText: { fontSize: 14, fontWeight: '700' },

  availRow: { marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  availText: { fontSize: 14, fontWeight: '700' },

  warnRow: { padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  warnText: { fontSize: 14, fontWeight: '600' },

  copyBtn: { marginHorizontal: 16, marginBottom: 16, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  copyBtnText: { fontSize: 14, fontWeight: '700' },

  offHint: { alignItems: 'center', padding: 48 },
  offHintText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Sub-modal
  sheetBg: { flex: 1, backgroundColor: '#00000065', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '92%',
    width: '100%', ...(isTablet && { maxWidth: TABLET_MAX_W }),
  },
  sheetTitle: { fontSize: 17, fontWeight: '900', marginBottom: 16, textAlign: 'center' },
  sheetBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  okBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },

  fieldLabel: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  fieldInput: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, marginBottom: 14,
  },

  typeChip: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, gap: 3, minWidth: 60,
  },
  typeChipText: { fontSize: 13, fontWeight: '600' },

  timePicker: { height: 130, borderWidth: 1, borderRadius: 10, marginBottom: 4 },
  timeOpt: { paddingVertical: 9, alignItems: 'center' },

  tabRow: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },

  subjRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 6,
  },
  subjDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  subjName: { fontSize: 15 },

  iconChip: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'transparent',
  },
  colorDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  colorDotSel: { borderWidth: 2.5, borderColor: 'white' },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 24, justifyContent: 'center', marginBottom: 14 },
  stepperBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  stepperVal: { fontSize: 20, fontWeight: '800', minWidth: 64, textAlign: 'center' },

  emptyHint: { fontSize: 14, textAlign: 'center', padding: 20 },
  copyHint: { fontSize: 14, textAlign: 'center', marginBottom: 16, lineHeight: 18 },
  copyDayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 8 },
  copyDayBtn: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 10, borderWidth: 1 },
  copyDayText: { fontSize: 15, fontWeight: '700' },
});
