# 열공메이트 — CLAUDE.md

이 파일은 Claude Code가 매 대화마다 자동으로 읽는 프로젝트 기준 문서입니다.

---

## 앱 개요

- **앱 이름**: 열공메이트
- **타겟**: 초등학생~공시생까지 모든 학습자 (수능/공시/자격증/내신 등)
- **플랫폼**: iOS + Android (React Native + Expo 52)
- **번들 ID**: `com.yeolgong.timer` / Apple ID: `6759892516`
- **현재 버전**: 1.0.20 (iOS 빌드 21, Android versionCode 14)

---

## 기술 스택

| 항목 | 내용 |

|------|------|
| 프레임워크 | React Native 0.76 + Expo SDK 52 |
| 상태 관리 | Context API (`src/hooks/useAppState.js`) |
| 로컬 저장소 | AsyncStorage (`src/utils/storage.js`) |
| 네비게이션 | React Navigation v6 (하단 탭) |
| 빌드 | EAS Build (eas.json 참고) |
| 알림 | expo-notifications (Foreground Service 포함) |
| 차트/그래픽 | react-native-svg, react-native-chart-kit |

---

## 파일 구조

```
src/
  hooks/
    useAppState.js        전역 상태 (Context API) — sessions/timers/todos/settings 관리
  screens/
    FocusScreen.js        타이머 메인 화면
    StatsScreen.js        통계 화면 (~1400줄, 일간/주간/월간/잔디 탭)
    PlannerScreen.js      플래너 화면
    ScheduleEditorScreen.js 일정 편집
    SubjectsScreen.js     과목 관리
    SettingsScreen.js     설정
    stats/
      components/         GoalRing, SubjectDonut, ReportComponents
      helpers.js          통계 계산 유틸
      styles.js           StatsScreen 전용 스타일
  components/
    RunningTimersBar.js   실행 중 타이머 상단바
    CircularTimer.js      원형 타이머 UI
    CharacterAvatar.js    캐릭터 아바타
    TimePickerGrid.js     시간 피커
    Stepper.js
    Toast.js
  utils/
    storage.js            AsyncStorage 래퍼
    density.js            집중밀도 계산 (calcAverageDensity, calculateDensity)
    format.js             formatDuration, formatShort, getToday 등
  constants/
    colors.js             getTheme(darkMode, accentColor, fontScale) → T 테마 객체
    presets.js            getTier(density) → 티어 라벨/색상
    characters.js         캐릭터 데이터
    fonts.js              폰트 상수
App.js                    앱 진입점, 온보딩, 네비게이션
```

---

## 핵심 데이터 구조

```js
// sessions
{ id, date(YYYY-MM-DD), subjectId, startedAt, endedAt, durationSec,
  focusDensity, tier, pausedCount, exitCount, focusMode, verified, selfRating, memo }

// subjects
{ id, name, color, totalElapsedSec, isFavorite }

// todos
{ id, text, done }

// settings
{ mainCharacter, dailyGoalMin, darkMode, streak, lastStudyDate,
  accentColor, exactAlarmGuideShown, ... }
```

---

## 주요 기능

### 타이머
- 모드: 카운트다운 / 자유 / 포모도로 / 랩 스탑워치
- 집중모드: 🔥(화면 켜짐) / 📖(화면 꺼짐)
- 동시에 여러 타이머 실행 가능 (RunningTimersBar로 전환)

### 집중밀도
- 20~103점 범위 (v5 기준)
- `src/utils/density.js`에서 계산

### 통계 (StatsScreen)
- 탭: 일간 | 주간 | 월간 | 잔디
- 잔디: HM_WEEKS=26 (6개월)
- 날짜 클릭 → 날짜 상세 바텀시트 (주간/월간/잔디 공유)
- 주간: weekOffset으로 이전/다음 주 탐색
- GoalRing: 목표 달성률 도넛 링

### 알림 / 백그라운드
- `timer-complete` 채널: AndroidImportance.MAX, DATE 트리거 (setExactAndAllowWhileIdle)
- `timer-progress` 채널: AndroidImportance.LOW, sticky 진행 알림 (Foreground Service 신호)
- Android 12+ 정확한 알람 권한 최초 1회 안내
- 배터리 최적화 설정 바로가기 (SettingsScreen + 온보딩 Step 5)
- iOS Live Activity: 실행 중 타이머를 잠금화면/Dynamic Island에 표시 (`src/utils/liveActivity.js`, expo-live-activity 0.5.0-alpha1 고정 — SDK 56 업그레이드 시 expo-widgets로 마이그레이션)

---

## 빌드 및 배포

```bash
# 개발 서버
expo start

# TestFlight / 내부 배포용 iOS 빌드
eas build --profile testflight --platform ios

# 프로덕션 Android (AAB)
eas build --profile production --platform android

# 내부 테스트 Android APK
eas build --profile preview --platform android
```

> **주의**: 알림/백그라운드 동작은 Expo Go에서 테스트 불가 → `preview` 프로필로 APK 빌드 후 테스트

### 버전 올릴 때 체크리스트
- `app.json` → `version`, `ios.buildNumber`, `android.versionCode`
- Android versionCode: **짝수 사용** (16KB 페이지 정렬 대응 빌드와 교대)

---

## 출시 현황 (2026-05-14 기준)

| 항목 | 내용 |
|------|------|
| iOS | App Store 출시 중, TestFlight 외부 링크: `https://testflight.apple.com/join/dsNaK9kb` |
| Android | Google Play 출시 중 |
| 사용자 수 | 초기 단계 (10~20명) |

---

## 작업 규칙

1. **iOS/Android 분기 필수**: iOS 작업이 Android에 영향을 줄 경우 반드시 먼저 물어볼 것 (`Platform.OS` 분기 확인)
2. **현재 모드**: iOS 우선 작업 — Android 영향 변경은 사용자 승인 후 진행
3. **테마**: `getTheme()`으로 항상 T 객체를 통해 색상 참조, 하드코딩 금지
4. **스타일**: StyleSheet.create 사용, 인라인 스타일 최소화
5. **알림 테스트**: 실기기 + EAS preview 빌드로만 검증 가능
