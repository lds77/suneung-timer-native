// src/utils/timeInput.js
// 시간 '타이핑' 입력의 순수 로직 (파싱·클램프·커밋).
// 휠/스테퍼는 항상 유효한 값만 만들지만, 타이핑은 사용자가 아무 문자열이나 넣을 수 있으므로
// 커밋 시점에 한 번 정규화한다. UI 컴포넌트(NumberField/TimeField)는 이 함수들만 쓴다.

// 문자열에서 숫자만 뽑아 [min, max]로 클램프. 빈 값/해석 불가면 fallback(직전 값) 유지.
// 예) '' → fallback, '8분' → 8, '999'(max 300) → 300
export function clampInt(text, { min = 0, max = 999, fallback = min } = {}) {
  const digits = String(text ?? '').replace(/[^0-9]/g, '');
  if (!digits) return fallback;
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// 'HH:MM' → { h, m }. 형식이 깨져 있으면 0시 0분.
export function splitHm(value) {
  const [h, m] = String(value ?? '').split(':');
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  return {
    h: Number.isFinite(hh) ? hh : 0,
    m: Number.isFinite(mm) ? mm : 0,
  };
}

export function hmToMin(value) {
  const { h, m } = splitHm(value);
  return h * 60 + m;
}

export function minToHm(total) {
  const t = Math.max(0, Math.min(24 * 60, Math.round(total)));
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// 타이핑한 시/분 텍스트를 'HH:MM'으로 확정한다.
// - 시는 0~maxHour, 분은 0~59 / 빈 칸·해석 불가는 직전 값 유지
// ※'종료 < 시작' 같은 관계 검증은 여기서 하지 않는다 — 고정 일정은 자정 넘김
//   (23:00~07:00)이 허용된 기능이라 하한을 걸면 정상 입력을 막는다.
//   판단은 저장 시점에 화면이 한다(경고 또는 자정 넘김 확인창).
//
// ★maxHour의 기본값은 23이다★ (2026-08-03) — 예전엔 모든 호출처가 24까지 받았는데
// 24시는 **'하루 끝'을 뜻하는 종료 시각 전용 표현**이라 다른 칸에서는 두 가지가 어긋났다:
//   ① 시 칸에 오타로 '25'를 치면 24로 잘리면서 `h===24` 규칙이 **분을 0으로 지운다**.
//      시를 09로 고쳐도 분은 이미 사라진 뒤라 복구되지 않는다(친 적 없는 값이 날아간 셈).
//   ② 리마인더 시각을 24로 저장하면 설정 화면은 '오후 12시'(정오)로 표시하는데
//      `setHours(24)`가 다음 날 00:00으로 롤오버해 **자정에 알림이 울렸다**.
// → 24가 의미 있는 '종료 시각' 칸만 `allowEndOfDay`로 열어준다(TimeField의 prop).
export function commitTimeText(hText, mText, { prev = '00:00', maxHour = 23 } = {}) {
  const before = splitHm(prev);
  const h = clampInt(hText, { min: 0, max: maxHour, fallback: Math.min(before.h, maxHour) });
  const m = h === 24 ? 0 : clampInt(mText, { min: 0, max: 59, fallback: before.m });
  return minToHm(h * 60 + m);
}

// 수치 입력(NumberField)의 라이브 커밋 값. 상한뿐 아니라 **하한도 즉시** 적용한다.
// ★min을 blur로 미루면 안 된다★ (2026-08-03) — 입력 모달은 keyboardShouldPersistTaps가
// 'handled'라 키보드가 뜬 채 '시작'을 누르면 **blur가 아예 일어나지 않는다**. 그러면 min 보정이
// 영영 실행되지 않아 `0`분 타이머가 만들어지고, 뽀모는 `pomoWorkMin || 25` 폴백 때문에
// 화면상 25분으로 멀쩡히 도는데 세션 기록만 `0 * 60`이라 **다 공부하고도 통계에 안 남는다**.
// 하한을 즉시 걸어도 사용자에게는 안 보인다 — 입력칸은 부모 값이 아니라 draft(친 그대로)를 그린다.
export function commitNumberText(text, { min = 0, max = 999 } = {}) {
  return clampInt(text, { min, max, fallback: min });
}
