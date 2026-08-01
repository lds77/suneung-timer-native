// 화면 끄기 이탈 판정 순수 로직 테스트
import fs from 'fs';
import path from 'path';
import {
  isScreenOffState, screenOffAwayMs, isRealAwayAfterScreenOn, offHappenedAround,
  wasIdleBeforeBackground,
  SCREEN_OFF_RACE_MS, AWAY_MIN_MS, SCREEN_OFF_LATE_MS, AWAY_NOTIF_IDS, IDLE_TOUCH_GAP_MS,
  ANDROID_AWAY_NOTIF_DELAY_SEC, awayMsAfterCall, POST_CALL_GRACE_MS,
  awayMinMs, AWAY_NOTIF_GRACE_SEC, IOS_AWAY_NOTIF_DELAY_SEC,
} from '../focusAway';

// ★알림은 벌점 통보가 아니라 '돌아올 기회'다★ — 그래서 첫 알림이 판정보다 반드시 먼저 와야 한다.
// iOS는 이 관계가 뒤집혀 있었다(알림 20초 > 판정 15초 → 알림 본 순간 이미 이탈 확정).
// 판정을 첫 알림에서 파생시켜 한쪽만 고쳐서 어긋날 수 없게 만든 것을 여기서 고정한다.
describe('awayMinMs — 판정은 첫 알림 + 유예', () => {
  it('안드로이드는 기존 AWAY_MIN_MS(15초)와 정확히 같다 — 기존 동작 불변', () => {
    expect(awayMinMs('android')).toBe(AWAY_MIN_MS);
    expect(awayMinMs('android')).toBe((ANDROID_AWAY_NOTIF_DELAY_SEC + AWAY_NOTIF_GRACE_SEC) * 1000);
  });

  it('iOS는 30초 — 첫 알림 20초 + 유예 10초', () => {
    expect(awayMinMs('ios')).toBe((IOS_AWAY_NOTIF_DELAY_SEC + AWAY_NOTIF_GRACE_SEC) * 1000);
    expect(awayMinMs('ios')).toBe(30000);
  });

  it('양 플랫폼 모두 첫 알림이 판정보다 먼저 온다 (이 순서가 뒤집히면 유예가 사라진다)', () => {
    for (const [platform, firstNotifSec] of [
      ['android', ANDROID_AWAY_NOTIF_DELAY_SEC],
      ['ios', IOS_AWAY_NOTIF_DELAY_SEC],
    ]) {
      expect(firstNotifSec * 1000).toBeLessThan(awayMinMs(platform));
    }
  });

  it('알 수 없는 플랫폼은 안드 기준으로 폴백', () => {
    expect(awayMinMs(undefined)).toBe(AWAY_MIN_MS);
    expect(awayMinMs('web')).toBe(AWAY_MIN_MS);
  });
});

// iOS 전용: 백그라운드 전환 직전 터치 유무로 '화면 자동 꺼짐'과 '사람이 나감'을 가른다
describe('wasIdleBeforeBackground', () => {
  const NOW = 2_000_000;

  it('방금 화면을 만졌으면 사람이 나간 것 — 이탈 판정 대상', () => {
    expect(wasIdleBeforeBackground(NOW - 500, NOW)).toBe(false);
    expect(wasIdleBeforeBackground(NOW - (IDLE_TOUCH_GAP_MS - 1), NOW)).toBe(false);
  });

  it('한동안 터치가 없었으면 화면이 꺼진 것 — 이탈 아님', () => {
    expect(wasIdleBeforeBackground(NOW - IDLE_TOUCH_GAP_MS, NOW)).toBe(true);
    expect(wasIdleBeforeBackground(NOW - 10 * 60000, NOW)).toBe(true);
  });

  it('터치 기록이 없으면 무동작으로 본다 — 오판 시 관대한 쪽(이탈 미기록)이 안전', () => {
    expect(wasIdleBeforeBackground(0, NOW)).toBe(true);
    expect(wasIdleBeforeBackground(null, NOW)).toBe(true);
    expect(wasIdleBeforeBackground(undefined, NOW)).toBe(true);
  });
});

