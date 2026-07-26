# 열공메이트 — CLAUDE.md

이 파일은 Claude Code가 매 대화마다 자동으로 읽는 프로젝트 기준 문서입니다.

---

## 앱 개요

- **앱 이름**: 열공메이트
- **타겟**: 초등학생~공시생까지 모든 학습자 (수능/공시/자격증/내신 등)
- **플랫폼**: iOS + Android (React Native + Expo SDK 56)
- **번들 ID**: `com.yeolgong.timer` / Apple ID: `6759892516` (preview 변형: `com.yeolgong.timer.preview`)
- **현재 버전**: 1.0.38 (Android versionCode 68 — 2026-07-26 Play 제출, 심사 중).
  라이브: **iOS 1.0.36** / **Android 1.0.37(vc64)**. iOS는 1.0.37을 빌드하지 않았고(무료 빌드 할당량 소진)
  buildNumber 53을 그대로 둔 채 2026-08-01 이후 1.0.38로 직행 예정.
  → 릴리스 진행 상태의 단일 진입점은 **`docs/release-next-build-checklist.md`** (이 줄보다 그 문서가 최신)

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 프레임워크 | React Native 0.85 + Expo SDK 56 (New Architecture/Fabric) + React 19.2 |
| 상태 관리 | Context API (`src/hooks/useAppState.js`, ~2800줄) |
| 로컬 저장소 | AsyncStorage (`src/utils/storage.js`, `@yeolgong/*` 키) — 앱의 기본은 서버 없는 로컬 저장 |
| 서버 (스터디룸 한정) | Firebase 익명 인증 + Realtime Database (`yeolgong-1e5cf`). 보안은 RTDB 규칙에 전적으로 의존 — `docs/firebase-database.rules.json`을 **콘솔에 직접 게시**해야 적용됨 |
| 사진 | expo-image-picker + expo-image-manipulator (오답노트 첨부, 1.0.38~ / 기기 내부 저장만) |
| 네비게이션 | React Navigation v6 하단 탭 5개: 집중/과목/플래너/통계/설정 |
| 빌드 | EAS Build (eas.json — development/preview/testflight/production 프로필) |
| 설정 파일 | `app.config.js` (app.json 아님 — `APP_VARIANT=preview` 분기) |
| 알림 | expo-notifications (Android Foreground Service 포함) |
| 사운드 | expo-audio (SDK 55에서 expo-av 제거됨 — createAudioPlayer + loop/volume 프로퍼티) |
| 잠금화면 | 자체 ActivityKit Live Activity — `modules/live-activity`(모듈) + `targets/widgets/FocusLiveActivity.swift`(UI) |
| 홈 위젯 (iOS) | WidgetKit + @bacons/apple-targets (`targets/widgets/` SwiftUI, App Group `group.com.yeolgong.timer`) |
| 홈 위젯 (Android) | react-native-android-widget (`src/widgets/`, 헤드리스 태스크 핸들러) |
| 차트/그래픽 | react-native-svg, react-native-chart-kit |

> **개발 환경 주의**: Windows — `expo prebuild -p ios` 불가, iOS 네이티브 검증은 EAS 클라우드 빌드로만 가능

---

## 파일 구조

