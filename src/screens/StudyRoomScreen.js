// 스터디룸(같이 공부) — 방 코드 기반 실시간 presence 화면. 설계: docs/realtime-study-design.md
// Modal 전체 화면. app.config.js extra.firebase가 없으면 진입점 자체가 렌더되지 않음 (StatsScreen 가드)

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert,
  StyleSheet, Share, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../hooks/useAppState';
import { getTheme } from '../constants/colors';
import CharacterAvatar from '../components/CharacterAvatar';
import { getToday, formatDuration } from '../utils/format';
import {
  validateNickname, normalizeRoomCode, displayStatus, sortMembers, todayStudySec, buildPresence,
} from '../utils/studyRoomCore';
import {
  fetchProfile, saveProfile, fetchMyRoomId, createRoom, joinRoom, joinLounge, leaveRoom,
  deleteMyData, subscribeRoom, syncPresence,
} from '../utils/studyRoom';

const STORE_LINKS = 'iPhone: https://apps.apple.com/app/id6759892516\nAndroid: https://play.google.com/store/apps/details?id=com.yeolgong.timer';

export default function StudyRoomScreen({ visible, onClose }) {
  const app = useApp();
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale, app.settings.stylePreset);

  const [step, setStep] = useState('loading'); // loading | offline | intro | lobby | room
  const [profile, setProfile] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [roomData, setRoomData] = useState({ room: null, status: null });
  const [busy, setBusy] = useState(false);

  // 폼 상태
  const [nickname, setNickname] = useState(app.settings.nickname || '');
  const [character, setCharacter] = useState(app.settings.mainCharacter || 'toru');
  const [roomName, setRoomName] = useState('');
  const [codeInput, setCodeInput] = useState('');

  // 1초 틱 — 공부 중 멤버의 경과 표시용 (로컬 계산, 네트워크 없음)
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!visible || step !== 'room') return;
    const iv = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(iv);
  }, [visible, step]);

  // 열 때 초기화: 프로필 → 방 조회
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    (async () => {
      setStep('loading');
      const p = await fetchProfile();
      if (!alive) return;
      if (p === null) {
        // 프로필 없음 = 미가입 (네트워크 실패도 여기로 — intro에서 재시도)
        setStep('intro');
        return;
      }
      setProfile(p);
      const rid = await fetchMyRoomId();
      if (!alive) return;
      setRoomId(rid);
      setStep(rid ? 'room' : 'lobby');
    })();
    return () => { alive = false; };
  }, [visible]);

  // 방 실시간 구독
  useEffect(() => {
    if (!visible || step !== 'room' || !roomId) return;
    const unsub = subscribeRoom(roomId, setRoomData);
    // 입장 직후 내 presence 1회 반영 (이후엔 useAppState effect가 상태 변화 시 처리)
    const active = app.timers.find(t => t.type !== 'lap' && t.status === 'running') || null;
    syncPresence(buildPresence(active, {
      todaySec: todayStudySec(app.sessions, getToday()), today: getToday(),
      focusMode: app.focusMode, ultraFocusLevel: app.settings.ultraFocusLevel || 'normal',
    }));
    return unsub;
  }, [visible, step, roomId]);

  // 멤버 ≤30이라 매 렌더 계산 (1초 틱 렌더에서 경과/스테일 판정이 같이 갱신됨)
  const members = (() => {
    const { room, status } = roomData;
    if (!room?.members) return [];
    const today = getToday();
    const now = Date.now();
    return sortMembers(Object.entries(room.members).map(([uid, m]) => {
      const d = displayStatus(status?.[uid], { nowMs: now, today });
      return { uid, nickname: m.nickname, character: m.character, ...d, subjectLabel: status?.[uid]?.subjectLabel || '' };
    }));
  })();

  // ── 액션 ──
  const handleStart = async () => {
    const v = validateNickname(nickname);
    if (!v.ok) { Alert.alert('닉네임 확인', v.reason); return; }
    setBusy(true);
    const ok = await saveProfile({ nickname: v.value, character });
    setBusy(false);
    if (!ok) { Alert.alert('연결 실패', '네트워크를 확인하고 다시 시도해 주세요.'); return; }
    setProfile({ nickname: v.value, character });
    setStep('lobby');
  };

  const handleCreate = async () => {
    setBusy(true);
    const r = await createRoom(roomName, profile);
    setBusy(false);
    if (!r.ok) { Alert.alert('방 만들기 실패', r.reason); return; }
    app.updateSettings({ studyRoomEnabled: true });
    setRoomId(r.roomId);
    setStep('room');
  };

  const handleJoin = async () => {
    const code = normalizeRoomCode(codeInput);
    setBusy(true);
    const r = await joinRoom(code, profile);
    setBusy(false);
    if (!r.ok) { Alert.alert('참여 실패', r.reason); return; }
    app.updateSettings({ studyRoomEnabled: true });
    setRoomId(r.roomId);
    setStep('room');
  };

  const handleJoinLounge = async () => {
    setBusy(true);
    const r = await joinLounge(profile);
    setBusy(false);
    if (!r.ok) { Alert.alert('입장 실패', r.reason); return; }
    app.updateSettings({ studyRoomEnabled: true });
    setRoomId(r.roomId);
    setStep('room');
  };

  const handleShareCode = () => {
    const name = roomData.room?.name || '스터디룸';
    Share.share({
      message: `[열공메이트] "${name}" 스터디룸에 초대해요!\n앱에서 통계탭 > 스터디룸 > 코드 입력: ${roomId}\n\n${STORE_LINKS}`,
    }).catch(() => {});
  };

  const handleLeave = () => {
    Alert.alert('방 나가기', '이 방에서 나갈까요? 코드가 있으면 다시 들어올 수 있어요.', [
      { text: '취소', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: async () => {
        await leaveRoom();
        setRoomId(null);
        setRoomData({ room: null, status: null });
        setStep('lobby');
      } },
    ]);
  };

  const handleDisable = () => {
    Alert.alert('스터디룸 끄기', '방에서 나가고 서버의 내 정보(닉네임·공부 상태)를 삭제해요. 공부 기록은 폰에 그대로 남아요.', [
      { text: '취소', style: 'cancel' },
      { text: '끄고 삭제', style: 'destructive', onPress: async () => {
        await deleteMyData();
        app.updateSettings({ studyRoomEnabled: false });
        setProfile(null); setRoomId(null); setRoomData({ room: null, status: null });
        onClose();
      } },
    ]);
  };

  // ── 렌더 ──
  const renderIntro = () => (
    <View>
      <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
        <Text style={[S.cardTitle, { color: T.text }]}>친구와 같이 공부해요</Text>
        <Text style={[S.desc, { color: T.sub }]}>
          방 코드를 아는 친구들끼리 서로의 공부 상태를 실시간으로 봐요.{'\n'}
          공유되는 건 닉네임, 캐릭터, 지금 공부 중인지, 오늘 공부시간뿐이에요.{'\n'}
          통계·플래너 등 상세 기록은 절대 공유되지 않아요.
        </Text>
      </View>
      <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
        <Text style={[S.label, { color: T.sub }]}>친구에게 보일 캐릭터 (탭해서 변경)</Text>
        <View style={{ alignItems: 'center', marginVertical: 10 }}>
          <CharacterAvatar characterId={character} size={72} tappable onCharChange={setCharacter} />
        </View>
        <Text style={[S.label, { color: T.sub }]}>닉네임 (2~12자)</Text>
        <TextInput
          style={[S.input, { color: T.text, borderColor: T.border, backgroundColor: T.surface2 }]}
          value={nickname} onChangeText={setNickname} maxLength={12}
          placeholder="예: 수학왕지민" placeholderTextColor={T.sub} />
        <TouchableOpacity style={[S.primaryBtn, { backgroundColor: T.accent }]} onPress={handleStart} disabled={busy}>
          {busy ? <ActivityIndicator color="white" /> : <Text style={S.primaryBtnText}>시작하기</Text>}
        </TouchableOpacity>
        <Text style={[S.fineprint, { color: T.sub }]}>
          가입 절차 없이 익명으로 시작돼요. 앱을 삭제하면 스터디룸 정보는 복구할 수 없어요.
        </Text>
      </View>
    </View>
  );

  const renderLobby = () => (
    <View>
      <TouchableOpacity style={[S.card, { backgroundColor: T.card, borderColor: T.accent + '55' }]} onPress={handleJoinLounge} disabled={busy} activeOpacity={0.8}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[S.iconBtn, { backgroundColor: T.accent + '18' }]}>
            <Ionicons name="people" size={18} color={T.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[S.cardTitle, { color: T.text }]}>공개 라운지 입장</Text>
            <Text style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>전국의 열공메이트 유저들과 같이 공부해요</Text>
          </View>
          {busy ? <ActivityIndicator color={T.accent} /> : <Ionicons name="chevron-forward" size={18} color={T.sub} />}
        </View>
      </TouchableOpacity>
      <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
        <Text style={[S.cardTitle, { color: T.text }]}>새 방 만들기</Text>
        <TextInput
          style={[S.input, { color: T.text, borderColor: T.border, backgroundColor: T.surface2 }]}
          value={roomName} onChangeText={setRoomName} maxLength={16}
          placeholder="방 이름 (예: 3반 스터디)" placeholderTextColor={T.sub} />
        <TouchableOpacity style={[S.primaryBtn, { backgroundColor: T.accent }]} onPress={handleCreate} disabled={busy}>
          {busy ? <ActivityIndicator color="white" /> : <Text style={S.primaryBtnText}>방 만들기</Text>}
        </TouchableOpacity>
      </View>
      <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
        <Text style={[S.cardTitle, { color: T.text }]}>코드로 참여</Text>
        <TextInput
          style={[S.input, { color: T.text, borderColor: T.border, backgroundColor: T.surface2, letterSpacing: 4, textAlign: 'center', fontWeight: '800' }]}
          value={codeInput} onChangeText={setCodeInput} maxLength={6} autoCapitalize="characters"
          placeholder="ABC123" placeholderTextColor={T.sub} />
        <TouchableOpacity style={[S.primaryBtn, { backgroundColor: T.accent }]} onPress={handleJoin} disabled={busy}>
          {busy ? <ActivityIndicator color="white" /> : <Text style={S.primaryBtnText}>참여하기</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderRoom = () => {
    const now = Date.now();
    return (
      <View>
        <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={[S.cardTitle, { color: T.text }]} numberOfLines={1}>{roomData.room?.name || '스터디룸'}</Text>
              <Text style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>코드 {roomId} · {members.length}명</Text>
            </View>
            <TouchableOpacity style={[S.iconBtn, { backgroundColor: T.accent + '18' }]} onPress={handleShareCode}>
              <Ionicons name="share-outline" size={18} color={T.accent} />
            </TouchableOpacity>
          </View>
        </View>

        {members.map(m => {
          // 공부 모드 3단계 배지 (편하게/집중/울트라집중)
          const MODE_BADGE = {
            book: { icon: 'book-outline', label: '편하게', color: T.sub },
            fire: { icon: 'flame-outline', label: '집중', color: '#FF8A3D' },
            ultra: { icon: 'flame', label: '울트라집중', color: '#E74C3C' },
          };
          const badge = m.studying ? MODE_BADGE[m.mode] || MODE_BADGE.book : null;
          return (
          <View key={m.uid} style={[S.memberRow, { backgroundColor: T.card, borderColor: m.studying ? T.accent + '55' : T.border }]}>
            <CharacterAvatar characterId={m.character} size={40} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[S.memberName, { color: T.text }]} numberOfLines={1}>{m.nickname}</Text>
                {badge && (
                  <View style={[S.modeChip, { backgroundColor: badge.color + '1A' }]}>
                    <Ionicons name={badge.icon} size={11} color={badge.color} />
                    <Text style={{ fontSize: 10, fontWeight: '800', color: badge.color }}>{badge.label}</Text>
                  </View>
                )}
              </View>
              {m.studying ? (
                <Text style={{ fontSize: 12, color: T.accent, fontWeight: '700' }} numberOfLines={1}>
                  {m.subjectLabel || '공부 중'} · {formatDuration(Math.max(0, (now - m.startedAt) / 1000))}
                  {m.maybeAway ? ' (자리비움일 수 있음)' : ''}
                </Text>
              ) : (
                <Text style={{ fontSize: 12, color: T.sub }}>쉬는 중</Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={[S.dot, { backgroundColor: m.studying ? '#2ECC71' : T.border }]} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: T.text, marginTop: 4 }}>{formatDuration(m.todaySec) || '0분'}</Text>
              <Text style={{ fontSize: 10, color: T.sub }}>오늘</Text>
            </View>
          </View>
          );
        })}

        <TouchableOpacity onPress={handleLeave} style={{ alignSelf: 'center', marginTop: 16, padding: 8 }}>
          <Text style={{ fontSize: 13, color: T.sub, textDecorationLine: 'underline' }}>방 나가기</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: T.bg }}>
        <View style={[S.header, { borderBottomColor: T.border }]}>
          <TouchableOpacity onPress={onClose} style={S.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-down" size={24} color={T.text} />
          </TouchableOpacity>
          <Text style={[S.headerTitle, { color: T.text }]}>스터디룸</Text>
          {profile ? (
            <TouchableOpacity onPress={handleDisable} style={S.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="settings-outline" size={20} color={T.sub} />
            </TouchableOpacity>
          ) : <View style={S.iconBtn} />}
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {step === 'loading' && <ActivityIndicator color={T.accent} style={{ marginTop: 60 }} />}
          {step === 'intro' && renderIntro()}
          {step === 'lobby' && renderLobby()}
          {step === 'room' && renderRoom()}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const S = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: Platform.OS === 'ios' ? 54 : 16, paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '900' },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '900' },
  desc: { fontSize: 13, lineHeight: 20, marginTop: 8 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginTop: 6 },
  primaryBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  primaryBtnText: { color: 'white', fontSize: 15, fontWeight: '900' },
  fineprint: { fontSize: 11, lineHeight: 16, marginTop: 10, textAlign: 'center' },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  memberName: { fontSize: 14, fontWeight: '800', flexShrink: 1 },
  modeChip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
