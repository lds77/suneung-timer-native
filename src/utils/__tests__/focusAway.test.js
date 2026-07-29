// 화면 끄기 이탈 판정 순수 로직 테스트
import fs from 'fs';
import path from 'path';
import {
  isScreenOffState, screenOffAwayMs, isRealAwayAfterScreenOn, offHappenedAround,
  wasIdleBeforeBackground,
  SCREEN_OFF_RACE_MS, SCREEN_ON_GRACE_MS, SCREEN_OFF_LATE_MS, AWAY_NOTIF_IDS, IDLE_TOUCH_GAP_MS,
} from '../focusAway';

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
    expect(isRealAwayAfterScreenOn(SCREEN_ON_GRACE_MS - 1)).toBe(false);
  });
  it('화면 켜고 한참 뒤 돌아오면 이탈 — 잠금화면에서 다른 앱을 쓴 경우', () => {
    expect(isRealAwayAfterScreenOn(SCREEN_ON_GRACE_MS)).toBe(true);
    expect(isRealAwayAfterScreenOn(600000)).toBe(true);
  });
});