```
src/
  hooks/
    useAppState.js        전역 상태 (Context API) — sessions/timers/todos/settings/weeklySchedule 관리, 100ms 타이머 틱
  screens/
    FocusScreen.js        타이머 메인 화면 (~1,500줄, 분해 후)
    StatsScreen.js        통계 화면 (~3,000줄, 일간/주간/월간/잔디 탭)
    PlannerScreen.js      플래너 화면 (~2,700줄, onlyWeek 일회성/반복 계획 구분)
    ScheduleEditorScreen.js 일정 편집
    SubjectsScreen.js     과목 관리 + 공부법 프리셋 (STUDY_METHODS, 학년별)
    SettingsScreen.js     설정
    ReviewNotesScreen.js  오답노트 (복습 루프 + 사진 첨부)
    StudyRoomScreen.js    스터디룸 (같이 공부 — 좌석 도면/라운지/다같이 집중)
    focus/                FocusScreen에서 분해한 조각 — TodoSection, TodoFormSheet, FavoritesCard,
                          ChallengeModal, NicknameModal, ResultModal(App.js 루트에서 렌더), helpers, styles
    stats/
      components/         GoalRing, SubjectDonut, ReportComponents
      helpers.js          통계 계산 유틸
      styles.js           StatsScreen 전용 스타일
  components/
    RunningTimersBar.js   실행 중 타이머 상단바
    CircularTimer.js      원형 타이머 UI
    AnalogClock.js        아날로그 시계 (수능 시험장 벽시계 스타일, v1.0.25+)
    CharacterAvatar.js    캐릭터 아바타
    TimePickerGrid.js     시간 피커
    GradientView.js / Stepper.js / Toast.js
  widgets/                Android 홈 위젯 + 양 플랫폼 위젯 데이터 (widgetData.js는 iOS 스냅샷도 계산)
    widgetData.js         getWidgetData() — AsyncStorage 직접 읽어 위젯 데이터 계산 (헤드리스 안전)
    updateStudyWidget.js  updateAllWidgets(activeTimer) — 안드 리렌더 / iOS App Group 스냅샷 기록
    widgetTaskHandler.js  안드 헤드리스 핸들러 (앱 꺼져 있어도 위젯 갱신/클릭 처리, 오늘할일 체크 토글 포함)
    StudyTimeWidget.js / DDayWidget.js / SubjectLauncherWidget.js / TodayPlanWidget.js / TodayTodoWidget.js
  utils/
    timerCore.js          타이머 핵심 순수 로직 — 벽시계 경과/남은시간, 뽀모·연속 페이즈 전환,
                          페이즈 알림 스펙, 결과(밀도/verified) 계산, 세션 레코드 생성,
                          콜드스타트 스냅샷 복원 분기(restoreTimerCore).
                          불변식 1~9의 구현부이자 테스트 대상 (__tests__/timerCore.test.js).
                          useAppState는 여기에 상태를 주입하고 부수효과만 수행
    storage.js            AsyncStorage 래퍼 (타이머 스냅샷·백업/복원 포함)
    density.js            집중밀도 계산 (calcAverageDensity, calculateDensity)
    format.js             formatDuration, formatShort, getToday, generateId 등
    liveActivity.js       iOS Live Activity 래퍼 (자체 ActivityKit 모듈 — 잠금화면/Dynamic Island 타이머)
    ongoingNotif.js       안드 상시 타이머 알림 동기화 (liveActivity.js와 표시 규칙 공유)
    studyRoom.js          스터디룸 Firebase I/O (익명 인증·RTDB 구독·하트비트)
    studyRoomCore.js      스터디룸 순수 로직 (좌석 배치·정렬·유령 판정 등, 테스트 대상)
    reviewNotes.js        오답노트 순수 로직 (복습 주기 계산 등, 테스트 대상)
    attachments.js        오답노트 사진 저장/압축/정리 (파일명만 기록 — 경로 저장 금지)
    screenPin.js          안드 OS 화면 고정 래퍼 (울트라집중 exam 강도)
    durableAuthStorage.js 익명 uid 영속 (iOS 키체인 미러 — 재설치 후 계정 유지)
  constants/
    colors.js             getTheme(darkMode, accentColor, fontScale, stylePreset) → T 테마 객체
    presets.js            getTier(density) → 티어 라벨/색상
    characters.js         캐릭터 데이터 (toru, paengi 등 + 상황별 메시지)
    fonts.js              폰트 상수
App.js                    앱 진입점 (~1,000줄), 온보딩, 네비게이션, 잠금화면 오버레이, 결과 모달, 위젯 딥링크
targets/widgets/          iOS 홈/잠금화면 위젯 (SwiftUI · WidgetKit) — index.swift(번들), SharedData.swift(파서/공용),
                          StudyTime/DDay/Subject/TodayPlan/TodayTodo 5종. EAS 빌드로만 검증 가능
modules/                  로컬 Expo 네이티브 모듈 4개 — live-activity(iOS ActivityKit),
                          timer-notif(안드 상시 알림), screen-pin(안드 화면 고정), focus-shield(iOS 앱 차단)
plugins/                  config 플러그인 — withAndroidWorkManagerFix(중복 클래스),
                          withCameraNotRequired(CAMERA 권한이 카메라를 필수로 암시해 Play 대상 기기가 줄던 문제)
docs/                     설계·릴리스 문서. release-next-build-checklist.md(릴리스 단일 진입점),
                          realtime-study-design.md, review-notes-design.md, account-persistence-design.md,
                          firebase-database.rules.json(★콘솔에 직접 게시해야 적용★), blog-guide.md
```

