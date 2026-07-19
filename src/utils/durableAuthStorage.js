// 계정 영속 어댑터 — Firebase 익명 인증 토큰을 iOS 키체인에 복제해
// 앱 재설치에도 uid(스터디룸 정체성)가 살아남게 한다. 설계: docs/account-persistence-design.md
//
// Firebase JS SDK의 getReactNativePersistence()에 AsyncStorage 대신 주입하는
// AsyncStorage 호환 인터페이스(getItem/setItem/removeItem).
// - 읽기: AsyncStorage 우선. 없으면(재설치 직후) SecureStore(키체인)에서 복구해 되채움
// - 읽기 성공 시 키체인에 미러 — 기존 사용자가 새 빌드 첫 실행만 해도 마이그레이션 완료
// - 쓰기/삭제: 양쪽 모두. SecureStore 실패는 전부 무시 — 영속성이 없어질 뿐 인증은 정상
// - Android: allowBackup(OS 자동백업)이 같은 역할이라 SecureStore 미사용 (secure=null)
// - 구빌드(expo-secure-store 네이티브 없음)에 OTA로 이 코드가 실려도: require가 던지고
//   secure=null 폴백 → 기존 AsyncStorage 단독 동작과 완전 동일 (안전)
//
// ※ SecureStore 키는 [A-Za-z0-9._-]만 허용 — Firebase 키('firebase:authUser:...')의
//   금지 문자를 '_'로 치환. 값 2048바이트 초과 시 경고가 뜰 수 있으나 iOS 키체인은 동작함
//   (실기기 검증 항목 — 설계 문서 구현 순서 3)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const secureKey = (k) => k.replace(/[^A-Za-z0-9._-]/g, '_');

export const createDurableStorage = (primary, secure) => ({
  async getItem(key) {
    let v = null;
    try { v = await primary.getItem(key); } catch {}
    if (v != null) {
      if (secure) secure.setItemAsync(secureKey(key), v).catch(() => {});
      return v;
    }
    if (!secure) return null;
    try {
      const sv = await secure.getItemAsync(secureKey(key));
      if (sv != null) await primary.setItem(key, sv); // 재설치 복구 → 이후 읽기는 primary
      return sv;
    } catch { return null; }
  },
  async setItem(key, value) {
    await primary.setItem(key, value);
    if (secure) { try { await secure.setItemAsync(secureKey(key), value); } catch {} }
  },
  async removeItem(key) {
    await primary.removeItem(key);
    if (secure) { try { await secure.deleteItemAsync(secureKey(key)); } catch {} }
  },
});

const loadSecureStore = () => {
  if (Platform.OS !== 'ios') return null;
  try {
    const SS = require('expo-secure-store');
    return SS && typeof SS.setItemAsync === 'function' ? SS : null;
  } catch { return null; } // 네이티브 모듈 없는 구빌드
};

export const durableAuthStorage = createDurableStorage(AsyncStorage, loadSecureStore());
