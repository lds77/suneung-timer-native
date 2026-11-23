// JS lifecycle contract only: ActivityKit rendering/launch animation needs an iPhone.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { currentState: 'active' },
}));
jest.mock('../../../modules/live-activity', () => ({
  __esModule: true,
  default: {
    listIds: jest.fn(() => ['live-1']),
    start: jest.fn(() => 'live-1'),
    update: jest.fn(() => Promise.resolve()),
    end: jest.fn(() => Promise.resolve()),
  },
}));

let activity, native, appState;
const timer = (overrides = {}) => ({
  id: 'timer-1', type: 'countdown', status: 'running', label: 'Study',
  resumedAt: 1800000000000, elapsedSecAtResume: 0, elapsedSec: 0,
  totalSec: 1500, ...overrides,
});
const transition = (state, value) => {
  appState.currentState = state;
  activity.syncLiveActivity(value);
};
beforeEach(() => {
  jest.resetModules();
  appState = require('react-native').AppState;
  native = require('../../../modules/live-activity').default;
  activity = require('../liveActivity');
});

test.each(['countdown', 'free', 'pomodoro'])(
  '%s: unchanged content is not sent again on lock/unlock', (type) => {
    const value = timer({ type, pomoPhase: 'work', pomoSet: 0, pomoWorkMin: 25 });
    transition('active', value);
    transition('background', value);
    transition('inactive', value);
    transition('active', { ...value, elapsedSec: 30 });
    expect(native.start).toHaveBeenCalledTimes(1);
    expect(native.update).not.toHaveBeenCalled();
  },
);

test('sequence still switches to total remaining time and back on resume', () => {
  const value = timer({ type: 'sequence', seqPhase: 'work', seqIndex: 0,
    seqTotal: 2, seqBreakSec: 300, seqItems: [{ totalSec: 1500 }, { totalSec: 600 }] });
  transition('active', value);
  transition('background', value);
  transition('active', value);
  expect(native.update).toHaveBeenCalledTimes(2);
  expect(native.update.mock.calls[0][1].endMs).toBe(value.resumedAt + 2400000);
  expect(native.update.mock.calls[1][1].endMs).toBe(value.resumedAt + 1500000);
});

test('pause and resume still update the activity', () => {
  const value = timer();
  transition('active', value);
  transition('active', { ...value, status: 'paused', elapsedSec: 20 });
  transition('active', { ...value, resumedAt: value.resumedAt + 30000, elapsedSecAtResume: 20 });
  expect(native.update).toHaveBeenCalledTimes(2);
  expect(native.update.mock.calls[0][1].mode).toBe('none');
  expect(native.update.mock.calls[1][1].mode).toBe('down');
});

test('a dismissed activity is recreated on resume even with identical content', () => {
  const value = timer();
  transition('active', value);
  transition('background', value);
  native.listIds.mockReturnValue([]);
  transition('active', value);
  expect(native.start).toHaveBeenCalledTimes(2);
});

test('away and return messages still update', () => {
  const value = timer();
  transition('active', value);
  activity.setLiveActivityAway(true);
  transition('background', value);
  activity.setLiveActivityAway(false);
  transition('active', value);
  expect(native.update).toHaveBeenCalledTimes(2);
  expect(native.update.mock.calls[0][1].subtitle).not.toBe(native.update.mock.calls[1][1].subtitle);
});

test('ending clears cached content so a new activity can start', () => {
  const value = timer();
  transition('active', value);
  activity.endLiveActivity();
  transition('active', value);
  expect(native.end).toHaveBeenCalledTimes(1);
  expect(native.start).toHaveBeenCalledTimes(2);
});