---

## 핵심 데이터 구조

```js
// timers (실행 중에만 존재, 5초 스로틀로 스냅샷 저장 → 강제종료 후 복원)
{ id, type('countdown'|'free'|'pomodoro'|'lap'|'sequence'), label, subjectId, color,
  totalSec, elapsedSec, status('running'|'paused'|'completed'), pauseCount,
  startedAt, resumedAt, elapsedSecAtResume,            // 벽시계 기준 경과 계산용
  pomoPhase('work'|'break'|'longbreak'), pomoSet, pomoWorkMin, pomoBreakMin,
  seqItems, seqIndex, seqTotal, seqBreakSec, seqPhase, // 연속모드 전용
  laps, planId, todoId, result }                       // todoId: 할일 '집중 시작' 연결

// sessions
{ id, date(YYYY-MM-DD), subjectId, label, startedAt, endedAt, durationSec,
  mode, focusDensity, tier, pausedCount, exitCount, focusMode, verified,
  selfRating, memo, planId, todoId, schoolLevel, ultraFocusLevel, timerType,
  completionRatio, pomoSets }

// subjects
{ id, name, color, totalElapsedSec, isFavorite }

// settings (주요 필드)
{ mainCharacter, dailyGoalMin, darkMode, accentColor, fontScale, fontFamily, stylePreset,
  schoolLevel('elementary'|'middle'|'high'...), elemGrade, nickname, motto,
  ultraFocusLevel('normal'|'focus'|'exam'), ultraStreak, streak, lastStudyDate,
  activeSounds, soundVolume, notifEnabled, dailyReminder*, weeklyReportEnabled,
  monthlyReportEnabled, guide* 플래그, headerBgPreset, ... }
```

### 타이머·세션 불변식 (깨뜨리면 데이터 정확성 버그 — 수정 전 반드시 확인)

> 구현부: 불변식 1~7의 계산 로직은 `src/utils/timerCore.js`(순수 함수, 테스트 有)에 있다.
> 이 규칙들을 수정할 땐 timerCore와 그 테스트를 함께 고칠 것 — useAppState에서 우회 구현 금지.

1. **경과 시간은 벽시계 기준**: `elapsed = elapsedSecAtResume + (now - resumedAt)/1000`.
   `elapsedSec` 필드는 표시용 캐시일 뿐 직접 누적하지 말 것 (백그라운드에서 어긋남)
2. **페이즈 전환 시각은 `resumedAt` 기반 계산** (`Date.now()` 금지 — 틱 오버슈트가 누적됨)
3. **세션 기록은 `recordSessionInternal` + `dedupeKey`** — 틱이 setTimers 업데이터 안에서 부수효과를
   내므로 재실행 대비 멱등 가드가 필수. 키 규칙: `complete|id|startedAt`, `pomo|id|startedAt|세트`, `seq|id|인덱스|startedAt`
4. **세션 date는 시작일 기준** (`toDateStr(new Date(startedAt))`) — 자정 걸친 세션은 시작한 날에 귀속
5. **휴식 페이즈는 세션 기록 금지** (`inBreakPhase` 가드 — 뽀모/연속 break 중 종료 시)
6. **연속모드 세션은 `timerType: 'countdown'`으로 기록** (모든 종료 경로 동일 — 밀도 공식·통계 라벨 일관)
7. **5분(300초) 미만 세션 미기록** (계획·할일 연결 시 30초), 30초 미만은 밀도 100점 고정.
   ※**결과 모달은 기록 기준과 별개로 항상 5분 이상**(`RESULT_MODAL_MIN_SEC`) — 짧은 할일도
   누적 시간엔 반영하되, 1분 공부에 자기평가 모달까지 뜨는 건 과하다는 판단(2026-07-25).
   모달이 안 떠도 완료 카드가 밀도·티어를 인라인으로 보여준다