describe('isScreenOffState', () => {
  const NOW = 1_000_000;

  it('정보 없음(구버전 네이티브)이면 꺼짐 아님 — 기존 동작 유지', () => {
    expect(isScreenOffState(null, NOW)).toBe(false);
    expect(isScreenOffState(undefined, NOW)).toBe(false);
  });

  it('interactive=false면 꺼짐', () => {
    expect(isScreenOffState({ interactive: false, lastOnAt: 0, lastOffAt: 0 }, NOW)).toBe(true);
  });

  it('interactive=true여도 방금 SCREEN_OFF가 왔으면 꺼짐 (전환 레이스)', () => {
    const st = { interactive: true, lastOnAt: NOW - 60000, lastOffAt: NOW - 100 };
    expect(isScreenOffState(st, NOW)).toBe(true);
  });

  it('유예 시간이 지난 옛 SCREEN_OFF는 무시 — 다른 앱으로 나간 것', () => {
    const st = { interactive: true, lastOnAt: NOW - 5000, lastOffAt: NOW - SCREEN_OFF_RACE_MS - 1 };
    expect(isScreenOffState(st, NOW)).toBe(false);
  });

  it('경계: 유예 시간과 정확히 같으면 제외 (미만일 때만 꺼짐)', () => {
    const st = { interactive: true, lastOnAt: NOW - 5000, lastOffAt: NOW - SCREEN_OFF_RACE_MS };
    expect(isScreenOffState(st, NOW)).toBe(false);
  });
});

describe('screenOffAwayMs', () => {
  const BG = 1_000_000;

  it('화면 켠 시점부터 복귀까지를 이탈 시간으로 계산', () => {
    expect(screenOffAwayMs(BG, BG + 60000, BG + 63000)).toBe(3000);
  });

  it('화면 켠 기록이 백그라운드 진입 이전이면 0 (정보 없음)', () => {
    expect(screenOffAwayMs(BG, BG - 5000, BG + 60000)).toBe(0);
    expect(screenOffAwayMs(BG, 0, BG + 60000)).toBe(0);
  });

  it('화면을 껐다 켜기를 반복해도 마지막으로 켠 시점 기준', () => {
    // 중간에 잠깐 켜졌다 다시 꺼진 뒤(그 켜짐은 lastOnAt이 아님) 최근에 켠 시점만 본다
    expect(screenOffAwayMs(BG, BG + 1_800_000, BG + 1_800_500)).toBe(500);
  });

  it('음수 방지', () => {
    expect(screenOffAwayMs(BG, BG + 10000, BG + 9000)).toBe(0);
  });

  it('경계: 화면 켠 시각이 백그라운드 진입과 정확히 같으면 0 (진입 전 정보로 간주)', () => {
    expect(screenOffAwayMs(BG, BG, BG + 60000)).toBe(0);
  });

  // ─── 잠금 상태 기준 (2026-07-30 실기기 진단으로 확정) ────────────────
  // 화면 켬 기준으로 재면 잠금화면 체류·패턴 입력 시간이 전부 이탈로 잡혔다.
  it('실측 재현: 복귀 순간 키가드가 잠겨 있으면 이탈 아님', () => {
    // 실기기 진단값 그대로 — bg 44.3초 전, 화면 켬 24.3초 전, 해제기록 없음, 키가드 잠김
    const on = BG + 20000, now = BG + 44300;
    const st = { lastUnlockAt: 0, keyguardLocked: true, deviceSecure: true };
    expect(screenOffAwayMs(BG, on, now, st)).toBe(0);
    // 수정 전(잠금 상태 무시)이면 24.3초 → 이탈로 오판했다
    expect(isRealAwayAfterScreenOn(screenOffAwayMs(BG, on, now))).toBe(true);
  });

  it('보안잠금 기기에서 해제 기록이 아직 없으면 방금 푼 것으로 본다 (관대 원칙)', () => {
    const on = BG + 15000, now = BG + 45000;
    const st = { lastUnlockAt: 0, keyguardLocked: false, deviceSecure: true };
    expect(screenOffAwayMs(BG, on, now, st)).toBe(0);
  });

  it('잠금 푼 뒤 다른 앱을 쓰다 온 것은 그대로 이탈로 잡힌다', () => {
    const on = BG + 15000, now = BG + 138000; // 해제(+18초) 후 2분
    const st = { lastUnlockAt: BG + 18000, keyguardLocked: false, deviceSecure: true };
    expect(screenOffAwayMs(BG, on, now, st)).toBe(120000);
    expect(isRealAwayAfterScreenOn(screenOffAwayMs(BG, on, now, st))).toBe(true);
  });

  it('잠금 미설정 기기: 화면 켠 순간부터 다른 앱을 열 수 있으므로 화면 켬 기준 유지', () => {
    const on = BG + 15000, now = BG + 45000;
    const st = { lastUnlockAt: 0, keyguardLocked: false, deviceSecure: false };
    expect(screenOffAwayMs(BG, on, now, st)).toBe(30000);
  });

  it('구빌드(필드 없음)는 화면 켬 기준의 기존 동작으로 폴백', () => {
    const on = BG + 15000, now = BG + 45000;
    expect(screenOffAwayMs(BG, on, now, {})).toBe(30000);
    expect(screenOffAwayMs(BG, on, now, undefined)).toBe(30000);
    expect(screenOffAwayMs(BG, on, now)).toBe(30000);
  });
});

