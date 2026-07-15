jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Linking: { openURL: jest.fn() },
  Alert: { alert: jest.fn() },
}));

import { shouldAskReview, REVIEW_MIN_SESSIONS, REVIEW_LATER_COOLDOWN_MS, REVIEW_MAX_LATER } from '../reviewAsk';

const NOW = 1800000000000;

describe('shouldAskReview — 리뷰 요청 판정', () => {
  test('완료 세션이 기준 미만이면 요청 안 함', () => {
    expect(shouldAskReview(REVIEW_MIN_SESSIONS - 1, {}, NOW)).toBe(false);
    expect(shouldAskReview(0, {}, NOW)).toBe(false);
  });

  test('기준 도달 + 기록 없음 → 요청', () => {
    expect(shouldAskReview(REVIEW_MIN_SESSIONS, {}, NOW)).toBe(true);
    expect(shouldAskReview(100, {}, NOW)).toBe(true);
  });

  test('이미 리뷰 남기기 선택했으면 다시 안 물음', () => {
    expect(shouldAskReview(10, { reviewAskDone: true }, NOW)).toBe(false);
  });

  test('나중에 선택 후 30일 이내에는 안 물음, 지나면 다시 물음', () => {
    const later = { reviewAskLaterAt: NOW - REVIEW_LATER_COOLDOWN_MS + 1000, reviewAskLaterCount: 1 };
    expect(shouldAskReview(10, later, NOW)).toBe(false);
    const expired = { reviewAskLaterAt: NOW - REVIEW_LATER_COOLDOWN_MS - 1000, reviewAskLaterCount: 1 };
    expect(shouldAskReview(10, expired, NOW)).toBe(true);
  });

  test('나중에 3회 미루면 영구히 안 물음', () => {
    const s = { reviewAskLaterAt: NOW - REVIEW_LATER_COOLDOWN_MS * 2, reviewAskLaterCount: REVIEW_MAX_LATER };
    expect(shouldAskReview(10, s, NOW)).toBe(false);
  });

  test('settings 미지정(구버전 데이터)에도 안전', () => {
    expect(shouldAskReview(10, undefined, NOW)).toBe(true);
  });
});
