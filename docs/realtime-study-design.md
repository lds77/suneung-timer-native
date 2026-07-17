# 실시간 "같이 공부" 기능 설계 문서

> 작성: 2026-07-17 (Claude Fable 5). 목적: 이후 세션/모델이 이 문서만 보고 단계별 구현할 수 있게
> 핵심 설계 결정을 전부 내려둔다. 구현 전 이 문서를 통독할 것.
> 관련 배경: 열품타(YPT)류 앱의 핵심 리텐션 기능. 현재 열공메이트는 서버·로그인 없음.

---

## 0. 제품 결정 (확정)

| 결정 | 내용 | 이유 |
|------|------|------|
| 모델 | **스터디룸(그룹) 코드 기반**, 개별 친구관계 없음 | 친구요청/수락 UX·차단·신고가 전부 생략됨. 반 친구들끼리 코드 공유가 실사용 패턴 |
| 계정 | **Firebase 익명 인증 + 닉네임/캐릭터만** | 로그인 화면 없음. 이메일/전화번호 수집 안 함 — "가입 없음" 셀링포인트 최대한 보존 |
| 공유 범위 | 닉네임, 캐릭터, 지금 공부 중 여부(+과목 라벨), 오늘 누적 공부시간 **만** | 세션 상세/통계/플래너는 서버에 절대 올리지 않음 (데이터 최소화) |
| 게이팅 | `settings.studyRoomEnabled` 기본 false — 기능을 켠 유저만 네트워크 사용 | 기존 유저 무영향. 미사용 시 완전 로컬 앱 유지 |
| 백엔드 | **Firebase** (Auth 익명 + Realtime Database) | 아래 1절 |

## 1. 스택 선택: Firebase (Supabase 대비)

- **RTDB `onDisconnect()`가 결정적**: 앱 강제종료/네트워크 단절 시 서버가 자동으로 '공부 끝' 처리.
  Supabase Realtime presence도 가능하지만 RN에서 소켓 수명 관리가 더 까다롭고 레퍼런스가 적다.
- Firebase **JS SDK는 순수 JS** → 네이티브 모듈 불필요 → **기존 바이너리에 OTA로도 배포 가능**
  (`@react-native-firebase/*` 네이티브 SDK는 쓰지 말 것 — prebuild 필요해짐).
- 전부 RTDB만 사용 (Firestore 혼용 금지 — 데이터가 단순해서 한 DB로 충분, 과금·규칙 단순화).
- 무료 티어(Spark): 동시 연결 100, 저장 1GB, 다운로드 10GB/월 — 현재 규모(MAU 100)에 충분.
  동시 연결 100 초과 시점(대략 DAU 500+)에 Blaze 전환 검토.

## 2. 데이터 모델 (RTDB)

```
/users/{uid}
  nickname: string (2~12자, 로컬 금칙어 필터 통과분)
  character: string ('toru' | 'paengi' | ...)
  roomId: string | null        // 현재 소속 방 (1인 1방 — 단순화)
  createdAt: number

/rooms/{roomId}                // roomId = 6자리 대문자+숫자 코드 (예: 'A3K9QZ')
  name: string (방 이름, 1~16자)
  ownerUid: string
  createdAt: number
  members/{uid}: { nickname, character, joinedAt }   // 최대 30명

/status/{roomId}/{uid}         // presence — 방 단위로 묶어 구독 1회로 전체 수신
  state: 'studying' | 'idle'
  subjectLabel: string | ''    // 과목명만 (과목 id/색상 등 로컬 정보 불필요)
  startedAt: number | null     // 공부 시작 시각 (경과 표시는 클라이언트가 계산)
  todaySec: number             // 오늘 누적 초 (아래 3.3 규칙으로 클라이언트가 갱신)
  date: string                 // todaySec의 기준일 'YYYY-MM-DD' (KST) — 자정 리셋 판별
  updatedAt: number
```

- 방 목록 화면 = `/status/{roomId}` 구독 하나로 렌더 (멤버 메타는 `/rooms/{roomId}/members` 1회 read).
- 과거 이력·랭킹 보존 없음(오늘만). 이력이 필요해지면 그때 `/daily/{roomId}/{date}/{uid}` 추가.

## 3. 동작 규칙

