# 열공메이트 — CLAUDE.md

이 파일은 Claude Code가 매 대화마다 자동으로 읽는 프로젝트 기준 문서입니다.

---

## 앱 개요

- **앱 이름**: 열공메이트
- **타겟**: 초등학생~공시생까지 모든 학습자 (수능/공시/자격증/내신 등)
- **플랫폼**: iOS + Android (React Native + Expo SDK 56)
- **번들 ID**: `com.yeolgong.timer` / Apple ID: `6759892516` (preview 변형: `com.yeolgong.timer.preview`)
- **현재 버전**: 1.0.39 (iOS buildNumber 53 / Android versionCode 70 — **2026-08 초 양대 스토어 동시 제출 예정**).
  라이브: **iOS 1.0.36** / **Android 1.0.38(vc68, 2026-07-29 승인)**. iOS는 1.0.37·1.0.38을 빌드하지 않았고
  (무료 빌드 할당량 소진, Windows라 로컬 빌드 불가) buildNumber 53으로 1.0.39에 직행.
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
    screenPin.js          안드 OS 화면 고정 래퍼 (울트라집중 exam 강도) + 화면/잠금 상태 조회,
                          배경 이탈 알림 감시 무장·해제(armAwayWatch/disarmAwayWatch)
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
- 집중모드: 🔥(screen_on, 잠금 오버레이 + 이탈 감지) / 📖(screen_off, 조용히 타이머만)
  ※내부 이름은 screen_on/off지만 **2026-07-29부터 🔥도 화면을 계속 켜 두지 않는다**(아래 참조)
- 울트라집중 잠금강도: normal / focus / exam (exam은 일시정지 차단, 이탈 시 exitCount 기록,
  안드로이드는 OS 화면 고정 `startLockTask` — `modules/screen-pin` 로컬 Expo 모듈 + `src/utils/screenPin.js` 래퍼)
- **모드 선택 팝업 = 3지선다** (2026-07-29~): 집중 세션을 새로 시작할 때(`focusMode`가 없을 때)
  **일반모드/집중모드/울트라모드**를 고르고, 그 선택이 `settings.ultraFocusLevel`에 저장된다
  (※사용자에게 보이는 이름은 2026-07-30에 통일한 것 — 내부 id는 `normal`/`focus`/`exam` 그대로.
   설정탭 섹션 제목은 **'공부 모드'**, 그 안의 카드는 '시작 팝업의 기본 선택값'이다)
  (세션 전용 상태를 만들지 않는다 — 잠금·화면고정·챌린지 판정이 전부 settings를 읽으므로 어긋난다).
  선택지는 App.js `MODE_CHOICES`, 설정탭 표시는 `FOCUS_LEVELS` — **양쪽 문구를 함께 고칠 것**
  - 카드에 **집중밀도 선언 보너스(+5/+10/+15, 이탈 0회 기준)를 숫자로 노출**한다 —
    `density.js`의 공식을 바꾸면 `MODE_CHOICES.bonus`도 함께 고쳐야 한다(약속한 점수가 어긋남)
  - 이전에는 강도별로 팝업을 건너뛰었다(normal→자동 편하게 / exam→자동 울트라). 온보딩에 강도
    선택 단계가 없어 **대부분이 기본값 normal에 머물러 3가지 모드의 존재조차 몰랐다**는 게 바꾼 이유.
    기본값을 `focus`로 바꾸고 기존 사용자도 1회만 normal→focus로 올린다(`modeAskIntro` 플래그)
  - 울트라집중 첫 선택 시 1회 확인 Alert(`guideUltraPick`), 첫 팝업에 1회 안내 배너(`guideMode`)
  - 팝업 진입점은 `addTimer`/`startSequence` 두 곳(랩 타이머는 제외) — `requestModeSelect`는 공개 헬퍼
  - **'다음부터 묻지 않고 이 모드로 시작' 체크(`modeAutoStart`, 기본 false)**: 켜면 팝업 없이
    `ultraFocusLevel`로 바로 시작한다. 체크는 팝업이 열릴 때마다 **해제 상태로 시작**하고,
    **실제로 시작한 경우에만** 저장한다(취소·물러서기로는 안 굳음).
    ★켜면 팝업이 아예 안 뜨므로 **끄는 길은 설정탭 '공부 모드'의 토글 하나뿐**★ →
    첫 자동 시작 때 1회 토스트로 그 위치를 알린다(`guideAutoStart`).
    설정에서 모드를 바꿔도 이 값은 유지된다 — 되돌리는 건 토글로 명시적으로 한다(암묵 리셋 금지).
    ※App.js는 `modeAutoStart`면 **오버레이를 렌더 자체를 안 한다** — effect로만 막으면 한 프레임 깜빡인다
