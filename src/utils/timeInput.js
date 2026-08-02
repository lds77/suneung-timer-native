// src/utils/timeInput.js
// 시간 '타이핑' 입력의 순수 로직 (파싱·클램프·커밋).
// 휠/스테퍼는 항상 유효한 값만 만들지만, 타이핑은 사용자가 아무 문자열이나 넣을 수 있으므로
// 커밋 시점에 한 번 정규화한다. UI 컴포넌트(EditableNumber/TimePickerGrid)는 이 함수들만 쓴다.

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
// - 시는 0~24, 분은 0~59 (24시는 분을 0으로 강제 — 앱의 하루 끝 표현이 '24:00'이라서)
// - minValue가 있으면 그보다 이른 시각은 minValue로 올린다 (종료<시작 방지).
//   ※휠은 손대지 않는다 — minValue는 원래 호출부 onChange가 보정하던 것이고,
//     타이핑은 그 보정을 우회할 수 있어 여기서만 하한을 건다.
export function commitTimeText(hText, mText, { prev = '00:00', minValue } = {}) {
  const before = splitHm(prev);
  const h = clampInt(hText, { min: 0, max: 24, fallback: before.h });
  const m = h === 24 ? 0 : clampInt(mText, { min: 0, max: 59, fallback: before.m });

  let total = h * 60 + m;
  if (minValue) {
    const floor = hmToMin(minValue);
    if (total < floor) total = floor;
  }
  return minToHm(total);
}
