// src/utils/focusAway.js
// 🔥모드 이탈 판정 중 '화면 끄기' 관련 순수 로직 (RN 의존 없음 — 테스트 대상).
//
// 배경: 안드로이드에서 화면을 끄면 앱이 background로 내려가 '이탈'로 잡혔다.
// 하지만 화면 고정(App Pinning) 중일 때는 이미 이탈로 치지 않고 있었고(다른 앱으로 못 나가니까),
// 고정을 거부한 사용자만 화면을 끌 때마다 이탈 처리되는 비대칭이 있었다.
// 화면을 끈 것은 다른 앱을 쓰는 게 아니므로 이탈이 아니다 — 대신 '화면을 다시 켠 시점'부터를
// 이탈 시간으로 본다 (잠금화면에서 바로 다른 앱을 열고 놀다 돌아온 경우를 걸러내기 위함).

// 화면 꺼짐 판정 유예: SCREEN_OFF 브로드캐스트와 액티비티 onPause 순서가 기기마다 달라
// isInteractive()가 잠깐 true로 남을 수 있다. 방금 꺼졌으면 꺼진 것으로 본다.
export const SCREEN_OFF_RACE_MS = 1500;

// ★이탈로 인정하는 최소 시간 — 이 값보다 짧게 나갔다 오면 이탈 0회★
// 🔥모드의 모든 이탈 판정이 이 하나를 쓴다(앱 전환 경로 / 화면 끄기 후 잠금해제 경로 / iOS 지연 판정).
// ※2026-07-30 이전엔 '화면 켠 뒤 유예'라는 이름으로 10초였고, **앱 전환 경로엔 같은 10초가
//   따로 하드코딩돼 있었다**(useAppState). 한쪽만 고치면 경로마다 기준이 달라지므로 하나로 합쳤다.
//
// 15초인 이유: 첫 이탈 알림이 5초에 오는데(ANDROID_AWAY_NOTIF_DELAY_SEC) 기준이 10초면
// **알림을 보고 곧바로 돌아온 경우가 10초 언저리에 걸려 어떨 땐 1회, 어떨 땐 0회로 갈렸다**
// (사용자 지적 2026-07-30). 알림 뒤 10초의 여유를 둬서 "알림 보고 바로 복귀 = 이탈 아님"이
// 안정적으로 성립하게 한다 — 알림이 벌점이 아니라 **돌아올 기회**로 동작하는 셈이다.
// 더 늘리면 짧게 자주 나갔다 오는 우회를 놓치므로 여기서 멈춘다.
export const AWAY_MIN_MS = 15000;

// ─── 첫 알림과 판정의 간격은 규칙 하나로 묶는다 (2026-08-01) ────────────────
// ★"판정 = 첫 이탈 알림 + 이 유예"★ — 이 관계가 이 기능의 전부다.
// 알림은 벌점 통보가 아니라 **돌아올 기회**이므로 반드시 판정보다 먼저 와야 하고,
// 그 사이 간격이 "보고 곧장 돌아오면 봐준다"는 약속이다.
//
// 예전엔 두 값을 플랫폼별로 각각 정하다가 **iOS에서 관계가 뒤집혀 있었다**:
// 알림 20초 > 판정 15초 → **알림을 본 순간 이미 이탈 확정**이라 유예가 아예 없었다
// (실기기 제보 2026-08-01: "20초 후에 바로 복귀해도 이탈 1회"). 안드는 5초/15초로
// 맞아 있었기에 같은 코드인데 플랫폼마다 체감이 반대였다.
// → 이제 판정을 숫자로 박지 않고 **첫 알림에서 파생**시킨다. 한쪽만 고쳐서 어긋날 수 없다.
// ※실제 판정값은 아래 awayMinMs() — 두 알림 상수보다 뒤에 정의돼 있다
export const AWAY_NOTIF_GRACE_SEC = 10;

// SCREEN_OFF 브로드캐스트가 AppState 'background'보다 늦게 도착할 수 있는 여유
export const SCREEN_OFF_LATE_MS = 2000;

// 🔥모드 이탈 알림 identifier 모음 — ★modules/focus-shield/ios/FocusShieldModule.swift의
// AWAY_NOTIF_IDS와 반드시 같아야 한다★ (iOS는 잠금 감지 시 네이티브가 이 id들로 예약을 취소하므로,
// 여기서 단계를 늘리고 Swift를 안 고치면 그 알림만 잠금화면에 뜬다).
// 어긋나면 focusAway.test.js의 교차 검증 테스트가 실패한다.
export const AWAY_NOW_ID = 'away-now';
export const AWAY_NUDGE_SECS = [30, 60, 180, 300];
export const AWAY_NOTIF_IDS = [AWAY_NOW_ID, ...AWAY_NUDGE_SECS.map(s => `away-nudge-${s}`)];

