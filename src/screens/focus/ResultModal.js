// src/screens/focus/ResultModal.js
// 타이머 완료 결과 + 자기평가 모달 (+ 공부 시간 수정 시트).
//
// **App.js 루트에서 렌더한다** — FocusScreen 안에 있으면 다른 탭에 있을 때 화면에 뜨지 않는다
// (react-native-screens가 비활성 탭을 뷰 계층에서 떼어내므로 Modal도 함께 사라짐).
// 알림을 눌러 앱에 들어왔는데 마지막 탭이 통계였다면 결과를 아예 못 보던 문제.
// 잠금 오버레이(LockOverlay)·챌린지 모달과 같은 루트 렌더링 계열.
//
// FocusScreen과 공유하는 것은 스타일(focus/styles.js)뿐 — 상태는 전부 이 컴포넌트 안에 있다.

import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Modal, Alert,
  KeyboardAvoidingView, useWindowDimensions, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../hooks/useAppState';
import { getTheme } from '../../constants/colors';
import { formatDuration } from '../../utils/format';
import { getTier } from '../../constants/presets';
import { getDensityBreakdown } from '../../utils/density';
import { maybeAskReview } from '../../utils/reviewAsk';
import NumberField from '../../components/NumberField';
import Toast from '../../components/Toast';
import { createStyles } from './styles';