8. **bg 복귀/틱의 완료 처리**: overshoot > 2초면 `skipNotif` (OS 예약 알림이 이미 발송됨 — 중복 방지)
9. **카운트업(자유/랩) 상한 5시간** (`COUNTUP_MAX_SEC`) — 도달 시 카운트다운 완료와 동일하게
   자동 종료 (자유는 세션 기록+상한 알림, 랩은 세션 없이 조용히). 잊힌 타이머가 수백 시간
   세션으로 통계를 오염시키는 것 방지. 위젯/스터디룸 하트비트의 좀비 스냅샷 가드도 이 상수 기준

---

## 주요 기능

### 타이머
- 모드: 카운트다운 / 자유(카운트업) / 뽀모도로 / 랩 스탑워치 / 연속(sequence, 여러 항목 자동 이어달리기)
- **단일 활성 타이머 제약**: 랩을 제외하고 한 번에 하나만 실행 가능
- 집중모드: 🔥(screen_on, 화면 켜짐 + 잠금 오버레이) / 📖(screen_off, 화면 꺼짐)
- 울트라집중 잠금강도: normal / focus / exam (exam은 일시정지 차단, 이탈 시 exitCount 기록,
  안드로이드는 OS 화면 고정 `startLockTask` — `modules/screen-pin` 로컬 Expo 모듈 + `src/utils/screenPin.js` 래퍼)
- 100ms 틱 + `resumedAt`/`elapsedSecAtResume` 벽시계 기준 계산 → 백그라운드에서도 정확
- 공부법 프리셋: SubjectsScreen의 STUDY_METHODS (학년별 연속모드 템플릿, 출처 표기)

### 집중밀도
- **56~103점 범위** (공식 v7, `src/utils/density.js`) — 최저 56점(C등급) 보장, 30초 미만 세션은 100점 고정
- 입력: 일시정지/이탈 횟수, 집중모드, 완료율, 자가평가, 학년 등
- 티어(`src/constants/presets.js`, `getTier`): **SS(전설, ≥100) > S+ > S > A > B > C(≥56)** — 최고는 SS, D/E/F 없음

### 통계 (StatsScreen)
- 탭: 일간 | 주간 | 월간 | 잔디
- 잔디: HM_WEEKS=16 (4개월, `src/screens/stats/styles.js`)
- 날짜 클릭 → 날짜 상세 바텀시트 (주간/월간/잔디 공유)
- 주간: weekOffset으로 이전/다음 주 탐색
- GoalRing: 목표 달성률 도넛 링
- 주간/월간 공부 리포트 알림 자동 예약

### 플래너 (PlannerScreen)
- 주간 시간표 그리드 + 미배치 행 + 주간요약(계획/실행/달성%) + 일간/월간 뷰
- **onlyWeek 모델**: 계획에 `onlyWeek:'YYYY-MM-DD'`(주 시작 일요일) 마킹 → '이번 주만' 일회성 vs 매주 반복 구분. 지난 주 일회성 계획은 초기 로드에서 자동 삭제
- 계획 블록 달성 미니바(계획 대비 실행량), 시험(D-Day)별 준비 할 일·진행률(todos scope:'exam')
- BlockModal `scope`('once'/'weekly') 선택 → 호출부에서 onlyWeek 변환
- 집중탭 계획 카드는 `getTodaySchedule` 사용 (onlyWeek 필터 반영)

### 알림 / 백그라운드
- `timer-complete` 채널: AndroidImportance.MAX, DATE 트리거 (setExactAndAllowWhileIdle)
- `focus-status` 채널: AndroidImportance.LOW 무음 — 🔥모드 이탈 중 sticky 상태 알림 (복귀 시 코드로 제거)
- 🔥모드 이탈 시: 즉시 알림 + 30초/1분/3분/5분 에스컬레이팅 넛지(복귀 시 취소, countdown 잔여시간 초과분 미예약),
  iOS는 Live Activity 부제 '이탈 중' 전환 (`setLiveActivityAway`)