// 안드: 이탈 알림을 즉시 띄우지 않고 이만큼 뒤로 예약한다 (2026-07-30).
// 예전엔 background 진입 즉시 알림을 쐈는데, 이탈로 셀지 말지는 AWAY_MIN_MS가 지나야 정해진다.
// 그래서 알림창을 내렸다 올리거나 알림을 눌러 앱으로 돌아오는 것처럼 몇 초짜리 배경 전환에도
// '돌아와' 알림만 먼저 울리고 이탈은 안 잡히는 어긋남이 있었다
// (사용자 제보 2026-07-30: "앱이 열리는 순간 이탈 알림이 오는데 이탈 체크는 안 됨").
// 예약해 두고 복귀 시 취소하면 그런 순간 전환에는 알림이 안 간다.
//
// ★5초인 이유(사용자 결정 2026-07-30)★ — **알림창·앱 전환 같은 순간 전환(1~2초)만 걸러내는
// 최소값**. 더 줄이면(0~2초) 위 증상이 그대로 돌아오므로 내리지 말 것.
// ★알림(5초)이 판정(AWAY_MIN_MS 15초)보다 먼저 오는 건 의도된 설계다★ —
// 알림은 벌점 통보가 아니라 **돌아올 기회**이고, 보고 곧장 복귀하면 이탈로 안 센다.
// 두 값의 간격(10초)이 그 유예다. 한쪽만 바꾸면 "알림 보고 바로 왔는데 이탈이 찍히는"
// 경계 흔들림이 생기니 **둘은 반드시 같이 조정할 것**.
export const ANDROID_AWAY_NOTIF_DELAY_SEC = 5;

// iOS: 이탈 알림을 즉시 띄우지 않고 이만큼 뒤로 예약한다.
// iOS는 백그라운드에서 JS 타이머가 멈추므로 '10초 뒤에 판단해서 알림'이 불가능하다. 대신
// 알림을 OS에 예약해 두고, 네이티브가 화면 잠금을 감지하면(약 10초) 예약을 취소하는 방식을 쓴다
// (modules/focus-shield). 감지 지연(약 10초)보다 넉넉히 잡아야 잠금화면 헛알림이 안 뜬다.
export const IOS_AWAY_NOTIF_DELAY_SEC = 20;

// 플랫폼별 이탈 인정 최소 시간(ms) = 첫 알림 + AWAY_NOTIF_GRACE_SEC.
// 안드 = (5+10)*1000 = AWAY_MIN_MS와 같다(테스트로 고정 — 기존 동작 불변).
// iOS = (20+10)*1000 = 30초. iOS가 더 관대한 건 **잠금 감지에 약 10초가 걸려 첫 알림을
// 20초보다 앞당길 수 없기 때문**이다 — 앞당기면 화면을 끌 때마다 잠금화면에 헛알림이
// 떴다 사라진다(실기기로 10분 잠금 무알림을 확인한 그 동작이 깨진다).
// 그 대가로 iOS는 30초 미만 앱 전환을 이탈로 세지 않는다. exam 무결성이 iOS에서 더 약하다는
// 기존 결론(체크리스트 1.6절 'iOS ②')의 연장이고, 의도된 수용이다.
export function awayMinMs(platform) {
  const firstNotifSec = platform === 'ios' ? IOS_AWAY_NOTIF_DELAY_SEC : ANDROID_AWAY_NOTIF_DELAY_SEC;
  return (firstNotifSec + AWAY_NOTIF_GRACE_SEC) * 1000;
}

