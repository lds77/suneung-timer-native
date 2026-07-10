// src/screens/focus/TodoFormSheet.js
// 할일 추가/수정 통합 바텀시트 — 자주 쓰는 것(내용/과목/목록/날짜)만 항상 노출하고
// 반복/우선순위/메모는 요약 칩으로 접어 탭하면 펼치는 구조. 폼 상태는 시트가 소유하고
// visible 시 initial로 초기화, 저장 시 onSave(fields)로 전달만 한다 (데이터 로직은 TodoSection).
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Keyboard, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dateChipLabel, buildMonthCells, DAYS_KR } from '../../utils/todoUtils';

const PRIORITIES = [
  { id: 'high', label: '중요', color: '#E17055' },
  { id: 'normal', label: '보통', color: '#4A90D9' },
  { id: 'low', label: '낮음', color: '#8E9AAF' },
];
const REPEATS = [
  { id: 'none', label: '안 함' }, { id: 'daily', label: '매일' },
  { id: 'weekday', label: '주중' }, { id: 'weekend', label: '주말' }, { id: 'custom', label: '직접선택' },
];
const WEEKDAYS = [{ d: 1, l: '월' }, { d: 2, l: '화' }, { d: 3, l: '수' }, { d: 4, l: '목' }, { d: 5, l: '금' }, { d: 6, l: '토' }, { d: 0, l: '일' }];
const MEMO_TAGS = ['오답', '개념 부족', '재풀이', '암기 필요', '계산 실수', '시간 초과'];

// 라벨 + 가로스크롤 칩 한 줄 — 컴포넌트 내부 정의 금지 (렌더마다 타입이 바뀌어 리마운트됨)
const Row = ({ T, label, children }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
    <Text style={{ width: 42, fontSize: 13, fontWeight: '700', color: T.sub }}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      style={{ flex: 1 }} contentContainerStyle={{ gap: 6, alignItems: 'center', paddingRight: 4 }}>
      {children}
    </ScrollView>
  </View>
);

// todo의 repeatDays → 반복 타입 역산 (수정 진입 시)
const deriveRepeatType = (rDays) => {
  if (!rDays || rDays.length === 0) return 'none';
  if (rDays.length === 7) return 'daily';
  if (rDays.length === 5 && !rDays.includes(0) && !rDays.includes(6)) return 'weekday';
  if (rDays.length === 2 && rDays.includes(0) && rDays.includes(6)) return 'weekend';
  return 'custom';
};