- **🔥모드 화면 꺼짐은 시스템에 맡긴다** (양 플랫폼, 2026-07-29~ 다음 네이티브 빌드):
  예전엔 keep-awake로 화면을 계속 켜 뒀지만 배터리 부담이 커서 **keep-awake를 잡지 않는다**.
  무동작 감지·터치 리셋은 전부 OS가 하던 대로 하고, 기기 설정의 '화면 시간 초과'가 그대로 적용된다.
  설정 항목 없음(항상). ※**앱이 화면을 직접 끄는 공개 API는 양 플랫폼 모두 없다** — 안 잡는 게 전부이고,
  기기가 '화면 계속 켜기'면 안 꺼진다
  - 이 동작은 위 '화면 끄기는 이탈이 아님' 규칙에 **전적으로 의존**한다. 그래서 **안드 구빌드
    (`screenStateSupported()`가 false = 네이티브 screenState 없음)에서는 예전처럼 keep-awake를 유지**한다 —
    안 그러면 화면이 꺼질 때마다 스스로 이탈을 만들어낸다(OTA 안전장치)
  - **iOS 판정 근거는 '마지막 터치 시각'**(`wasIdleBeforeBackground`, 15초): 다른 앱으로 나가려면
    반드시 화면을 만져야 하므로 **한동안 터치 없이 백그라운드 = 화면이 꺼진 것**이다. iOS엔 안드의
    `screenState()` 같은 수단이 없고 네이티브 잠금 감지는 암호 미설정 기기에서 실패하므로 이 판정이
    오탐(멀쩡한 사용자에게 이탈)을 막는 핵심이다. 터치 기록은 App.js **루트 View + 잠금 오버레이**의
    `onStartShouldSetResponderCapture`(false 반환 — 터치 처리엔 관여 안 함)가 갱신
  - 안드는 네이티브 `screenState()`가 정확하므로 터치 판정을 쓰지 않는다(우회 방지 규칙 그대로 — 기준 시간은 AWAY_MIN_MS)
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
- 🔥모드 이탈 시: 이탈 알림 + 30초/1분/3분/5분 에스컬레이팅 넛지(복귀 시 취소, countdown 잔여시간 초과분 미예약),
  iOS는 Live Activity 부제 '이탈 중' 전환 (`setLiveActivityAway`)
  - **전화가 오면 이탈로 치지 않는다** (안드 2026-07-30 / **iOS 2026-08-01**): 벨 울림·통화·
    인터넷 통화(보이스톡 등) 중의 배경 전환은 화면 고정 중과 같이 판정을 통째로 건너뛴다.
    - **안드**: 판별은 `AudioManager.getMode()` — **`READ_PHONE_STATE` 없이** 되므로 Play 정책·
      지원 기기 문제가 없다(`screenPin.isInCall`).
      배경 진입 시점 + 복귀 시점 + 네이티브 `AwayWatch.onCheck` 세 곳에서 확인한다.
    - **iOS**: 판별은 CallKit `CXCallObserver`(`modules/focus-shield` + `focusShield.isInCallIOS`) —
      **권한도 usage description도 필요 없다**(안드가 `READ_PHONE_STATE`를 피한 것과 같은 이점).
      배경 진입 + 복귀 + 잠금 감시 폴링(0.5초) 세 곳에서 확인하고, 통화가 관측되면 예약해 둔
      이탈 알림을 네이티브가 지운다. ★관측자(`CXCallObserver`)는 프로퍼티로 붙들 것★ —
      매번 새로 만들면 목록 동기화 전이라 빈 배열이 온다
      - ★**iOS 고유 한계**: 백그라운드에서 앱이 정지되면 관측이 끊겨 통화 **종료 시각**을 못 본다★
        → 끊길 때 통화 중이었으면(`consumeCallHeld`) 그 배경 구간을 **통째로 면제**한다.
        잠금 감지가 이미 같은 양보를 하고 있어 일관되지만(아래 'iOS 한계' 참조),
        **통화 후 다른 앱을 오래 쓰는 우회를 안드만큼 막지 못한다**(수용)
    ※예전엔 처리가 없어 **통화 중에 '돌아와' 넛지가 울리고 끊으면 이탈 1회**가 찍혔다.
    울트라모드만 멀쩡해 보였던 건 화면 고정이 이 경로를 막고 있어서다(고정을 거부하면 똑같이 발생)
  - **통화가 끝난 뒤 1분도 이탈이 아니다** (`POST_CALL_GRACE_MS`, `awayMsAfterCall`):
    통화 자체를 면제해도 **끊고 통화 종료 화면을 닫고 앱으로 돌아오는 시간**이 별개의 배경
    전환으로 잡혀 이탈 1회가 찍혔다(실기기 진단 2026-07-30 — 통화 87초는 면제, 그 뒤 20초가 이탈).
    통째로 면제하지 않고 **'통화 관측 시각 + 유예' 이후만 이탈로 센다** — 통화 뒤 다른 앱을
    오래 쓰는 우회를 막기 위함. ★배경에 있는 동안 JS는 통화를 볼 수 없으므로(타이머가 멈춘다)
    **네이티브 `AwayWatch` 폴링이 남긴 `lastCallAt`이 유일한 근거**다★
    - ★**통화 중에는 화면이 꺼져도 계속 폴링한다**(`CALL_POLL_MS`) — 근접센서로 화면이 꺼질 때
      폴링을 멈추면 기준점이 **통화 시작 시각에 굳어** 유예가 `60초 − 통화 시간`으로 줄어든다
      (2분 통화면 유예 0). **"상수를 60초로 넣었다"와 "유예가 60초로 동작한다"는 다르다** —
      기준점이 어디서 갱신되는지를 반드시 같이 볼 것
      - 통화 예외는 **`onCheck`와 `onScreenEvent` 두 곳 모두**에 있어야 한다. `onCheck`만 고치면
        SCREEN_OFF를 받은 `onScreenEvent`가 예약을 취소해 `onCheck`가 다시 불리지 않는다
      - `POST_CALL_GRACE_MS`는 **Kotlin(알림)과 JS(카운트) 양쪽에 있다 — 함께 고칠 것**
      - **iOS도 같은 이유로 통화 중에는 폴링을 멈추지 않는다** — 잠금 감시 타이머가 통화를
        관측하면 알림만 지우고 `endWatch()`를 부르지 않는다(부르면 기준점이 통화 시작에 굳는다).
        다만 iOS는 백그라운드 태스크가 회수되면 거기서 관측이 끝난다(위 'iOS 고유 한계')
  - **이탈로 인정하는 최소 시간은 `focusAway.AWAY_MIN_MS`(15초) 하나뿐이다** — 앱 전환 경로,
    화면 끄기 후 잠금해제 경로, iOS 지연 판정이 모두 이 상수를 쓴다. 예전엔 useAppState에
    같은 값이 **따로 하드코딩**돼 있어 한쪽만 고치면 경로마다 기준이 갈렸다(2026-07-30 일소).
    **판정 시간을 숫자로 다시 박지 말 것**
  - **첫 이탈 알림은 즉시가 아니라 예약이다** (안드 5초 `ANDROID_AWAY_NOTIF_DELAY_SEC` / iOS 20초):
    이탈로 셀지 말지는 `AWAY_MIN_MS`(15초)가 지나야 정해지는데 알림만 먼저 쏘면
    **알림창을 내렸다 올리거나 알림을 눌러 앱으로 돌아오는 몇 초짜리 배경 전환에도 '돌아와' 알림이
    울리고 정작 이탈은 안 잡히는** 어긋남이 생긴다(2026-07-30 제보). sticky 상태 알림도 같은 이유로
    같은 시점에 예약한다. 넛지 목록 맨 앞 항목(`firstDelaySec`)으로 넣어야 취소 세대 가드를 함께 받음.
    안드 5초는 **순간 전환(1~2초)만 걸러내는 최소값**(사용자 결정) — 0~2초로 내리면 원래 증상이 재발.
  - **알림(5초)이 판정(`AWAY_MIN_MS` 15초)보다 먼저 오는 것은 의도된 설계다** — 그 간격 10초가
    "알림 보고 바로 돌아오면 봐준다"는 유예이고, 알림은 벌점 통보가 아니라 **돌아올 기회**다.
    간격이 좁으면 "알림 보고 바로 왔는데 어떨 땐 이탈 1회, 어떨 땐 0회"로 갈린다(2026-07-30 지적)
    → **두 값은 반드시 같이 조정할 것**