// ─── iOS: '다른 앱을 쓰다가 화면을 끈' 경우 (2026-08-01) ────────────────────
// 실기기 제보: 집중모드에서 다른 앱으로 나간 뒤 **이탈 알림이 오기 전에 화면을 끄면**
// 알림이 아예 안 오고 이탈도 안 잡힌다. 잠금이 감지되면 그 배경 구간을 통째로 면제했기 때문.
//
// 하지만 **배경 진입 ~ 잠금 사이는 명백히 다른 앱을 쓴 시간**이다. 두 시각을 다 알고 있으므로
// (`bgAt`는 JS, 잠금 감지 시각은 네이티브 `consumeLockedAt`) 그 구간만 잘라 이탈로 센다.
// ※'화면 끔 → 잠금 해제 → 다른 앱' 순서는 여전히 못 잡는다 — 앱이 정지돼 **잠금 해제 시각을
//   알 방법이 없다**(안드는 screenState의 lastUnlockAt으로 잡는다). 1.6절 'iOS ②' 한계 그대로.
//
// 잠금 감지는 실제 잠금보다 늦다(isProtectedDataAvailable이 꺼지기까지 약 10초).
// 그대로 빼지 않으면 그만큼 과다 계상되므로 지연분을 빼고 센다 — 오판 시 이탈을 놓치는 쪽이
// 멀쩡한 사용자에게 이탈을 씌우는 쪽보다 낫다는 기존 관대 원칙(wasIdleBeforeBackground 주석)과 같다.
export const IOS_LOCK_DETECT_LAG_MS = 10000;

// bgAt: 백그라운드 진입 시각, lockedAt: 네이티브가 잠금을 감지한 시각(epoch ms, 0이면 잠금 아님).
// 반환: 잠금 전까지 '다른 앱을 쓴' 것으로 볼 시간(ms).
export function iosAwayBeforeLockMs(bgAt, lockedAt, lag = IOS_LOCK_DETECT_LAG_MS) {
  if (!bgAt || !lockedAt || lockedAt <= bgAt) return 0;
  return Math.max(0, lockedAt - bgAt - lag);
}

// ─── 🔥모드 화면 꺼짐은 시스템에 맡긴다 (2026-07-29) ──────────────────────
// 예전에는 🔥모드가 keep-awake로 화면을 계속 켜 뒀는데, 잠금화면을 덮어놓고 공부하는 동안
// 화면이 안 꺼져 배터리 부담이 컸다. 이제 keep-awake를 잡지 않고 기기 설정의 화면 시간 초과에
// 그대로 맡긴다(무동작 감지·터치 리셋 모두 OS가 원래 하던 대로 한다).
// ※앱이 화면을 직접 끄는 공개 API는 양 플랫폼 모두 없다 — '꺼짐 방지를 안 하는 것'이 전부다.

// iOS: 백그라운드 전환 직전 이만큼 터치가 없었다면 '화면 자동 꺼짐(잠금)'으로 본다.
// 다른 앱으로 나가려면 반드시 화면을 만져야 하므로(홈 제스처·앱 전환·알림 탭 모두 터치),
// '한동안 아무 터치 없음 + 백그라운드'는 사람이 나간 게 아니라 화면이 꺼진 것이다.
// iOS는 안드의 screenState() 같은 수단이 없고 네이티브 잠금 감지도 암호 미설정 기기에선
// 실패하므로, 이 판정이 없으면 화면이 꺼질 때마다 이탈로 잡힌다.
// 15초인 이유: iOS 자동 잠금의 최솟값이 30초라 자동 꺼짐은 항상 마지막 터치 +30초 이후에 일어나고,
// 앱 전환은 터치 직후(1~2초)에 일어난다 — 두 경우 사이가 넉넉히 벌어지는 값.
export const IDLE_TOUCH_GAP_MS = 15000;

// lastTouchAt: 마지막으로 화면을 만진 시각(ms). 기록이 없으면 '무동작'으로 본다 —
// 오판했을 때 이탈을 놓치는 쪽(관대)이 멀쩡한 사용자에게 이탈을 씌우는 쪽보다 낫다.
export function wasIdleBeforeBackground(lastTouchAt, now = Date.now()) {
  if (!lastTouchAt) return true;
  return now - lastTouchAt >= IDLE_TOUCH_GAP_MS;
}

// 네이티브 screenState()가 준 값으로 '지금 화면이 꺼져 있는가' 판정
// state: { interactive: boolean, lastOnAt: number, lastOffAt: number } | null
export function isScreenOffState(state, now = Date.now()) {
  if (!state) return false; // 구버전 네이티브(정보 없음) → 기존 동작 유지
  if (state.interactive === false) return true;
  const off = state.lastOffAt || 0;
  return off > 0 && now - off < SCREEN_OFF_RACE_MS;
}

// 백그라운드 진입이 사실은 '화면 끄기' 때문이었는지 뒤늦게 판정 (복귀 시점의 보정).
// isInteractive()가 전환 순간 아직 true였고 브로드캐스트도 늦게 도착한 기기에서,
// 이미 이탈로 표시해 버린 것을 되돌리기 위한 안전망.
export function offHappenedAround(bgAt, lastOffAt) {
  const off = lastOffAt || 0;
  if (!off || !bgAt) return false;
  return off >= bgAt - SCREEN_OFF_RACE_MS && off <= bgAt + SCREEN_OFF_LATE_MS;
}