- Android 12+ 정확한 알람 권한 최초 1회 안내
- 배터리 최적화 설정 바로가기 (SettingsScreen + 온보딩 Step 5)
- **iOS Live Activity**: 실행 중 타이머를 잠금화면/Dynamic Island에 표시 (`src/utils/liveActivity.js`)
  - **자체 ActivityKit 구현**: `modules/live-activity`(start/update/end/listIds 로컬 모듈) +
    `targets/widgets/FocusLiveActivity.swift`(UI). expo-live-activity·expo-widgets는 폐기됨
    (expo-widgets는 실기기 렌더 불가 — 2026-07-09)
  - ※`FocusActivityAttributes`(ContentState 9필드)는 모듈과 익스텐션에 **동일하게 중복 정의** —
    ActivityKit이 타입 이름으로 매칭하므로 수정 시 양쪽을 함께 고칠 것
  - 카운트다운/업은 `Text(timerInterval:)`(OS가 그림), 일시정지는 mode 'none' + 정적 subtitle
  - useAppState의 동기화 useEffect 1개가 시그니처 비교로 start/update/end 판단 (초당 호출 없음)
  - 잔존 activity는 `listIds()`로 재부착/정리 (id 저장 불필요)
- **안드 상시 타이머 알림 (잠금화면/상단바)**: 실행 중 타이머를 chronometer 상시 알림으로 표시 —
  iOS Live Activity의 안드 대응물. `modules/timer-notif`(Kotlin) + `src/utils/ongoingNotif.js`(동기화,
  liveActivity.js와 표시 규칙 공유). OS가 벽시계 앵커(when) 기준으로 초를 직접 그려 백그라운드/앱 종료
  후에도 정확, timeout 상한으로 좀비 방지. 설정 토글 `timerOngoingNotif`. **1.0.38(vc68)부터 활성**
- **안드 위젯 강제 갱신 알람 (B단계)**: 타이머 종료 시각에 AlarmManager →
  `AlarmReceiver`(WIDGET_REFRESH) → APPWIDGET_UPDATE 브로드캐스트 → 헤드리스 재렌더.
  앱이 죽어 있어도 위젯 '집중 중' 해제/오늘합계 반영 (`scheduleWidgetRefresh`/`cancelWidgetRefresh`)

### 홈 화면 위젯 (iOS + Android, 1.0.32~)
- 5종: 오늘 공부 / 시험 D-Day / 과목 바로 시작 / 오늘 계획 / 오늘 할 일(1.0.34~) — 양 플랫폼 동일 구성
- 데이터 흐름: `getWidgetData()`가 AsyncStorage를 직접 계산 → 안드는 헤드리스 렌더,
  iOS는 `updateAllWidgets()`가 App Group(UserDefaults `widgetData` 키)에 JSON 기록 후 reloadWidget
- iOS 전용: 잠금화면 위젯(accessory 패밀리), 실행 중 실시간 카운팅(`runningAnchorMs` + `Text(style:.timer)`),
  자정 리셋(스냅샷 `date` 비교), D-Day는 위젯이 목표일로 매 렌더 재계산
- 딥링크(App.js 처리): `yeolgong://start?subjectId=`(과목 자유 타이머) / `yeolgong://start?planId=`(계획 카운트다운) /
  `yeolgong://open?tab=planner&view=monthly`(D-Day 위젯→플래너 월간) / `yeolgong://open?tab=focus&section=plans|todos`(오늘계획/오늘할일 위젯→집중탭 해당 카드 스크롤)
- 갱신 트리거: 세션/과목/D-Day/설정/할일 변경 + 타이머 상태 시그니처(틱 제외) — useAppState의 위젯 effect
- **오늘할일 위젯 체크(안드 전용)**: 행 탭 → `TODO_TOGGLE` → 헤드리스가 storage에 직접 토글+완료로그
  → `@yeolgong/widgetTodoDirty` 플래그 → 앱 복귀 시 todos/todoLog 재로드 (자동저장 덮어쓰기 방지). iOS는 보기 전용
- ※iOS 위젯 타겟명은 디렉터리와 같은 ASCII('widgets') 필수, apple-targets는 patch-package 패치 유지 필요

### 오답노트 (1.0.36~)
- `src/screens/ReviewNotesScreen.js` + `src/utils/reviewNotes.js`(순수 로직) +
  `src/utils/attachments.js`(사진). 저장 키 `@yeolgong/reviewNotes`. 설계 `docs/review-notes-design.md`