### 3.1 초기화·가입
1. 설정탭(또는 새 '스터디룸' 진입점)에서 기능 켬 → `signInAnonymously()` → 닉네임/캐릭터 입력 → `/users/{uid}` 생성.
2. Auth 영속화: `initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })` 필수
   (기본 메모리 영속이면 재시작마다 새 uid가 생겨 유령 유저가 쌓인다).
3. **앱 삭제 = 계정 유실**임을 켜기 화면에 명시 (익명 인증의 트레이드오프. 복구 기능 안 만듦).

### 3.2 Presence
- 타이머 시작(단일 활성 타이머 제약 덕에 신호가 깔끔): `/status/{roomId}/{uid}`에
  `{ state:'studying', subjectLabel, startedAt: Date.now(), ... }` set.
- 타이머 종료/일시정지: `state:'idle'` + todaySec 갱신. (일시정지도 idle로 — '공부 중' 신뢰가 기능의 생명)
- 연결 시마다 `onDisconnect(ref).update({ state:'idle', updatedAt: serverTimestamp })` 재등록.
  등록 위치: 로그인 직후 + `.info/connected` 리스너에서 재연결 때마다.
- 클라이언트 표시: `state==='studying'`이면 `startedAt` 기준 경과를 로컬에서 카운팅 (서버 틱 없음 — 쓰기 비용 0).
- **연동 지점**: useAppState의 Live Activity 동기화 effect와 같은 시그니처 패턴을 재사용
  (`활성 타이머 id|status|phase` 변화 시에만 쓰기 — elapsedSec 틱 제외. 초당 네트워크 쓰기 금지).
- 뽀모/연속의 휴식 페이즈는 `state:'studying'` 유지하되 subjectLabel '휴식 중' — 단순하게.

### 3.3 오늘 누적(todaySec)
- 로컬 세션 기록(recordSessionInternal) 후 오늘 세션 합계를 계산해 `todaySec`/`date`를 통째로 set (increment 아님 — 멱등, 중복 기록 걱정 없음).
- 원본은 항상 로컬 sessions. 서버 값은 표시용 캐시일 뿐 (기기 재설치 시 서버 잔존값은 다음 set으로 덮임).
- `date !== 오늘(KST)`인 항목은 클라이언트가 0으로 표시 (자정 리셋을 서버에서 안 함).
- 날짜는 반드시 `format.js`의 `getToday()` 사용 (작업 규칙 7 — toISOString 금지).

### 3.4 방 생성/참여/탈퇴
- 생성: 코드 6자 랜덤 생성 → `/rooms/{code}` 트랜잭션 set (충돌 시 재생성) → 본인 join.
- 참여: 코드 입력 → members에 자기 uid 추가 (30명 초과 시 거부 — 규칙에서도 강제).
- 코드 공유는 기존 `Share.share` 재사용 ("[열공메이트] 스터디룸 A3K9QZ로 들어와!" + 스토어 링크 → 초대가 곧 설치 유도).
- 탈퇴: members/{uid}·status/{roomId}/{uid} 제거, users.roomId null. 방장 탈퇴 시 방은 남고 방장 이양 없음(오너 필드만 잔존 — 기능상 무해).

## 4. 보안 규칙 초안 (RTDB rules)

```json
{
  "rules": {
    "users": {
      "$uid": { ".read": "auth.uid === $uid", ".write": "auth.uid === $uid",
        ".validate": "newData.child('nickname').val().length <= 12" }
    },
    "rooms": {
      "$roomId": {
        ".read": "auth !== null",
        "members": {
          "$uid": { ".write": "auth.uid === $uid" }
        },
        ".write": "auth !== null && !data.exists()"
      }
    },
    "status": {
      "$roomId": {
        ".read": "root.child('rooms').child($roomId).child('members').child(auth.uid).exists()",
        "$uid": { ".write": "auth.uid === $uid" }
      }
    }
  }
}
```
- 요지: 본인 것만 쓰기, 방 상태는 멤버만 읽기, 방 생성은 없는 코드에만. members 30명 제한과
  todaySec 상한(예: 86400) validate는 구현 시 추가.

## 5. 화면 (신규 1개 + 진입점)

- **스터디룸 화면** (신규, 통계탭 상단 진입 버튼 or 설정): 방 이름/코드 + 멤버 리스트.
  각 행: 캐릭터 아바타, 닉네임, 상태점(공부 중=accent/휴식=회색), 공부 중이면 실시간 경과, 오늘 누적.
  정렬: 공부 중 우선 → 오늘 누적 내림차순. 미참여 상태면 생성/참여/코드입력 UI.
