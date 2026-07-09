// 잠금 해제 챌린지 모달 — 🔥모드 이탈 후 복귀 시 문구를 따라 써야 해제.
// FocusScreen에서 코드 무변경 이동 (분해 작업). 입력 상태는 이 컴포넌트가 소유.
import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import CharacterAvatar from '../../components/CharacterAvatar';
import { getToday } from '../../utils/format';

export default function ChallengeModal({ app, T, S }) {
  const [challengeInput, setChallengeInput] = useState('');
  const challengeTarget = app.getChallengeText?.(app.settings.ultraFocusLevel || 'normal', app.ultraFocus?.challengeAwayMs || 0) || '집중';
  const challengeMatch = challengeInput.trim() === challengeTarget;
  const challengeAwayMin = Math.floor((app.ultraFocus?.challengeAwayMs || 0) / 60000);
  const challengeAwaySec = Math.floor(((app.ultraFocus?.challengeAwayMs || 0) % 60000) / 1000);

  return (
    <Modal visible={!!app.ultraFocus?.showChallenge} transparent animationType="fade">
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View style={S.chalOverlay}>
        <View style={[S.chalBox, { backgroundColor: T.card }]}>
          <CharacterAvatar characterId={app.settings.mainCharacter} size={90} />
          <Text style={{ fontSize: 15, fontWeight: '800', color: T.text, marginTop: 10 }}>
            {app.settings.mainCharacter === 'toru' ? '토루가 울고 있어...' : app.settings.mainCharacter === 'paengi' ? '팽이가 슬퍼하고 있어...' : app.settings.mainCharacter === 'taco' ? '타코가 실망했어...' : '토토루가 속상해...'}
          </Text>
          <View style={[S.chalInfo, { backgroundColor: '#FF6B6B12', borderColor: '#FF6B6B40' }]}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#FF6B6B' }}>이탈 시간</Text>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#FF6B6B', marginTop: 4 }}>
              {challengeAwayMin > 0 ? `${challengeAwayMin}분 ${challengeAwaySec}초` : `${challengeAwaySec}초`}
            </Text>
            <Text style={{ fontSize: 12, color: T.sub, marginTop: 4 }}>총 {app.ultraFocus?.exitCount || 0}번 이탈</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: T.sub, marginTop: 14 }}>다시 집중하려면 아래 문구를 따라 쓰세요</Text>
          <View style={[S.chalTargetBox, { backgroundColor: T.accent + '12', borderColor: T.accent + '40' }]}>
            <Text style={{ fontSize: 15, fontWeight: '900', color: T.accent, letterSpacing: 0 }}>{challengeTarget}</Text>
          </View>
          <TextInput style={[S.chalInput, { color: T.text, borderColor: challengeMatch ? '#4CAF50' : T.border, backgroundColor: challengeMatch ? '#4CAF5010' : T.bg }]}
            value={challengeInput} onChangeText={setChallengeInput} placeholder="여기에 입력..." placeholderTextColor={T.sub} autoFocus />
          <TouchableOpacity style={[S.chalBtn, { backgroundColor: challengeMatch ? T.accent : T.border }]}
            onPress={() => { if (challengeMatch) { setChallengeInput(''); app.dismissChallenge?.(); } }} disabled={!challengeMatch} activeOpacity={0.8}>
            <Text style={{ fontSize: 15, fontWeight: '900', color: challengeMatch ? 'white' : T.sub }}>{challengeMatch ? '다시 집중하기!' : '문구를 정확히 입력하세요'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 12, paddingVertical: 8 }} onPress={() => {
              // giveUpDate는 로컬 날짜(getToday)로 저장됨 — UTC(toISOString)로 비교하면 KST 새벽에 카운트가 어긋남
              const today = getToday();
              const todayCount = app.settings.giveUpDate === today ? (app.settings.giveUpCount || 0) : 0;
              const countMsg = todayCount > 0 ? `오늘 ${todayCount + 1}번째 그만하기예요.\n` : '';
              Alert.alert('정말 그만할까요?', `${countMsg}모든 타이머가 중단돼요`, [{ text: '계속하기', style: 'cancel' }, { text: '그만하기', style: 'destructive', onPress: () => { setChallengeInput(''); app.giveUpFocus?.(); } }]);
            }}>
            <Text style={{ fontSize: 13, color: T.sub, textDecorationLine: 'underline' }}>그만하기</Text>
          </TouchableOpacity>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