export default function ResultModal() {
  const app = useApp();
  const { width: winW } = useWindowDimensions();
  const isTablet = winW >= 600;
  const contentMaxW = isTablet ? Math.round(winW * 0.83) : winW;
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale, app.settings.stylePreset);
  const fs = T.fontScale * (isTablet ? 1.1 : 1.0);
  const S = useMemo(() => createStyles(fs), [fs]);

  const [resultSelfRating, setResultSelfRating] = useState(null);
  const [resultMemo, setResultMemo] = useState('');
  const [resultTodoDone, setResultTodoDone] = useState(false); // 연결된 할 일 완료로 표시
  const [resultShowBreakdown, setResultShowBreakdown] = useState(false); // 점수 상세 펼침
  const [editingDuration, setEditingDuration] = useState(false); // 공부시간 수정 시트 열림
  const [editHour, setEditHour] = useState(0);
  const [editMin, setEditMin] = useState(0);

  // 결과 모달 닫기 공통 처리 (확인/건너뛰기/뒤로가기) — 할일 완료 토글 반영 + 입력 상태 리셋
  const closeResultModal = () => {
    const data = app.completedResultData;
    if (resultTodoDone && data?.todoId) {
      const todo = app.todos.find(x => x.id === data.todoId && !x.done);
      if (todo) app.toggleTodo(todo.id);
    }
    app.setCompletedResultData(null);
    if (data?.timerId) app.removeTimer(data.timerId);
    setResultSelfRating(null);
    setResultMemo('');
    setResultTodoDone(false);
    setResultShowBreakdown(false);
    setEditingDuration(false);
    // 스토어 리뷰 요청 — 모달 닫힘 애니메이션 후 (정책·빈도 제한은 reviewAsk가 판정)
    setTimeout(() => maybeAskReview(app.sessions.length, app.settings, app.updateSettings), 700);
  };

  return (
    <>
      {/* ── 완료 결과 + 자기평가 ── */}
      {/* ★시간 수정 시트를 이 Modal '안'에 렌더한다 — 형제 Modal로 두면 iOS에서 안 뜬다★
          iOS의 Modal은 네이티브 화면 전환(UIViewController present)이라, 이미 하나가 떠 있는
          상태에서 형제 Modal을 또 띄우면 조용히 무시된다. 안드는 Modal이 그냥 뷰라 잘 떠서
          **안드에서만 정상 동작**했다(실기기 제보 2026-08-01).
          → 두 번째 Modal을 없애고 절대 위치 오버레이로 바꿔 양 플랫폼 동일하게 만들었다.
          ※같은 이유로 이 파일에 Modal을 하나 더 추가하지 말 것 */}
      {/* 안드 뒤로가기: 수정 시트가 열려 있으면 그것만 닫는다.
          예전엔 수정 시트가 별도 Modal이라 자기 onRequestClose로 처리됐는데, 오버레이로
          바꾸면서 이 분기가 없으면 뒤로가기 한 번에 결과 모달까지 통째로 닫힌다 */}
      <Modal visible={!!app.completedResultData} transparent animationType="slide"
        onRequestClose={() => { if (editingDuration) setEditingDuration(false); else closeResultModal(); }}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={[S.mo, { justifyContent: 'flex-end' }]}>
          <View style={[S.selfRatingSheet, { backgroundColor: T.bg }, isTablet && { maxWidth: contentMaxW, width: '100%', alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: T.border }]}>
            <View style={[S.selfRatingHandle, { backgroundColor: T.border }]} />
            {/* 계획 타이머라도 모달은 항상 뜨고(5분 기준), 목표의 80%를 넘긴 세션에서만
                '계획 달성!'으로 축하한다 — planAchieved는 useAppState.planResultExtras가 판정.
                ※예전엔 80%를 넘겨야 모달 자체가 떴고 계획 세션을 묶어 넘겼다(planSessionIds).
                  그래서 목표에 못 미치면 자기평가 기회조차 없었다 (2026-08-01 변경) */}
            <Ionicons
              name={app.completedResultData?.planAchieved ? 'calendar-outline' : 'checkmark-circle-outline'}
              size={32} color={T.accent} style={{ textAlign: 'center', alignSelf: 'center', marginBottom: 2 }} />
            <Text style={[S.selfRatingTitle, { color: T.text }]}>{app.completedResultData?.planAchieved ? '계획 달성!' : '공부 완료!'}</Text>
            {/* 결과 정보 */}
            {app.completedResultData?.result && (() => {
              const selfBonus = (resultSelfRating === 'fire' || resultSelfRating === 'perfect') ? 3 : 0;
              const displayDensity = Math.max(56, Math.min(103, (app.completedResultData.result.density || 0) + selfBonus));
              const displayTier = getTier(displayDensity);
              const inputs = app.completedResultData.result.densityInputs; // 구 스냅샷 결과엔 없을 수 있음
              return (
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <View style={[S.resTier, { backgroundColor: displayTier.color + '20', marginBottom: 4 }]}>
                    <Text style={[S.resTierT, { color: displayTier.color }]}>{displayTier.label}</Text>
                  </View>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: displayTier.color }}>
                    밀도 {displayDensity}점{selfBonus > 0 ? <Text style={{ fontSize: 15, color: displayTier.color }}> (+{selfBonus})</Text> : null}
                  </Text>
                  <Text style={{ fontSize: 13, color: T.sub, marginTop: 3 }}>
                    {formatDuration(app.completedResultData.result.durationSec || 0)}
                    {app.completedResultData.isSeq ? ` · ${app.completedResultData.seqTotal}개 항목 완주` : ''}
                  </Text>
                  {/* 점수 근거 — 타이머 사용 행동 기반이라는 걸 투명하게 보여줌 */}
                  {inputs && (
                    <TouchableOpacity onPress={() => setResultShowBreakdown(v => !v)} activeOpacity={0.7}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6, paddingVertical: 3, paddingHorizontal: 8 }}>
                      <Text style={{ fontSize: 12, color: T.sub, fontWeight: '700' }}>점수 상세</Text>
                      <Ionicons name={resultShowBreakdown ? 'chevron-up' : 'chevron-down'} size={12} color={T.sub} />
                    </TouchableOpacity>
                  )}
                  {inputs && resultShowBreakdown && (() => {
                    const bd = getDensityBreakdown({ ...inputs, selfRating: resultSelfRating });
                    const rows = [
                      { label: '완료', val: `${bd.completionScore}/40` },
                      { label: `습관 · 일시정지 ${inputs.pausedCount || 0}회`, val: `${bd.habitScore}/30` },
                      { label: '지속력', val: `${bd.persistenceBonus}/15` },
                      { label: inputs.focusMode === 'screen_on' ? `집중모드 · 이탈 ${inputs.exitCount || 0}회` : '일반모드', val: `+${bd.declarationBonus}` },
                      { label: '자가평가', val: `+${bd.selfBonus}` },
                    ];
                    return (
                      <View style={{ alignSelf: 'stretch', backgroundColor: T.card, borderWidth: 1, borderColor: T.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 6 }}>
                        {rows.map(r => (
                          <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                            <Text style={{ fontSize: 12, color: T.sub }}>{r.label}</Text>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: T.text }}>{r.val}</Text>
                          </View>
                        ))}
                        <Text style={{ fontSize: 10, color: T.sub, marginTop: 4 }}>
                          타이머 사용 습관으로 계산하는 참고 점수예요 · 최저 56점(C) 보장
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              );
            })()}
            {/* 연결된 할 일 완료 토글 — 할일 '집중 시작'으로 켠 타이머일 때만 */}
            {(() => {
              const data = app.completedResultData;
              if (!data?.todoId) return null;
              const todo = app.todos.find(x => x.id === data.todoId && !x.done);
              if (!todo) return null;
              return (
                <TouchableOpacity onPress={() => setResultTodoDone(v => !v)} activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, marginBottom: 12,
                    backgroundColor: resultTodoDone ? T.accent + '15' : T.card,
                    borderWidth: resultTodoDone ? 2 : 1, borderColor: resultTodoDone ? T.accent : T.border }}>
                  <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                    borderColor: resultTodoDone ? T.accent : T.border, backgroundColor: resultTodoDone ? T.accent : 'transparent' }}>
                    {resultTodoDone && <Ionicons name="checkmark" size={13} color="white" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: T.text }} numberOfLines={1}>{todo.text}</Text>
                    <Text style={{ fontSize: 11, color: T.sub, marginTop: 1 }}>이 할 일을 완료로 표시</Text>
                  </View>
                </TouchableOpacity>
              );
            })()}
            <Text style={{ fontSize: 14, color: T.sub, textAlign: 'center', marginBottom: 12 }}>오늘 공부 어땠나요?</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              {[
                { icon: 'flame', label: '완전 집중', value: 'fire', bonus: '+3점', color: '#FF6B9D' },
                { icon: 'happy-outline', label: '보통이었어', value: 'normal', bonus: '±0점', color: T.sub },
                { icon: 'moon-outline', label: '좀 딴 짓', value: 'sleepy', bonus: '±0점', color: '#B2BEC3' },
              ].map(opt => (
                <TouchableOpacity key={opt.value}
                  style={[S.selfRatingBtn, { backgroundColor: T.card, borderColor: resultSelfRating === opt.value ? opt.color : T.border, borderWidth: resultSelfRating === opt.value ? 2 : 1 }]}
                  onPress={() => setResultSelfRating(opt.value)}>
                  <Ionicons name={opt.icon} size={28} color={opt.color} style={{ marginBottom: 6 }} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: T.text, textAlign: 'center' }}>{opt.label}</Text>
                  <Text style={{ fontSize: 11, color: opt.color, fontWeight: '700', marginTop: 3 }}>{opt.bonus}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              value={resultMemo}
              onChangeText={setResultMemo}
              placeholder="한줄 메모 (선택)"
              placeholderTextColor={T.sub}
              style={[S.memoInput, { borderColor: T.border, color: T.text, backgroundColor: T.surface }]}
              maxLength={50}
            />
            <TouchableOpacity
              style={{ width: '100%', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 8, backgroundColor: resultSelfRating ? T.accent : T.border }}
              onPress={() => {
                if (!resultSelfRating) { app.showToastCustom('자기평가를 선택해주세요!', 'paengi'); return; }
                const data = app.completedResultData;
                if (data?.seqSessionIds?.length) {
                  // 연속모드: 마지막 완료 세션에만 자기평가 적용 (중간 세션은 이미 밀도 계산됨)
                  const lastSeqId = data.seqSessionIds[data.seqSessionIds.length - 1];
                  app.updateSessionSelfRating(lastSeqId, resultSelfRating, resultMemo.trim() || null);
                } else if (data?.sessionId) {
                  app.updateSessionSelfRating(data.sessionId, resultSelfRating, resultMemo.trim() || null);
                }
                closeResultModal();
              }}>
              <Text style={{ color: 'white', fontSize: 15, fontWeight: '900', letterSpacing: 1 }}>완료</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={closeResultModal}
              style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ fontSize: 14, color: T.sub }}>건너뛰기</Text>
            </TouchableOpacity>
            {/* 방금 끝난 기록 정정 — 잊은 타이머 등 잘못 기록된 세션의 시간 수정/삭제 (지나간 통계는 건드리지 않음) */}
            {(() => {
              const data = app.completedResultData;
              if (!data) return null;
              const ids = data.sessionId ? [data.sessionId] : (data.seqSessionIds || []);
              if (ids.length === 0) return null;
              // 연속모드(여러 세션 묶음)만 시간 정정 대상에서 제외 — 삭제만.
              // ※계획 타이머는 2026-08-01부터 세션 단위(sessionId)로 오므로 시간 수정도 된다
              const canEditTime = !!data.sessionId;
              return (
                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 18, paddingTop: 2, paddingBottom: 6 }}>
                  {canEditTime && (
                    <TouchableOpacity onPress={() => {
                      const cur = data.result?.durationSec || 0;
                      setEditHour(Math.floor(cur / 3600));
                      setEditMin(Math.round((cur % 3600) / 60));
                      setEditingDuration(true);
                    }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="create-outline" size={14} color={T.sub} />
                      <Text style={{ fontSize: 13, color: T.sub, fontWeight: '700' }}>시간 수정</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => {
                    Alert.alert('기록 삭제', '방금 기록한 공부 시간을 삭제(폐기)할까요?\n통계에서도 빠집니다.', [
                      { text: '취소', style: 'cancel' },
                      { text: '삭제', style: 'destructive', onPress: () => {
                        app.deleteSessions(ids);
                        app.showToastCustom('기록을 삭제했어요', 'paengi');
                        closeResultModal();
                      } },
                    ]);
                  }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="trash-outline" size={14} color="#E8575A" />
                    <Text style={{ fontSize: 13, color: '#E8575A', fontWeight: '700' }}>기록 삭제</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}
          </View>
        </View>

        {/* 공부 시간 수정 시트 — 결과 모달 위 오버레이 (★Modal이 아니다★ — 위 주석 참조).
            잊은 타이머 등을 실제 시간으로 정정 (한 번 수정하면 재수정·삭제 불가) */}
        {editingDuration && (
        <View style={[StyleSheet.absoluteFill, S.mo, { justifyContent: 'center', paddingHorizontal: 24 }]}>
          <View style={[{ backgroundColor: T.bg, borderRadius: 20, padding: 20 }, isTablet && { maxWidth: 420, width: '100%', alignSelf: 'center' }]}>
            <Text style={{ fontSize: 17, fontWeight: '900', color: T.text, textAlign: 'center', marginBottom: 4 }}>공부 시간 수정</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color: T.accent, textAlign: 'center', marginBottom: 16 }}>
              {editHour > 0 ? `${editHour}시간 ` : ''}{editMin}분
            </Text>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub, marginBottom: 6, textAlign: 'center' }}>시간</Text>
              <NumberField value={editHour} onChange={setEditHour} min={0} max={5} unit="시간" colors={T} />
            </View>
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub, marginBottom: 6, textAlign: 'center' }}>분</Text>
              <NumberField value={editMin} onChange={setEditMin} min={0} max={59} unit="분" colors={T} />
            </View>
            <View style={{ backgroundColor: '#E8575A18', borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: T.text, lineHeight: 18 }}>
                입력한 시간이 통계에 그대로 반영됩니다. 실제 공부한 시간을 정확히 입력해 주세요.{'\n'}수정한 뒤에는 이 기록을 다시 바꾸거나 삭제할 수 없어요.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setEditingDuration(false)}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: T.card, borderWidth: 1, borderColor: T.border }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: T.sub }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                const data = app.completedResultData;
                if (!data?.sessionId) { setEditingDuration(false); return; }
                const newSec = editHour * 3600 + editMin * 60;
                if (newSec < 60) { app.showToastCustom('1분 이상 입력해 주세요', 'paengi'); return; }
                if (newSec > 5 * 3600) { app.showToastCustom('최대 5시간까지 입력할 수 있어요', 'paengi'); return; }
                Alert.alert('시간 수정', `${editHour > 0 ? editHour + '시간 ' : ''}${editMin}분으로 수정할까요?\n\n입력한 시간이 통계에 그대로 반영되며, 수정 후에는 되돌릴 수 없어요.`, [
                  { text: '취소', style: 'cancel' },
                  { text: '수정', onPress: () => {
                    app.updateSessionDuration(data.sessionId, newSec);
                    app.setCompletedResultData(prev => prev ? { ...prev, result: { ...prev.result, durationSec: newSec } } : prev);
                    setEditingDuration(false);
                    app.showToastCustom('시간을 수정했어요', 'toru');
                  } },
                ]);
              }}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: T.accent }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: 'white' }}>수정하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        )}
        {/* ★Modal 안에서는 App.js 루트의 Toast가 보이지 않는다★ — 안드 Modal은 별도 창이라
            그 아래 렌더된 것이 통째로 가린다. 이 파일의 토스트는 '자기평가를 선택해주세요',
            '1분 이상 입력해 주세요' 같은 **저장이 막힌 이유**라, 안 보이면 사용자는 버튼이
            먹통이라고 느낀다(오답노트에서 같은 증상 제보 2026-08-03).
            같은 상태(app.toast)를 이 창에도 그린다 — 호출부는 그대로 둔다.
            ※위 주석의 'Modal을 하나 더 추가하지 말 것'과 충돌하지 않는다(Toast는 Modal이 아니다) */}
        <Toast message={app.toast.message} characterId={app.toast.char} visible={app.toast.visible} colors={T} />
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