- **'화면 끄기/잠금'은 이탈이 아니다** (양 플랫폼, 다음 네이티브 빌드~): 화면을 끄면 앱이
  background로 내려가지만 다른 앱을 쓰는 게 아니므로 이탈 처리하지 않는다 — 안드 화면 고정(pin)
  중과 동일 취급. 공통 순수 로직은 `src/utils/focusAway.js`(테스트 有)
  - **안드**: `modules/screen-pin`의 `screenState()`(PowerManager.isInteractive + SCREEN_ON/OFF
    브로드캐스트 시각 + **KeyguardManager 직접 조회**) → 즉시 판정.
    우회 방지: **잠금을 푼 뒤** `AWAY_MIN_MS`(15초) 넘게 앱으로 안 돌아오면 그 구간만 이탈로 계산
    - ★**배경에서 JS 타이머로 시간을 재는 방법은 없다**★ (2026-07-30 실기기로 확인). RN 안드는
      액티비티 onPause에서 JS 타이머를 통째로 멈춘다(`JavaTimerManager.onHostPause`) — 배경 폴링을
      구현했다가 한 번도 안 도는 걸 확인하고 걷어냈다(`focusAway.js` 하단 주석).
      **반면 동적 등록 BroadcastReceiver와 AlarmManager는 배경에서도 정상 동작한다**
    - **이탈 알림만 네이티브가 담당한다** (`modules/screen-pin`의 `AwayWatch`, 2026-07-30):
      화면 끄기로 배경에 내려가면 JS가 `armAwayWatch(grace, limitAt, steps)`로 무장 →
      화면이 켜져 있는 동안 2초마다 `isKeyguardLocked`를 **직접 조회**해 잠금이 풀린 채 5초가 지나면
      확인 알람 예약(다시 꺼지면 취소) → 확인 시점에도 켜짐+해제면 그때부터가 이탈 →
      네이티브가 알림 게시 + 30초/1분/3분/5분 넛지 알람 예약. 복귀 시 JS가 `disarmAwayWatch()`.
      **알림 문구는 useAppState의 `awayFirstNotif`/`awayNudgeSteps`가 단일 출처**(양 경로 공용)
    - ※**이탈 카운트는 네이티브로 옮기지 않았다** — 기존대로 복귀 시점에 JS가 역산으로 확정한다
      (실기기 확인 2026-07-30: 알림창→다른 앱 1분 이탈 후 복귀 시 챌린지 정상)
    - ★핵심 판별자는 **복귀 순간의 `keyguardLocked`**★ (2026-07-30 실기기 진단으로 확정).
      "복귀 시점에 잠겨 있었다 = 그때까지 다른 앱을 쓸 수 없었다" — 다른 앱을 쓰고 돌아오는
      경로는 이미 잠금이 풀려 있어 false다. **직접 조회라 브로드캐스트 지연을 안 탄다**
    - ※**`ACTION_USER_PRESENT`(잠금해제 시각)만으로는 못 고친다** — 패턴 해제가 시작되면
      **액티비티가 먼저 살아나고** USER_PRESENT와 `isKeyguardLocked` 해제는 그 뒤에 온다.
      실측: 복귀 시점에 `lastUnlockAt`은 '없음', `keyguardLocked`는 아직 true.
      이 방식으로 한 번 고쳤다가 실패했으니 되돌리지 말 것
    - 판정 순서(**관측이 없을 때의 폴백**): ①`keyguardLocked` → 이탈 0 / ②`lastUnlockAt > lastOnAt`
      → 해제 후 경과분 / ③`deviceSecure`인데 해제 기록 없음 → 방금 푼 것으로 보고 이탈 0(관대) /
      ④잠금 미설정 → 화면 켬 기준(기존). 구빌드는 필드가 없어 ④로 폴백.
      ※③은 **키가드가 안 걸린 경우와 구분이 안 돼 이탈을 통째로 놓친다** — 그래서 위 배경 관측이 있다
    - 화면 켬 기준이던 시절엔 **잠금화면을 12초만 들여다봐도 이탈 1회가 조용히 찍혔다**(화면 꺼짐
      감지는 정상이라 markAway를 안 거치고 복귀 시 재계산에서만 확정 → **알림도 챌린지도 없이
      카운트만** 증가). 기기의 '화면이 꺼진 후 잠금 시간' 설정 탓에 짧게 끄면 잠금이 안 걸려
      재현이 안 되고 오래 끄면 재현돼, **'오래 꺼서 생긴 문제'로 오인하기 쉽다** —
      재현 조건은 끔 시간이 아니라 **잠금화면 체류 시간**이다
  - **iOS**: 잠금과 앱 전환이 같은 이벤트라 즉시 구분 불가 + **백그라운드에선 JS 타이머가 멈춰**
    나중에 JS로 판단할 수도 없다. 그래서 역할을 나눈다 —
    ① JS는 이탈 알림을 즉시가 아니라 20초 뒤로 예약(`IOS_AWAY_NOTIF_DELAY_SEC`, id `away-now`),
    ② `modules/focus-shield`가 background 진입 시 `beginBackgroundTask`로 25초 버티며
    `isProtectedDataAvailable`을 감시(잠기면 약 10초 뒤 false) → 잠금이면 예약된 알림/넛지를
    네이티브가 직접 취소(`AWAY_NOTIF_IDS` — **JS의 identifier와 반드시 일치**),
    ③ 이탈 카운트는 복귀 시 `consumeLockedAt()`으로 확정.
    부작용으로 **iOS는 이탈 중 Live Activity '이탈 중' 부제를 더 이상 세우지 않는다**
    (판별 전에 세우면 잠금화면에 오표시되고, 나중에 되돌릴 방법이 없어서 내린 결정)
  - iOS 한계(수용): **기기 암호를 안 건 사용자는 감지 불가 → 기존대로 이탈 처리**.
    또 **잠금이 감지되면 그 백그라운드 구간 전체가 이탈 면제**된다 — 잠금 후 잠금화면에서
    바로 다른 앱을 열어 오래 쓰고 돌아와도 이탈 0. 앱이 정지돼 잠금 해제 시각을 알 수 없어
    공개 API로는 못 막는다(안드는 `lastOnAt`으로 막음). exam 무결성이 iOS에서 더 약함
  - 알림 id(`away-now`, `away-nudge-*`)는 **`focusAway.js`의 `AWAY_NOTIF_IDS`가 단일 출처**이고
    Swift `AWAY_NOTIF_IDS`와 일치해야 한다 — `focusAway.test.js`가 Swift 파일을 직접 읽어 대조
  - 구빌드에는 네이티브 함수가 없어 두 경로 모두 조용히 기존 동작 유지(OTA 안전)
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