// 화면 끄기로 백그라운드에 갔다가 돌아왔을 때, 이탈로 계산할 시간(ms).
// bgAt: 백그라운드 진입 시각, lastOnAt: 화면을 마지막으로 켠 시각,
// lastUnlockAt: 잠금해제(키가드 해제)를 마친 시각.
// 화면을 켠 기록이 백그라운드 진입보다 이전이면(정보 없음/이상값) 이탈 0으로 본다.
//
// ★기준점은 '화면을 켠 순간'이 아니라 '잠금을 푼 순간'이다★ (2026-07-30 수정)
// 다른 앱은 잠금을 풀어야 열 수 있으므로, 잠금화면에 머문 시간(알림 확인)과 패턴·PIN을
// 입력한 시간은 다른 앱을 쓴 게 아니다. 화면 켬 기준으로 재면 이 시간이 전부 이탈로 잡혀,
// 잠금화면을 12초만 들여다봐도 이탈 1회가 조용히 찍혔다(알림 없이 — 화면 꺼짐 감지는
// 정상 동작하므로 markAway를 안 거치고 여기서만 이탈이 확정되기 때문).
// 기기 '화면이 꺼진 후 잠금 시간' 설정 때문에 짧게 끄면 잠금이 안 걸려 재현이 안 되고,
// 오래 끄면 패턴을 요구받아 재현되는 탓에 '화면을 오래 꺼서 생긴 문제'로 오인하기 쉽다.
//
// ★핵심 판별자는 복귀 순간의 keyguardLocked★ (2026-07-30 실기기 진단으로 확정)
// 패턴을 그려 해제가 시작되면 **액티비티가 먼저 살아나고** USER_PRESENT 브로드캐스트와
// isKeyguardLocked 해제는 그 뒤에 확정된다. 실측: 복귀 시점에 lastUnlockAt은 '없음',
// keyguardLocked는 아직 true. 그래서 잠금해제 시각만으로는 절대 못 고친다.
// 대신 "복귀 순간에 잠겨 있었다 = 그때까지 다른 앱을 쓸 수 없었다"가 성립한다 —
// 다른 앱을 쓰고 돌아오는 경로는 이미 잠금이 풀려 있어 false다. 직접 조회라 지연도 없다.
//
// state 인자는 네이티브 screenState()의 부분집합: { lastUnlockAt, keyguardLocked, deviceSecure }.
// 구빌드는 이 필드들이 없어 전부 기본값 → 화면 켬 기준의 기존 동작으로 폴백된다.
export function screenOffAwayMs(bgAt, lastOnAt, now = Date.now(), state = {}) {
  const on = lastOnAt || 0;
  if (!on || on <= (bgAt || 0)) return 0;
  const { lastUnlockAt = 0, keyguardLocked = false, deviceSecure = false } = state || {};

  // ① 아직 잠금 화면 = 다른 앱 사용 불가 → 이탈 아님
  if (keyguardLocked) return 0;
  // ② 잠금을 푼 시각을 아는 경우 그때부터 잰다 (해제 후 다른 앱을 쓴 시간만 이탈)
  if (lastUnlockAt > on) return Math.max(0, now - lastUnlockAt);
  // ③ 보안잠금 기기인데 해제 기록이 아직 없다 = 방금 막 푼 것(브로드캐스트가 복귀보다 늦음).
  //    관대 원칙(위 wasIdleBeforeBackground 주석 참조)에 따라 이탈로 치지 않는다.
  //    한계: USER_PRESENT가 오래 지연되면 실제 우회를 놓칠 수 있다 — 실기기 ② 항목으로 확인할 것
  if (deviceSecure) return 0;
  // ④ 잠금 미설정 기기: 화면을 켠 순간 곧바로 다른 앱을 열 수 있으므로 기존 규칙 유지
  return Math.max(0, now - on);
}

// 위 시간이 이탈로 인정될 만큼 긴가
export function isRealAwayAfterScreenOn(awayMs) {
  return awayMs >= AWAY_MIN_MS;
}

