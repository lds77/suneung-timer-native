// stats/components/DayDetail.js
// 날짜 상세 공용 렌더 — 가로모드 인라인(마스터-디테일)과 세로모드 바텀시트 모달이 공유한다.
// 과거 두 벌로 중복 구현돼 있어 섹션 추가(완료한 할 일) 때 한쪽 누락 버그가 났던 부채의 단일화.
// SubjectRatioCard는 일간/주간/월간 과목 비율 카드로도 쓰인다 (구 renderSubjects).

import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDuration, formatShort } from '../../../utils/format';
import { getTier } from '../../../constants/presets';
import { stripLeadingEmoji, formatHM } from '../helpers';
import SubjectDonut from './SubjectDonut';

// 과목 비율 카드 — 4과목 이하는 도넛+목록 나란히, 많으면 도넛 위/목록 아래
export function SubjectRatioCard({ data, label, T, S }) {
  if (!data || data.length === 0) return null;
  const rows = data.map((s, i) => (
    <View key={i} style={S.subjRow}>
      <View style={[S.subjDot, { backgroundColor: s.color }]} />
      <Text style={[S.subjName, { color: T.text }]}>{s.name}</Text>
      <Text style={[S.subjPct, { color: T.sub }]}>{s.pct}%</Text>
      <Text style={[S.subjTime, { color: T.text }]}>{formatShort(s.sec)}</Text>
    </View>
  ));
  return (
    <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
      <Text style={[S.secLabel, { color: T.sub }]}>{label}</Text>
      {data.length <= 4 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <SubjectDonut data={data} T={T} />
          <View style={{ flex: 1 }}>{rows}</View>
        </View>
      ) : (
        <>
          <View style={{ alignItems: 'center', marginBottom: 10 }}>
            <SubjectDonut data={data} T={T} size={130} />
          </View>
          {rows}
        </>
      )}
    </View>
  );
}

// 세션 1개 카드 (과목색 보더 + 시각/시간/티어/인증/울트라/메모)
function SessionCard({ sess, subjects, T, S }) {
  const subj = subjects.find(s => s.id === sess.subjectId);
  const tier = getTier(sess.focusDensity || 0);
  const startH = sess.startedAt ? formatHM(sess.startedAt) : '';
  const endH = sess.startedAt ? formatHM(sess.startedAt + (sess.durationSec || 0) * 1000) : '';
  return (
    <View style={[S.sessCard, { borderLeftColor: subj ? subj.color : '#B2BEC3' }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: subj ? subj.color : '#B2BEC3' }} />
          <Text style={{ fontSize: 14, fontWeight: subj ? '700' : '400', color: subj ? T.text : T.sub }}>{subj ? subj.name : (stripLeadingEmoji(sess.label) || '—')}</Text>
        </View>
        <Text style={{ fontSize: 14, color: T.sub }}>{startH}{endH ? ` ~ ${endH}` : ''}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 14, color: T.accent, fontWeight: '600' }}>{formatShort(sess.durationSec)}</Text>
        <View style={[S.tierSmallBadge, { backgroundColor: tier.color + '25' }]}>
          <Text style={{ fontSize: 13, color: tier.color, fontWeight: '700' }}>{tier.label} {sess.focusDensity || 0}점</Text>
        </View>
        {sess.verified && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Ionicons name="trophy" size={11} color="#F5A623" />
            <Text style={{ fontSize: 11, color: '#F5A623', fontWeight: '700' }}>인증</Text>
          </View>
        )}
        {sess.ultraFocusLevel === 'exam' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Ionicons name="flame" size={11} color="#FF6B6B" />
            <Text style={{ fontSize: 11, color: '#FF6B6B', fontWeight: '700' }}>울트라</Text>
          </View>
        )}
      </View>
      {sess.memo && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
          <Ionicons name="chatbubble-outline" size={11} color={T.sub} />
          <Text style={{ fontSize: 13, color: T.sub }}>{sess.memo}</Text>
        </View>
      )}
    </View>
  );
}

// 날짜 상세 본문: 요약 3카드 + 과목 비율 + 세션 기록 + 완료한 할 일 + 빈 상태.
// 헤더(제목/닫기)와 스크롤 래퍼는 호출부(인라인/모달) 소유.
export function DayDetailContent({ dayDetail, subjects, todoLog, T, S }) {
  if (!dayDetail) return null;
  const doneTodos = (todoLog || []).filter(e => e.date === dayDetail.date);
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
          <Text style={[S.sLabel, { color: T.sub }]}>총 공부시간</Text>
          <Text style={[S.sVal, { color: T.accent }]}>{formatDuration(dayDetail.totalSec)}</Text>
          {dayDetail.avgDensity > 0 && dayDetail.totalSec > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
              <Ionicons name="flame" size={11} color="#E17055" />
              <Text style={{ fontSize: 11, color: T.sub }}>순공 {formatShort(Math.round(dayDetail.totalSec * dayDetail.avgDensity / 100))}</Text>
            </View>
          )}
        </View>
        <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
          <Text style={[S.sLabel, { color: T.sub }]}>집중밀도</Text>
          <Text style={[S.sVal, { color: dayDetail.tier.color }]}>
            {dayDetail.sessions.length > 0 ? `${dayDetail.tier.label} ${dayDetail.avgDensity}점` : '-'}
          </Text>
        </View>
        <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.border, flex: 1 }]}>
          <Text style={[S.sLabel, { color: T.sub }]}>세션</Text>
          <Text style={[S.sVal, { color: T.text }]}>{dayDetail.sessions.length}회</Text>
        </View>
      </View>
      {dayDetail.subjects.length > 0 && <SubjectRatioCard data={dayDetail.subjects} label="과목 비율" T={T} S={S} />}
      {dayDetail.sessions.length > 0 && (
        <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
          <Text style={[S.secLabel, { color: T.sub }]}>세션 기록</Text>
          {dayDetail.sessions.map(sess => (
            <SessionCard key={sess.id} sess={sess} subjects={subjects} T={T} S={S} />
          ))}
        </View>
      )}
      {/* 완료한 할 일 (완료 로그 — 리셋으로 항목이 삭제돼도 보존) */}
      {doneTodos.length > 0 && (
        <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
          <Text style={[S.secLabel, { color: T.sub }]}>완료한 할 일 {doneTodos.length}</Text>
          {doneTodos.map(e => (
            <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 }}>
              <Ionicons name="checkmark-circle" size={14} color={e.subjectColor || '#27AE60'} />
              <Text style={{ fontSize: 13, color: T.text, flex: 1 }} numberOfLines={2}>{e.text}</Text>
              {e.subjectLabel && <Text style={{ fontSize: 11, color: T.sub }}>{e.subjectLabel}</Text>}
            </View>
          ))}
        </View>
      )}
      {dayDetail.sessions.length === 0 && (
        <Text style={[S.emptyText, { color: T.sub }]}>이 날은 공부 기록이 없어요</Text>
      )}
    </>
  );
}