## 출시 현황 (2026-07-29 기준)

> ※이 표는 쉽게 낡는다. 진행 중인 릴리스의 최신 상태는 항상 `docs/release-next-build-checklist.md`를 볼 것.

| 항목 | 내용 |
|------|------|
| iOS | App Store 라이브 **1.0.36** (2026-07-23 배포 — 스터디룸·오답노트 첫 출시. 1.0.36은 스크린샷 사유 2.3.3 리젝 후 실제화면으로 교체해 승인). **1.0.37·1.0.38은 iOS 미빌드**(무료 빌드 할당량 소진, Windows라 로컬 빌드 불가) → **8월 초 1.0.39(buildNumber 53) 빌드·제출 예정**. TestFlight 외부 링크: `https://testflight.apple.com/join/dsNaK9kb` |
| Android | Google Play 라이브 **1.0.38(vc68)** (2026-07-29 승인 — 상시 타이머 알림·오답노트 사진첨부·라운지 신고 첫 출시). 다음은 **1.0.39(vc70)**, 8월 초 iOS와 동시 제출 예정 |
| 웹사이트 | `https://lds77.github.io/suneung-timer-native/` (main 브랜치 index.html, GitHub Pages) |
| 사용자 수 | 2026-07-14 기준 Play 활성기기 94 · MAU 약 100 · 총 설치 198 / iOS 90일 다운로드 185 (6월 대비 약 2배) |
| 브랜치 | 작업은 `sdk56`, 배포 승인 후 `main` 머지 — **1.0.35 이후 머지 보류 중**. vc68 승인(07-29)으로 조건은 풀렸고 머지만 남음 |
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
14. **사용자에게 보이는 이름을 바꾸면 저장소 밖 문구가 조용히 낡는다** — 스토어 설명·릴리스
    노트·웹사이트(`main` 브랜치)는 코드와 함께 안 고쳐진다. 07-31에 모드 이름을
    일반/집중/울트라로 통일했는데 08-01까지 스토어 설명은 옛 이름(집중 도전·울트라집중·
    편하게 공부) 그대로였다 — **앱에 없는 단어로 기능을 설명하고 있던 것**.
    UI 문구를 바꿀 땐 `docs/release-next-build-checklist.md` 6.5·6.5-A·6.5-B·6.6절을 함께 볼 것
