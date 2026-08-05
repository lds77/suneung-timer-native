// 백업 넛지 판정 (순수 로직, 테스트 대상)
// 기록이 충분히 쌓인 사용자에게만, 마지막 백업(또는 마지막 넛지)에서 30일 지났을 때 한 번씩 안내.
export const BACKUP_MIN_SESSIONS = 20;
export const BACKUP_NUDGE_INTERVAL_MS = 30 * 86400000;

export const shouldNudgeBackup = (sessionCount, settings = {}, now = Date.now()) => {
  if (sessionCount < BACKUP_MIN_SESSIONS) return false;
  if (settings.lastBackupAt && now - settings.lastBackupAt < BACKUP_NUDGE_INTERVAL_MS) return false;
  if (settings.lastBackupNudgeAt && now - settings.lastBackupNudgeAt < BACKUP_NUDGE_INTERVAL_MS) return false;
  return true;
};

// 설정 탭 백업 행의 보조 문구 (마지막 백업 날짜 노출 — 없으면 위험 안내)
export const backupRowSub = (settings = {}, now = Date.now()) => {
  if (!settings.lastBackupAt) return 'JSON 파일로 내보내기 · 아직 백업하지 않았어요';
  const d = new Date(settings.lastBackupAt);
  const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
  const overdue = now - settings.lastBackupAt >= BACKUP_NUDGE_INTERVAL_MS;
  return overdue ? `마지막 백업 ${dateStr} · 30일이 지났어요` : `마지막 백업 ${dateStr}`;
};
