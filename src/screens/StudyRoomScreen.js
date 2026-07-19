// 스터디룸(같이 공부) — 방 코드 기반 실시간 presence 화면. 설계: docs/realtime-study-design.md
// Modal 전체 화면. app.config.js extra.firebase가 없으면 진입점 자체가 렌더되지 않음 (StatsScreen 가드)

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert,
  StyleSheet, Share, ActivityIndicator, KeyboardAvoidingView, Platform, Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../hooks/useAppState';
import { getTheme } from '../constants/colors';
import CharacterAvatar from '../components/CharacterAvatar';
import { getToday, formatShort } from '../utils/format';
import {
  validateNickname, normalizeRoomCode, extractRoomCode, displayStatus, todayStudySec, buildPresence,
  findGhostMembers, GHOST_MS, withNicknameTags,
  ROOM_THEMES, themeOf, TOTAL_SEATS, resolveSeats,
} from '../utils/studyRoomCore';
import {
  fetchProfile, saveProfile, fetchMyRoomId, createRoom, joinRoom, joinLounge, leaveRoom,
  deleteMyData, subscribeRoom, syncPresence, sweepGhostMembers, getMyUid, setMySeat,
} from '../utils/studyRoom';

const STORE_LINKS = 'iPhone: https://apps.apple.com/app/id6759892516\nAndroid: https://play.google.com/store/apps/details?id=com.yeolgong.timer';

// 클립보드 초대 코드 감지 — expo-clipboard 네이티브 모듈은 빌드 51+/vc60+에만 포함.
// 구빌드에 OTA로 이 코드가 실려도 require가 던지고 null 폴백 → 기능만 조용히 꺼짐 (durableAuthStorage와 동일 패턴)
let Clipboard = null;
try {
  const C = require('expo-clipboard');
  if (C && typeof C.getStringAsync === 'function') Clipboard = C;
} catch {}

