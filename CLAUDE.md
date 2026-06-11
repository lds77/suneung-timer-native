# 열공메이트 — CLAUDE.md

이 파일은 Claude Code가 매 대화마다 자동으로 읽는 프로젝트 기준 문서입니다.

---

## 앱 개요

- **앱 이름**: 열공메이트
- **타겟**: 초등학생~공시생까지 모든 학습자 (수능/공시/자격증/내신 등)
- **플랫폼**: iOS + Android (React Native + Expo SDK 54)
- **번들 ID**: `com.yeolgong.timer` / Apple ID: `6759892516` (preview 변형: `com.yeolgong.timer.preview`)
- **현재 버전**: 1.0.27 (iOS 빌드 28, Android versionCode 20)

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 프레임워크 | React Native 0.81 + Expo SDK 54 (New Architecture/Fabric) + React 19.1 |
| 상태 관리 | Context API (`src/hooks/useAppState.js`, ~1900줄) |
| 로컬 저장소 | AsyncStorage (`src/utils/storage.js`, `@yeolgong/*` 키) |
| 네비게이션 | React Navigation v6 하단 탭 5개: 집중/과목/플래너/통계/설정 |
| 빌드 | EAS Build (eas.json — development/preview/testflight/production 프로필) |
| 설정 파일 | `app.config.js` (app.json 아님 — `APP_VARIANT=preview` 분기) |
| 알림 | expo-notifications (Android Foreground Service 포함) |
| 잠금화면 | expo-live-activity 0.5.0-alpha1 **정확히 고정** (iOS Live Activity) |
| 차트/그래픽 | react-native-svg, react-native-chart-kit |

> **개발 환경 주의**: Windows — `expo prebuild -p ios` 불가, iOS 네이티브 검증은 EAS 클라우드 빌드로만 가능

---

## 파일 구조

```
src/
  hooks/
    useAppState.js        전역 상태 (Context API) — sessions/timers/todos/settings/weeklySchedule 관리, 100ms 타이머 틱
  screens/
    FocusScreen.js        타이머 메인 화면 (~3,500줄)
    StatsScreen.js        통계 화면 (~3,800줄, 일간/주간/월간/잔디 탭)
    PlannerScreen.js      플래너 화면 (~2,000줄)
    ScheduleEditorScreen.js 일정 편집
    SubjectsScreen.js     과목 관리 + 공부법 프리셋 (STUDY_METHODS, 학년별)
    SettingsScreen.js     설정
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
  utils/
    storage.js            AsyncStorage 래퍼 (타이머 스냅샷·백업/복원 포함)
    density.js            집중밀도 계산 (calcAverageDensity, calculateDensity)
    format.js             formatDuration, formatShort, getToday, generateId 등
    liveActivity.js       iOS Live Activity 래퍼 (잠금화면/Dynamic Island 타이머)
  constants/
    colors.js             getTheme(darkMode, accentColor, fontScale, stylePreset) → T 테마 객체
    presets.js            getTier(density) → 티어 라벨/색상
    characters.js         캐릭터 데이터 (toru, paengi 등 + 상황별 메시지)
    fonts.js              폰트 상수
App.js                    앱 진입점 (~1,000줄), 온보딩, 네비게이션, 잠금화면 오버레이
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
  laps, planId, result }

// sessions
{ id, date(YYYY-MM-DD), subjectId, label, startedAt, endedAt, durationSec,
  mode, focusDensity, tier, pausedCount, exitCount, focusMode, verified,
  selfRating, memo, planId, schoolLevel, ultraFocusLevel, timerType,
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

---

## 주요 기능

### 타이머
- 모드: 카운트다운 / 자유(카운트업) / 뽀모도로 / 랩 스탑워치 / 연속(sequence, 여러 항목 자동 이어달리기)
- **단일 활성 타이머 제약**: 랩을 제외하고 한 번에 하나만 실행 가능
- 집중모드: 🔥(screen_on, 화면 켜짐 + 잠금 오버레이) / 📖(screen_off, 화면 꺼짐)
- 울트라집중 잠금강도: normal / focus / exam (exam은 일시정지 차단, 이탈 시 exitCount 기록)
- 100ms 틱 + `resumedAt`/`elapsedSecAtResume` 벽시계 기준 계산 → 백그라운드에서도 정확
- 공부법 프리셋: SubjectsScreen의 STUDY_METHODS (학년별 연속모드 템플릿, 출처 표기)

### 집중밀도
- 20~103점 범위 (v5 기준), `src/utils/density.js`에서 계산
- 입력: 일시정지/이탈 횟수, 집중모드, 완료율, 자가평가, 학년 등

### 통계 (StatsScreen)
- 탭: 일간 | 주간 | 월간 | 잔디
- 잔디: HM_WEEKS=26 (6개월)
- 날짜 클릭 → 날짜 상세 바텀시트 (주간/월간/잔디 공유)
- 주간: weekOffset으로 이전/다음 주 탐색
- GoalRing: 목표 달성률 도넛 링
- 주간/월간 공부 리포트 알림 자동 예약

### 알림 / 백그라운드
- `timer-complete` 채널: AndroidImportance.MAX, DATE 트리거 (setExactAndAllowWhileIdle)
- `timer-progress` 채널: AndroidImportance.LOW, sticky 진행 알림 (Foreground Service 신호)
- Android 12+ 정확한 알람 권한 최초 1회 안내
- 배터리 최적화 설정 바로가기 (SettingsScreen + 온보딩 Step 5)
- **iOS Live Activity**: 실행 중 타이머를 잠금화면/Dynamic Island에 표시 (`src/utils/liveActivity.js`)
  - 카운트다운류는 `progressBar.date`(OS가 그림), 자유는 `elapsedTimer`(카운트업), 일시정지는 정적 subtitle
  - useAppState의 동기화 useEffect 1개가 시그니처 비교로 start/update/end 판단 (초당 호출 없음)
  - expo-live-activity는 deprecated → **SDK 56 업그레이드 시 공식 expo-widgets로 마이그레이션 필요**

### 기타
- 아날로그 시계 모드 (수능 시험장 벽시계, 가로 전체화면 모달 지원)
- 캐릭터 시스템 (토루/팽이 등) + 상황별 토스트 메시지
- 데이터 백업/복원 (JSON 내보내기/가져오기)

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

## 출시 현황 (2026-06-11 기준)

| 항목 | 내용 |
|------|------|
| iOS | App Store 출시 중, TestFlight 외부 링크: `https://testflight.apple.com/join/dsNaK9kb` |
| Android | Google Play 출시 중 |
| 사용자 수 | 초기 단계 (10~20명) |

---

## 작업 규칙

1. **iOS/Android 분기 필수**: iOS 작업이 Android에 영향을 줄 경우 반드시 먼저 물어볼 것 (`Platform.OS` 분기 확인)
2. **현재 모드**: iOS 우선 작업 — Android 영향 변경은 사용자 승인 후 진행
3. **EAS 빌드는 사용자 승인 후 실행** (빌드 큐/비용 발생)
4. **테마**: `getTheme()`으로 항상 T 객체를 통해 색상 참조, 하드코딩 금지
5. **스타일**: StyleSheet.create 사용, 인라인 스타일 최소화
6. **알림 테스트**: 실기기 + EAS 빌드로만 검증 가능
