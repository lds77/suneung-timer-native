// runningAnchorMs — iOS 오늘공부 위젯 실시간 카운팅 앵커 계산 테스트
// 앵커 = resumedAt - 이미쌓인초*1000 - 완료세션합*1000
// → 위젯의 (지금 - 앵커) = 완료 세션 + 현재 타이머 경과 = 오늘 누적 실시간

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const { runningAnchorMs } = require('../updateStudyWidget');

describe('runningAnchorMs', () => {
  const NOW = 1_800_000_000_000;

  test('실행 중 타이머: 완료세션합 + 현재 경과가 실시간으로 표시되도록 앵커 계산', () => {
    // 10분 전 재개, 재개 시점까지 5분 쌓임, 완료 세션 1시간
    const t = { status: 'running', type: 'free', resumedAt: NOW - 600_000, elapsedSecAtResume: 300 };
    const anchor = runningAnchorMs(t, 3600);
    // (NOW - anchor) / 1000 = 600 + 300 + 3600
    expect((NOW - anchor) / 1000).toBe(4500);
  });

  test('일시정지/랩/타이머 없음이면 null (정적 표시)', () => {
    expect(runningAnchorMs(null, 100)).toBeNull();
    expect(runningAnchorMs({ status: 'paused', type: 'free', resumedAt: NOW }, 100)).toBeNull();
    expect(runningAnchorMs({ status: 'running', type: 'lap', resumedAt: NOW }, 100)).toBeNull();
  });

  test('뽀모도로/연속모드 쉬는시간은 카운팅하지 않는다', () => {
    expect(runningAnchorMs({ status: 'running', type: 'pomodoro', pomoPhase: 'break', resumedAt: NOW }, 0)).toBeNull();
    expect(runningAnchorMs({ status: 'running', type: 'sequence', seqPhase: 'break', resumedAt: NOW }, 0)).toBeNull();
    // work 페이즈는 카운팅
    expect(runningAnchorMs({ status: 'running', type: 'pomodoro', pomoPhase: 'work', resumedAt: NOW, elapsedSecAtResume: 0 }, 0)).toBe(NOW);
    expect(runningAnchorMs({ status: 'running', type: 'sequence', seqPhase: 'work', resumedAt: NOW, elapsedSecAtResume: 0 }, 0)).toBe(NOW);
  });
});