export default function StudyRoomScreen({ visible, onClose }) {
  const app = useApp();
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale, app.settings.stylePreset);

  const [step, setStep] = useState('loading'); // loading | offline | intro | lobby | room
  const [profile, setProfile] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [roomData, setRoomData] = useState({ room: null, status: null });
  const [busy, setBusy] = useState(false);

  const scrollRef = useRef(null);
  // 폼 상태
  const [nickname, setNickname] = useState(app.settings.nickname || '');
  const [character, setCharacter] = useState(app.settings.mainCharacter || 'toru');
  const [roomName, setRoomName] = useState('');
  const [roomTheme, setRoomTheme] = useState('cafe'); // 방 생성 시 테마 (카페/독서실/교실)
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

  // 유령 멤버 정리 — 방 진입당 1회 (14일 무활동 익명 계정이 정원을 잠식하는 것 방지)
  const sweptRef = useRef(null); // 마지막으로 정리를 시도한 roomId
  useEffect(() => {
    if (step !== 'room' || !roomId || sweptRef.current === roomId) return;
    const { room, status } = roomData;
    if (!room?.members) return;
    sweptRef.current = roomId;
    const ghosts = findGhostMembers(room.members, status);
    if (ghosts.length) sweepGhostMembers(roomId, ghosts);
  }, [roomData, step, roomId]);

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

  // 멤버 ≤30이라 매 렌더 계산 (1초 틱 렌더에서 경과/스테일 판정이 같이 갱신됨).
  // 좌석 도면 배치는 resolveSeats — 본인이 고른 자리 우선, 미선택자는 앞번호 자동 착석
  const members = (() => {
    const { room, status } = roomData;
    if (!room?.members) return [];
    const today = getToday();
    const now = Date.now();
    return withNicknameTags(Object.entries(room.members)
      // 유령(14일 무활동)은 정리 반영 전에도 표시에서 제외
      .filter(([uid, m]) => (now - Math.max(m?.joinedAt || 0, status?.[uid]?.updatedAt || 0)) <= GHOST_MS)
      .map(([uid, m]) => {
        const d = displayStatus(status?.[uid], { nowMs: now, today });
        return {
          uid, nickname: m.nickname, character: m.character,
          joinedAt: m.joinedAt || 0, seat: m.seat,
          ...d, subjectLabel: status?.[uid]?.subjectLabel || '',
        };
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
    const r = await createRoom(roomName, profile, roomTheme);
    setBusy(false);
    if (!r.ok) { Alert.alert('방 만들기 실패', r.reason); return; }
    app.updateSettings({ studyRoomEnabled: true });
    setRoomId(r.roomId);
    setStep('room');
  };

  const joinByCode = async (code) => {
    setBusy(true);
    const r = await joinRoom(code, profile);
    setBusy(false);
    if (!r.ok) { Alert.alert('참여 실패', r.reason); return; }
    app.updateSettings({ studyRoomEnabled: true });
    setRoomId(r.roomId);
    setStep('room');
  };
  const handleJoin = () => joinByCode(normalizeRoomCode(codeInput));

  // 클립보드 초대 코드 감지 — 로비 진입 시 1회, 복사해둔 코드가 있으면 바로 입장 제안
  // (초대 여정을 '코드 복사 → 앱 열기 → 확인 탭'으로 단축. 줌/디스코드 패턴)
  const clipPromptedRef = useRef(null);
  useEffect(() => {
    if (!visible || step !== 'lobby' || !Clipboard || !profile) return;
    let alive = true;
    (async () => {
      try {
        const raw = await Clipboard.getStringAsync();
        const code = extractRoomCode(raw);
        if (!alive || !code || clipPromptedRef.current === code) return;
        clipPromptedRef.current = code; // 같은 코드로 반복 제안 방지 (거절 존중)
        setCodeInput(code);
        Alert.alert('초대 코드 발견', `복사한 코드 ${code}로 스터디룸에 입장할까요?`, [
          { text: '나중에' },
          { text: '입장', onPress: () => joinByCode(code) },
        ]);
      } catch {}
    })();
    return () => { alive = false; };
  }, [visible, step, profile]);

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
        <Text style={[S.label, { color: T.sub }]}>방 분위기</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          {Object.entries(ROOM_THEMES).map(([key, th]) => (
            <TouchableOpacity key={key}
              style={[S.themeChip, {
                borderColor: roomTheme === key ? T.accent : T.border,
                backgroundColor: roomTheme === key ? T.accent + '14' : T.surface2,
              }]}
              onPress={() => setRoomTheme(key)} activeOpacity={0.7}>
              <Ionicons name={th.icon} size={15} color={roomTheme === key ? T.accent : T.sub} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: roomTheme === key ? T.accent : T.sub }}>{th.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={[S.primaryBtn, { backgroundColor: T.accent }]} onPress={handleCreate} disabled={busy}>
          {busy ? <ActivityIndicator color="white" /> : <Text style={S.primaryBtnText}>방 만들기</Text>}
        </TouchableOpacity>
      </View>
      <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
        <Text style={[S.cardTitle, { color: T.text }]}>코드로 참여</Text>
        <TextInput
          style={[S.input, { color: T.text, borderColor: T.border, backgroundColor: T.surface2, letterSpacing: 4, textAlign: 'center', fontWeight: '800' }]}
          value={codeInput} onChangeText={setCodeInput} maxLength={6} autoCapitalize="characters"
          placeholder="ABC123" placeholderTextColor={T.sub}
          onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)} />
        <TouchableOpacity style={[S.primaryBtn, { backgroundColor: T.accent }]} onPress={handleJoin} disabled={busy}>
          {busy ? <ActivityIndicator color="white" /> : <Text style={S.primaryBtnText}>참여하기</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  // 빈 좌석 탭 → 그 자리로 이동 (내 멤버 레코드에 seat 저장 — 서버 반영은 구독이 자동 갱신)
  const handleSit = async (seatNo) => {
    Vibration.vibrate([0, 20]);
    await setMySeat(roomId, seatNo);
  };

  const renderRoom = () => {
    const now = Date.now();
    const myUid = getMyUid();
    // 공부 모드 3단계 — 자리 테두리 색 + 자리 상단 텍스트 (일반 녹색/집중 주황/울트라 빨강)
    const MODE_COLOR = { book: '#2ECC71', fire: '#FF8A3D', ultra: '#E74C3C' };
    const MODE_LABEL = { book: '일반', fire: '집중', ultra: '울트라집중' };
    const bySeat = resolveSeats(members);
    const seated = members.length;
    const theme = themeOf(roomData.room?.theme);
    // 칸막이(독서실): 좌/우/위 3면 두꺼운 테두리로 부스 느낌
    const partitionStyle = theme.partition
      ? { borderTopWidth: 4, borderLeftWidth: 3, borderRightWidth: 3, borderTopLeftRadius: 4, borderTopRightRadius: 4 }
      : null;

    const renderSeat = (no, ci) => {
      if (no === 0) return <View key={`aisle-${ci}`} style={{ flex: theme.aisleFlex || 0.5 }} />;
      const m = bySeat[no];
      const mine = m && m.uid === myUid;
      if (!m) {
        return (
          <TouchableOpacity key={no}
            style={[S.seat, !theme.partition && S.seatEmptyTile, partitionStyle, { borderColor: T.border, opacity: theme.partition ? 0.55 : 1 }]}
            onPress={() => handleSit(no)} activeOpacity={0.6}>
            <View style={[S.seatDesk, { backgroundColor: T.border, opacity: 0.45 }]} />
            <Text style={{ fontSize: 7, color: T.sub, opacity: 0.7, marginTop: 2 }}>빈자리</Text>
          </TouchableOpacity>
        );
      }
      const modeColor = MODE_COLOR[m.mode] || T.accent;
      return (
        <View key={no}
          style={[
            S.seat,
            partitionStyle,
            { backgroundColor: m.studying ? modeColor + '12' : T.surface2, borderColor: m.studying ? modeColor : T.border },
            theme.partition && !m.studying && { borderColor: T.sub + '55' },
            mine && { borderWidth: 2 },
            m.maybeAway && { opacity: 0.55 },
          ]}>
          {m.studying && (
            <Text style={[S.seatMode, { color: modeColor }]} numberOfLines={1}>{MODE_LABEL[m.mode] || '일반'}</Text>
          )}
          <View style={{ opacity: m.studying ? 1 : 0.5 }}>
            <CharacterAvatar characterId={m.character} size={24} />
          </View>
          <View style={[S.seatDesk, { backgroundColor: m.studying ? theme.desk : T.border }]} />
          <Text style={[S.seatName, { color: T.text }]} numberOfLines={1}>{m.displayName}</Text>
          {m.studying ? (
            <Text style={[S.seatInfo, { color: modeColor }]} numberOfLines={1}>
              {(m.subjectLabel || '공부')} {formatShort(Math.max(0, (now - m.startedAt) / 1000))}
            </Text>
          ) : (
            <Text style={[S.seatInfo, { color: T.sub }]} numberOfLines={1}>
              {m.todaySec > 0 ? formatShort(m.todaySec) : '휴식'}
            </Text>
          )}
          {mine && <View style={[S.seatMineDot, { backgroundColor: T.accent }]} />}
        </View>
      );
    };

    return (
      <View>
        <View style={[S.card, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={[S.cardTitle, { color: T.text }]} numberOfLines={1}>{roomData.room?.name || '스터디룸'}</Text>
              <Text style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>코드 {roomId} · {seated}/{TOTAL_SEATS}석 이용 중</Text>
            </View>
            <TouchableOpacity style={[S.iconBtn, { backgroundColor: T.accent + '18' }]} onPress={handleShareCode}>
              <Ionicons name="share-outline" size={18} color={T.accent} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 좌석 도면 — 테마별 배치(카페/독서실/교실), 빈자리 탭으로 이동 */}
        <View style={[S.floorCard, { backgroundColor: T.card, borderColor: T.border }]}>
          {theme.board && (
            <View style={S.chalkboard}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#E8F0E8', letterSpacing: 4 }}>칠판</Text>
            </View>
          )}
          {theme.zones.map((zone, zi) => (
            <View key={zi} style={{ marginBottom: 10 }}>
              {!!zone.label && <Text style={[S.zoneLabel, { color: T.sub }]}>{zone.label}</Text>}
              {zone.rows.map((row, ri) => (
                <View key={ri} style={S.seatRow}>
                  {row.map((no, ci) => renderSeat(no, ci))}
                </View>
              ))}
            </View>
          ))}
          <Text style={{ fontSize: 10, color: T.sub, opacity: 0.7, textAlign: 'center' }}>
            빈 책상을 누르면 그 자리로 옮겨요
          </Text>
        </View>

        <TouchableOpacity onPress={handleLeave} style={{ alignSelf: 'center', marginTop: 16, padding: 8 }}>
          <Text style={{ fontSize: 13, color: T.sub, textDecorationLine: 'underline' }}>방 나가기</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* 안드 Modal은 창 밀어올리기(adjustPan)가 적용되지 않아 padding 방식으로 통일
          (키보드 이벤트 기반이라 Dialog 창에서도 동작) + 코드 입력 포커스 시 스크롤 보정 */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: T.bg }}>
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
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
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
  floorCard: { borderRadius: 16, borderWidth: 1, padding: 12, paddingBottom: 8, marginBottom: 12 },
  zoneLabel: { fontSize: 10, fontWeight: '800', marginBottom: 5, letterSpacing: 0.5 },
  seatRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  seat: {
    flex: 1, height: 90, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 4, paddingHorizontal: 2, overflow: 'hidden',
  },
  seatMode: { fontSize: 7, fontWeight: '900', letterSpacing: 0.3, marginBottom: 1, maxWidth: '96%' },
  seatEmptyTile: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  seatDesk: { alignSelf: 'stretch', height: 5, borderRadius: 3, marginTop: 2, marginHorizontal: 5 },
  seatName: { fontSize: 8, fontWeight: '800', marginTop: 3, maxWidth: '96%' },
  seatInfo: { fontSize: 7.5, fontWeight: '700', marginTop: 1, maxWidth: '96%' },
  seatMineDot: { position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: 4 },
  seatMineChip: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1.5 },
  themeChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 10, paddingVertical: 9,
  },
  chalkboard: {
    backgroundColor: '#3E6B4F', borderRadius: 8, paddingVertical: 6,
    alignItems: 'center', marginBottom: 12, marginHorizontal: 20,
  },
});