- 기존 캐릭터 시스템(characters.js)을 아바타로 재사용 — 신규 에셋 불필요.
- 테마는 T 객체, 이모지 금지(Ionicons) — 기존 작업 규칙 그대로.

## 6. 개인정보/정책 (출시 전 필수)

- privacy-policy.html 개정: "스터디룸 기능을 켠 경우에 한해 닉네임·캐릭터·공부 상태·오늘 공부시간이
  같은 방 참여자에게 공유되며 서버(Firebase, Google)에 저장됩니다. 기능을 끄거나 방을 나가면 서버 데이터가 삭제됩니다."
- 스토어 데이터 안전(Play)/개인정보 처리방침(ASC) 설문 갱신 필요 — **수집 항목이 '없음'에서 바뀜**.
  (닉네임은 개인 식별 불가 가명 정보지만 설문에는 '기타 정보' 공유로 신고하는 게 안전)
- 탈퇴(기능 끄기) 시 `/users/{uid}`·status·members 삭제 구현 필수 (Play 계정 삭제 정책 대응).
- 닉네임 금칙어: 로컬 필터(간단 목록)로 시작. 신고 기능은 MVP 제외 — 방 코드 기반이라 아는 사이 전제.

## 7. 구현 단계 (각 단계 독립 배포 가능)

1. **P0 인프라**: Firebase 프로젝트 생성(콘솔), RTDB 인스턴스(서울 리전 asia-southeast1 없음 → us-central1 또는 asia-southeast1 중 지연 확인), `firebase` npm 설치, `src/utils/studyRoom.js` 모듈 뼈대 + config. **API 키는 app.config.js extra로** (JS 번들에 들어가도 됨 — Firebase 웹 키는 공개 전제, 보안은 rules가 담당).
2. **P1 계정**: 익명 로그인 + 닉네임/캐릭터 설정 + AsyncStorage 영속.
3. **P2 방**: 생성/참여/탈퇴/코드 공유. 멤버 리스트 표시(정적).
4. **P3 presence**: 타이머 연동 쓰기 + onDisconnect + 실시간 구독 렌더.
5. **P4 누적**: todaySec 갱신/표시, 정렬.
6. **P5 정책**: privacy 개정, 스토어 설문, 삭제 흐름, 금칙어.
- P0~P2까지는 Expo Go에서도 개발 가능. 전 단계 순수 JS라 **이론상 OTA 배포 가능**하나,
  첫 릴리스는 실기기 검증(로컬 APK 레시피) 후 내보낼 것.

## 8. 함정 목록 (구현 시 주의)

- **초당 쓰기 금지**: presence는 상태 변화 시에만. elapsed는 클라이언트 계산 (Live Activity 시그니처 패턴 참조).
- 익명 auth 영속 누락 → 재시작마다 새 uid (위 3.1).
- onDisconnect는 **연결마다 재등록** 필요 — 한 번 등록으로 영구가 아님.
- iOS 백그라운드: 소켓이 수십 초 내 끊김 → onDisconnect 발화 → 백그라운드 공부(📖모드)가 idle로 보임.
  **대응(확정)**: `state:'studying'`이면 클라이언트가 `updatedAt` 기준 30분까지는 공부 중으로 그려주고,
  onDisconnect는 `state:'bg'`(별도 값)로 내려서 '자리비움 가능성' 표시. 완전 정확성보다 단순성 우선.
- 시계 조작: startedAt/todaySec은 클라이언트 신고값 — 시험/보상 기능이 아니므로 수용. 랭킹에 상금 걸지 말 것.
- RTDB 값에 undefined 금지 (set 시 에러) — null로 정규화.
- 기존 불변식(타이머·세션)은 이 기능과 완전 분리 유지 — studyRoom.js가 useAppState를 **구독만** 하고 역방향 의존 금지.

## 9. 하지 않기로 한 것 (스코프 밖 — 재론 금지 이유 포함)

- 개별 친구요청/팔로우: 차단·신고·프라이버시 설정이 따라와 MVP 3배 크기.
- 공부 인증샷/채팅: 모더레이션 비용이 기능 가치보다 큼 (미성년 사용자).
- 주간/전체 랭킹 보존: 오늘만으로 시작 — 경쟁 과열/조작 유인 최소화.
- 푸시 알림("친구가 공부 시작"): 서버 함수 필요(Blaze) + 피로도. presence 화면으로 충분.