- 틀린 문제를 과목·챕터별로 기록. 챕터는 별도 엔티티가 아니라 **노트당 문자열 태그**(자동완성만 제공)
- **복습 루프 = 카운터 방식**: `markReviewed`로 `reviewCount`/`lastReviewedAt` 누적 + `mastered` 토글 +
  '복습 필요만' 필터(`!mastered`). ※**다시 볼 날짜 예약이나 할일 자동 생성은 없다** — 오해 주의
- 연결 방향은 **할일 → 노트**(`archiveTodoToNote`, 할일 메모가 일일 리셋으로 사라지는 문제 해결이 출발점).
  같은 할일에서 중복 생성 방지는 `sourceTodoId` 가드
- **과목을 삭제해도 노트는 지우지 않고 `subjectId=null`(미분류)로 보존** — 오답 기록은 사용자 자산이라
  고아 유령을 지우는 다른 곳들과 반대로 판단한 것
- **사진 첨부(1.0.38~ 네이티브)**: expo-image-picker(촬영/앨범 다중선택) + expo-image-manipulator(1600px 압축).
  파일은 `documentDirectory`에 저장하고 **파일명만** 기록(경로 저장 금지 — 앱 재설치 시 경로가 바뀜),
  한 문제당 5장 상한. 사진은 기기 밖으로 나가지 않음(개인정보처리방침에 명시)
- 편집기는 **전체화면**(바텀시트 키보드 문제를 구조적으로 해결한 결과 — 바텀시트로 되돌리지 말 것)

### 스터디룸 (같이 공부, 1.0.36~)
- `src/screens/StudyRoomScreen.js` + `src/utils/studyRoom.js`(Firebase I/O) +
  `src/utils/studyRoomCore.js`(순수 로직·테스트 대상). 설계 `docs/realtime-study-design.md`
- Firebase(`yeolgong-1e5cf`) 익명 인증 + RTDB. **보안은 전적으로 RTDB 규칙** —
  `docs/firebase-database.rules.json`이 원본이고 **콘솔에 직접 게시**해야 적용됨(배포 잊으면 무방비)
- 초대 코드 방 / 공개 라운지, 좌석 도면 3테마(카페·독서실·교실), 하트비트로 '공부 중' 표시,
  화면끔도 '화면끔 몰입'으로 인정, 다같이 집중(공유 카운트다운, 라운지 제외), **익명 응원**(엄지척)
- **익명 응원은 익명이 설계 의도** — 보낸 사람을 남기면 아는 사이끼리만 주고받게 되어 취지가 죽는다.
  되돌리지 말 것
- 라운지 안전장치: 사용자 숨기기 + 신고 + 닉네임 필터 (**안드는 1.0.38부터, iOS는 미출시**)
- 집중탭·잠금 오버레이의 '우리 방 N명' pill → 탭하면 방으로 바로 입장

### 기타
- 아날로그 시계 모드 (수능 시험장 벽시계, 가로 전체화면 모달 지원)
- 캐릭터 시스템 (토루/팽이 등) + 상황별 토스트 메시지
- 데이터 백업/복원 (JSON 내보내기/가져오기 — 키별 형태 검증으로 손상 백업 방어)

---

## 빌드 및 배포

```bash
# 개발 서버
expo start

# TestFlight / 스토어 배포용 iOS 빌드
eas build --profile testflight --platform ios

# 프로덕션 Android (AAB)
eas build --profile production --platform android

# 내부 테스트 Android APK (번들ID *.preview, 본 앱과 공존 설치 가능)
eas build --profile preview --platform android
```

> **주의**: 알림/백그라운드/Live Activity는 Expo Go에서 테스트 불가 → EAS 빌드 후 실기기로만 검증
> **주의**: 새 iOS 타겟(LiveActivity 등) 추가 후 첫 빌드는 프로비저닝 프로파일 생성 때문에 대화형(`--non-interactive` 없이)으로 실행해야 함

### 버전 올릴 때 체크리스트
- `app.config.js` → `version`, `ios.buildNumber`, `android.versionCode`
- Android versionCode: **짝수 사용** 관행 (과거 16KB 페이지 정렬 대응 — SDK 54의 `enablePageAlignedJniLibs`로 근본 해결됨)

---

## 출시 현황 (2026-07-26 기준)

