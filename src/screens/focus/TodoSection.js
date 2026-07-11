// src/screens/focus/TodoSection.js
// 해야할일 기능 전체 (카드 + 추가/수정 폼시트 + 목록 모달 + 상태/핸들러) — FocusScreen에서 분리.
// 추가/수정 폼의 필드 상태는 TodoFormSheet가 소유하고, 여기는 저장 시 데이터 로직만 처리한다.
// mainScrollRef/scrollYRef는 FocusScreen 메인 ScrollView 소유 — 안드 키보드 가림 스크롤 보정에만 사용.
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, KeyboardAvoidingView, Platform, Vibration, Keyboard, AppState, Animated, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { calcDDay, generateId, getToday, formatDuration } from '../../utils/format';
import { isTodayVisible, isUpcoming, dueBadge, nextDates, dateChipLabel, computeDropIndex } from '../../utils/todoUtils';
import { getTodoMessage } from '../../constants/characters';
import TodoFormSheet from './TodoFormSheet';

export default function TodoSection({ app, T, S, isTablet, isLandscape, contentMaxW, tabletModalW, mainScrollRef, scrollYRef, onDragActive }) {
  const [expandedTodo, setExpandedTodo] = useState(null);
  const [editTarget, setEditTarget] = useState(null); // 수정 중인 todo 객체 (폼 초기값 + 저장 시 원본 정리용)
  const [todoScopeFilter, setTodoScopeFilter] = useState('today');
  const [todoListModal, setTodoListModal] = useState(null); // { mode:'add' } | { mode:'rename', target:'today'|'exam'|커스텀 목록 id }
  const [todoListName, setTodoListName] = useState('');
  const [showAddTodoModal, setShowAddTodoModal] = useState(false);
  const inlineInputRef = useRef(null);
  const [addTodoText, setAddTodoText] = useState('');

  const inlineFocusedRef = useRef(false);

  // ── 드래그 정렬 (같은 그룹의 미완료 항목끼리, 손잡이로 시작) ──
  // 부모 ScrollView 안이라 드래그 중엔 onDragActive로 바깥 스크롤을 잠근다.
  // PanResponder 콜백은 grant 시점 렌더의 클로저에 묶이므로 최신값은 dragRef로 읽는다.
  const [drag, setDrag] = useState(null); // { ids, heights, from, to, maxUp, maxDown }
  const dragRef = useRef(null);
  const dragY = useRef(new Animated.Value(0)).current;
  const rowHeights = useRef({}); // todo id → onLayout 측정 높이

  // 할일별 누적 집중시간 — '집중 시작'으로 기록된 세션(todoId)에서 파생 (틱 재렌더 대비 메모)
  const todoFocusSec = useMemo(() => {
    const m = {};
    (app.sessions || []).forEach(s => { if (s.todoId) m[s.todoId] = (m[s.todoId] || 0) + s.durationSec; });
    return m;
  }, [app.sessions]);

  const startDrag = (t, orderedIds) => {
    const from = orderedIds.indexOf(t.id);
    if (from === -1) return;
    const heights = orderedIds.map(id => rowHeights.current[id] ?? 44);
    const d = {
      ids: orderedIds, heights, from, to: from,
      maxUp: -heights.slice(0, from).reduce((a, b) => a + b, 0),
      maxDown: heights.slice(from + 1).reduce((a, b) => a + b, 0),
    };
    dragRef.current = d;
    setDrag(d);
    onDragActive?.(true);
    Vibration.vibrate([0, 20]);
  };
  const moveDrag = (dy) => {
    const d = dragRef.current;
    if (!d) return;
    dragY.setValue(Math.max(d.maxUp, Math.min(d.maxDown, dy)));
    const to = computeDropIndex(d.heights, d.from, dy);
    if (to !== d.to) {
      dragRef.current = { ...d, to };
      setDrag(dragRef.current);
    }
  };
  const endDrag = () => {
    const d = dragRef.current;
    if (d && d.to !== d.from) {
      const ids = [...d.ids];
      const [moved] = ids.splice(d.from, 1);
      ids.splice(d.to, 0, moved);
      app.reorderTodos(ids);
      Vibration.vibrate([0, 30]);
    }
    dragRef.current = null;
    setDrag(null);
    dragY.setValue(0);
    onDragActive?.(false);
  };
  // PanResponder는 컴포넌트당 1개로 고정 — 렌더마다 새로 만들면 드래그 중 재렌더(setDrag) 시
  // 핸들러가 교체돼 gestureState 기준점이 끊기고 이동 이벤트가 죽는다 (grant만 되고 move 안 됨).
  // 어느 행을 잡았는지는 손잡이의 onStartShouldSetResponder에서 pendingDragRef로 전달.
  const pendingDragRef = useRef(null); // { todo, ids }
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false, // 부모 ScrollView에 responder 안 뺏김
    onPanResponderGrant: () => {
      const p = pendingDragRef.current;
      if (p) startDrag(p.todo, p.ids);
    },
    onPanResponderMove: (_, g) => moveDrag(g.dy),
    onPanResponderRelease: endDrag,
    onPanResponderTerminate: endDrag,
  })).current;

  // 앱 복귀 시 키보드 자동 열림 방지
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        Keyboard.dismiss();
        inlineInputRef.current?.blur();
      }
    });
    return () => sub.remove();
  }, []);

  // Android: 인라인 todo 입력창이 키보드에 가려질 때 스크롤로 노출
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = Keyboard.addListener('keyboardDidShow', (e) => {
      if (!inlineFocusedRef.current) return;
      const keyboardScreenY = e.endCoordinates.screenY;
      inlineInputRef.current?.measureInWindow((x, y, w, h) => {
        const inputBottom = y + h;
        if (inputBottom > keyboardScreenY - 8) {
          mainScrollRef.current?.scrollTo({
            y: scrollYRef.current + (inputBottom - keyboardScreenY) + 24,
            animated: true,
          });
        }
      });
    });
    return () => sub.remove();
  }, []);

  // ── 해야할일 목록 구성 ──
  // '오늘'(매일 초기화·반복 생성처)과 '시험대비'(D-Day 연동)는 동작이 고정이라 이름만 변경 가능,
  // 커스텀 목록(기본 '이번주')은 추가/이름변경/삭제 자유 — 항목은 매일 초기화 없이 유지
  const todoLists = app.settings.todoLists ?? [{ id: 'week', name: '이번주' }];
  const todayLabel = app.settings.todoLabelToday || '오늘';
  const examLabel = app.settings.todoLabelExam || 'D-Day';
  const todoScopeName = (scope) =>
    scope === 'exam' ? examLabel
      : (scope === 'today' || scope == null) ? todayLabel
        : (todoLists.find(l => l.id === scope)?.name ?? '목록');
  const MAX_TODO_LISTS = 5;
  // 모달 날짜(기한) 칩 후보: 오늘 + 다음 6일
  const todoDateToday = getToday();
  const todoDateChoices = [todoDateToday, ...nextDates(todoDateToday, 6)];

  // 백업 복원 등으로 선택 중인 목록이 사라졌을 때 필터 자동 복구
  // (의존성은 settings의 원본 참조 — todoLists는 렌더마다 새 배열이라 사용 금지)
  useEffect(() => {
    if (todoScopeFilter === 'today' || todoScopeFilter === 'exam' || todoScopeFilter === 'all') return;
    if (!todoLists.some(l => l.id === todoScopeFilter)) setTodoScopeFilter('today');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.settings.todoLists, todoScopeFilter]);

  const openRenameTodoList = (target) => {
    setTodoListName(target === 'today' ? todayLabel : target === 'exam' ? examLabel : (todoLists.find(l => l.id === target)?.name ?? ''));
    setTodoListModal({ mode: 'rename', target });
  };
  const openAddTodoList = () => {
    if (todoLists.length >= MAX_TODO_LISTS) { app.showToastCustom(`목록은 최대 ${MAX_TODO_LISTS}개까지 만들 수 있어요`, 'paengi'); return; }
    setTodoListName('');
    setTodoListModal({ mode: 'add' });
  };
  const submitTodoListModal = () => {
    const name = todoListName.trim();
    if (!name || !todoListModal) return;
    const isRename = todoListModal.mode === 'rename';
    const target = isRename ? todoListModal.target : null;
    // 다른 목록과 같은 이름 방지 (이름변경 시 자기 자신은 제외)
    const otherNames = [
      target === 'today' ? null : todayLabel,
      target === 'exam' ? null : examLabel,
      ...todoLists.filter(l => l.id !== target).map(l => l.name),
    ].filter(Boolean);
    if (otherNames.includes(name)) { app.showToastCustom('같은 이름의 목록이 이미 있어요', 'paengi'); return; }
    if (!isRename) {
      app.updateSettings({ todoLists: [...todoLists, { id: generateId('list_'), name }] });
    } else if (target === 'today') {
      app.updateSettings({ todoLabelToday: name });
    } else if (target === 'exam') {
      app.updateSettings({ todoLabelExam: name });
    } else {
      app.updateSettings({ todoLists: todoLists.map(l => l.id === target ? { ...l, name } : l) });
    }
    setTodoListModal(null);
  };
  const confirmDeleteTodoList = (listId) => {
    const list = todoLists.find(l => l.id === listId);
    if (!list) return;
    const cnt = app.todos.filter(t => t.scope === listId).length;
    Alert.alert('목록 삭제', cnt > 0 ? `'${list.name}' 목록과 할 일 ${cnt}개가 함께 삭제됩니다.` : `'${list.name}' 목록을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => {
        app.removeTodosByScope(listId);
        app.updateSettings({ todoLists: todoLists.filter(l => l.id !== listId) });
        if (todoScopeFilter === listId) setTodoScopeFilter('today');
      } },
    ]);
  };
  const onLongPressTodoTab = (id) => {
    if (id === 'all') return;
    if (id === 'today' || id === 'exam') { openRenameTodoList(id); return; }
    const list = todoLists.find(l => l.id === id);
    if (!list) return;
    Alert.alert(list.name, undefined, [
      { text: '이름 변경', onPress: () => openRenameTodoList(id) },
      { text: '삭제', style: 'destructive', onPress: () => confirmDeleteTodoList(id) },
      { text: '취소', style: 'cancel' },
    ]);
  };

  // ── 할일 추가/수정 ──
  const submitInlineTodo = () => {
    if (!addTodoText.trim()) { setAddTodoText(''); return; }
    app.addTodo({
      text: addTodoText.trim(),
      priority: 'normal',
      scope: todoScopeFilter === 'all' ? 'today' : todoScopeFilter,
      isTemplate: false,
    });
    Vibration.vibrate([0, 30]);
    setAddTodoText('');
    Keyboard.dismiss();
  };

  // 폼시트 필드 → addTodo 파라미터 (반복 설정 시 목록/날짜는 무효 — 인스턴스가 매일 '오늘'로 생성됨)
  const buildTodoFields = (f) => {
    const repeatMap = { daily: [0,1,2,3,4,5,6], weekday: [1,2,3,4,5], weekend: [0,6], custom: f.customDays };
    const repeatDays = f.repeatType !== 'none' ? (repeatMap[f.repeatType] || null) : null;
    return {
      text: f.text,
      subjectId: f.subjectId, subjectLabel: f.subjectLabel, subjectColor: f.subjectColor,
      priority: f.priority,
      scope: f.repeatType !== 'none' ? 'today' : f.scope,
      dueDate: f.repeatType !== 'none' ? null : f.dueDate,
      ddayId: f.ddayId,
      memo: f.memo,
      isTemplate: repeatDays !== null,
      repeatDays,
    };
  };

  const handleAddSave = (fields) => {
    app.addTodo(buildTodoFields(fields));
    // 반복 템플릿 인스턴스 생성은 addTodo 내부에서 처리
    Vibration.vibrate([0, 30]);
    setAddTodoText(''); // 인라인 입력에서 이월된 텍스트 정리
    app.showToastCustom('할 일이 저장됐어요!', 'taco');
    setShowAddTodoModal(false);
  };

  const openEditTodo = (t) => setEditTarget(t);

  const handleEditSave = (fields) => {
    const todo = editTarget;
    if (!todo) return;
    // 인스턴스 편집 시 부모 템플릿도 함께 제거 (새 템플릿 생성 또는 반복 해제 시 중복/유령 템플릿 방지)
    if (todo.templateId) {
      app.removeTodo(todo.templateId);
    }
    // 템플릿 자체 편집 시 기존 인스턴스도 제거 — 아래 addTodo가 오늘 인스턴스를 다시 생성하므로 중복 방지
    if (todo.isTemplate) {
      app.todos.filter(x => x.templateId === todo.id).forEach(x => app.removeTodo(x.id));
    }
    app.removeTodo(todo.id);
    app.addTodo(buildTodoFields(fields));
    setEditTarget(null);
    Vibration.vibrate([0, 30]);
    app.showToastCustom('수정했어요!', 'toru');
  };

  return (
    <>
        {/* 할 일 */}
        {(() => {
          const todayStr = getToday();
          const tomorrowStr = nextDates(todayStr, 1)[0];
          // 완료만 아래로 (안정 정렬 — 미완료끼리는 배열 순서 = 드래그로 정한 수동 순서)
          const sortTodos = (list) => [...list].sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));

          // scope 필터 적용 — '오늘'은 오늘 목록 + 기한 도래 항목 (My Day 모델)
          const visibleTodos = app.todos.filter(t => !t.isTemplate && (() => {
            if (todoScopeFilter === 'today') return isTodayVisible(t, todayStr);
            if (todoScopeFilter === 'all') return true;
            return t.scope === todoScopeFilter; // 'exam' + 커스텀 목록
          })());

          // 과목별 그룹핑
          const groupMap = {};
          const groupOrder = [];
          visibleTodos.forEach(t => {
            const key = t.subjectId || '__none__';
            if (!groupMap[key]) {
              groupMap[key] = { key, label: t.subjectLabel || (t.subjectId ? '알 수 없음' : '미분류'), color: t.subjectColor || T.sub, todos: [] };
              groupOrder.push(key);
            }
            groupMap[key].todos.push(t);
          });
          // 미완료 많은 순 정렬 (미분류는 마지막)
          groupOrder.sort((a, b) => {
            if (a === '__none__') return 1;
            if (b === '__none__') return -1;
            return groupMap[b].todos.filter(t => !t.done).length - groupMap[a].todos.filter(t => !t.done).length;
          });

          // orderedIds: 이 행이 속한 그룹의 미완료 id 목록(표시 순서) — 드래그 정렬 범위
          const renderTodoRow = (t, orderedIds) => {
            const isExpanded = expandedTodo === t.id;
            const timeStr = t.completedAt
              ? new Date(t.completedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
              : null;
            // 드래그 중 시각 처리: 잡힌 행은 손가락 따라 이동, 사이 행들은 잡힌 행 높이만큼 자리 양보
            const dIdx = drag && !t.done ? drag.ids.indexOf(t.id) : -1;
            const isDragged = dIdx !== -1 && dIdx === drag.from;
            let shiftY = 0;
            if (dIdx !== -1 && !isDragged) {
              if (drag.from < drag.to && dIdx > drag.from && dIdx <= drag.to) shiftY = -drag.heights[drag.from];
              else if (drag.from > drag.to && dIdx >= drag.to && dIdx < drag.from) shiftY = drag.heights[drag.from];
            }
            return (
              <Animated.View key={t.id}
                onLayout={(e) => { rowHeights.current[t.id] = e.nativeEvent.layout.height; }}
                style={isDragged
                  ? { transform: [{ translateY: dragY }], zIndex: 10, elevation: 6, backgroundColor: T.card, borderRadius: 8,
                      shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }
                  : shiftY !== 0 ? { transform: [{ translateY: shiftY }] } : null}>
              <TouchableOpacity style={[S.todoItem, { alignItems: 'flex-start' }]} activeOpacity={0.7}
                onPress={() => setExpandedTodo(isExpanded ? null : t.id)}
                onLongPress={() => openEditTodo(t)}>
                {/* 우선순위 인디케이터 */}
                {t.priority === 'high' && !t.done && (
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#E17055', marginTop: 6, marginRight: 4 }} />
                )}
                {t.priority !== 'high' && <View style={{ width: 6, marginRight: 4 }} />}
                {/* 체크박스 */}
                <TouchableOpacity onPress={() => {
                  const wasDone = t.done;
                  app.toggleTodo(t.id);
                  Vibration.vibrate([0, 30]);
                  // 올클리어 체크: 완료로 바꿀 때만
                  if (!wasDone) {
                    const todayList = app.todos.filter(x => isTodayVisible(x, todayStr));
                    const nowDone = todayList.filter(x => x.id === t.id ? true : x.done).length;
                    if (nowDone === todayList.length && todayList.length > 0) {
                      app.showToastCustom('오늘 할 일 올클리어!', app.settings.mainCharacter || 'toru');
                    }
                  }
                }}
                  style={[S.todoCk, { borderColor: t.done ? T.accent : T.border, backgroundColor: t.done ? T.accent : 'transparent', marginTop: 1 }]}>
                  {t.done && <Ionicons name="checkmark" size={12} color="white" />}
                </TouchableOpacity>
                {/* 텍스트 + 메타 */}
                <View style={{ flex: 1 }}>
                  <Text style={[S.todoText, { color: t.done ? T.sub : T.text }, t.done && { textDecorationLine: 'line-through' }]}
                    numberOfLines={isExpanded ? 0 : 2}>{t.text}</Text>
                  {/* 메타 행: scope 뱃지 + 메모 + 완료 시각 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    {(() => {
                      const scopeInfo = t.scope === 'exam' ? { label: examLabel, color: '#E17055' }
                        : (t.scope === 'today' || t.scope == null) ? { label: todayLabel, color: T.accent }
                        : { label: todoScopeName(t.scope), color: '#27AE60' };
                      return (
                        <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: scopeInfo.color + '18' }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: scopeInfo.color }}>{scopeInfo.label}</Text>
                        </View>
                      );
                    })()}
                    {(() => {
                      const db = dueBadge(t, todayStr);
                      if (!db) return null;
                      const c = db.tone === 'overdue' ? '#E17055' : db.tone === 'due' ? T.accent : T.sub;
                      return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: c + '18' }}>
                          <Ionicons name="calendar-outline" size={10} color={c} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: c }}>{db.label}</Text>
                        </View>
                      );
                    })()}
                    {/* 이 할일로 집중한 누적 시간 (세션 todoId 파생, 1분 이상만) */}
                    {(todoFocusSec[t.id] || 0) >= 60 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: T.surface2 }}>
                        <Ionicons name="timer-outline" size={10} color={T.sub} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub }}>{formatDuration(todoFocusSec[t.id])}</Text>
                      </View>
                    )}
                    {t.memo && <Ionicons name="attach-outline" size={13} color={T.sub} />}
                    {t.done && timeStr && <Text style={{ fontSize: 11, color: T.sub }}>{timeStr}</Text>}
                  </View>
                  {t.memo && isExpanded && (
                    <View style={{ marginTop: 4, padding: 6, backgroundColor: T.surface2, borderRadius: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="attach-outline" size={12} color={T.sub} />
                        <Text style={{ fontSize: 12, color: T.sub }}>{t.memo}</Text>
                      </View>
                    </View>
                  )}
                  {/* 펼침 퀵액션: 집중 시작(자유 타이머) / 내일로 미루기 */}
                  {isExpanded && !t.done && (
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                      <TouchableOpacity onPress={() => {
                        setExpandedTodo(null);
                        app.addTimer({
                          type: 'free',
                          label: t.text.length > 18 ? t.text.slice(0, 18) + '…' : t.text,
                          subjectId: t.subjectId || null,
                          color: t.subjectColor || T.accent,
                          todoId: t.id, // 종료 시 완료 확인 + 할일에 집중시간 누적 표시
                        });
                      }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: T.accent }}>
                        <Ionicons name="play" size={12} color="white" />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: 'white' }}>집중 시작</Text>
                      </TouchableOpacity>
                      {/* 반복 인스턴스는 내일 것이 자동 생성되므로 미루기 제외 */}
                      {!t.templateId && (
                        <TouchableOpacity onPress={() => {
                          Vibration.vibrate([0, 30]);
                          app.showToastCustom('내일 할 일로 미뤘어요', 'toru');
                          app.updateTodo(t.id, { dueDate: tomorrowStr });
                          setExpandedTodo(null);
                        }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border }}>
                          <Ionicons name="arrow-redo-outline" size={12} color={T.sub} />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub }}>내일로</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
                {/* 드래그 손잡이 — 같은 그룹에 미완료가 2개 이상일 때만.
                    onStartShouldSetResponder만 행별로 덮어써 잡은 행 정보를 넘기고,
                    responder 초기화는 반드시 공유 인스턴스에 위임(직접 true 반환 시 기준점 미초기화) */}
                {!t.done && orderedIds && orderedIds.length > 1 && (
                  <View {...panResponder.panHandlers}
                    onStartShouldSetResponder={(e) => {
                      pendingDragRef.current = { todo: t, ids: orderedIds };
                      return panResponder.panHandlers.onStartShouldSetResponder(e);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 2 }}
                    style={{ paddingHorizontal: 3, paddingVertical: 2, marginTop: 1 }}>
                    <Ionicons name="reorder-two-outline" size={17} color={isDragged ? T.accent : T.border} />
                  </View>
                )}
                <TouchableOpacity onPress={() => Alert.alert('할 일 삭제', '이 항목을 삭제할까요?', [
                  { text: '취소', style: 'cancel' },
                  { text: '삭제', style: 'destructive', onPress: () => app.removeTodo(t.id) },
                ])} style={S.todoDelBtn}>
                  <Text style={{ fontSize: 16, color: T.sub }}>×</Text>
                </TouchableOpacity>
              </TouchableOpacity>
              </Animated.View>
            );
          };

          // 오늘 완료 카운트 (캐릭터 메시지용)
          const todayTodos = app.todos.filter(t => isTodayVisible(t, todayStr));
          const doneCount = todayTodos.filter(t => t.done).length;
          const allDone = doneCount > 0 && doneCount === todayTodos.length;

          return (
            <View style={[S.todoCard, { backgroundColor: T.card, borderColor: T.border }, isTablet && !isLandscape && S.tabletBlock]}>
              {/* 헤더 */}
              <View style={S.todoH}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={T.accent} />
                  <Text style={[S.todoTitle, { color: T.text }]}>해야 할 일</Text>
                </View>
                <Text style={[S.todoCnt, { color: T.sub }]}>{doneCount}/{todayTodos.length}</Text>
                <Text style={{ fontSize: 11, color: T.border, marginLeft: 4 }}>탭:펼치기 · 꾹:수정</Text>
              </View>
              {/* scope 필터 탭 — 꾹 누르면 이름변경(오늘/시험대비) 또는 이름변경·삭제(커스텀), +로 목록 추가 */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ gap: 6, alignItems: 'center', flexGrow: 1 }}>
                {[{ id: 'today', label: todayLabel }, ...todoLists.map(l => ({ id: l.id, label: l.name })), { id: 'exam', label: examLabel }, { id: 'all', label: '전체' }].map(opt => {
                  const sel = todoScopeFilter === opt.id;
                  const cnt = opt.id === 'all' ? 0 : app.todos.filter(t => !t.isTemplate && (
                    opt.id === 'today' ? isTodayVisible(t, todayStr) : t.scope === opt.id
                  )).length;
                  return (
                    <TouchableOpacity key={opt.id} onPress={() => setTodoScopeFilter(opt.id)} onLongPress={() => onLongPressTodoTab(opt.id)}
                      style={{ flexGrow: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, alignItems: 'center', backgroundColor: sel ? T.accent + '20' : T.surface2, borderWidth: 1, borderColor: sel ? T.accent : T.border }}>
                      <Text style={{ fontSize: 12, fontWeight: sel ? '800' : '600', color: sel ? T.accent : T.sub }} numberOfLines={1}>
                        {opt.label}{cnt > 0 ? ` ${cnt}` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity onPress={openAddTodoList}
                  style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border }}>
                  <Ionicons name="add" size={15} color={T.sub} />
                </TouchableOpacity>
              </ScrollView>
              {/* 빠른 추가 인라인 입력 */}
              <View style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TextInput
                    ref={inlineInputRef}
                    value={addTodoText} onChangeText={setAddTodoText}
                    placeholder="할 일 입력..." placeholderTextColor={T.sub}
                    style={[S.todoInput, { flex: 1, borderColor: T.accent, backgroundColor: T.surface, color: T.text, marginBottom: 0 }]}
                    onSubmitEditing={submitInlineTodo} returnKeyType="done"
                    onFocus={() => { inlineFocusedRef.current = true; }}
                    onBlur={() => { inlineFocusedRef.current = false; }}
                  />
                  <TouchableOpacity onPress={submitInlineTodo}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: T.accent }}>
                    <Text style={{ color: 'white', fontSize: 14, fontWeight: '800' }}>추가</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowAddTodoModal(true)}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border }}>
                    <Ionicons name="options-outline" size={18} color={T.sub} />
                  </TouchableOpacity>
                </View>
              </View>
              {/* D-Day 임박 경고 (시험 14일 이내) */}
              {(() => {
                const urgentDdays = (app.ddays || []).filter(d => {
                  if (!d.date) return false;
                  const days = calcDDay(d.date);
                  if (days === null || days < 0 || days > 14) return false;
                  return app.todos.some(t => !t.isTemplate && t.scope === 'exam' && t.ddayId === d.id && !t.done);
                });
                if (urgentDdays.length === 0 || todoScopeFilter === 'exam') return null;
                return urgentDdays.map(d => {
                  const days = calcDDay(d.date);
                  const remaining = app.todos.filter(t => !t.isTemplate && t.scope === 'exam' && t.ddayId === d.id && !t.done).length;
                  const dStr = days === 0 ? 'D-Day' : `D-${days}`;
                  return (
                    <TouchableOpacity key={d.id} onPress={() => setTodoScopeFilter('exam')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E17055' + '15', borderWidth: 1, borderColor: '#E17055' + '60', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 8 }}>
                      <Ionicons name="flag-outline" size={16} color="#E17055" />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#E17055', flex: 1 }}>
                        {d.label} {dStr} · 할 일 {remaining}개 남음
                      </Text>
                      <Text style={{ fontSize: 12, color: '#E17055' }}>보기 ›</Text>
                    </TouchableOpacity>
                  );
                });
              })()}
              {/* 할일 목록 */}
              {todoScopeFilter === 'exam' ? (() => {
                const examTodos = app.todos.filter(t => !t.isTemplate && t.scope === 'exam');
                if (examTodos.length === 0) return (
                  <Text style={{ fontSize: 14, color: T.sub, textAlign: 'center', paddingVertical: 12 }}>
                    {`시험 체크리스트가 없어요!\n목록을 "${examLabel}"로 설정해 추가해보세요`}
                  </Text>
                );
                // D-Day별 그룹핑
                const ddayMap = {};
                const ddayOrder = [];
                examTodos.forEach(t => {
                  const key = t.ddayId || '__none__';
                  if (!ddayMap[key]) { ddayMap[key] = { key, todos: [] }; ddayOrder.push(key); }
                  ddayMap[key].todos.push(t);
                });
                // 정렬: 가까운 D-Day 먼저, 지난 시험 마지막, 미분류 마지막
                ddayOrder.sort((a, b) => {
                  if (a === '__none__') return 1;
                  if (b === '__none__') return -1;
                  const da = (app.ddays || []).find(d => d.id === a);
                  const db = (app.ddays || []).find(d => d.id === b);
                  const daysA = da?.date ? (calcDDay(da.date) ?? 9999) : 9999;
                  const daysB = db?.date ? (calcDDay(db.date) ?? 9999) : 9999;
                  if (daysA < 0 && daysB >= 0) return 1;
                  if (daysA >= 0 && daysB < 0) return -1;
                  return daysA - daysB;
                });
                const activeKeys = ddayOrder.filter(k => {
                  if (k === '__none__') return true;
                  const dd = (app.ddays || []).find(d => d.id === k);
                  return !dd?.date || (calcDDay(dd.date) ?? 0) >= 0;
                });
                const pastKeys = ddayOrder.filter(k => {
                  if (k === '__none__') return false;
                  const dd = (app.ddays || []).find(d => d.id === k);
                  return dd?.date && (calcDDay(dd.date) ?? 0) < 0;
                });
                return (
                  <>
                    {activeKeys.map(key => {
                      const group = ddayMap[key];
                      const dd = (app.ddays || []).find(d => d.id === key);
                      const days = dd?.date ? calcDDay(dd.date) : null;
                      const dStr = days === null ? '' : days === 0 ? ' D-Day' : days > 0 ? ` D-${days}` : ` D+${Math.abs(days)}`;
                      const sorted = sortTodos(group.todos);
                      const doneCnt = group.todos.filter(t => t.done).length;
                      const pct = group.todos.length > 0 ? doneCnt / group.todos.length : 0;
                      return (
                        <View key={key} style={{ marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
                              <Ionicons name={key === '__none__' ? 'list-outline' : 'flag-outline'} size={14} color={key === '__none__' ? T.sub : T.accent} />
                              <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>
                                {key === '__none__' ? '기타 시험 항목' : `${dd?.label || '시험'}${dStr}`}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 12, color: T.sub }}>{doneCnt}/{group.todos.length}</Text>
                          </View>
                          <View style={{ height: 4, backgroundColor: T.surface2, borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
                            <View style={{ height: 4, borderRadius: 2, backgroundColor: pct >= 1 ? '#27AE60' : T.accent, width: `${Math.round(pct * 100)}%` }} />
                          </View>
                          {(() => {
                            const undoneIds = sorted.filter(x => !x.done).map(x => x.id);
                            return sorted.map(t => renderTodoRow(t, undoneIds));
                          })()}
                        </View>
                      );
                    })}
                    {pastKeys.length > 0 && (
                      <View style={{ marginTop: 4, opacity: 0.65 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub, marginBottom: 8 }}>완료된 시험</Text>
                        {pastKeys.map(key => {
                          const group = ddayMap[key];
                          const dd = (app.ddays || []).find(d => d.id === key);
                          const days = dd?.date ? calcDDay(dd.date) : null;
                          const doneCnt = group.todos.filter(t => t.done).length;
                          const pct = group.todos.length > 0 ? Math.round((doneCnt / group.todos.length) * 100) : 0;
                          return (
                            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                              <Text style={{ fontSize: 13, color: T.sub, flex: 1 }}>
                                {dd?.label || '시험'}{days !== null ? ` D+${Math.abs(days)}` : ''}
                              </Text>
                              <Text style={{ fontSize: 12, color: T.sub }}>{doneCnt}/{group.todos.length} ({pct}%)</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </>
                );
              })() : (
                visibleTodos.length === 0 ? (
                  <Text style={{ fontSize: 14, color: T.sub, textAlign: 'center', paddingVertical: 12 }}>
                    {todoScopeFilter === 'all' ? '할 일이 없어요!' : `${todoScopeName(todoScopeFilter)} 할 일이 없어요!`}
                  </Text>
                ) : (
                  groupOrder.map(key => {
                    const group = groupMap[key];
                    const sorted = sortTodos(group.todos);
                    const undoneIds = sorted.filter(x => !x.done).map(x => x.id);
                    const groupDone = group.todos.filter(t => t.done).length;
                    return (
                      <View key={key} style={{ marginBottom: 8 }}>
                        {(groupOrder.length > 1 || key !== '__none__') && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, paddingHorizontal: 2 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: group.color }} />
                            <Text style={{ fontSize: 13, fontWeight: '800', color: group.color, flex: 1 }}>{group.label}</Text>
                            <Text style={{ fontSize: 12, color: T.sub }}>{groupDone}/{group.todos.length}</Text>
                          </View>
                        )}
                        {sorted.map(t => renderTodoRow(t, undoneIds))}
                      </View>
                    );
                  })
                )
              )}
              {/* 예정: 오늘 목록 소속인데 기한이 미래인 항목 — 기한 도래 시 위 목록에 자동 등장 */}
              {todoScopeFilter === 'today' && (() => {
                const upcoming = app.todos.filter(t => isUpcoming(t, todayStr)).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
                if (upcoming.length === 0) return null;
                return (
                  <View style={{ marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <Ionicons name="time-outline" size={13} color={T.sub} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub }}>예정 {upcoming.length}</Text>
                      <Text style={{ fontSize: 11, color: T.border }}>날짜가 되면 자동으로 올라와요 · 꾹:수정</Text>
                    </View>
                    {upcoming.map(t => (
                      <TouchableOpacity key={t.id} onLongPress={() => openEditTodo(t)} activeOpacity={0.7}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, opacity: 0.75 }}>
                        <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: T.surface2 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub }}>{dateChipLabel(t.dueDate, todayStr)}</Text>
                        </View>
                        <Text style={{ fontSize: 13, color: T.sub, flex: 1 }} numberOfLines={1}>{t.text}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })()}
              {/* 하단 완료 + 캐릭터 메시지 */}
              {todayTodos.length > 0 && (
                <View style={{ paddingTop: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: T.border, marginTop: 4 }}>
                  {doneCount > 0 && (
                    <Text style={{ fontSize: 13, fontWeight: '800', color: T.accent, marginBottom: 3 }}>
                      오늘 완료 {doneCount}개
                    </Text>
                  )}
                  <Text style={{ fontSize: 12, color: T.sub, textAlign: 'center' }}>
                    {getTodoMessage(doneCount, allDone, app.settings.mainCharacter)}
                  </Text>
                </View>
              )}
              {/* 반복 템플릿 목록 */}
              {(() => {
                const templates = app.todos.filter(t => t.isTemplate && t.repeatDays && t.repeatDays.length > 0);
                if (templates.length === 0) return null;
                const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
                const dayOrder = [1,2,3,4,5,6,0]; // 월~토, 일 순 (토·일 표시용)
                return (
                  <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                      <Ionicons name="repeat-outline" size={12} color={T.sub} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub }}>반복 할 일 템플릿</Text>
                      <Text style={{ fontSize: 11, color: T.border }}>탭:수정</Text>
                    </View>
                    {templates.map(t => (
                      <TouchableOpacity key={t.id} onPress={() => openEditTodo(t)} activeOpacity={0.7}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        {t.subjectColor && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.subjectColor }} />}
                        <Text style={{ fontSize: 13, color: T.sub, flex: 1 }} numberOfLines={1}>{t.text}</Text>
                        <Text style={{ fontSize: 11, color: T.sub }}>
                          {t.repeatDays.length === 7 ? '매일' : t.repeatDays.length === 5 && !t.repeatDays.includes(0) && !t.repeatDays.includes(6) ? '주중' : [...t.repeatDays].sort((a,b) => dayOrder.indexOf(a) - dayOrder.indexOf(b)).map(d => dayLabels[d]).join('·')}
                        </Text>
                        <TouchableOpacity onPress={() => {
                          Alert.alert(
                            '반복 할일 삭제',
                            `"${t.text}" 반복을 삭제할까요?\n오늘 생성된 항목도 함께 삭제됩니다.`,
                            [
                              { text: '취소', style: 'cancel' },
                              { text: '삭제', style: 'destructive', onPress: () => {
                                app.todos.filter(x => x.templateId === t.id).forEach(x => app.removeTodo(x.id));
                                app.removeTodo(t.id);
                              }},
                            ]
                          );
                        }} style={{ padding: 2 }}>
                          <Text style={{ fontSize: 14, color: T.sub }}>×</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })()}
            </View>
          );
        })()}

      {/* ── 할일 추가/수정 폼시트 (TodoFormSheet — 필드 상태는 시트 소유) ── */}
      <TodoFormSheet
        visible={showAddTodoModal} mode="add"
        initial={{ text: addTodoText, scope: todoScopeFilter === 'all' ? 'today' : todoScopeFilter }}
        onSave={handleAddSave} onClose={() => setShowAddTodoModal(false)}
        app={app} T={T} S={S} isTablet={isTablet} sheetMaxW={contentMaxW}
        todoLists={todoLists} todayLabel={todayLabel} examLabel={examLabel}
        todoDateToday={todoDateToday} todoDateChoices={todoDateChoices}
      />
      <TodoFormSheet
        visible={!!editTarget} mode="edit"
        initial={editTarget}
        onSave={handleEditSave} onClose={() => setEditTarget(null)}
        app={app} T={T} S={S} isTablet={isTablet} sheetMaxW={contentMaxW}
        todoLists={todoLists} todayLabel={todayLabel} examLabel={examLabel}
        todoDateToday={todoDateToday} todoDateChoices={todoDateChoices}
      />

      {/* ═══ 할일 목록 추가/이름변경 모달 ═══ */}
      <Modal visible={!!todoListModal} transparent animationType="fade" onRequestClose={() => setTodoListModal(null)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View style={[S.mo, { justifyContent: 'center' }]}>
            <View style={[S.modal, { backgroundColor: T.card, borderColor: T.border, alignSelf: 'center', width: '86%' }, isTablet && { maxWidth: 420 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Ionicons name={todoListModal?.mode === 'add' ? 'add-circle-outline' : 'create-outline'} size={18} color={T.accent} />
                <Text style={[S.modalTitle, { color: T.text, marginBottom: 0 }]}>{todoListModal?.mode === 'add' ? '새 목록 만들기' : '목록 이름 변경'}</Text>
              </View>
              <TextInput
                value={todoListName} onChangeText={setTodoListName}
                placeholder="목록 이름 (예: 단어장, 오답노트)" placeholderTextColor={T.sub}
                maxLength={12} autoFocus returnKeyType="done" onSubmitEditing={submitTodoListModal}
                style={[S.todoInput, { borderColor: T.accent, backgroundColor: T.surface, color: T.text, marginBottom: 8 }]}
              />
              {todoListModal?.mode === 'add' && (
                <Text style={{ fontSize: 12, color: T.sub, marginBottom: 12 }}>새 목록의 할 일은 매일 초기화되지 않고 계속 유지돼요</Text>
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setTodoListModal(null)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: T.sub }}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitTodoListModal}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: T.accent }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: 'white' }}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
