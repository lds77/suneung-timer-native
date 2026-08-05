import { shouldNudgeBackup, backupRowSub, BACKUP_MIN_SESSIONS, BACKUP_NUDGE_INTERVAL_MS } from '../backupNudge';

const NOW = 1800000000000;
const DAY = 86400000;

describe('shouldNudgeBackup — 백업 넛지 판정', () => {
  test('세션이 기준 미만이면 안 띄움', () => {
    expect(shouldNudgeBackup(BACKUP_MIN_SESSIONS - 1, {}, NOW)).toBe(false);
  });

  test('기록 충분 + 백업/넛지 이력 없음 → 띄움', () => {
    expect(shouldNudgeBackup(BACKUP_MIN_SESSIONS, {}, NOW)).toBe(true);
  });

  test('최근 30일 내 백업했으면 안 띄움, 30일 지나면 띄움', () => {
    expect(shouldNudgeBackup(50, { lastBackupAt: NOW - 29 * DAY }, NOW)).toBe(false);
    expect(shouldNudgeBackup(50, { lastBackupAt: NOW - 31 * DAY }, NOW)).toBe(true);
  });

  test('최근 30일 내 넛지 봤으면 다시 안 띄움 (매일 안 귀찮게)', () => {
    expect(shouldNudgeBackup(50, { lastBackupNudgeAt: NOW - 1 * DAY }, NOW)).toBe(false);
    expect(shouldNudgeBackup(50, { lastBackupNudgeAt: NOW - 31 * DAY }, NOW)).toBe(true);
  });
});

describe('backupRowSub — 설정 행 보조 문구', () => {
  test('백업 이력 없음', () => {
    expect(backupRowSub({}, NOW)).toContain('아직 백업하지 않았어요');
  });
  test('최근 백업은 날짜만, 30일 경과 시 경고 덧붙임', () => {
    const recent = backupRowSub({ lastBackupAt: NOW - DAY }, NOW);
    expect(recent).toMatch(/^마지막 백업 \d+\/\d+$/);
    const overdue = backupRowSub({ lastBackupAt: NOW - 31 * DAY }, NOW);
    expect(overdue).toContain('30일이 지났어요');
  });
});
