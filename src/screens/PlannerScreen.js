// src/screens/PlannerScreen.js
// 주간/월간 플래너 — 시각적 시간표 그리드

import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch,
  Modal, TextInput, Alert, StyleSheet, Platform,
  Dimensions, useWindowDimensions, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../constants/colors';
import { FIXED_TYPES } from '../constants/presets';
import { generateId, formatDDay, calcDDay, getToday } from '../utils/format';
import { useApp } from '../hooks/useAppState';
import RunningTimersBar from '../components/RunningTimersBar';
import TimePickerGrid from '../components/TimePickerGrid';
import ScheduleEditorScreen from './ScheduleEditorScreen';

const { width: SW } = Dimensions.get('window');
const isTablet = SW >= 600;

// ─── 그리드 상수 ───
const START_HOUR = 6;      // 06:00 부터
const END_HOUR = 24;       // 24:00 (자정)
const TOTAL_HOURS = END_HOUR - START_HOUR;
const HOUR_H = 60;         // 1시간 = 60px
const GRID_H = TOTAL_HOURS * HOUR_H;
const TIME_COL_W = 42;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// ─── 헬퍼 ───
const parseTimeToMin = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const minToStr = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const getTodayKey = () => {
  const d = new Date().getDay(); // 0=일, 1=월, ..., 6=토
  return DAY_KEYS[d]; // 일요일 기준 배열과 getDay() 인덱스 일치
};

