// 닉네임 / 한마디 편집 모달 — 헤더 인사말 롱프레스로 열림.
// FocusScreen에서 코드 무변경 이동 (분해 작업). 입력 상태는 이 컴포넌트가 소유,
// 열릴 때(visible true) 현재 설정값으로 초기화.
import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity } from 'react-native';

export default function NicknameModal({ visible, onClose, app, T }) {
  const [editNickname, setEditNickname] = useState('');
  const [editMotto, setEditMotto] = useState('');
  useEffect(() => {
    if (visible) {
      setEditNickname(app.settings.nickname || '');
      setEditMotto(app.settings.motto || '');
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: '#00000055', justifyContent: 'center', padding: 24 }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{ backgroundColor: T.card, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: T.border }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: T.text, marginBottom: 16 }}>내 정보 설정</Text>

            <Text style={{ fontSize: 12, fontWeight: '600', color: T.sub, marginBottom: 6 }}>닉네임</Text>
            <TextInput
              style={{ borderWidth: 1.5, borderColor: T.border, borderRadius: 10, padding: 10, fontSize: 15, color: T.text, backgroundColor: T.surface, marginBottom: 14 }}
              placeholder="이름 또는 닉네임 (예: 민준, 수험생)"
              placeholderTextColor={T.sub}
              value={editNickname}
              onChangeText={setEditNickname}
              maxLength={12}
              returnKeyType="next"
            />

            <Text style={{ fontSize: 12, fontWeight: '600', color: T.sub, marginBottom: 6 }}>오늘의 한마디</Text>
            <TextInput
              style={{ borderWidth: 1.5, borderColor: T.border, borderRadius: 10, padding: 10, fontSize: 14, color: T.text, backgroundColor: T.surface, marginBottom: 20 }}
              placeholder="오늘의 목표나 다짐을 입력해요"
              placeholderTextColor={T.sub}
              value={editMotto}
              onChangeText={setEditMotto}
              maxLength={20}
              returnKeyType="done"
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: T.surface, borderWidth: 1, borderColor: T.border }}
                onPress={onClose}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.sub }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 2, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: T.accent }}
                onPress={() => {
                  app.updateSettings({ nickname: editNickname.trim(), motto: editMotto.trim() });
                  onClose();
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
