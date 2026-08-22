// 안드 상시 타이머 알림 — JS와 Kotlin에 나뉘어 있는 값의 교차 검증.
// 채널 id가 어긋나면 설정탭 진단이 채널을 못 찾아 원인을 못 짚는다(조용히 깨지는 유형).
// ※ongoingNotif.js는 react-native에 의존하므로 import하지 않고 소스를 읽어 대조한다.
import fs from 'fs';
import path from 'path';

// 선언 뒤 첫 따옴표 쌍 안의 값을 꺼낸다 (정규식 없이 — 두 언어의 따옴표만 다르다)
const grab = (src, key, quote) => {
  const i = src.indexOf(key);
  if (i < 0) return null;
  const a = src.indexOf(quote, i);
  if (a < 0) return null;
  const b = src.indexOf(quote, a + 1);
  if (b < 0) return null;
  return src.slice(a + 1, b);
};

describe('ONGOING_CHANNEL_ID ↔ Kotlin CHANNEL_ID 교차 검증', () => {
  it('두 파일의 채널 id가 같다', () => {
    const jsSrc = fs.readFileSync(path.join(__dirname, '../ongoingNotif.js'), 'utf8');
    const jsId = grab(jsSrc, 'ONGOING_CHANNEL_ID =', String.fromCharCode(39));

    const ktPath = path.join(
      __dirname, '../../../modules/timer-notif/android/src/main/java/expo/modules/timernotif/TimerNotifModule.kt');
    const ktSrc = fs.readFileSync(ktPath, 'utf8');
    const ktId = grab(ktSrc, 'val CHANNEL_ID =', String.fromCharCode(34));

    expect(jsId).toBe('timer-ongoing');
    expect(ktId).toBe(jsId);
  });
});