// ─── 통화 직후 유예 (안드, 2026-07-30 실기기 진단으로 확정) ──────────────────
// 전화를 끊고 통화 종료 화면을 닫고 앱으로 돌아오기까지의 시간은 이탈이 아니다.
// 실기기 로그: 통화 구간(87초)은 이미 면제되고 있었는데, **끊은 뒤의 20초**가 별개의 배경
// 전환으로 잡혀 이탈 1회 + '돌아와' 알림이 나갔다. 사용자가 겪은 "전화 끊고 몇 초 있다가
// 이탈 알림"의 정체다.
export const POST_CALL_GRACE_MS = 60000;

// 통화 관측 시각을 반영해 이탈 시간을 다시 잰다.
// callAgoMs: 마지막으로 통화를 관측한 이후 경과(ms). 기록이 없으면 음수 → 그대로 통과.
// ★'통화 이후 유예가 끝난 시점'부터만 이탈로 센다★ — 통째로 면제하지 않는 이유는,
// 통화가 끝난 뒤 다른 앱을 오래 쓰는 경우까지 봐주면 우회 수단이 되기 때문이다.
// 뽀모/연속 **휴식 페이즈** 중의 배경 전환은 이탈이 아니다 — 쉬라고 준 시간이다.
// 세션 기록은 이미 휴식을 빼는데(불변식 5) 이탈 카운트만 안 빼고 있었다.
//
// ★단순히 '휴식 중이면 면제'로 하면 안 된다★ — 판정이 **배경 진입 시점**에만 있어서,
// 휴식에 나가 작업 페이즈까지 안 돌아오는 우회가 열린다. 그래서 통화 직후 유예
// (awayMsAfterCall)와 같은 꼴로 **'휴식이 끝난 시각' 이후만** 센다.
//   msSinceBreakEnd = now − breakEndsAt (아직 휴식 중이면 음수 → 0으로 눌려 면제)
export function awayMsAfterBreak(awayMs, msSinceBreakEnd) {
  // 휴식 중이 아니었으면(null 등) 손대지 않는다. ※awayMsAfterCall과 같은 이유로 타입까지 확인 —
  //   null이 0으로 강제 변환되면 '휴식이 방금 끝났다'가 되어 이탈이 통째로 면제된다
  if (typeof msSinceBreakEnd !== 'number' || !Number.isFinite(msSinceBreakEnd)) return awayMs;
  return Math.max(0, Math.min(awayMs, msSinceBreakEnd));
}

export function awayMsAfterCall(awayMs, callAgoMs, grace = POST_CALL_GRACE_MS) {
  // ※`callAgoMs >= 0`만으로 거르면 안 된다 — null이 0으로 강제 변환돼 '방금 통화'로 둔갑하고,
  //   그러면 통화가 없었는데도 이탈이 통째로 면제된다. 타입까지 확인할 것
  if (typeof callAgoMs !== 'number' || !Number.isFinite(callAgoMs) || callAgoMs < 0) return awayMs;
  return Math.max(0, Math.min(awayMs, callAgoMs - grace));
}

// ─── ★배경에서 JS 타이머로 폴링하는 방법은 없다 (2026-07-30 실기기로 확인)★ ────
// 화면을 끄고 내려간 뒤 잠금화면에서 곧장 다른 앱으로 가면 앱은 'active'를 한 번도 못 받아,
// 위 screenOffAwayMs()의 역산 말고는 이탈 시작 시각을 알 방법이 없다. 그래서 "배경에 있는 동안
// 2초마다 screenState()를 직접 조회한다"를 구현했는데 **한 번도 돌지 않았다**.
//   원인: RN 안드로이드는 액티비티 onPause에서 JS 타이머를 통째로 멈춘다 —
//   JavaTimerManager.onHostPause()가 isPaused=true + clearFrameCallback을 하고
//   TimerFrameCallback.doFrame()은 isPaused면 즉시 return한다(headless 태스크 중 제외).
//   즉 **setInterval/setTimeout은 백그라운드에서 발화하지 않는다**.
//   ※"안드는 백그라운드에서도 JS가 돈다"는 취지의 주석이 useAppState 틱 근처에 있었는데
//     그게 오해의 출처다 — 배경에서 도는 건 네이티브가 밀어 넣는 이벤트(AppState 등)뿐이다.
// → 배경에서 '몇 초 뒤에 판단'이 필요하면 **네이티브(AlarmManager/브로드캐스트)로만 가능**하다.
//   그래서 이 경로의 이탈 알림은 `modules/screen-pin`의 AwayWatch(Kotlin)가 담당한다.
//   같은 걸 JS 타이머로 다시 시도하지 말 것.