const getWeekDates = (weekOffset = 0) => {
  const today = new Date();
  const dow = today.getDay(); // 0=일
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - dow + weekOffset * 7); // 이번 주 일요일
  return DAY_KEYS.map((_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
};

// 현재 시간 → 그리드 상의 Y 위치 (px)
const getNowY = () => {
  const now = new Date();
  const totalMin = now.getHours() * 60 + now.getMinutes() - START_HOUR * 60;
  return Math.max(0, Math.min(GRID_H, totalMin));
};

// 자정 넘는 일정 여부 (end <= start)
const isMidnightCrossing = (start, end) => parseTimeToMin(end) <= parseTimeToMin(start);

// 블록 top/height 계산
// 자정 넘는 일정은 당일 그리드 끝(24:00)까지만 표시
const blockGeometry = (start, end) => {
  const effectiveEnd = isMidnightCrossing(start, end) ? '24:00' : end;
  const startMin = parseTimeToMin(start) - START_HOUR * 60;
  const endMin   = parseTimeToMin(effectiveEnd) - START_HOUR * 60;
  const top    = Math.max(0, startMin);
  const bottom = Math.min(GRID_H, endMin);
  return { top, height: Math.max(4, bottom - top) };
};

// 자정 넘는 일정의 다음 날 이어지는 블록 계산 (06:00 ~ end)
const carryoverGeometry = (end) => {
  const endMin = parseTimeToMin(end) - START_HOUR * 60;
  if (endMin <= 0) return null; // end가 06:00 이전이면 그리드에 안 보임
  return { top: 0, height: Math.min(endMin, GRID_H) };
};

// ─── 블록 추가/수정 모달 ───
// minStartTime: 이 시간 이전은 시작시간 선택 불가 (오늘의 현재 시간)
function BlockModal({ visible, onClose, onSave, onDelete, initial, subjects, T, minStartTime, planOnly }) {
  const [type, setType]           = useState(planOnly ? 'plan' : 'fixed');
  const [label, setLabel]         = useState('');
  const [start, setStart]         = useState('08:00');
  const [end, setEnd]             = useState('09:00');
  const [color, setColor]         = useState('#95A5A6');
  const [subjectId, setSid]       = useState(null);
  const [targetMin, setTargetMin] = useState(60);
  const [useSchedule, setUseSchedule] = useState(false);
  const isEdit = !!initial;

  useEffect(() => {
    if (visible) {
      if (initial) {
        setType(planOnly ? 'plan' : (initial.blockType || 'fixed'));
        setLabel(initial.label || '');
        setStart(initial.start || '08:00');
        setEnd(initial.end || '09:00');
        setColor(initial.color || '#95A5A6');
        setSid(initial.subjectId || null);
        setTargetMin(initial.targetMin || 60);
        setUseSchedule(!!initial.start);
      } else {
        setType(planOnly ? 'plan' : 'fixed');
        setLabel('');
        setStart('08:00');
        setEnd('09:00');
        setColor('#95A5A6');
        setSid(null);
        setTargetMin(60);
        setUseSchedule(false);
      }
    }
  }, [visible, initial]);

  const COLORS = ['#95A5A6','#E8575A','#4A90D9','#5CB85C','#F5A623','#9B6FC3','#E17055','#00B894','#6C5CE7','#FF6B9D','#FDCB6E','#636E72'];

  const TARGET_PRESETS = [30, 60, 90, 120, 180];
  const fmtTarget = (min) => min < 60 ? `${min}분` : min % 60 === 0 ? `${min/60}시간` : `${Math.floor(min/60)}시간 ${min%60}분`;

  const handleSave = () => {
    if (!label.trim()) { Alert.alert('이름을 입력해주세요'); return; }
    const needsTime = type === 'fixed' || useSchedule;
    if (needsTime) {
      const startMin = parseTimeToMin(start);
      const endMin   = parseTimeToMin(end);
      if (endMin <= startMin) { Alert.alert('종료 시간이 시작 시간보다 늦어야 해요'); return; }
    }
    const computedTargetMin = needsTime
      ? Math.round(parseTimeToMin(end) - parseTimeToMin(start))
      : targetMin;
    onSave({
      id: initial?.id || generateId('blk_'),
      blockType: type,
      label: label.trim(),
      start: needsTime ? start : null,
      end:   needsTime ? end   : null,
      targetMin: computedTargetMin,
      color: type === 'plan' && subjectId ? (subjects.find(s => s.id === subjectId)?.color || color) : color,
      subjectId: type === 'plan' ? subjectId : null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: '#00000055' }} activeOpacity={1} onPress={onClose} />
      <View style={[{ backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 28, maxHeight: '90%' }, isTablet && { maxWidth: 540, alignSelf: 'center', width: '100%' }]}>
        {/* 헤더 */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>
            {isEdit ? '일정 수정' : '일정 추가'}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={T.sub} />
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* 타입 선택 — 공부계획 전용 모드에서는 숨김 */}
        {!planOnly && (
          <View style={{ flexDirection: 'row', backgroundColor: T.surface, borderRadius: 10, padding: 3, marginBottom: 12 }}>
            {[{ id: 'fixed', label: '고정 일정' }, { id: 'plan', label: '공부 계획' }].map(t => (
              <TouchableOpacity key={t.id} onPress={() => setType(t.id)} style={{
                flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center',
                backgroundColor: type === t.id ? T.accent : 'transparent',
              }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: type === t.id ? '#fff' : T.sub }}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 이름 */}
        {type === 'plan' && subjects.length > 0 ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 11, color: T.sub, fontWeight: '600', marginBottom: 5 }}>과목 선택</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              {[{ id: null, name: '직접 입력', color: T.gray }, ...subjects].map(s => (
                <TouchableOpacity key={s.id || 'custom'} onPress={() => { setSid(s.id); if (s.id) setLabel(s.name); }}
                  style={{
                    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14,
                    backgroundColor: subjectId === s.id ? (s.color || T.accent) + '25' : T.surface,
                    borderWidth: 1.5, borderColor: subjectId === s.id ? (s.color || T.accent) : T.border,
                  }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: subjectId === s.id ? (s.color || T.accent) : T.sub }}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {(type === 'fixed' || !subjectId) && (
          <TextInput
            style={{ borderWidth: 1.5, borderColor: T.border, borderRadius: 10, padding: 10,
              fontSize: 14, color: T.text, backgroundColor: T.card, marginBottom: 10 }}
            placeholder={type === 'fixed' ? '예: 학교, 학원, 식사...' : '계획 이름'}
            placeholderTextColor={T.sub}
            value={label}
            onChangeText={setLabel}
          />
        )}

        {/* 공부 계획 전용: 목표량 + 시간 배치 토글 */}
        {type === 'plan' && (
          <>
            <Text style={{ fontSize: 11, color: T.sub, fontWeight: '600', marginBottom: 5 }}>목표량</Text>
            <View style={{ flexDirection: 'row', gap: 5, marginBottom: 10 }}>
              {TARGET_PRESETS.map(min => {
                const sel = targetMin === min;
                return (
                  <TouchableOpacity key={min} onPress={() => {
                    setTargetMin(min);
                    if (useSchedule) setEnd(minToStr(Math.min(parseTimeToMin(start) + min, 24 * 60)));
                  }} style={{
                    flex: 1, paddingVertical: 6, borderRadius: 14, alignItems: 'center',
                    backgroundColor: sel ? T.accent : T.surface,
                    borderWidth: 1.5, borderColor: sel ? T.accent : T.border,
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: sel ? '#fff' : T.sub }}>
                      {fmtTarget(min)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity onPress={() => {
              const next = !useSchedule;
              setUseSchedule(next);
              if (next) setEnd(minToStr(Math.min(parseTimeToMin(start) + targetMin, 24 * 60)));
            }} style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10,
              marginBottom: useSchedule ? 10 : 12,
              backgroundColor: T.surface,
              borderWidth: 1.5, borderColor: useSchedule ? T.accent + '55' : T.border,
            }}>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }}>특정 시간에 배치</Text>
                <Text style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>타임라인에 시간대로 표시돼요</Text>
              </View>
              <Switch
                value={useSchedule}
                onValueChange={(v) => {
                  setUseSchedule(v);
                  if (v) setEnd(minToStr(Math.min(parseTimeToMin(start) + targetMin, 24 * 60)));
                }}
                trackColor={{ false: T.border, true: T.accent + '80' }}
                thumbColor={useSchedule ? T.accent : '#ccc'}
              />
            </TouchableOpacity>
          </>
        )}

        {/* 시간 피커 — 고정 일정은 항상, 공부 계획은 토글 ON일 때만 */}
        {(type === 'fixed' || useSchedule) && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <TimePickerGrid label="시작 시간" value={start} onChange={(v) => {
              setStart(v);
              const newStartMin = parseTimeToMin(v);
              const curEndMin   = parseTimeToMin(end);
              if (curEndMin <= newStartMin) {
                setEnd(minToStr(Math.min(newStartMin + targetMin, 24 * 60)));
              }
            }} T={T} minValue={!initial ? minStartTime : undefined} />
            <TimePickerGrid label="종료 시간" value={end} onChange={(v) => {
              setEnd(v);
              if (type === 'plan') {
                const diff = Math.round(parseTimeToMin(v) - parseTimeToMin(start));
                if (diff > 0) setTargetMin(diff);
              }
            }} T={T} minValue={start} />
          </View>
        )}

        {/* 색상 (고정 일정 or 직접 입력 계획) */}
        {(type === 'fixed' || !subjectId) && (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 11, color: T.sub, fontWeight: '600', marginBottom: 6 }}>색상</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setColor(c)}
                  style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c,
                    borderWidth: color === c ? 3 : 0, borderColor: T.text }}>
                  {color === c && <Ionicons name="checkmark" size={14} color="#fff" style={{ margin: 4 }} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        </ScrollView>

        {/* 버튼 */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {isEdit && (
            <TouchableOpacity onPress={() => { Alert.alert('삭제', '이 일정을 삭제할까요?', [
              { text: '취소', style: 'cancel' },
              { text: '삭제', style: 'destructive', onPress: () => onDelete(initial.id, initial.blockType) },
            ]); }} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
              backgroundColor: T.red + '18', borderWidth: 1.5, borderColor: T.red + '50' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: T.red }}>삭제</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleSave} style={{
            flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: T.accent,
          }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>{isEdit ? '수정' : '추가'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── 공부계획 실행 바텀시트 ───
function PlanActionSheet({ visible, plan, isToday, onClose, onEdit, onStart, T, getPlanCompletedSec }) {
  if (!plan) return null;
  const doneSec = getPlanCompletedSec?.(plan.id) || 0;
  const targetSec = (plan.targetMin || 0) * 60;
  const pct = targetSec > 0 ? Math.min(1, doneSec / targetSec) : 0;
  const doneMin = Math.round(doneSec / 60);
  const isDone = pct >= 1;

  const startBtnColor = isDone ? T.green : (!isToday ? T.surface : (plan.color || T.accent));
  const startBtnText = isDone ? '✅ 완료' : (!isToday ? '오늘 일정만 실행 가능' : '▶ 지금 시작');
  const startBtnTextColor = (isDone || !isToday) ? T.sub : '#fff';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: '#00000055' }} activeOpacity={1} onPress={onClose} />
      <View style={[{ backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 }, isTablet && { maxWidth: 540, alignSelf: 'center', width: '100%' }]}>
        {/* 헤더 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: plan.color || T.accent, marginRight: 10 }} />
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: T.text }}>{plan.label}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={T.sub} />
          </TouchableOpacity>
        </View>

        {/* 시간 정보 */}
        {plan.start && plan.end && (
          <Text style={{ fontSize: 14, color: T.sub, marginBottom: 14 }}>
            🕐 {plan.start} ~ {plan.end}  ({plan.targetMin}분 목표)
          </Text>
        )}

        {/* 진행률 */}
        {targetSec > 0 && (
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 13, color: T.sub }}>완료 {doneMin}분 / {plan.targetMin}분</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: isDone ? T.green : (plan.color || T.accent) }}>
                {Math.round(pct * 100)}%
              </Text>
            </View>
            <View style={{ height: 8, backgroundColor: T.surface, borderRadius: 4, overflow: 'hidden' }}>
              <View style={{
                height: 8,
                width: `${Math.round(pct * 100)}%`,
                backgroundColor: isDone ? T.green : (plan.color || T.accent),
                borderRadius: 4,
              }} />
            </View>
          </View>
        )}

        {/* 버튼 */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={onEdit} style={{
            flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
            backgroundColor: T.surface, borderWidth: 1.5, borderColor: T.border,
          }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: T.text }}>수정</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={isToday && !isDone ? onStart : undefined}
            disabled={!isToday || isDone}
            style={{
              flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
              backgroundColor: startBtnColor, opacity: (!isToday && !isDone) ? 0.5 : 1,
            }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: startBtnTextColor }}>
              {startBtnText}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── 빈 시간 배치 바텀시트 ───
function QuickAssignSheet({ visible, plan, freeSlots, nowMin, onClose, onAssignToday, onManual, T }) {
  if (!plan) return null;
  const futureSlots = freeSlots.filter(s => parseTimeToMin(s.start) >= nowMin);

  const handleSlotTap = (start, assignEnd) => {
    onAssignToday(plan, start, assignEnd);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: '#00000055' }} activeOpacity={1} onPress={onClose} />
      <View style={[{ backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34, maxHeight: '70%' }, isTablet && { maxWidth: 540, alignSelf: 'center', width: '100%' }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: '900', color: T.text }}>빈 시간에 배치</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={T.sub} /></TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: plan.color || T.accent }} />
          <Text style={{ fontSize: 13, color: T.sub }}>{plan.label} · {plan.targetMin}분 목표</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {futureSlots.length === 0 ? (
            <Text style={{ fontSize: 14, color: T.sub, textAlign: 'center', paddingVertical: 20 }}>
              오늘 남은 빈 시간이 없어요
            </Text>
          ) : (
            futureSlots.map((slot, i) => {
              const assignEnd = minToStr(Math.min(parseTimeToMin(slot.start) + plan.targetMin, parseTimeToMin(slot.end === '24:00' ? '24:00' : slot.end)));
              const fits = slot.durationMin >= plan.targetMin;
              return (
                <TouchableOpacity key={i} onPress={() => handleSlotTap(slot.start, assignEnd)} style={{
                  flexDirection: 'row', alignItems: 'center',
                  padding: 14, borderRadius: 12, marginBottom: 8,
                  backgroundColor: fits ? T.accent + '12' : T.surface,
                  borderWidth: 1.5, borderColor: fits ? T.accent + '50' : T.border,
                }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: fits ? T.accent : T.text }}>
                      {slot.start} ~ {assignEnd}
                    </Text>
                    <Text style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>
                      빈 시간 {slot.durationMin >= 60 ? `${Math.floor(slot.durationMin/60)}시간${slot.durationMin%60>0?` ${slot.durationMin%60}분`:''}` : `${slot.durationMin}분`}
                      {!fits ? `  ·  목표 ${plan.targetMin}분 중 ${slot.durationMin}분 가능` : '  ·  목표 시간 전부 가능'}
                    </Text>
                  </View>
                  {fits && <Ionicons name="checkmark-circle" size={22} color={T.accent} />}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        <TouchableOpacity onPress={onManual} style={{
          paddingVertical: 12, borderRadius: 12, alignItems: 'center',
          borderWidth: 1.5, borderColor: T.border, marginTop: 8,
        }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: T.sub }}>직접 시간 설정하기</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── 메인 화면 ───
export default function PlannerScreen({ navigation }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const app = useApp();
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale, app.settings.stylePreset);
  const tabletMaxW = isTablet ? Math.round(winW * 0.83) : winW;
  const isLandscape = isTablet && winW > winH;

  const [viewMode, setViewMode]     = useState('today'); // 'today' | 'weekly' | 'monthly'
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [nowY, setNowY]             = useState(getNowY());
  const [modal, setModal]             = useState(null);
  const [planSheet, setPlanSheet]     = useState(null);
  const [quickAssignPlan, setQuickAssignPlan] = useState(null);
  const [tempAssignments, setTempAssignments] = useState({});
  const [showScheduleEditor, setShowScheduleEditor] = useState(false);

  // ── D-Day 모달 상태 ──
  const [showDDayModal, setShowDDayModal] = useState(false);
  const [editingDDay, setEditingDDay]     = useState(null);
  const [ddLabel, setDdLabel]             = useState('');
  const [ddPickerMonth, setDdPickerMonth] = useState(new Date());
  const [ddSelectedDates, setDdSelectedDates] = useState(new Set()); // 다중 날짜 선택
  const [selectedDate, setSelectedDate]   = useState(null); // 캘린더 탭한 날짜

  const scrollRef = useRef(null);
  const todayKey = getTodayKey();

  // 현재 시간을 10분 단위 올림으로 반환 (문자열)
  const getNowTimeStr = () => {
    const now = new Date();
    const h = now.getHours();
    const m = Math.ceil(now.getMinutes() / 10) * 10;
    if (m >= 60) return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:00`;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // 지난 요일 여부 (이번 주 기준)
  const isPastDay = useCallback((dayKey) => {
    if (weekOffset < 0) return true;
    if (weekOffset > 0) return false;
    const todayIdx = DAY_KEYS.indexOf(todayKey);
    return DAY_KEYS.indexOf(dayKey) < todayIdx;
  }, [weekOffset, todayKey]);

  // 지난 시간 여부 (오늘 기준, 분 단위)
  const isPastTimeMin = useCallback((dayKey, timeMin) => {
    if (isPastDay(dayKey)) return true;
    if (dayKey !== todayKey || weekOffset !== 0) return false;
    const now = new Date();
    return timeMin < now.getHours() * 60 + now.getMinutes();
  }, [isPastDay, todayKey, weekOffset]);

  // 현재 시간 선 업데이트 (1분마다)
  useEffect(() => {
    const id = setInterval(() => setNowY(getNowY()), 60000);
    return () => clearInterval(id);
  }, []);

  // 초기 스크롤 — 현재 시간 근처로
  useEffect(() => {
    if (viewMode === 'weekly') {
      const targetY = Math.max(0, nowY - 120);
      setTimeout(() => scrollRef.current?.scrollTo({ y: targetY, animated: false }), 100);
    }
  }, [viewMode]);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const DAY_W = Math.floor((winW - TIME_COL_W) / 7);
  const isThisWeek = weekOffset === 0;

  // weeklySchedule에서 특정 요일 데이터 가져오기
  const getDayData = useCallback((dayKey) => {
    const ws = app.weeklySchedule;
    if (!ws) return { fixed: [], plans: [] };
    return ws[dayKey] || { fixed: [], plans: [] };
  }, [app.weeklySchedule]);

  // 요일 데이터 업데이트 헬퍼
  const updateDayData = useCallback((dayKey, updater) => {
    const ws = app.weeklySchedule || { enabled: true };
    const current = ws[dayKey] || { fixed: [], plans: [] };
    app.setWeeklySchedule({ ...ws, enabled: true, [dayKey]: updater(current) });
  }, [app.weeklySchedule, app.setWeeklySchedule]);

  // 블록 저장 (추가 or 수정)
  // 타입이 변경된 경우(fixed→plan, plan→fixed) 기존 목록에서 해당 id 제거 후 새 목록에 추가
  const handleSave = useCallback(({ dayKey, block }) => {
    updateDayData(dayKey, (day) => {
      if (block.blockType === 'fixed') {
        // plans에 같은 id가 있으면 제거 (타입 변경 케이스)
        const plans = (day.plans || []).filter(p => p.id !== block.id);
        const existingFixed = (day.fixed || []).find(f => f.id === block.id);
        const fixed = existingFixed
          ? (day.fixed || []).map(f => f.id === block.id ? { ...f, ...block } : f)
          : [...(day.fixed || []), block];
        return { ...day, fixed, plans };
      } else {
        // fixed에 같은 id가 있으면 제거 (타입 변경 케이스)
        const fixed = (day.fixed || []).filter(f => f.id !== block.id);
        const existingPlan = (day.plans || []).find(p => p.id === block.id);
        const targetMin = block.start
          ? Math.round(parseTimeToMin(block.end) - parseTimeToMin(block.start))
          : (block.targetMin || 60);
        const plans = existingPlan
          ? (day.plans || []).map(p => p.id === block.id ? { ...p, ...block, targetMin } : p)
          : [...(day.plans || []), { ...block, targetMin }];
        return { ...day, fixed, plans };
      }
    });
    setModal(null);
  }, [updateDayData]);

  // 블록 삭제
  const handleDelete = useCallback((dayKey, blockId, blockType) => {
    updateDayData(dayKey, (day) => {
      if (blockType === 'fixed') {
        return { ...day, fixed: (day.fixed || []).filter(f => f.id !== blockId) };
      } else {
        return { ...day, plans: (day.plans || []).filter(p => p.id !== blockId) };
      }
    });
    setModal(null);
  }, [updateDayData]);

  // 그리드 셀 탭 → 시간 계산 → 모달 열기
  const handleGridTap = useCallback((dayKey, tapY) => {
    const snappedMin = Math.floor(tapY / 10) * 10;
    const startMin = START_HOUR * 60 + snappedMin;
    // 지난 시간/요일은 탭 무시
    if (isPastTimeMin(dayKey, startMin)) return;
    const endMin = startMin + 30; // 기본 30분
    setModal({
      dayKey,
      initial: null,
      prefill: {
        start: minToStr(Math.min(startMin, 23 * 60 + 50)),
        end:   minToStr(Math.min(endMin, 24 * 60)),
      },
    });
  }, [isPastTimeMin]);

  // 주간 헤더 (요일 + 날짜)
  const renderWeekHeader = () => (
    <View style={{ backgroundColor: T.card, borderBottomWidth: 1, borderBottomColor: T.border }}>
      {/* 주간 네비게이션 — 컴팩트 인라인 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 7, paddingBottom: 6 }}>
        <TouchableOpacity
          onPress={() => setWeekOffset(p => p - 1)}
          style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={15} color={T.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
          disabled={weekOffset === 0}
          onPress={() => setWeekOffset(0)}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>{weekTitle}</Text>
          {weekOffset !== 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: T.accent, borderRadius: 10 }}>
              <Ionicons name="today-outline" size={9} color="#fff" />
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>오늘</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: T.accent + '18', borderRadius: 10 }}>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: T.accent }} />
              <Text style={{ fontSize: 9, fontWeight: '700', color: T.accent }}>이번 주</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setWeekOffset(p => p + 1)}
          style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-forward" size={15} color={T.text} />
        </TouchableOpacity>
      </View>
      {/* 요일 + 날짜 헤더 */}
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: T.border }}>
        <View style={{ width: TIME_COL_W }} />
        {DAY_KEYS.map((key, i) => {
          const date = weekDates[i];
          const isToday = isThisWeek && key === todayKey;
          return (
            <View key={key} style={{ width: DAY_W, alignItems: 'center', paddingVertical: 4, borderLeftWidth: 1, borderLeftColor: T.border + '60' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: key === 'sat' ? T.accent : key === 'sun' ? T.red : T.sub }}>
                {DAY_LABELS[i]}
              </Text>
              <View style={{
                width: 22, height: 22, borderRadius: 11, marginTop: 2,
                backgroundColor: isToday ? T.accent : 'transparent',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 12, fontWeight: isToday ? '800' : '600',
                  color: isToday ? '#fff' : key === 'sat' ? T.accent : key === 'sun' ? T.red : T.text }}>
                  {date.getDate()}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );

  // 그리드 (시간 + 블록)
  const renderGrid = () => (
    <View style={{ flexDirection: 'row' }}>
      {/* 시간 컬럼 — 06~23 라벨 + 하단 24 라벨 */}
      <View style={{ width: TIME_COL_W, borderRightWidth: 1, borderRightColor: T.border }}>
        {Array.from({ length: TOTAL_HOURS }).map((_, i) => {
          const hour = START_HOUR + i;
          const isKey = hour % 3 === 0; // 06·09·12·15·18·21 강조
          return (
            <View key={i} style={{ height: HOUR_H, justifyContent: 'flex-start', paddingTop: 2, alignItems: 'flex-end', paddingRight: 6 }}>
              <Text style={{ fontSize: isKey ? 11 : 10, color: isKey ? T.accent : T.sub, fontWeight: isKey ? '800' : '500' }}>
                {String(hour).padStart(2, '0')}
              </Text>
            </View>
          );
        })}
        {/* 24 라벨 */}
        <View style={{ height: 14, justifyContent: 'flex-start', paddingTop: 1, alignItems: 'flex-end', paddingRight: 6 }}>
          <Text style={{ fontSize: 11, color: T.accent, fontWeight: '800' }}>24</Text>
        </View>
      </View>

      {/* 요일별 컬럼 */}
      {DAY_KEYS.map((key, di) => {
        const dayData = getDayData(key);
        const isToday = isThisWeek && key === todayKey;
        const TOTAL_ROWS = TOTAL_HOURS; // 06:00~24:00 (18행, 마지막 행 하단이 24:00)

        // 전날 자정 넘는 일정 → 이 날 상단에 이어서 표시
        const prevKey = DAY_KEYS[(di - 1 + 7) % 7];
        const prevData = getDayData(prevKey);
        const carryovers = [
          ...(prevData.fixed || []).filter(f => f.start && f.end && isMidnightCrossing(f.start, f.end)),
          ...(prevData.plans || []).filter(p => p.start && p.end && isMidnightCrossing(p.start, p.end)),
        ];

        return (
          <View key={key} style={{ width: DAY_W, borderLeftWidth: 1, borderLeftColor: T.border + '60', position: 'relative', backgroundColor: isToday ? T.accent + '06' : 'transparent' }}>

            {/* 시간 행 — 정상 레이아웃 흐름 + 10분 구분선 */}
            {Array.from({ length: TOTAL_ROWS }).map((_, i) => (
              <View key={i} style={{
                height: HOUR_H,
                borderTopWidth: 1,
                borderTopColor: T.sub + '70',
                position: 'relative',
              }}>
                {/* 10분 구분선 */}
                <View style={{ position: 'absolute', top: 10, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: T.sub, opacity: 0.3 }} />
                <View style={{ position: 'absolute', top: 20, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: T.sub, opacity: 0.3 }} />
                {/* 30분 구분선 */}
                <View style={{ position: 'absolute', top: 30, left: 0, right: 0, height: 1, backgroundColor: T.sub, opacity: 0.6 }} />
                {/* 10분 구분선 */}
                <View style={{ position: 'absolute', top: 40, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: T.sub, opacity: 0.3 }} />
                <View style={{ position: 'absolute', top: 50, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: T.sub, opacity: 0.3 }} />
              </View>
            ))}

            {/* 탭 영역 */}
            <TouchableOpacity
              activeOpacity={0.7}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              onPress={(e) => handleGridTap(key, e.nativeEvent.locationY)}
            />

            {/* 지난 시간대 오버레이 */}
            {(() => {
              let pastH = 0;
              if (weekOffset < 0) {
                // 지난 주 전체
                pastH = GRID_H;
              } else if (isThisWeek) {
                if (isPastDay(key)) pastH = GRID_H;       // 이번 주 지난 요일 전체
                else if (key === todayKey) pastH = nowY;  // 오늘은 현재 시간까지
              }
              if (pastH <= 0) return null;
              return (
                <View pointerEvents="none" style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: pastH,
                  backgroundColor: T.text === '#E8E8F2' ? '#ffffff14' : '#00000014',
                }} />
              );
            })()}

            {/* 전날에서 자정 넘어 이어지는 블록 */}
            {carryovers.map(b => {
              const geo = carryoverGeometry(b.end);
              if (!geo) return null;
              const blockColor = b.color || '#95A5A6';
              return (
                <View key={`carry_${b.id}`} style={{
                  position: 'absolute', left: 1, right: 1, top: geo.top, height: geo.height,
                  backgroundColor: blockColor,
                  borderRadius: 4, borderLeftWidth: 3, borderLeftColor: blockColor,
                  paddingHorizontal: 3, paddingVertical: 2, overflow: 'hidden',
                  elevation: 2,
                }}>
                  <Text style={{ fontSize: 9, color: '#ffffffCC' }} numberOfLines={1}>↪~{b.end}</Text>
                  {geo.height > 20 && (
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }} numberOfLines={1}>{b.label}</Text>
                  )}
                </View>
              );
            })}

            {/* 고정 일정 블록 */}
            {(dayData.fixed || []).map(f => {
              const { top, height } = blockGeometry(f.start, f.end);
              if (height < 4) return null;
              const blockColor = f.color || '#95A5A6';
              return (
                <View key={f.id}
                  style={{
                    position: 'absolute', left: 1, right: 1, top, height,
                    backgroundColor: blockColor,
                    borderRadius: 4, borderLeftWidth: 3, borderLeftColor: blockColor,
                    paddingHorizontal: 3, paddingVertical: 2, overflow: 'hidden',
                    elevation: 2,
                  }}
                >
                  <Text style={{ fontSize: 9, color: '#ffffffCC' }} numberOfLines={1}>{f.start}{height > 14 ? `~${isMidnightCrossing(f.start, f.end) ? '익일' : f.end}` : ''}</Text>
                  {height > 20 && (
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }} numberOfLines={1}>{f.label}</Text>
                  )}
                </View>
              );
            })}

            {/* 공부 계획 블록 (start 있는 것만) + 오늘만 임시 배치 */}
            {[
              ...(dayData.plans || []).filter(p => p.start && p.end && !(tempAssignments[p.id]?.dayKey === key && tempAssignments[p.id]?.weekOffset === weekOffset)),
              ...Object.entries(tempAssignments)
                .filter(([, v]) => v.dayKey === key && v.weekOffset === weekOffset)
                .map(([planId, times]) => {
                  const plan = (dayData.plans || []).find(p => p.id === planId);
                  return plan ? { ...plan, start: times.start, end: times.end, _tempAssigned: true } : null;
                })
                .filter(Boolean),
            ].map(p => {
              const { top, height } = blockGeometry(p.start, p.end);
              if (height < 4) return null;
              const blockColor = p.color || T.accent;
              return (
                <TouchableOpacity key={p.id}
                  style={{
                    position: 'absolute', left: 1, right: 1, top, height,
                    backgroundColor: blockColor + 'E0',
                    borderRadius: 4, borderLeftWidth: 3, borderLeftColor: blockColor,
                    paddingHorizontal: 3, paddingVertical: 2, overflow: 'hidden',
                    elevation: 2,
                  }}
                  onPress={() => setPlanSheet({ plan: p, dayKey: key })}
                >
                  <Text style={{ fontSize: 9, color: '#ffffffCC' }} numberOfLines={1}>{p.start}{height > 14 ? `~${p.end}` : ''}</Text>
                  {height > 20 && (
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }} numberOfLines={1}>{p.label}</Text>
                  )}
                </TouchableOpacity>
              );
            })}

            {/* 오늘 현재 시간 선 */}
            {isToday && nowY >= 0 && nowY <= GRID_H && (
              <View style={{ position: 'absolute', top: nowY - 1, left: -4, right: 0, flexDirection: 'row', alignItems: 'center', zIndex: 10 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: T.red }} />
                <View style={{ flex: 1, height: 2, backgroundColor: T.red }} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );

  // ── D-Day CRUD 헬퍼 ──
  const DDAY_PRESETS = [
    { label: '수능 2026', date: '2026-11-19' },
    { label: '중간고사', date: null }, { label: '기말고사', date: null }, { label: '모의고사', date: null },
  ];

  // 선택된 날짜 Set 토글
  const toggleDdDate = (dateStr) => {
    setDdSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr); else next.add(dateStr);
      return next;
    });
  };

  // 선택된 날짜들 → 정렬 배열, 시작일, 일수 계산
  const ddSortedDates = useMemo(() => [...ddSelectedDates].sort(), [ddSelectedDates]);
  const ddStartDate = ddSortedDates.length > 0 ? ddSortedDates[0] : null;
  const ddEndDate = ddSortedDates.length > 0 ? ddSortedDates[ddSortedDates.length - 1] : null;
  const ddComputedDays = ddStartDate && ddEndDate
    ? Math.round((new Date(ddEndDate + 'T00:00:00') - new Date(ddStartDate + 'T00:00:00')) / 86400000) + 1
    : 0;

  const openAddDDay = (prefillDate) => {
    setEditingDDay(null);
    setDdLabel('');
    setDdSelectedDates(prefillDate ? new Set([prefillDate]) : new Set());
    setDdPickerMonth(prefillDate ? new Date(prefillDate + 'T00:00:00') : new Date());
    setShowDDayModal(true);
  };
  const openEditDDay = (dd) => {
    setEditingDDay(dd);
    setDdLabel(dd.label);
    // 기존 date + days → 날짜 Set 복원
    const dates = new Set();
    if (dd.date) {
      const days = dd.days || 1;
      for (let i = 0; i < days; i++) {
        const d = new Date(dd.date + 'T00:00:00');
        d.setDate(d.getDate() + i);
        dates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
      setDdPickerMonth(new Date(dd.date + 'T00:00:00'));
    }
    setDdSelectedDates(dates);
    setShowDDayModal(true);
  };
  const handleSaveDDay = () => {
    if (!ddLabel.trim() || ddSelectedDates.size === 0) { app.showToastCustom('이름과 날짜를 선택하세요', 'paengi'); return; }
    const saveDate = ddStartDate;
    const saveDays = ddComputedDays;
    if (editingDDay) {
      app.updateDDay(editingDDay.id, { label: ddLabel.trim(), date: saveDate, days: saveDays });
      app.showToastCustom('일정 수정 완료!', 'taco');
    } else {
      if (app.ddays.length >= 10) { app.showToastCustom('일정은 최대 10개까지!', 'paengi'); return; }
      app.addDDay({ label: ddLabel.trim(), date: saveDate, days: saveDays });
      app.showToastCustom('일정 추가 완료!', 'taco');
    }
    setShowDDayModal(false);
  };
  const handleDeleteDDay = (dd) => {
    Alert.alert('일정 삭제', `"${dd.label}"을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => app.removeDDay(dd.id) },
    ]);
  };

  // ── 월간 캘린더 데이터 ──
  const ddPickerStr = `${ddPickerMonth.getFullYear()}.${String(ddPickerMonth.getMonth() + 1).padStart(2, '0')}`;
  const ddPickerCells = useMemo(() => {
    const y = ddPickerMonth.getFullYear(), m = ddPickerMonth.getMonth();
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    const cells = Array(first.getDay()).fill(null);
    for (let d = 1; d <= last.getDate(); d++) {
      const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, date: ds });
    }
    return cells;
  }, [ddPickerMonth]);

  // 날짜별 공부 시간 (초) 맵
  const studyByDate = useMemo(() => {
    const map = {};
    (app.sessions || []).forEach(s => {
      if (!s.date || !s.durationSec) return;
      map[s.date] = (map[s.date] || 0) + s.durationSec;
    });
    return map;
  }, [app.sessions]);

  // D-Day 날짜 셋 (시험 기간 포함)
  const ddayDateMap = useMemo(() => {
    const map = {}; // { 'YYYY-MM-DD': { label, color, isStart, isEnd, isExamRange } }
    (app.ddays || []).forEach(dd => {
      if (!dd.date) return;
      const days = dd.days || 1;
      for (let i = 0; i < days; i++) {
        const d = new Date(dd.date + 'T00:00:00');
        d.setDate(d.getDate() + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        map[ds] = { label: dd.label, isPinned: dd.isPrimary, isStart: i === 0, isEnd: i === days - 1, days };
      }
    });
    return map;
  }, [app.ddays]);

  // 월간 뷰 렌더링
  const renderMonthly = () => {
    const now = new Date();
    const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const firstDow = targetDate.getDay();

    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const cellW = Math.floor((winW - 16) / 7);
    const todayStr = getToday();
    // 선택된 날짜의 상세 정보
    const selDateStr = selectedDate;
    const selStudySec = selDateStr ? (studyByDate[selDateStr] || 0) : 0;
    const selEvents = selDateStr ? (app.ddays || []).filter(dd => {
      if (!dd.date) return false;
      const start = new Date(dd.date + 'T00:00:00');
      const end = new Date(start);
      end.setDate(end.getDate() + (dd.days || 1) - 1);
      const sel = new Date(selDateStr + 'T00:00:00');
      return sel >= start && sel <= end;
    }) : [];
    const selSessions = selDateStr ? (app.sessions || []).filter(s => s.date === selDateStr) : [];

    // 공부량 기준 색상 농도
    const getStudyDotOpacity = (dateStr) => {
      const sec = studyByDate[dateStr] || 0;
      if (sec === 0) return 0;
      if (sec < 1800) return 0.25;   // ~30분
      if (sec < 3600) return 0.45;   // ~1시간
      if (sec < 7200) return 0.65;   // ~2시간
      return 0.85;
    };

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: insets.bottom + 80 }, isTablet && { maxWidth: tabletMaxW, alignSelf: 'center', width: '100%' }]}>
        {/* 요일 헤더 */}
        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          {DAY_LABELS.map((l, i) => (
            <View key={l} style={{ width: cellW, alignItems: 'center', paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: i === 0 ? T.red : i === 6 ? T.accent : T.sub }}>{l}</Text>
            </View>
          ))}
        </View>

        {/* 날짜 셀 그리드 */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((d, idx) => {
            if (!d) return <View key={`e${idx}`} style={{ width: cellW, height: 64 }} />;
            const dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const isSel = dateStr === selectedDate;
            const dow = new Date(targetYear, targetMonth, d).getDay();
            const isPast = dateStr < todayStr;
            const ddayInfo = ddayDateMap[dateStr];
            const studyOp = getStudyDotOpacity(dateStr);
            const daysLeft = calcDDay(dateStr);

            return (
              <TouchableOpacity key={idx} activeOpacity={0.6} onPress={() => setSelectedDate(isSel ? null : dateStr)}
                onLongPress={() => { if (!isPast) openAddDDay(dateStr); }}
                style={{
                  width: cellW, height: 64, borderRadius: 8, padding: 3, marginBottom: 2,
                  backgroundColor: ddayInfo ? (T.accent + '20') : 'transparent',
                  borderWidth: isSel ? 1.5 : ddayInfo ? 1 : 0,
                  borderColor: isSel ? T.accent : ddayInfo ? (T.accent + '40') : 'transparent',
                }}>
                {/* 날짜 숫자 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                  <View style={{
                    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isToday ? T.accent : 'transparent',
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: isToday ? '800' : '600',
                      color: isToday ? '#fff' : dow === 0 ? T.red : dow === 6 ? T.accent : T.text }}>
                      {d}
                    </Text>
                  </View>
                </View>

                {/* 공부 기록 도트 (과거) */}
                {isPast && studyOp > 0 && (
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: T.accent, opacity: studyOp, marginBottom: 2 }} />
                )}

                {/* 오늘 공부 도트 */}
                {isToday && studyOp > 0 && (
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: T.accent, opacity: studyOp, marginBottom: 2 }} />
                )}

                {/* D-Day 이벤트 마커 — 모든 기간 날짜에 표시 */}
                {ddayInfo && (
                  <Text style={{ fontSize: 8, fontWeight: '800', color: T.accent, textAlign: 'center' }} numberOfLines={1}>
                    {ddayInfo.label}
                  </Text>
                )}

                {/* D-Day 임박 뱃지 (시작일에만, D-14 이내) */}
                {ddayInfo && ddayInfo.isStart && daysLeft !== null && daysLeft >= 0 && daysLeft <= 14 && (
                  <View style={{ backgroundColor: daysLeft <= 3 ? T.red : T.accent, borderRadius: 4, paddingHorizontal: 3, alignSelf: 'center', marginTop: 1 }}>
                    <Text style={{ fontSize: 7, fontWeight: '800', color: '#fff' }}>
                      {daysLeft === 0 ? 'D-Day' : `D-${daysLeft}`}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── 선택된 날짜 상세 ── */}
        {selectedDate && (
          <View style={{ marginTop: 12, backgroundColor: T.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: T.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: T.text }}>
                {(() => {
                  const d = new Date(selectedDate + 'T00:00:00');
                  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${['일','월','화','수','목','금','토'][d.getDay()]})`;
                })()}
              </Text>
              {!selectedDate || selectedDate >= todayStr ? (
                <TouchableOpacity onPress={() => openAddDDay(selectedDate)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: T.accent }}>
                  <Ionicons name="add" size={13} color="#fff" />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>일정 추가</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* 공부 기록 */}
            {selStudySec > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: T.surface, borderRadius: 8 }}>
                <Ionicons name="time-outline" size={14} color={T.accent} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.text }}>
                  공부 {Math.floor(selStudySec / 3600)}시간 {Math.round((selStudySec % 3600) / 60)}분
                </Text>
                <Text style={{ fontSize: 11, color: T.sub, marginLeft: 'auto' }}>{selSessions.length}세션</Text>
              </View>
            )}

            {/* 세션 상세 */}
            {selSessions.length > 0 && (
              <View style={{ gap: 4, marginBottom: selEvents.length > 0 ? 10 : 0 }}>
                {selSessions.map((sess, i) => {
                  const subj = (app.subjects || []).find(s => s.id === sess.subjectId);
                  return (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: subj?.color || T.accent }} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: T.text }} numberOfLines={1}>
                        {subj?.name || '과목 없음'}
                      </Text>
                      <Text style={{ fontSize: 11, color: T.sub, marginLeft: 'auto' }}>
                        {Math.round((sess.durationSec || 0) / 60)}분
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* 해당 날짜 이벤트 */}
            {selEvents.length > 0 && (
              <View style={{ gap: 6 }}>
                {selEvents.map(dd => (
                  <View key={dd.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: T.accent + '10', borderRadius: 8 }}>
                    <Ionicons name="flag" size={14} color={T.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: T.text }}>{dd.label}</Text>
                      <Text style={{ fontSize: 11, color: T.sub }}>{dd.date}{dd.days > 1 ? ` (${dd.days}일간)` : ''} · {formatDDay(dd.date)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => openEditDDay(dd)} style={{ padding: 4 }}>
                      <Ionicons name="pencil-outline" size={14} color={T.sub} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* 아무 데이터도 없을 때 */}
            {selStudySec === 0 && selEvents.length === 0 && (
              <Text style={{ fontSize: 13, color: T.sub, textAlign: 'center', paddingVertical: 8 }}>
                {selectedDate < todayStr ? '공부 기록이 없어요' : '등록된 일정이 없어요'}
              </Text>
            )}
          </View>
        )}

        {/* ── D-Day 이벤트 목록 ── */}
        <View style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: T.text }}>일정 · D-Day</Text>
            <TouchableOpacity onPress={() => openAddDDay(null)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20, backgroundColor: T.accent }}>
              <Ionicons name="add" size={14} color="#fff" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>추가</Text>
            </TouchableOpacity>
          </View>

          {(app.ddays || []).length === 0 && (
            <View style={{ paddingVertical: 24, alignItems: 'center', backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border }}>
              <Ionicons name="calendar-outline" size={32} color={T.sub} />
              <Text style={{ fontSize: 13, color: T.sub, marginTop: 8 }}>등록된 일정이 없어요</Text>
              <Text style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>시험, 모의고사 등 중요 일정을 추가해보세요</Text>
            </View>
          )}

          {(app.ddays || []).sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(dd => {
            const days = calcDDay(dd.date);
            const isPast = days !== null && days < 0;
            const isUrgent = days !== null && days >= 0 && days <= 14;
            return (
              <View key={dd.id} style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6,
                backgroundColor: T.card, borderRadius: 12, borderWidth: 1,
                borderColor: isUrgent ? T.accent + '60' : T.border,
                opacity: isPast ? 0.5 : 1,
              }}>
                {/* 고정(핀) 토글 */}
                <TouchableOpacity onPress={() => app.setPrimaryDDay(dd.id)}>
                  <Ionicons name={dd.isPrimary ? 'star' : 'star-outline'} size={18} color={dd.isPrimary ? T.gold : T.sub} />
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }}>{dd.label}</Text>
                  <Text style={{ fontSize: 11, color: T.sub }}>{dd.date}{dd.days > 1 ? ` · ${dd.days}일간` : ''}</Text>
                </View>

                {/* D-Day 뱃지 */}
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
                  backgroundColor: days === 0 ? T.red : isUrgent ? T.accent : T.surface,
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: days === 0 || isUrgent ? '#fff' : T.text }}>
                    {formatDDay(dd.date)}
                  </Text>
                </View>

                {/* 편집/삭제 */}
                <TouchableOpacity onPress={() => openEditDDay(dd)} style={{ padding: 4 }}>
                  <Ionicons name="pencil-outline" size={14} color={T.sub} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteDDay(dd)} style={{ padding: 4 }}>
                  <Ionicons name="close-circle-outline" size={16} color={T.red} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  };

  // 미배치 계획 (start 없는 plans) 패널
  const unscheduledPlans = useMemo(() => {
    const result = {};
    DAY_KEYS.forEach(key => {
      const plans = (getDayData(key).plans || []).filter(p => !p.start);
      if (plans.length > 0) result[key] = plans;
    });
    return result;
  }, [getDayData, app.weeklySchedule]);

  const hasUnscheduled = Object.keys(unscheduledPlans).length > 0;

  // 오늘 타임라인 아이템 (고정 + 시간배치 계획 + 오늘만 임시배치, 시간순)
  const todayAllItems = useMemo(() => {
    const dayData = getDayData(todayKey);
    const tempPlans = Object.entries(tempAssignments)
      .filter(([, v]) => v.dayKey === todayKey && v.weekOffset === 0)
      .map(([planId, times]) => {
        const plan = (dayData.plans || []).find(p => p.id === planId);
        return plan ? { ...plan, start: times.start, end: times.end, itemType: 'plan', _tempAssigned: true } : null;
      }).filter(Boolean);
    return [
      ...(dayData.fixed || []).map(f => ({ ...f, itemType: 'fixed' })),
      ...(dayData.plans || []).filter(p => p.start && p.end && !(tempAssignments[p.id]?.dayKey === todayKey && tempAssignments[p.id]?.weekOffset === 0)).map(p => ({ ...p, itemType: 'plan' })),
      ...tempPlans,
    ].sort((a, b) => parseTimeToMin(a.start) - parseTimeToMin(b.start));
  }, [getDayData, todayKey, app.weeklySchedule, tempAssignments]);

  // 특정 요일의 빈 시간 슬롯 계산 (30분 이상)
  const getDayFreeSlots = useCallback((dayKey) => {
    const dd = getDayData(dayKey);
    const items = [
      ...(dd.fixed || []).map(f => ({ ...f })),
      ...(dd.plans || []).filter(p => p.start && p.end).map(p => ({ ...p })),
    ].sort((a, b) => parseTimeToMin(a.start) - parseTimeToMin(b.start));
    const MIN_GAP = 30;
    const slots = [];
    let prevEnd = null;
    for (const item of items) {
      const s = parseTimeToMin(item.start);
      const e = isMidnightCrossing(item.start, item.end) ? 24 * 60 : parseTimeToMin(item.end);
      if (prevEnd !== null && s - prevEnd >= MIN_GAP) {
        slots.push({ start: minToStr(prevEnd), end: minToStr(s), durationMin: s - prevEnd });
      }
      prevEnd = prevEnd === null ? e : Math.max(prevEnd, e);
    }
    if (prevEnd !== null && 24 * 60 - prevEnd >= MIN_GAP) {
      slots.push({ start: minToStr(prevEnd), end: '24:00', durationMin: 24 * 60 - prevEnd });
    }
    return slots;
  }, [getDayData]);


  // 주간 제목 문자열
  const weekTitle = useMemo(() => {
    const dates = weekDates;
    const first = dates[0];
    const last  = dates[6];
    if (first.getMonth() === last.getMonth()) {
      return `${first.getFullYear()}년 ${first.getMonth() + 1}월`;
    }
    return `${first.getMonth() + 1}월 ~ ${last.getMonth() + 1}월`;
  }, [weekDates]);

  const monthTitle = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  }, [monthOffset]);

  // ─── 오늘 뷰 렌더링 ───
  const renderToday = () => {
    const dayData = getDayData(todayKey);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const allItems = todayAllItems;
    const unscheduled = (dayData.plans || []).filter(p => !p.start && !(tempAssignments[p.id]?.dayKey === todayKey && tempAssignments[p.id]?.weekOffset === 0));

    // 전체 진행률
    const plansWithTarget = (dayData.plans || []).filter(p => (p.targetMin || 0) > 0);
    const totalTargetSec = plansWithTarget.reduce((sum, p) => sum + p.targetMin * 60, 0);
    const totalDoneSec = plansWithTarget.reduce((sum, p) => {
      const done = app.getPlanCompletedSec?.(p.id) || 0;
      const running = (app.timers || []).find(t => t.planId === p.id && (t.status === 'running' || t.status === 'paused'));
      return sum + done + (running ? running.elapsedSec : 0);
    }, 0);
    const overallPct = totalTargetSec > 0 ? Math.min(1, totalDoneSec / totalTargetSec) : 0;
    const totalDoneMin = Math.round(totalDoneSec / 60);
    const totalTargetMin = Math.round(totalTargetSec / 60);
    const remainMin = Math.max(0, totalTargetMin - totalDoneMin);

    const dateStr = `${now.getMonth() + 1}월 ${now.getDate()}일 ${['일', '월', '화', '수', '목', '금', '토'][now.getDay()]}요일`;

    const nowLabel = `${String(Math.floor(nowMin/60)).padStart(2,'0')}:${String(nowMin%60).padStart(2,'0')}`;

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[{ padding: 16 }, isTablet && { maxWidth: tabletMaxW, alignSelf: 'center', width: '100%' }]}>

        {/* ── 헤더: 날짜 + 진행률 통합 카드 ── */}
        <View style={{
          backgroundColor: T.card, borderRadius: T.cardRadius,
          padding: 16, borderWidth: 1, borderColor: T.border, marginBottom: 16,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: totalTargetSec > 0 ? 10 : 0 }}>
            <Text style={{ fontSize: 17, fontWeight: '900', color: T.text }}>{dateStr}</Text>
            {totalTargetSec > 0 && (
              <Text style={{ fontSize: 28, fontWeight: '900', color: overallPct >= 1 ? T.green : T.accent, lineHeight: 32 }}>
                {Math.round(overallPct * 100)}%
              </Text>
            )}
          </View>
          {totalTargetSec > 0 && (
            <>
              <View style={{ height: 8, backgroundColor: T.surface, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                <View style={{ height: 8, width: `${Math.round(overallPct * 100)}%`, backgroundColor: overallPct >= 1 ? T.green : T.accent, borderRadius: 4 }} />
              </View>
              <Text style={{ fontSize: 12, color: T.sub }}>
                {totalDoneMin}분 완료 · {totalTargetMin}분 목표
                {remainMin > 0 ? `  ·  ${remainMin}분 남음` : '  ·  🎉 달성!'}
              </Text>
            </>
          )}
        </View>

        {/* ── 첫 방문 안내 카드 ── */}
        {!app.settings.plannerGuideSeen && (
          <View style={{
            backgroundColor: T.accent + '12', borderRadius: T.cardRadius,
            borderWidth: 1.5, borderColor: T.accent + '40',
            padding: 14, marginBottom: 14,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Ionicons name="calendar-outline" size={20} color={T.accent} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: T.accent, marginBottom: 4 }}>
                  학교급에 맞는 기본 시간표가 설정됐어요!
                </Text>
                <Text style={{ fontSize: 12, color: T.text, lineHeight: 18 }}>
                  주간 탭에서 시간표를 확인하고, 하단 <Text style={{ fontWeight: '800' }}>⚙ 편집</Text> 버튼으로 내 일정에 맞게 수정해보세요.
                </Text>
                <TouchableOpacity
                  onPress={() => { setShowScheduleEditor(true); app.updateSettings({ plannerGuideSeen: true }); }}
                  style={{
                    marginTop: 10, paddingVertical: 7, paddingHorizontal: 14,
                    backgroundColor: T.accent, borderRadius: 10,
                    alignSelf: 'flex-start',
                  }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>⚙ 지금 편집하기</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => app.updateSettings({ plannerGuideSeen: true })}
                style={{ padding: 2 }}>
                <Ionicons name="close" size={18} color={T.sub} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── 일정 없음 ── */}
        {allItems.length === 0 && unscheduled.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Ionicons name="calendar-outline" size={48} color={T.sub + '40'} />
            <Text style={{ fontSize: 15, color: T.sub, marginTop: 12 }}>오늘 일정이 없어요</Text>
            <TouchableOpacity onPress={() => setViewMode('weekly')} style={{ marginTop: 12,
              paddingHorizontal: 16, paddingVertical: 8, backgroundColor: T.accent, borderRadius: 20 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>주간 시간표에서 추가하기</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 타임라인 리스트 ── */}
        {allItems.map((item, idx) => {
          const startMin = parseTimeToMin(item.start);
          const endMin = isMidnightCrossing(item.start, item.end) ? 24 * 60 : parseTimeToMin(item.end);
          const isPast = endMin <= nowMin;
          const isCurrent = startMin <= nowMin && nowMin < endMin;
          const isFixed = item.itemType === 'fixed';
          const blockColor = item.color || (isFixed ? '#95A5A6' : T.accent);

          // 계획 진행률
          let doneSec = 0, targetSec = 0, pct = 0, isDone = false, isRunning = false, runningSec = 0;
          if (!isFixed) {
            doneSec = app.getPlanCompletedSec?.(item.id) || 0;
            targetSec = (item.targetMin || 0) * 60;
            const runningTimer = (app.timers || []).find(t => t.planId === item.id && (t.status === 'running' || t.status === 'paused'));
            runningSec = runningTimer ? runningTimer.elapsedSec : 0;
            const currentSec = doneSec + runningSec;
            pct = targetSec > 0 ? Math.min(1, currentSec / targetSec) : 0;
            isDone = pct >= 1;
            isRunning = !!runningTimer;
          }

          const prevEnd = idx > 0 ? (isMidnightCrossing(allItems[idx-1].start, allItems[idx-1].end) ? 24*60 : parseTimeToMin(allItems[idx-1].end)) : 0;
          const showNowLine = !isPast && startMin > nowMin && prevEnd <= nowMin;
          const prevItemEnd = idx > 0
            ? (isMidnightCrossing(allItems[idx-1].start, allItems[idx-1].end) ? 24*60 : parseTimeToMin(allItems[idx-1].end))
            : null;
          const gapMin = prevItemEnd !== null ? startMin - prevItemEnd : 0;

          return (
            <React.Fragment key={item.id}>

              {/* 빈 시간 구분 */}
              {gapMin >= 30 && !showNowLine && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 4 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: T.border }} />
                  <Text style={{ fontSize: 10, color: T.sub, marginHorizontal: 8, opacity: 0.7 }}>
                    {gapMin >= 60
                      ? `${Math.floor(gapMin/60)}시간${gapMin%60>0?` ${gapMin%60}분`:''} 여유`
                      : `${gapMin}분 여유`}
                  </Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: T.border }} />
                </View>
              )}

              {/* 지금 구분선 (pill 형태) */}
              {showNowLine && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 8 }}>
                  <View style={{ flex: 1, height: 1.5, backgroundColor: T.red + '50' }} />
                  <View style={{ backgroundColor: T.red, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, marginHorizontal: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>지금 {nowLabel}</Text>
                  </View>
                  <View style={{ flex: 1, height: 1.5, backgroundColor: T.red + '50' }} />
                </View>
              )}

              <TouchableOpacity
                activeOpacity={isFixed ? 1 : 0.75}
                onPress={isFixed ? undefined : () => setPlanSheet({ plan: item, dayKey: todayKey })}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: isCurrent ? blockColor + '14' : (isDone ? T.surface : T.card),
                  borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, marginBottom: 6,
                  borderWidth: isCurrent ? 2 : 1,
                  borderColor: isCurrent ? blockColor + '80' : T.border,
                  borderLeftWidth: 4,
                  borderLeftColor: blockColor,
                  opacity: isPast && !isCurrent ? 0.45 : 1,
                }}
              >
                {/* 시간 컬럼 */}
                <View style={{ width: 52, marginRight: 10 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '800', color: isCurrent ? blockColor : (isPast ? T.sub : T.text) }}>
                    {item.start}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 10, color: T.sub }}>
                    {isMidnightCrossing(item.start, item.end) ? '익일' + item.end : item.end}
                  </Text>
                </View>

                {/* 정보 영역 */}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {isFixed && (
                      <View style={{ backgroundColor: T.surface, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 }}>
                        <Text style={{ fontSize: 9, color: T.sub, fontWeight: '700' }}>고정</Text>
                      </View>
                    )}
                    {isRunning && (
                      <View style={{ backgroundColor: T.red, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 }}>
                        <Text style={{ fontSize: 9, color: '#fff', fontWeight: '700' }}>🔥 실행 중</Text>
                      </View>
                    )}
                    {isDone && !isRunning && <Ionicons name="checkmark-circle" size={13} color={T.green} />}
                    <Text style={{
                      fontSize: 14, fontWeight: '700', flex: 1,
                      color: isDone ? T.sub : (isPast ? T.sub : T.text),
                      textDecorationLine: isDone ? 'line-through' : 'none',
                    }} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </View>

                  {/* 진행률 바 + 시간 */}
                  {!isFixed && targetSec > 0 && (
                    <View style={{ marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ flex: 1, height: 3, backgroundColor: T.surface, borderRadius: 2, overflow: 'hidden' }}>
                          <View style={{ height: 3, width: `${Math.min(100, Math.round(pct * 100))}%`, backgroundColor: isDone ? T.green : blockColor, borderRadius: 2 }} />
                        </View>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: isDone ? T.green : T.sub, minWidth: 24, textAlign: 'right' }}>
                          {Math.round(pct * 100)}%
                        </Text>
                      </View>
                      <Text style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>
                        {(() => {
                          const curSec = doneSec + runningSec;
                          const doneM = Math.floor(curSec / 60);
                          const targetM = Math.round(targetSec / 60);
                          const remainM = Math.max(0, targetM - doneM);
                          return isDone ? `${doneM}분 완료` : `${doneM}분 / ${targetM}분${remainM > 0 ? ` · 남은 ${remainM}분` : ''}`;
                        })()}
                      </Text>
                    </View>
                  )}
                </View>

                {/* 액션 버튼 */}
                {!isFixed && !isDone && !isRunning && (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation?.();
                      const hasRunning = (app.timers || []).some(t => t.status === 'running' || t.status === 'paused');
                      if (hasRunning) { app.showToastCustom?.('타이머가 이미 실행 중이에요!', 'toru'); return; }
                      app.startFromPlan?.(item);
                      navigation.navigate('Focus');
                    }}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: blockColor,
                      alignItems: 'center', justifyContent: 'center', marginLeft: 8,
                    }}>
                    <Ionicons name="play" size={14} color="#fff" />
                  </TouchableOpacity>
                )}
                {isRunning && (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('Focus')}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: T.red,
                      alignItems: 'center', justifyContent: 'center', marginLeft: 8,
                    }}>
                    <Ionicons name="eye-outline" size={14} color="#fff" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </React.Fragment>
          );
        })}

        {/* 마지막 항목 뒤 "지금" 구분선 */}
        {allItems.length > 0 && (() => {
          const lastEnd = isMidnightCrossing(allItems[allItems.length-1].start, allItems[allItems.length-1].end)
            ? 24*60 : parseTimeToMin(allItems[allItems.length-1].end);
          if (lastEnd <= nowMin) return (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 8 }}>
              <View style={{ flex: 1, height: 1.5, backgroundColor: T.red + '50' }} />
              <View style={{ backgroundColor: T.red, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, marginHorizontal: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>지금 {nowLabel}</Text>
              </View>
              <View style={{ flex: 1, height: 1.5, backgroundColor: T.red + '50' }} />
            </View>
          );
          return null;
        })()}

        {/* ── 시간 미배치 계획 ── */}
        {unscheduled.length > 0 && (
          <View style={{ marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: T.border }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub }}>시간 미배치</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: T.border }} />
            </View>
            {unscheduled.map((p) => {
              const doneSec = app.getPlanCompletedSec?.(p.id) || 0;
              const runningT = (app.timers || []).find(t => t.planId === p.id && (t.status === 'running' || t.status === 'paused'));
              const curSec = doneSec + (runningT ? runningT.elapsedSec : 0);
              const targetSec = (p.targetMin || 0) * 60;
              const pct = targetSec > 0 ? Math.min(1, curSec / targetSec) : 0;
              const isDone = pct >= 1;
              const pc = p.color || T.accent;
              return (
                <View key={p.id} style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: T.card, borderRadius: 10,
                  paddingVertical: 9, paddingHorizontal: 10, marginBottom: 6,
                  borderWidth: 1, borderColor: T.border,
                  borderLeftWidth: 4, borderLeftColor: pc,
                  borderStyle: 'dashed',
                }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: T.text, marginBottom: p.targetMin > 0 ? 3 : 0 }} numberOfLines={1}>{p.label}</Text>
                    {p.targetMin > 0 && (
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <View style={{ flex: 1, height: 3, backgroundColor: T.surface, borderRadius: 2, overflow: 'hidden' }}>
                            <View style={{ height: 3, width: `${Math.round(pct * 100)}%`, backgroundColor: isDone ? T.green : pc, borderRadius: 2 }} />
                          </View>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: isDone ? T.green : T.sub }}>{Math.round(pct * 100)}%</Text>
                        </View>
                        <Text style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>
                          {(() => {
                            const doneM = Math.floor(curSec / 60);
                            const targetM = p.targetMin;
                            const remainM = Math.max(0, targetM - doneM);
                            return isDone ? `${doneM}분 완료` : `${doneM}분 / ${targetM}분${remainM > 0 ? ` · 남은 ${remainM}분` : ''}`;
                          })()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 5, marginLeft: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        const hasRunning = (app.timers || []).some(t => t.status === 'running' || t.status === 'paused');
                        if (hasRunning) { app.showToastCustom?.('타이머가 이미 실행 중이에요!', 'toru'); return; }
                        app.startFromPlan?.(p);
                        navigation.navigate('Focus');
                      }}
                      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5, borderColor: pc }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: pc }}>실행</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setQuickAssignPlan({ plan: p, dayKey: todayKey })}
                      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: pc }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>배치</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 주간 시간표 링크 */}
        <TouchableOpacity onPress={() => setViewMode('weekly')} style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          paddingVertical: 18, marginTop: 4, gap: 6,
        }}>
          <Ionicons name="calendar-outline" size={16} color={T.accent} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: T.accent }}>주간 시간표 보기</Text>
          <Ionicons name="chevron-forward" size={14} color={T.accent} />
        </TouchableOpacity>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar barStyle={T.text === '#E8E8F2' ? 'light-content' : 'dark-content'} />
      <RunningTimersBar />

      {/* 상단 헤더 — 월간일 때만 네비게이션 표시 (주간은 renderWeekHeader에 통합) */}
      {viewMode === 'monthly' && (
        <View style={[{ backgroundColor: T.card, borderBottomWidth: 1, borderBottomColor: T.border, paddingHorizontal: 16, paddingVertical: 8 }, isTablet && { alignItems: 'center' }]}>
          <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, isTablet && { maxWidth: tabletMaxW, width: '100%' }]}>
            <TouchableOpacity
              onPress={() => setMonthOffset(p => p - 1)}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={18} color={T.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, alignItems: 'center' }}
              disabled={monthOffset === 0}
              onPress={() => setMonthOffset(0)}
            >
              <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>{monthTitle}</Text>
              {monthOffset !== 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: T.accent, borderRadius: 12 }}>
                  <Ionicons name="today-outline" size={10} color="#fff" />
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>오늘로 이동</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: T.accent + '18', borderRadius: 12 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: T.accent }} />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: T.accent }}>이번 달</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMonthOffset(p => p + 1)}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-forward" size={18} color={T.text} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 오늘 뷰 */}
      {viewMode === 'today' && renderToday()}

      {/* 주간 뷰 */}
      {viewMode === 'weekly' && (
        <>
          {renderWeekHeader()}
          <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {renderGrid()}
            {/* ③ 미배치 계획 — 요일별 컬럼 */}
            {hasUnscheduled && (
              <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.card }}>
                <View style={{ width: TIME_COL_W, paddingTop: 6, alignItems: 'flex-end', paddingRight: 4 }}>
                  <Text style={{ fontSize: 8, color: T.sub, fontWeight: '600' }}>미배치</Text>
                </View>
                {DAY_KEYS.map((key) => {
                  const plans = (unscheduledPlans[key] || []).filter(p => !(tempAssignments[p.id]?.dayKey === key && tempAssignments[p.id]?.weekOffset === weekOffset));
                  const past = isPastDay(key);
                  return (
                    <View key={key} style={{
                      width: DAY_W, borderLeftWidth: 1, borderLeftColor: T.border + '60',
                      paddingHorizontal: 2, paddingVertical: 4, gap: 3,
                    }}>
                      {plans.map(p => (
                        past ? (
                          // 지난 요일: 비활성 표시만
                          <View key={p.id} style={{
                            paddingHorizontal: 3, paddingVertical: 3, borderRadius: 4,
                            backgroundColor: T.surface,
                            borderLeftWidth: 2, borderLeftColor: T.border,
                            opacity: 0.4,
                          }}>
                            <Text style={{ fontSize: 9, fontWeight: '600', color: T.sub, textDecorationLine: 'line-through' }} numberOfLines={1}>
                              {p.label}
                            </Text>
                            <Text style={{ fontSize: 8, color: T.sub }}>{p.targetMin}분</Text>
                          </View>
                        ) : (
                          // 오늘·미래 요일: 빈 시간 추천
                          <TouchableOpacity key={p.id}
                            onPress={() => setQuickAssignPlan({ plan: p, dayKey: key })}
                            style={{
                              paddingHorizontal: 3, paddingVertical: 3, borderRadius: 4,
                              backgroundColor: (p.color || T.accent) + '22',
                              borderLeftWidth: 2, borderLeftColor: p.color || T.accent,
                            }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: p.color || T.accent }} numberOfLines={1}>
                              {p.label}
                            </Text>
                            <Text style={{ fontSize: 8, color: T.sub }}>{p.targetMin}분</Text>
                          </TouchableOpacity>
                        )
                      ))}
                    </View>
                  );
                })}
              </View>
            )}
            <View style={{ height: insets.bottom + 20 }} />
          </ScrollView>
        </>
      )}

      {/* 월간 뷰 */}
      {viewMode === 'monthly' && renderMonthly()}

      {/* 블록 추가/수정 모달 (공부계획 전용) */}
      {modal && (
        <BlockModal
          visible={!!modal}
          onClose={() => setModal(null)}
          onSave={(block) => {
            if (modal.tempOnly) {
              // 오늘만 임시 배치
              setTempAssignments(prev => ({ ...prev, [block.id]: { start: block.start, end: block.end, dayKey: modal.dayKey, weekOffset } }));
              setModal(null);
            } else {
              handleSave({ dayKey: modal.dayKey, block });
            }
          }}
          onDelete={(id, type) => handleDelete(modal.dayKey, id, type)}
          initial={modal.initial ? modal.initial : (modal.prefill ? { ...modal.prefill, blockType: 'plan' } : null)}
          subjects={app.subjects || []}
          T={T}
          planOnly
          minStartTime={
            (modal.dayKey === todayKey && weekOffset === 0) ? getNowTimeStr() : undefined
          }
        />
      )}

      {/* 공부계획 실행 바텀시트 */}
      <PlanActionSheet
        visible={!!planSheet}
        plan={planSheet?.plan}
        isToday={planSheet?.dayKey === todayKey && weekOffset === 0}
        onClose={() => setPlanSheet(null)}
        onEdit={() => {
          const p = planSheet.plan;
          const dk = planSheet.dayKey;
          setPlanSheet(null);
          setModal({ dayKey: dk, initial: { ...p, blockType: 'plan' } });
        }}
        onStart={() => {
          const hasRunning = (app.timers || []).some(t => t.status === 'running' || t.status === 'paused');
          if (hasRunning) {
            app.showToastCustom?.('타이머가 이미 실행 중이에요!', 'toru');
            return;
          }
          app.startFromPlan?.(planSheet.plan);
          setPlanSheet(null);
          navigation.navigate('Focus');
        }}
        T={T}
        getPlanCompletedSec={app.getPlanCompletedSec}
      />

      <QuickAssignSheet
        visible={!!quickAssignPlan}
        plan={quickAssignPlan?.plan}
        freeSlots={quickAssignPlan ? getDayFreeSlots(quickAssignPlan.dayKey) : []}
        // 오늘이면 현재 시각 이후만, 미래 요일이면 전체 표시
        nowMin={quickAssignPlan?.dayKey === todayKey ? new Date().getHours() * 60 + new Date().getMinutes() : 0}
        onClose={() => setQuickAssignPlan(null)}
        onAssignToday={(plan, start, end) => {
          if (start && end) {
            setTempAssignments(prev => ({ ...prev, [plan.id]: { start, end, dayKey: quickAssignPlan.dayKey, weekOffset } }));
          }
          setQuickAssignPlan(null);
        }}
        onManual={() => {
          const isToday = quickAssignPlan.dayKey === todayKey && weekOffset === 0;
          const defaultStart = isToday ? getNowTimeStr() : '08:00';
          setModal({
            dayKey: quickAssignPlan.dayKey,
            tempOnly: true,
            initial: { ...quickAssignPlan.plan, blockType: 'plan', start: defaultStart,
              end: minToStr(Math.min(parseTimeToMin(defaultStart) + (quickAssignPlan.plan.targetMin || 60), 24 * 60)) },
          });
          setQuickAssignPlan(null);
        }}
        T={T}
      />

      {/* ── 하단 세그먼트 바: 오늘 / 주간 / 월간 / 편집 ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: T.card, borderTopWidth: 1, borderTopColor: T.border,
        paddingHorizontal: 12, paddingTop: 6,
        paddingBottom: Platform.OS === 'android' ? 6 : Math.max(insets.bottom, 6),
        gap: 6,
      }}>
        {[
          { id: 'today', label: '오늘', icon: 'today-outline' },
          { id: 'weekly', label: '주간', icon: 'calendar-outline' },
          { id: 'monthly', label: '월간', icon: 'grid-outline' },
        ].map(m => {
          const sel = viewMode === m.id;
          return (
            <TouchableOpacity key={m.id} onPress={() => setViewMode(m.id)} style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
              paddingVertical: 8, borderRadius: 10,
              backgroundColor: sel ? T.accent : 'transparent',
            }}>
              <Ionicons name={m.icon} size={15} color={sel ? '#fff' : T.sub} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? '#fff' : T.sub }}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity onPress={() => setShowScheduleEditor(true)} style={{
          width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
          backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
        }}>
          <Ionicons name="settings-outline" size={18} color={T.accent} />
        </TouchableOpacity>
      </View>

      {/* 주간 플래너 편집 모달 */}
      <ScheduleEditorScreen visible={showScheduleEditor} onClose={() => setShowScheduleEditor(false)} />

      {/* ── D-Day 추가/수정 모달 ── */}
      <Modal visible={showDDayModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={[{ backgroundColor: T.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: T.border, maxHeight: '85%' }, isTablet && { maxWidth: 540, alignSelf: 'center', width: '100%' }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Ionicons name="calendar-outline" size={18} color={T.accent} />
                <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>{editingDDay ? '일정 수정' : '일정 추가'}</Text>
              </View>

              {/* 프리셋 */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {DDAY_PRESETS.map(p => (
                  <TouchableOpacity key={p.label}
                    style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: ddLabel === p.label ? T.accent : T.border }}
                    onPress={() => { setDdLabel(p.label); if (p.date) { setDdSelectedDates(new Set([p.date])); const d = new Date(p.date + 'T00:00:00'); setDdPickerMonth(new Date(d.getFullYear(), d.getMonth(), 1)); } }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: ddLabel === p.label ? T.accent : T.sub }}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 이름 입력 */}
              <TextInput value={ddLabel} onChangeText={setDdLabel} placeholder="이름 (예: 중간고사)" placeholderTextColor={T.sub} maxLength={15}
                style={{ borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, color: T.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8 }} />

              {/* 캘린더 피커 (다중 선택) */}
              <View style={{ backgroundColor: T.surface, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: T.border, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <TouchableOpacity onPress={() => setDdPickerMonth(p => { const d = new Date(p); d.setMonth(d.getMonth() - 1); return d; })}>
                    <Text style={{ color: T.accent, fontSize: 16, paddingHorizontal: 8 }}>◀</Text>
                  </TouchableOpacity>
                  <Text style={{ color: T.text, fontSize: 14, fontWeight: '800' }}>{ddPickerStr}</Text>
                  <TouchableOpacity onPress={() => setDdPickerMonth(p => { const d = new Date(p); d.setMonth(d.getMonth() + 1); return d; })}>
                    <Text style={{ color: T.accent, fontSize: 16, paddingHorizontal: 8 }}>▶</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                  {'일월화수목금토'.split('').map(d => <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: T.sub, fontWeight: '600' }}>{d}</Text>)}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {ddPickerCells.map((cell, i) => {
                    if (!cell) return <View key={`e${i}`} style={{ width: '14.28%', height: 32 }} />;
                    const sel = ddSelectedDates.has(cell.date);
                    // 시작~끝 사이 범위 표시
                    const inRange = ddStartDate && ddEndDate && cell.date >= ddStartDate && cell.date <= ddEndDate;
                    return (
                      <TouchableOpacity key={cell.date} style={{ width: '14.28%', height: 32, alignItems: 'center', justifyContent: 'center' }}
                        onPress={() => toggleDdDate(cell.date)}>
                        <View style={[
                          { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
                          sel && { backgroundColor: T.accent },
                          !sel && inRange && { backgroundColor: T.accent + '25' },
                        ]}>
                          <Text style={{ fontSize: 13, fontWeight: sel ? '800' : '500', color: sel ? 'white' : T.text }}>{cell.day}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* 선택된 날짜 요약 */}
              {ddSelectedDates.size > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: T.accent + '15' }}>
                    <Ionicons name="calendar" size={12} color={T.accent} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: T.accent }}>
                      {ddSelectedDates.size === 1
                        ? ddStartDate
                        : `${ddStartDate} ~ ${ddEndDate} (${ddComputedDays}일)`}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setDdSelectedDates(new Set())}
                    style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub }}>초기화</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* 버튼 */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: T.border, alignItems: 'center' }}
                  onPress={() => { setShowDDayModal(false); setEditingDDay(null); }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: T.sub }}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: T.accent, alignItems: 'center' }}
                  onPress={handleSaveDDay}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{editingDDay ? '수정' : '추가'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
