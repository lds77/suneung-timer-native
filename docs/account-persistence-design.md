# 계정 영속 설계 — 재설치해도 스터디룸 정체성/데이터 유지

2026-07-19 작성. 배경: 로컬 APK → 스토어 재설치 과정에서 익명 uid가 교체되어
라운지에 유령 멤버가 남고 스터디룸 정체성(닉네임/자리/방)이 소실되는 것을 실사용으로 확인.
일반 사용자도 앱 삭제/기기 초기화 시 동일하게 겪는다. 구현 전 설계 문서.

## 현재 구조와 취약점

- 인증: `signInAnonymously` + `getReactNativePersistence(AsyncStorage)` (studyRoom.js)
  → 리프레시 토큰이 **AsyncStorage에 저장**. iOS 키체인이 아니므로 **양 플랫폼 모두
  앱 삭제 = uid 영구 소실** (Firebase 네이티브 SDK와 달리 JS SDK는 키체인 미사용)
- Android `allowBackup: false` (app.config.js) → OS 자동백업도 차단 상태
- 공부 데이터(sessions/todos/settings)도 전부 AsyncStorage → 삭제 시 소실
  (JSON 수동 백업/복원만 존재, 백업 넛지로 유도 중)
- 소실 시 서버 잔재: 유령 멤버(14일 스윕으로 자가치유), users/{olduid} 고아 노드(정리 안 됨)

## 대안 비교

| 방안 | 재설치 생존 | 기기 이전 | 비용 | 비고 |
|------|-----------|----------|------|------|
| A. iOS 키체인 + Android 자동백업 | O | X | 소 (빌드 1회) | 사용자 동작 불필요 |
| B. 소셜 로그인 링크 (Apple/Google) | O | O | 중 (UI+네이티브+심사) | 선택적 제공 가능 |
| C. 복구 코드 (규칙 기반 bearer) | O | O | 소 | 보안 취약·자체 암호 설계 — **기각** |
| D. 이메일/비밀번호 | O | O | 중 | 초등~수험생 타겟에 마찰 큼 — **기각** |

## 권장: A를 기본으로, B를 후속 선택 기능으로

### 1단계 — A: 플랫폼 저장소 영속 (다음 네이티브 빌드에 포함, 빌드 51+/vc60+)

**iOS**: `expo-secure-store`로 AsyncStorage 인터페이스 셔임(getItem/setItem/removeItem)을
만들어 `initializeAuth`의 persistence로 주입 → 토큰이 키체인에 저장되고 **키체인은 앱
삭제 후에도 유지**(기기 초기화 전까지). 재설치 시 같은 uid로 자동 복귀.
- 주의: SecureStore 값 2KB 제한 — Firebase auth 영속 객체가 이를 넘는지 실측 필요.
  넘으면 리프레시 토큰만 SecureStore, 나머지는 AsyncStorage로 분리 저장.
- 기존 사용자 마이그레이션: 초기화 시 AsyncStorage에 토큰이 있으면 키체인으로 옮기고
  AsyncStorage 쪽은 삭제 (1회성).

**Android**: `allowBackup: true` + `dataExtractionRules`로 백업 대상을 지정 →
OS 자동백업(기기 잠금으로 암호화, GMS 필수)이 AsyncStorage를 통째로 보존.
재설치 시 **uid + 공부 데이터 전체**가 복원되는 보너스.
- 주의 1: **Android 정책 변경이므로 작업 규칙 1에 따라 사용자 승인 후 진행**
- 주의 2: allowBackup=false가 의도적이었는지 이력 확인 안 됨 — 특별한 사유 없으면 전환
- 주의 3: 복원되는 스냅샷이 오래됐을 수 있음 — 콜드스타트 복원 경로가 이미 방어
  (5시간 상한, 좀비 하트비트 가드, dedupeKey 멱등)하므로 추가 작업 불필요 판단.
  단, 복원 직후 `leavePrevRoomIfAny`/`fetchMyRoomId` 경로 1회 실기기 확인
- 주의 4: 자동백업은 24시간 주기·Wi-Fi 조건 — 백업 시점 이후 데이터는 소실될 수 있음.
  JSON 수동 백업 넛지는 그대로 유지

### 2단계 — B: 소셜 로그인 링크 (수요 확인 후, 선택 기능)

- `linkWithCredential`로 **익명 uid에 자격증명을 연결** → uid가 그대로 유지되므로
  서버 데이터 마이그레이션이 아예 불필요 (Firebase 익명 계정 업그레이드 표준 경로)
- 설정 화면에 "계정 보호" 항목: Apple(iOS 필수 요건)/Google 버튼 하나씩.
  로그인해도 앱 동작은 변화 없음 — 순수하게 복구 수단
- 기기 이전·다기기까지 커버되는 유일한 방안. 다만 공부 데이터(AsyncStorage)는
  서버에 없으므로 기기 이전 시 JSON 백업 병행 필요 → 장기적으로 RTDB에 세션
  동기화를 붙일지는 별도 결정 (비용/규칙 복잡도 증가, 현 사용자 규모에선 보류)
- 심사 영향: 소셜 로그인을 넣으면 Apple 심사 지침상 Sign in with Apple 필수 —
  Google만 단독 제공은 불가

## 하지 않기로 한 것

- **C(복구 코드)**: RTDB 규칙의 data 비교로 bearer 토큰 흉내는 가능하나, 코드 유출 =
  계정 탈취이고 레이트리밋 불가. 자체 인증 설계는 하지 않는다
- **서버 세션 동기화**: 계정 영속과 별개 주제. Blaze 요금제/규칙 복잡도 대비
  현 규모(MAU ~100)에서 실익 없음. B단계 이후 수요 있으면 재검토
- **users/{olduid} 고아 노드 자동 정리**: 규칙상 본인만 삭제 가능해 클라이언트로는
  불가. 크기가 미미(닉네임 1건)하므로 방치, 눈에 띄면 콘솔 정리

## 구현 순서 (다음 네이티브 빌드 사이클)

1. iOS SecureStore 셔임 + 토큰 마이그레이션 (iOS 단독, 승인 불필요)
2. Android allowBackup 전환 — **사용자 승인 후**
3. EAS 빌드 → 실기기에서 "설치→방 입장→삭제→재설치→같은 uid 확인" 시나리오 검증
4. B단계는 1~2 배포 후 사용자 피드백 보고 결정