> ※이 표는 쉽게 낡는다. 진행 중인 릴리스의 최신 상태는 항상 `docs/release-next-build-checklist.md`를 볼 것.

| 항목 | 내용 |
|------|------|
| iOS | App Store 라이브 **1.0.36** (2026-07-23 배포 — 스터디룸·오답노트 첫 출시. 1.0.36은 스크린샷 사유 2.3.3 리젝 후 실제화면으로 교체해 승인). **1.0.37은 iOS 미빌드**(무료 빌드 할당량 소진, Windows라 로컬 빌드 불가) → 8/1 이후 1.0.38(buildNumber 53) 빌드 예정. TestFlight 외부 링크: `https://testflight.apple.com/join/dsNaK9kb` |
| Android | Google Play 라이브 **1.0.37(vc64)** (2026-07-26 승인 확인), **1.0.38(vc68) 전체출시 제출 — 심사 중**. vc68이 상시 타이머 알림·오답노트 사진첨부·라운지 신고를 처음 출시 |
| 웹사이트 | `https://lds77.github.io/suneung-timer-native/` (main 브랜치 index.html, GitHub Pages) |
| 사용자 수 | 2026-07-14 기준 Play 활성기기 94 · MAU 약 100 · 총 설치 198 / iOS 90일 다운로드 185 (6월 대비 약 2배) |
| 브랜치 | 작업은 `sdk56`, 배포 승인 후 `main` 머지 — **1.0.35 이후 머지 보류 중**(vc68 승인이 조건) |
| 아이콘 | 런처·스토어 아이콘 모두 회색곰+빨간 스톱워치로 통일 (배경 블루그레이 #E4ECF7, 풀블리드). 1.0.29 빌드부터 반영 |

---

## 작업 규칙

1. **iOS/Android 분기 필수**: iOS 작업이 Android에 영향을 줄 경우 반드시 먼저 물어볼 것 (`Platform.OS` 분기 확인)
2. **현재 모드**: iOS 우선 작업 — Android 영향 변경은 사용자 승인 후 진행
3. **EAS 빌드는 사용자 승인 후 실행** (빌드 큐/비용 발생)
4. **테마**: `getTheme()`으로 항상 T 객체를 통해 색상 참조, 하드코딩 금지
5. **스타일**: StyleSheet.create 사용, 인라인 스타일 최소화
6. **알림 테스트**: 실기기 + EAS 빌드로만 검증 가능
7. **날짜 코드는 반드시 `format.js`의 `getToday()`/`toDateStr()` 사용** — `toISOString()`은 UTC라
   KST 새벽 0~9시에 하루 밀림 (이 클래스 버그를 6월·7월 두 번 일소함). 'YYYY-MM-DD' 파싱은 `+ 'T00:00:00'`
8. **로직 변경 후 `npm test`** (Jest 441개, 순수 로직만 — RN 의존 코드는 EAS 빌드+실기기)
9. **UI 문구에 이모지 금지** — 필요하면 Ionicons 사용
10. **월 이동은 `new Date(y, m ± n, 1)`로 1일 정규화** — `new Date()`에 그대로 `setMonth(±n)`
    하면 29~31일에 짧은 달로 넘칠 때 달이 건너뛰거나 제자리 (2026-07-19 감사에서 3곳 일소)
11. **useMemo 안에서 `new Date()`/`getToday()`를 쓰면 `today`를 의존성에 포함** — 자정 넘겨
    열어둔 화면에서 어제/주간 경계가 옛 날짜로 굳는 스테일 버그의 원인
12. **안드 권한을 새로 추가하면 Play 검토 화면의 '지원 기기 변경사항'을 반드시 확인** — 권한이
    하드웨어를 필수로 암시해 배포 대상 기기가 줄어든다. CAMERA 추가 때 402대(태블릿 -4%)가 빠져
    `plugins/withCameraNotRequired.js`로 막았음 (2026-07-26, vc66 폐기 후 vc68 재빌드)
13. **RTDB 규칙 변경은 코드 커밋만으로 적용되지 않음** — `docs/firebase-database.rules.json`을
    Firebase 콘솔에 직접 게시해야 한다. 게시를 잊으면 스터디룸이 무방비 상태로 배포됨
