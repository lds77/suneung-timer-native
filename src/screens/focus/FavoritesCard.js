// 즐겨찾기 타이머 카드 — 카운트다운/카운트업 탭 전환 + 편집 모달 2종.
// FocusScreen에서 분리해 과목탭(내 과목)으로 이전 (2026-07-19, 코드 무변경 이동).
// 자체 완결형: 스타일은 focus/styles의 createStyles를 직접 생성, 상태도 내부 소유.
// 타이머 시작 시 onStarted() 호출 — 호출부(SubjectsScreen)가 집중탭으로 이동시킨다.
// (집중모드 선택 모달은 App.js 전역 오버레이라 어느 탭에서 시작해도 정상 동작)
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Alert, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createStyles } from './styles';
import { getSchoolDefaultFavs, resolveIcon } from './helpers';

export default function FavoritesCard({ app, T, onStarted }) {
  const { width: winW } = useWindowDimensions();
  const isTablet = winW >= 600;
  const tabletModalW = Math.min(640, Math.round(winW * 0.8));
  const fs = T.fontScale * (isTablet ? 1.1 : 1.0);
  const S = useMemo(() => createStyles(fs), [fs]);

  const favs = app.favs || [];
  const countupFavs = app.countupFavs || [];
  const school = app.settings.schoolLevel || 'high';
  const [favTab, setFavTab] = useState('countdown'); // 'countdown' | 'countup'
  const [showFavMgr, setShowFavMgr] = useState(false);
  const [showCountupFavMgr, setShowCountupFavMgr] = useState(false);

  const addToFav = (fav) => { app.addFav?.(fav); };
  const removeFav = (id) => { app.removeFav?.(id); };
  const checkCanStart = () => {
    const running = app.timers.find(t => t.status === 'running' && t.type !== 'lap');
    if (running) { app.showToastCustom(`⏱ 타이머가 실행 중입니다`, 'paengi'); return false; }
    return true;
  };
  const runCountupFav = (fav) => {
    if (!checkCanStart()) return;
    app.addTimer({ type: 'free', label: fav.label, color: fav.color, totalSec: 0 });
    onStarted?.();
  };
  const runFav = (fav) => {
    if (!checkCanStart()) return;
    if (fav.type === 'sequence' && fav.seqItems) {
      const items = fav.seqItems.map(it => ({ label: it.label, color: it.color, totalSec: it.min * 60, type: 'countdown', isBreak: !!it.isBreak }));
      app.startSequence({ items, breakSec: (fav.seqBreak ?? 5) * 60, seqName: fav.label, seqIcon: fav.icon, seqColor: fav.color });
    } else {
      app.addTimer({ type: fav.type, label: fav.label, color: fav.color, subjectId: fav.subjectId || null, totalSec: fav.totalSec || 0, pomoWorkMin: fav.pomoWorkMin || 25, pomoBreakMin: fav.pomoBreakMin || 5 });
    }
    onStarted?.();
  };

  return (
    <>
      {/* ═══ 즐겨찾기 (탭 전환형) ═══ */}
      <View style={[S.quickSec, { backgroundColor: T.card, borderColor: T.border }]}>
        {/* 헤더: 탭 전환 + 편집 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
          <TouchableOpacity
            onPress={() => setFavTab('countdown')}
            style={[S.favTabBtn, { backgroundColor: favTab === 'countdown' ? T.accent : T.surface2, borderColor: favTab === 'countdown' ? T.accent : T.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="alarm-outline" size={14} color={favTab === 'countdown' ? 'white' : T.sub} />
              <Text style={[S.favTabBtnT, { color: favTab === 'countdown' ? 'white' : T.sub }]}>카운트다운</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFavTab('countup')}
            style={[S.favTabBtn, { backgroundColor: favTab === 'countup' ? T.accent : T.surface2, borderColor: favTab === 'countup' ? T.accent : T.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="stopwatch-outline" size={14} color={favTab === 'countup' ? 'white' : T.sub} />
              <Text style={[S.favTabBtnT, { color: favTab === 'countup' ? 'white' : T.sub }]}>카운트업</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ marginLeft: 'auto' }}
            onPress={() => favTab === 'countdown' ? setShowFavMgr(true) : setShowCountupFavMgr(true)}>
            <Text style={[S.quickEdit, { color: T.accent }]}>편집</Text>
          </TouchableOpacity>
        </View>
        {/* 즐겨찾기 2행 (3칸 × 2) */}
        {favTab === 'countdown' ? (
          <>
            {[0, 1].map(row => (
              <View key={row} style={S.favGrid}>
                {[0, 1, 2].map(col => {
                  const i = row * 3 + col;
                  const fav = favs[i];
                  if (fav) return (
                    <TouchableOpacity key={fav.id} style={[S.favCell, { backgroundColor: T.surface2, borderColor: T.border }]} onPress={() => runFav(fav)}
                      onLongPress={() => Alert.alert('삭제', `${fav.label} 삭제?`, [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => removeFav(fav.id) }])}>
                      <Ionicons name={resolveIcon(fav.icon) || 'timer-outline'} size={18} color={fav.color} style={{ marginBottom: 2 }} />
                      <Text style={[S.favCellLabel, { color: fav.color }]} numberOfLines={1}>{fav.label}</Text>
                    </TouchableOpacity>
                  );
                  return (
                    <TouchableOpacity key={`ecd${i}`} style={[S.favCell, { backgroundColor: T.surface2, borderColor: T.border, borderStyle: 'dashed' }]} onPress={() => setShowFavMgr(true)}>
                      <Text style={S.favCellIcon}>+</Text>
                      <Text style={[S.favCellLabel, { color: T.sub }]}>추가</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </>
        ) : (
          <>
            {[0, 1].map(row => (
              <View key={row} style={S.favGrid}>
                {[0, 1, 2].map(col => {
                  const i = row * 3 + col;
                  const fav = countupFavs[i];
                  if (fav) return (
                    <TouchableOpacity key={fav.id} style={[S.favCell, { backgroundColor: T.surface2, borderColor: T.border }]} onPress={() => runCountupFav(fav)}
                      onLongPress={() => Alert.alert('삭제', `${fav.label}을(를) 즐겨찾기에서 삭제할까요?`, [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => app.removeCountupFav(fav.id) }])}>
                      <Ionicons name={resolveIcon(fav.icon) || 'timer-outline'} size={18} color={fav.color} style={{ marginBottom: 2 }} />
                      <Text style={[S.favCellLabel, { color: fav.color }]} numberOfLines={1}>{fav.label}</Text>
                    </TouchableOpacity>
                  );
                  return (
                    <TouchableOpacity key={`ecu${i}`} style={[S.favCell, { backgroundColor: T.surface2, borderColor: T.border, borderStyle: 'dashed' }]} onPress={() => setShowCountupFavMgr(true)}>
                      <Text style={S.favCellIcon}>+</Text>
                      <Text style={[S.favCellLabel, { color: T.sub }]}>추가</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </>
        )}
      </View>

      {/* ═══ 즐겨찾기 편집 모달 ═══ */}
      <Modal visible={showFavMgr} transparent animationType="fade">
        <View style={S.mo}><View style={[S.moScroll, isTablet && { alignItems: 'center' }, { justifyContent: 'center', flex: 1 }]}><View style={[S.modal, { backgroundColor: T.card, borderColor: T.border }, isTablet && { maxWidth: tabletModalW, width: '100%' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="star" size={16} color="#F0B429" />
            <Text style={[S.modalTitle, { color: T.text }]}>즐겨찾기 편집</Text>
          </View>
          <Text style={[S.favSecLabel, { color: T.sub }]}>현재 ({favs.length}/6) · 탭하면 삭제</Text>
          <View style={S.favMgrGrid}>{favs.map(f => (
            <TouchableOpacity key={f.id} style={[S.favMgrChip, { backgroundColor: f.color + '15', borderColor: f.color }]} onPress={() => removeFav(f.id)}>
              <Ionicons name={resolveIcon(f.icon) || 'timer-outline'} size={13} color={f.color} /><Text style={[S.favMgrChipT, { color: f.color }]} numberOfLines={1}>{f.label}</Text><Text style={[S.favMgrX, { color: f.color }]}>×</Text></TouchableOpacity>
          ))}</View>
          {favs.length < 6 && (<>
            <Text style={[S.favSecLabel, { color: T.text, marginTop: 14 }]}>추가하기</Text>
            <View style={S.favMgrGrid}>{[
              { label: '뽀모 25+5', icon: 'nutrition-outline', type: 'pomodoro', color: '#E17055', totalSec: 0, pomoWorkMin: 25, pomoBreakMin: 5 },
              { label: '뽀모 50+10', icon: 'nutrition-outline', type: 'pomodoro', color: '#E17055', totalSec: 0, pomoWorkMin: 50, pomoBreakMin: 10 },
              { label: '뽀모 15+5', icon: 'nutrition-outline', type: 'pomodoro', color: '#E17055', totalSec: 0, pomoWorkMin: 15, pomoBreakMin: 5 },
              { label: '3분 어택', icon: 'alarm-outline', type: 'countdown', color: '#6C5CE7', totalSec: 180 },
              { label: '5분 어택', icon: 'alarm-outline', type: 'countdown', color: '#6C5CE7', totalSec: 300 },
              { label: '10분 어택', icon: 'alarm-outline', type: 'countdown', color: '#6C5CE7', totalSec: 600 },
            ].map(item => { const ex = favs.some(f => f.label === item.label); return (
              <TouchableOpacity key={item.label} style={[S.favAddChip, { borderColor: ex ? T.border : item.color + '60', backgroundColor: ex ? T.surface2 : item.color + '08' }]} onPress={() => !ex && addToFav(item)} disabled={ex}>
                <Ionicons name={resolveIcon(item.icon) || 'timer-outline'} size={13} color={ex ? T.sub : item.color} /><Text style={[S.favAddChipT, { color: ex ? T.sub : item.color }]}>{item.label}</Text>
                {ex ? <Text style={{ fontSize: 12, color: T.sub }}>✓</Text> : <Text style={{ fontSize: 14, fontWeight: '800', color: item.color }}>+</Text>}</TouchableOpacity>); })}</View>
          </>)}
          <TouchableOpacity style={{ marginTop: 12, alignItems: 'center' }} onPress={() => { app.setFavs?.(getSchoolDefaultFavs(school)); app.showToastCustom('기본 복원!', 'toru'); }}><Text style={[S.favResetT, { color: T.sub }]}>기본으로 복원</Text></TouchableOpacity>
          <TouchableOpacity style={[S.favDoneBtn, { backgroundColor: T.accent }]} onPress={() => setShowFavMgr(false)}><Text style={S.favDoneBtnT}>완료</Text></TouchableOpacity>
        </View></View></View>
      </Modal>

      {/* ═══ 공부량 즐겨찾기 편집 모달 ═══ */}
      <Modal visible={showCountupFavMgr} transparent animationType="fade">
        <View style={S.mo}><ScrollView style={{ flex: 1 }} contentContainerStyle={[S.moScroll, isTablet && { alignItems: 'center' }]}><View style={[S.modal, { backgroundColor: T.card, borderColor: T.border }, isTablet && { maxWidth: tabletModalW, width: '100%' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="trending-up-outline" size={16} color={T.accent} />
            <Text style={[S.modalTitle, { color: T.text }]}>공부량 즐겨찾기 편집</Text>
          </View>
          <Text style={[S.favSecLabel, { color: T.sub }]}>현재 ({countupFavs.length}/6) · 탭하면 삭제</Text>
          <View style={S.favMgrGrid}>{countupFavs.map(f => (
            <TouchableOpacity key={f.id} style={[S.favMgrChip, { backgroundColor: f.color + '15', borderColor: f.color }]} onPress={() => app.removeCountupFav(f.id)}>
              <Ionicons name={resolveIcon(f.icon) || 'timer-outline'} size={13} color={f.color} />
              <Text style={[S.favMgrChipT, { color: f.color }]} numberOfLines={1}>{f.label}</Text>
              <Text style={[S.favMgrX, { color: f.color }]}>×</Text>
            </TouchableOpacity>
          ))}</View>
          {countupFavs.length < 6 && (<>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14, marginBottom: 6 }}>
              <Ionicons name="book-outline" size={12} color={T.text} />
              <Text style={[S.favSecLabel, { color: T.text, marginBottom: 0 }]}>과목 추가</Text>
            </View>
            <View style={S.favMgrGrid}>{[
              { id: 'cp_kor', label: '국어', icon: 'book-outline', color: '#E8575A' },
              { id: 'cp_math', label: '수학', icon: 'calculator-outline', color: '#4A90D9' },
              { id: 'cp_eng', label: '영어', icon: 'globe-outline', color: '#5CB85C' },
              { id: 'cp_hst', label: '한국사', icon: 'time-outline', color: '#E17055' },
              { id: 'cp_exp1', label: '탐구1', icon: 'flask-outline', color: '#F5A623' },
              { id: 'cp_exp2', label: '탐구2', icon: 'flask-outline', color: '#9B6FC3' },
              { id: 'cp_sec', label: '제2외국어', icon: 'language-outline', color: '#00B894' },
              { id: 'cp_free', label: '자유공부', icon: 'pencil-outline', color: '#6C5CE7' },
            ].map(item => { const ex = countupFavs.some(f => f.label === item.label); return (
              <TouchableOpacity key={item.id} style={[S.favAddChip, { borderColor: ex ? T.border : item.color + '60', backgroundColor: ex ? T.surface2 : item.color + '08' }]} onPress={() => !ex && app.addCountupFav(item)} disabled={ex}>
                <Ionicons name={resolveIcon(item.icon) || 'book-outline'} size={13} color={ex ? T.sub : item.color} />
                <Text style={[S.favAddChipT, { color: ex ? T.sub : item.color }]}>{item.label}</Text>
                {ex ? <Text style={{ fontSize: 12, color: T.sub }}>✓</Text> : <Text style={{ fontSize: 14, fontWeight: '800', color: item.color }}>+</Text>}
              </TouchableOpacity>
            ); })}</View>
            {app.subjects.length > 0 && (<>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14, marginBottom: 6 }}>
                <Ionicons name="list-outline" size={12} color={T.text} />
                <Text style={[S.favSecLabel, { color: T.text, marginBottom: 0 }]}>내 과목</Text>
              </View>
              <View style={S.favMgrGrid}>{app.subjects.map(subj => { const ex = countupFavs.some(f => f.label === subj.name); return (
                <TouchableOpacity key={subj.id} style={[S.favAddChip, { borderColor: ex ? T.border : subj.color + '60', backgroundColor: ex ? T.surface2 : subj.color + '08' }]} onPress={() => !ex && app.addCountupFav({ label: subj.name, icon: 'book-outline', color: subj.color })} disabled={ex}>
                  <Ionicons name="book-outline" size={13} color={ex ? T.sub : subj.color} />
                  <Text style={[S.favAddChipT, { color: ex ? T.sub : subj.color }]}>{subj.name}</Text>
                  {ex ? <Text style={{ fontSize: 12, color: T.sub }}>✓</Text> : <Text style={{ fontSize: 14, fontWeight: '800', color: subj.color }}>+</Text>}
                </TouchableOpacity>
              ); })}</View>
            </>)}
          </>)}
          <TouchableOpacity style={[S.favDoneBtn, { backgroundColor: T.accent }]} onPress={() => setShowCountupFavMgr(false)}>
            <Text style={S.favDoneBtnT}>완료</Text>
          </TouchableOpacity>
        </View></ScrollView></View>
      </Modal>
    </>
  );
}