describe('offHappenedAround', () => {
  const BG = 1_000_000;

  it('백그라운드 진입 직후 도착한 SCREEN_OFF는 그 전환의 원인으로 본다', () => {
    expect(offHappenedAround(BG, BG + 300)).toBe(true);
    expect(offHappenedAround(BG, BG + SCREEN_OFF_LATE_MS)).toBe(true);
  });

  it('진입 직전 SCREEN_OFF도 원인 (브로드캐스트가 먼저 온 경우)', () => {
    expect(offHappenedAround(BG, BG - 200)).toBe(true);
    expect(offHappenedAround(BG, BG - SCREEN_OFF_RACE_MS)).toBe(true);      // 하한 경계 포함
    expect(offHappenedAround(BG, BG - SCREEN_OFF_RACE_MS - 1)).toBe(false); // 그 직전은 제외
  });

  it('한참 전/후의 SCREEN_OFF는 무관 — 다른 앱으로 나간 뒤 화면이 꺼진 것', () => {
    expect(offHappenedAround(BG, BG - 60000)).toBe(false);
    expect(offHappenedAround(BG, BG + 60000)).toBe(false);
  });

  it('기록 없음/진입 시각 없음이면 false', () => {
    expect(offHappenedAround(BG, 0)).toBe(false);
    expect(offHappenedAround(null, BG)).toBe(false);
  });
});

