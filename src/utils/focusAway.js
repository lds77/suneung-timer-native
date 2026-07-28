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

// 화면을 다시 켜고 이 시간 안에 앱으로 돌아왔으면 이탈 아님 (잠금해제에 걸리는 시간)
export const SCREEN_ON_GRACE_MS = 10000;

// SCREEN_OFF 브로드캐스트가 AppState 'background'보다 늦게 도착할 수 있는 여유
export const SCREEN_OFF_LATE_MS = 2000;

// 🔥모드 이탈 알림 identifier 모음 — ★modules/focus-shield/ios/FocusShieldModule.swift의
// AWAY_NOTIF_IDS와 반드시 같아야 한다★ (iOS는 잠금 감지 시 네이티브가 이 id들로 예약을 취소하므로,
// 여기서 단계를 늘리고 Swift를 안 고치면 그 알림만 잠금화면에 뜬다).
// 어긋나면 focusAway.test.js의 교차 검증 테스트가 실패한다.
export const AWAY_NOW_ID = 'away-now';
export const AWAY_NUDGE_SECS = [30, 60, 180, 300];
export const AWAY_NOTIF_IDS = [AWAY_NOW_ID, ...AWAY_NUDGE_SECS.map(s => `away-nudge-${s}`)];

// iOS: 이탈 알림을 즉시 띄우지 않고 이만큼 뒤로 예약한다.
// iOS는 백그라운드에서 JS 타이머가 멈추므로 '10초 뒤에 판단해서 알림'이 불가능하다. 대신
// 알림을 OS에 예약해 두고, 네이티브가 화면 잠금을 감지하면(약 10초) 예약을 취소하는 방식을 쓴다
// (modules/focus-shield). 감지 지연(약 10초)보다 넉넉히 잡아야 잠금화면 헛알림이 안 뜬다.
export const IOS_AWAY_NOTIF_DELAY_SEC = 20;

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
// bgAt: 백그라운드 진입 시각, lastOnAt: 화면을 마지막으로 켠 시각.
// 화면을 켠 기록이 백그라운드 진입보다 이전이면(정보 없음/이상값) 이탈 0으로 본다.
export function screenOffAwayMs(bgAt, lastOnAt, now = Date.now()) {
  const on = lastOnAt || 0;
  if (!on || on <= (bgAt || 0)) return 0;
  return Math.max(0, now - on);
}

// 위 시간이 이탈로 인정될 만큼 긴가
export function isRealAwayAfterScreenOn(awayMs) {
  return awayMs >= SCREEN_ON_GRACE_MS;
}
