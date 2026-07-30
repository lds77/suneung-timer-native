// 화면 끄기 이탈 판정 순수 로직 테스트
import fs from 'fs';
import path from 'path';
import {
  isScreenOffState, screenOffAwayMs, isRealAwayAfterScreenOn, offHappenedAround,
  wasIdleBeforeBackground, emptyAwayWatch, awayWatchStep, awayWatchAwayMs,
  SCREEN_OFF_RACE_MS, SCREEN_ON_GRACE_MS, SCREEN_OFF_LATE_MS, AWAY_NOTIF_IDS, IDLE_TOUCH_GAP_MS,
  ANDROID_AWAY_NOTIF_DELAY_SEC,
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
    expect(isRealAwayAfterScreenOn(SCREEN_ON_GRACE_MS - 1)).toBe(false);
  });
  it('화면 켜고 한참 뒤 돌아오면 이탈 — 잠금화면에서 다른 앱을 쓴 경우', () => {
    expect(isRealAwayAfterScreenOn(SCREEN_ON_GRACE_MS)).toBe(true);
    expect(isRealAwayAfterScreenOn(600000)).toBe(true);
  });
});

// ─── 안드 배경 폴링 (2026-07-30 제보 대응) ───────────────────────────────
// 화면을 끄고 배경에 있는 동안 화면/잠금 상태를 직접 관측해 '이탈 시작 시각'을 잡는다.
// 복귀 시점의 브로드캐스트 타임스탬프 역산이 놓치던 경로(잠금이 안 걸린 채 다른 앱으로 이동)를
// 여기서 잡는다 — 관측이므로 USER_PRESENT가 없어도 정확하다.
describe('awayWatchStep / awayWatchAwayMs', () => {
  const T = 5_000_000;
  const off = { interactive: false, keyguardLocked: true };
  const locked = { interactive: true, keyguardLocked: true };   // 화면은 켰지만 잠금화면
  const open = { interactive: true, keyguardLocked: false };    // 잠금까지 풀린 상태

  const run = (steps) => steps.reduce((s, [st, t]) => awayWatchStep(s, st, t), emptyAwayWatch());

  it('폴링이 한 번도 못 돌았으면 null — 호출부가 기존 역산으로 폴백', () => {
    expect(awayWatchAwayMs(emptyAwayWatch(), T)).toBeNull();
    expect(awayWatchAwayMs(null, T)).toBeNull();
  });

  it('화면 꺼진 채로만 있었으면 이탈 0', () => {
    const s = run([[off, T], [off, T + 2000], [off, T + 4000]]);
    expect(s.confirmed).toBe(false);
    expect(awayWatchAwayMs(s, T + 6000)).toBe(0);
  });

  it('잠금화면에 오래 머물러도 이탈 0 — 다른 앱을 쓸 수 없는 구간', () => {
    const s = run([[off, T], [locked, T + 2000], [locked, T + 20000], [locked, T + 33700]]);
    expect(s.confirmed).toBe(false);
    expect(awayWatchAwayMs(s, T + 34000)).toBe(0);
  });

  it('잠금이 풀린 시각부터 이탈 — 10초 넘게 안 돌아오면 확정', () => {
    const s = run([[off, T], [locked, T + 2000], [open, T + 10000], [open, T + 12000]]);
    expect(s.unlockedAt).toBe(T + 10000);
    expect(s.confirmed).toBe(false);                       // 아직 2초
    const s2 = awayWatchStep(s, open, T + 20000);
    expect(s2.confirmed).toBe(true);                       // 10초 경과 → 확정
    expect(awayWatchAwayMs(s2, T + 20000)).toBe(10000);
  });

  it('잠금해제 직후 곧바로 앱으로 복귀하면 이탈 아님', () => {
    const s = run([[off, T], [open, T + 8000]]);
    expect(awayWatchAwayMs(s, T + 9000)).toBe(1000);
    expect(isRealAwayAfterScreenOn(awayWatchAwayMs(s, T + 9000))).toBe(false);
  });

  it('★잠금이 아예 안 걸린 채 다른 앱으로 가도 잡힌다 (제보 사례)', () => {
    // 화면을 짧게 꺼서 키가드가 안 걸림 → USER_PRESENT가 없어 역산은 이탈을 통째로 놓쳤다
    const s = run([[off, T], [open, T + 4000], [open, T + 60000]]);
    expect(s.confirmed).toBe(true);
    expect(awayWatchAwayMs(s, T + 180000)).toBe(176000);
  });

  it('확정 전에 화면을 다시 끄면 기준점을 버린다 — 알림만 확인하고 껐다 켠 경우', () => {
    const s = run([[off, T], [open, T + 2000], [off, T + 6000], [off, T + 8000]]);
    expect(s.unlockedAt).toBe(0);
    expect(awayWatchAwayMs(s, T + 9000)).toBe(0);
  });

  it('확정된 뒤에는 화면을 꺼도 이탈이 유지된다', () => {
    const s = run([[off, T], [open, T + 2000], [open, T + 14000], [off, T + 16000]]);
    expect(s.confirmed).toBe(true);
    expect(s.unlockedAt).toBe(T + 2000);
  });

  it('조회 실패(null)는 상태를 건드리지 않고 관측 횟수에도 안 들어간다', () => {
    const s = run([[off, T], [open, T + 2000], [null, T + 4000]]);
    expect(s.unlockedAt).toBe(T + 2000);
    expect(s.ticks).toBe(2);
  });

  it('구빌드처럼 매번 조회 실패면 null — 역산 경로로 폴백해야 오판이 없다', () => {
    const s = run([[null, T], [null, T + 2000], [null, T + 4000]]);
    expect(awayWatchAwayMs(s, T + 6000)).toBeNull();
  });
});

describe('ANDROID_AWAY_NOTIF_DELAY_SEC', () => {
  it('이탈 판정 기준(10초)보다 뒤에 있어야 알림과 판정이 어긋나지 않는다', () => {
    expect(ANDROID_AWAY_NOTIF_DELAY_SEC * 1000).toBeGreaterThan(SCREEN_ON_GRACE_MS);
  });
});