// iOS는 화면 잠금을 감지하면 '네이티브가' 예약된 이탈 알림을 취소한다. 그래서 알림 id 목록이
// JS와 Swift 양쪽에 있는데, 어긋나면 그 알림만 잠금화면에 뜬다(조용히 깨지는 유형).
// 넛지 단계를 추가/변경하면 이 테스트가 먼저 실패해서 Swift 수정을 강제한다.
describe('AWAY_NOTIF_IDS ↔ Swift AWAY_NOTIF_IDS 교차 검증', () => {
  it('네이티브 취소 목록이 JS identifier와 정확히 일치', () => {
    const swiftPath = path.join(__dirname, '../../../modules/focus-shield/ios/FocusShieldModule.swift');
    const src = fs.readFileSync(swiftPath, 'utf8');
    const m = src.match(/AWAY_NOTIF_IDS\s*=\s*\[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const swiftIds = m[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, ''));
    expect(swiftIds.sort()).toEqual([...AWAY_NOTIF_IDS].sort());
  });
});

describe('isRealAwayAfterScreenOn', () => {
  it('잠금해제 정도의 짧은 시간은 이탈 아님', () => {
    expect(isRealAwayAfterScreenOn(0)).toBe(false);
    expect(isRealAwayAfterScreenOn(AWAY_MIN_MS - 1)).toBe(false);
  });
  it('화면 켜고 한참 뒤 돌아오면 이탈 — 잠금화면에서 다른 앱을 쓴 경우', () => {
    expect(isRealAwayAfterScreenOn(AWAY_MIN_MS)).toBe(true);
    expect(isRealAwayAfterScreenOn(600000)).toBe(true);
  });
});

describe('ANDROID_AWAY_NOTIF_DELAY_SEC', () => {
  // 즉시(0초)로 되돌리면 알림창을 내렸다 올리거나 알림을 눌러 앱에 들어오는 몇 초짜리 배경
  // 전환에도 이탈 알림이 울린다(2026-07-30 제보 증상). 순간 전환은 1~2초라 그보다 커야 한다.
  it('순간 배경 전환(1~2초)을 걸러낼 만큼은 뒤에 있어야 한다', () => {
    expect(ANDROID_AWAY_NOTIF_DELAY_SEC).toBeGreaterThanOrEqual(3);
  });
  it('첫 넛지(30초)보다는 앞이어야 순서가 뒤집히지 않는다', () => {
    expect(ANDROID_AWAY_NOTIF_DELAY_SEC).toBeLessThan(30);
  });
  // ★알림을 보고 곧장 돌아온 사용자에게 이탈이 찍히면 안 된다★ — 알림(5초)과 판정(15초)
  // 사이의 간격이 그 유예다. 간격이 좁으면 "알림 보고 바로 왔는데 어떨 땐 1회, 어떨 땐 0회"로
  // 갈린다(사용자 지적 2026-07-30). 알림을 보고 복귀하는 데 걸리는 현실적인 시간(수 초)을 덮을 것
  it('알림을 보고 복귀할 여유가 판정 기준까지 충분히 남아야 한다', () => {
    expect(AWAY_MIN_MS - ANDROID_AWAY_NOTIF_DELAY_SEC * 1000).toBeGreaterThanOrEqual(8000);
  });
});

// ─── 통화 직후 유예 (2026-07-30 실기기 진단으로 확정) ────────────────────────
// 실기기 로그: 통화 구간(87초)은 이미 면제되고 있었는데 **끊은 뒤 20초**가 별개의 배경
// 전환으로 잡혀 이탈 1회 + 알림이 나갔다. 통화 관측 시각(네이티브)을 기준으로 되짚어 막는다.
describe('awayMsAfterCall', () => {
  const G = POST_CALL_GRACE_MS;

  it('통화 관측 기록이 없으면 그대로 통과 (평소 이탈은 영향 없음)', () => {
    expect(awayMsAfterCall(30000, -1)).toBe(30000);
    expect(awayMsAfterCall(30000, undefined)).toBe(30000);
    expect(awayMsAfterCall(30000, null)).toBe(30000); // null이 0으로 강제 변환돼 '방금 통화'가 되면 안 된다
  });

  it('실기기 재현: 통화 직후 20초 복귀 → 이탈 아님', () => {
    // 끊은 지 20초, 그 20초가 통째로 배경이었다
    expect(awayMsAfterCall(20000, 20000)).toBe(0);
    expect(isRealAwayAfterScreenOn(awayMsAfterCall(20000, 20000))).toBe(false);
  });

  it('유예 경계: 유예까지는 0, 넘어선 만큼만 이탈로 센다', () => {
    expect(awayMsAfterCall(600000, G)).toBe(0);
    expect(awayMsAfterCall(600000, G + 5000)).toBe(5000);
  });

  it('통화 후 다른 앱을 오래 쓰면 유예를 뺀 나머지는 이탈로 잡힌다 (우회 방지)', () => {
    const away = 10 * 60000, callAgo = 10 * 60000; // 끊고 10분 내내 다른 앱
    expect(awayMsAfterCall(away, callAgo)).toBe(away - G);
    expect(isRealAwayAfterScreenOn(awayMsAfterCall(away, callAgo))).toBe(true);
  });

  it('배경 시간보다 길게 잡히지 않는다 (통화가 앱 밖에서 이미 끝나 있던 경우)', () => {
    expect(awayMsAfterCall(5000, 10 * 60000)).toBe(5000);
  });

  it('오래전 통화는 유예를 주지 않는다', () => {
    expect(awayMsAfterCall(30000, 60 * 60000)).toBe(30000);
  });
});