export default function TodoFormSheet({
  visible, mode, initial, onSave, onClose,
  app, T, S, isTablet, sheetMaxW,
  todoLists, todayLabel, examLabel, todoDateToday, todoDateChoices,
}) {
  const [text, setText] = useState('');
  const [subjectId, setSubjectId] = useState(null);
  const [subjectLabel, setSubjectLabel] = useState(null);
  const [subjectColor, setSubjectColor] = useState(null);
  const [scope, setScope] = useState('today');
  const [dueDate, setDueDate] = useState(null);
  const [ddayId, setDdayId] = useState(null);
  const [repeatType, setRepeatType] = useState('none');
  const [customDays, setCustomDays] = useState([]);
  const [priority, setPriority] = useState('normal');
  const [memo, setMemo] = useState('');
  const [expanded, setExpanded] = useState(null); // 'repeat' | 'priority' | 'memo' | null
  const [showCalendar, setShowCalendar] = useState(false); // 날짜 임의 선택 달력
  const [calMonth, setCalMonth] = useState(null); // 달력 표시 중인 달의 1일 Date

  // 열릴 때 initial로 초기화 (수정: 기존 todo 값, 추가: 인라인 이월 텍스트 + 현재 필터 목록)
  useEffect(() => {
    if (!visible) return;
    const i = initial || {};
    const rType = deriveRepeatType(i.repeatDays);
    setText(i.text ?? '');
    setSubjectId(i.subjectId ?? null);
    setSubjectLabel(i.subjectLabel ?? null);
    setSubjectColor(i.subjectColor ?? null);
    const validScope = i.scope === 'exam' || todoLists.some(l => l.id === i.scope) ? i.scope : 'today';
    setScope(validScope);
    setDueDate(i.dueDate ?? null);
    setDdayId(i.ddayId ?? null);
    setRepeatType(rType);
    setCustomDays(rType === 'custom' ? i.repeatDays : []);
    setPriority(i.priority ?? 'normal');
    setMemo(i.memo ?? '');
    // 기존 값이 있는 접힌 섹션은 펼친 채로 시작 (수정 시 안 보이면 없는 줄 알게 됨)
    setExpanded(i.memo ? 'memo' : rType !== 'none' ? 'repeat' : null);
    setShowCalendar(false);
    const base = new Date((i.dueDate || todoDateToday) + 'T00:00:00');
    setCalMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const submit = () => {
    if (!text.trim()) return;
    onSave({
      text: text.trim(), subjectId, subjectLabel, subjectColor,
      scope, dueDate, ddayId, repeatType, customDays, priority, memo,
    });
  };

  // 공통 칩 스타일 — 시트 내 모든 선택 UI 통일 (모서리 14 / 세로 6 / 폰트 13)
  const chipStyle = (sel, color = T.accent) => ({
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, alignItems: 'center',
    backgroundColor: sel ? color + '20' : T.surface2, borderColor: sel ? color : T.border,
  });
  const chipText = (sel, color = T.accent) => ({ fontSize: 13, fontWeight: sel ? '800' : '600', color: sel ? color : T.sub });

  const priorityInfo = PRIORITIES.find(p => p.id === priority) || PRIORITIES[1];
  const repeatInfo = REPEATS.find(r => r.id === repeatType) || REPEATS[0];
  const toggleExpand = (key) => { Keyboard.dismiss(); setExpanded(prev => (prev === key ? null : key)); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={onClose} />
        <View style={[S.addTodoSheet, { backgroundColor: T.card, borderColor: T.border }, isTablet && { maxWidth: sheetMaxW, width: '100%', alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1 }]}>
          {/* 헤더 */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name={mode === 'add' ? 'add-circle-outline' : 'create-outline'} size={18} color={T.accent} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>{mode === 'add' ? '할 일 추가' : '할 일 수정'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 10 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color={T.sub} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
            {/* 내용 — 최상단, 크게 */}
            <TextInput
              value={text} onChangeText={setText}
              placeholder="할 일 내용을 입력하세요" placeholderTextColor={T.sub}
              style={[S.todoInput, { borderColor: T.accent, backgroundColor: T.surface, color: T.text, fontSize: 15, paddingVertical: 10, marginBottom: 12 }]}
              onSubmitEditing={submit} returnKeyType="done" autoFocus
            />
            {/* 과목 */}
            <Row T={T} label="과목">
              <TouchableOpacity onPress={() => { setSubjectId(null); setSubjectLabel(null); setSubjectColor(null); }} style={chipStyle(!subjectId)}>
                <Text style={chipText(!subjectId)}>미분류</Text>
              </TouchableOpacity>
              {app.subjects.map(s => {
                const sel = subjectId === s.id;
                return (
                  <TouchableOpacity key={s.id} onPress={() => { setSubjectId(s.id); setSubjectLabel(s.name); setSubjectColor(s.color); }} style={chipStyle(sel, s.color)}>
                    <Text style={chipText(sel, s.color)}>{s.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </Row>
            {/* 목록/날짜 — 반복 설정 시엔 반복이 우선이므로 숨김 */}
            {repeatType === 'none' ? (
              <>
                <Row T={T} label="목록">
                  {[{ id: 'today', label: todayLabel }, ...todoLists.map(l => ({ id: l.id, label: l.name })), { id: 'exam', label: examLabel }].map(opt => {
                    const sel = scope === opt.id;
                    return (
                      <TouchableOpacity key={opt.id} onPress={() => { Keyboard.dismiss(); setScope(opt.id); }} style={chipStyle(sel)}>
                        <Text style={chipText(sel)} numberOfLines={1}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </Row>
                {scope === 'exam' && (app.ddays || []).length > 0 && (
                  <Row T={T} label="시험">
                    {(app.ddays || []).map(d => {
                      const sel = ddayId === d.id;
                      return (
                        <TouchableOpacity key={d.id} onPress={() => setDdayId(sel ? null : d.id)} style={chipStyle(sel, '#E17055')}>
                          <Text style={chipText(sel, '#E17055')}>{d.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </Row>
                )}
                <Row T={T} label="날짜">
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowCalendar(p => !p); }}
                    style={[chipStyle(showCalendar), { flexDirection: 'row', gap: 4 }]}>
                    <Ionicons name="calendar-outline" size={13} color={showCalendar ? T.accent : T.sub} />
                    <Text style={chipText(showCalendar)}>달력</Text>
                  </TouchableOpacity>
                  {[null, ...(dueDate && !todoDateChoices.includes(dueDate) ? [dueDate] : []), ...todoDateChoices].map(ds => {
                    const sel = dueDate === ds;
                    const label = ds === null ? '없음' : ds === todoDateToday ? '오늘' : dateChipLabel(ds, todoDateToday);
                    return (
                      <TouchableOpacity key={ds ?? 'none'} onPress={() => { Keyboard.dismiss(); setDueDate(ds); }} style={chipStyle(sel)}>
                        <Text style={chipText(sel)}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </Row>
                {/* 임의 날짜 선택 달력 (칩 7일 너머 — 다음 달 모의고사 등) */}
                {showCalendar && calMonth && (() => {
                  const cells = buildMonthCells(calMonth.getFullYear(), calMonth.getMonth());
                  const todayD = new Date(todoDateToday + 'T00:00:00');
                  const atCurrentMonth = calMonth.getFullYear() === todayD.getFullYear() && calMonth.getMonth() === todayD.getMonth();
                  return (
                    <View style={{ backgroundColor: T.surface, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: T.border, marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <TouchableOpacity disabled={atCurrentMonth} onPress={() => setCalMonth(p => new Date(p.getFullYear(), p.getMonth() - 1, 1))}
                          style={{ padding: 4, opacity: atCurrentMonth ? 0.3 : 1 }}>
                          <Ionicons name="chevron-back" size={16} color={T.accent} />
                        </TouchableOpacity>
                        <Text style={{ color: T.text, fontSize: 13, fontWeight: '800' }}>{`${calMonth.getFullYear()}년 ${calMonth.getMonth() + 1}월`}</Text>
                        <TouchableOpacity onPress={() => setCalMonth(p => new Date(p.getFullYear(), p.getMonth() + 1, 1))} style={{ padding: 4 }}>
                          <Ionicons name="chevron-forward" size={16} color={T.accent} />
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                        {DAYS_KR.map(d => <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: T.sub, fontWeight: '600' }}>{d}</Text>)}
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                        {cells.map((cell, i) => {
                          if (!cell) return <View key={`e${i}`} style={{ width: '14.28%', height: 30 }} />;
                          const past = cell.date < todoDateToday;
                          const sel = dueDate === cell.date;
                          return (
                            <TouchableOpacity key={cell.date} disabled={past}
                              style={{ width: '14.28%', height: 30, alignItems: 'center', justifyContent: 'center', opacity: past ? 0.3 : 1 }}
                              onPress={() => { setDueDate(cell.date); setShowCalendar(false); }}>
                              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? T.accent : 'transparent' }}>
                                <Text style={{ fontSize: 12, fontWeight: sel ? '800' : '500', color: sel ? 'white' : cell.date === todoDateToday ? T.accent : T.text }}>{cell.day}</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })()}
                {dueDate && (
                  <Text style={{ fontSize: 12, color: T.accent, marginLeft: 42, marginTop: -4, marginBottom: 10 }}>날짜가 되면 오늘 할 일에 자동으로 올라와요</Text>
                )}
              </>
            ) : (
              <Text style={{ fontSize: 12, color: T.accent, marginLeft: 42, marginBottom: 10 }}>반복 할 일은 해당 요일마다 오늘 목록에 자동 추가돼요</Text>
            )}
            {/* 접힌 옵션 요약 칩: 반복 / 우선순위 / 메모 */}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 2, marginBottom: expanded ? 8 : 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.border }}>
              {[
                { key: 'repeat', icon: 'repeat-outline', label: repeatType === 'none' ? '반복' : repeatInfo.label, active: repeatType !== 'none', color: T.accent },
                { key: 'priority', icon: 'flag-outline', label: priority === 'normal' ? '우선순위' : priorityInfo.label, active: priority !== 'normal', color: priorityInfo.color },
                { key: 'memo', icon: 'attach-outline', label: '메모', active: !!memo.trim(), color: T.accent },
              ].map(opt => {
                const open = expanded === opt.key;
                const tint = opt.active ? opt.color : T.sub;
                return (
                  <TouchableOpacity key={opt.key} onPress={() => toggleExpand(opt.key)}
                    style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, paddingVertical: 7, borderRadius: 14, backgroundColor: open || opt.active ? tint + '15' : T.surface2, borderWidth: 1, borderColor: open ? tint : opt.active ? tint + '60' : T.border }}>
                    <Ionicons name={opt.icon} size={13} color={tint} />
                    <Text style={{ fontSize: 12, fontWeight: opt.active || open ? '800' : '600', color: tint }} numberOfLines={1}>{opt.label}</Text>
                    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={11} color={tint} />
                  </TouchableOpacity>
                );
              })}
            </View>
            {expanded === 'repeat' && (
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 5, marginBottom: repeatType === 'custom' ? 6 : 0 }}>
                  {REPEATS.map(opt => {
                    const sel = repeatType === opt.id;
                    return (
                      <TouchableOpacity key={opt.id} onPress={() => { Keyboard.dismiss(); setRepeatType(opt.id); }} style={[chipStyle(sel), { flex: 1, paddingHorizontal: 2 }]}>
                        <Text style={[chipText(sel), { fontSize: 12 }]} numberOfLines={1}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {repeatType === 'custom' && (
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    {WEEKDAYS.map(({ d, l }) => {
                      const sel = customDays.includes(d);
                      return (
                        <TouchableOpacity key={d} onPress={() => setCustomDays(prev => sel ? prev.filter(x => x !== d) : [...prev, d])}
                          style={[chipStyle(sel), { flex: 1, paddingHorizontal: 2, backgroundColor: sel ? T.accent : T.surface2 }]}>
                          <Text style={[chipText(sel), { color: sel ? 'white' : T.sub }]}>{l}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
            {expanded === 'priority' && (
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                {PRIORITIES.map(opt => {
                  const sel = priority === opt.id;
                  return (
                    <TouchableOpacity key={opt.id} onPress={() => { Keyboard.dismiss(); setPriority(opt.id); }} style={[chipStyle(sel, opt.color), { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 5 }]}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sel ? opt.color : opt.color + '80' }} />
                      <Text style={chipText(sel, opt.color)}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {expanded === 'memo' && (
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                  {MEMO_TAGS.map(tag => (
                    <TouchableOpacity key={tag} onPress={() => setMemo(prev => prev ? prev + ' · ' + tag : tag)}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border }}>
                      <Text style={{ fontSize: 12, color: T.sub, fontWeight: '600' }}>{tag}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput value={memo} onChangeText={setMemo}
                  placeholder="예) 수학 17번 · 개념 부족 · 재풀이 필요" placeholderTextColor={T.sub} multiline
                  style={[S.todoInput, { borderColor: T.border, backgroundColor: T.surface, color: T.text, minHeight: 48, textAlignVertical: 'top', marginBottom: 0 }]}
                />
              </View>
            )}
            {/* 저장 */}
            <TouchableOpacity onPress={submit}
              style={{ backgroundColor: text.trim() ? T.accent : T.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 2 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: 'white' }}>{mode === 'add' ? '추가' : '저장'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
