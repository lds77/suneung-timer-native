// stats/helpers.js 단위 테스트 — 날짜 경계, 과목 매칭, 표시 헬퍼
import {
  dateStr, addDays, darkenColor, stripLeadingEmoji,
  getSessionSubject, fmtDiff, getStreakTitle, BUILTIN_SUBJECTS,
} from '../helpers';
import { getTier } from '../../../constants/presets';

describe('dateStr / addDays — 로컬 날짜 경계', () => {
  test('dateStr는 로컬 연-월-일', () => {
    expect(dateStr(new Date(2026, 5, 12))).toBe('2026-06-12');
    expect(dateStr(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
  test('addDays 월/연 경계 넘기기', () => {
    expect(dateStr(addDays(new Date(2026, 5, 30), 1))).toBe('2026-07-01');
    expect(dateStr(addDays(new Date(2026, 0, 1), -1))).toBe('2025-12-31');
    expect(dateStr(addDays(new Date(2024, 1, 28), 1))).toBe('2024-02-29'); // 윤년
  });
  test('addDays는 원본을 변경하지 않음', () => {
    const d = new Date(2026, 5, 12);
    addDays(d, 7);
    expect(dateStr(d)).toBe('2026-06-12');
  });
});

describe('darkenColor', () => {
  test('30% 어둡게', () => {
    expect(darkenColor('#FFFFFF', 0.3)).toBe('#b3b3b3');
    expect(darkenColor('#000000', 0.3)).toBe('#000000');
  });
});

describe('stripLeadingEmoji', () => {
  test('앞쪽 이모지/기호 제거, 한글 유지', () => {
    expect(stripLeadingEmoji('📘 국어')).toBe('국어');
    expect(stripLeadingEmoji('국어')).toBe('국어');
    expect(stripLeadingEmoji('🔥🔥 수학 심화')).toBe('수학 심화');
  });
  test('빈 값 방어', () => {
    expect(stripLeadingEmoji('')).toBe('');
    expect(stripLeadingEmoji(null)).toBe(null);
  });
});

describe('getSessionSubject — 세션→과목 매칭 우선순위', () => {
  const subjects = [
    { id: 's1', name: '국어', color: '#E8575A' },
    { id: 's2', name: '수학', color: '#4A90D9' },
    { id: 's3', name: '수학 심화', color: '#123456' },
  ];

  test('1순위: subjectId 직접 매칭', () => {
    expect(getSessionSubject({ subjectId: 's1', label: '수학' }, subjects).id).toBe('s1');
  });
  test('2순위: 라벨 정확 일치 (이모지 제거 후)', () => {
    expect(getSessionSubject({ subjectId: null, label: '📘 국어' }, subjects).id).toBe('s1');
  });
  test('3순위: 부분 일치는 긴 과목명 우선 (수학 심화 > 수학)', () => {
    expect(getSessionSubject({ subjectId: null, label: '수학 심화 문제풀이' }, subjects).id).toBe('s3');
  });
  test('4순위: 내장 과목 매칭', () => {
    const r = getSessionSubject({ subjectId: null, label: '한국사 인강' }, subjects);
    expect(r.id).toBe('builtin_한국사');
  });
  test('내장 과목도 긴 이름 우선 (지구과학이 과학보다 먼저)', () => {
    const r = getSessionSubject({ subjectId: null, label: '지구과학 기출' }, []);
    expect(r.name).toBe('지구과학');
  });
  test('5순위: 라벨 자체를 과목으로 (해시 색상 결정적)', () => {
    const a = getSessionSubject({ subjectId: null, label: '논술' }, subjects);
    const b = getSessionSubject({ subjectId: null, label: '논술' }, subjects);
    expect(a.id).toBe('lbl_논술');
    expect(a.color).toBe(b.color);
  });
  test('라벨 없으면 미지정', () => {
    expect(getSessionSubject({ subjectId: null, label: '' }, subjects).name).toBe('미지정');
  });
});

describe('fmtDiff', () => {
  const fmt = (n) => `${n}분`;
  test('증가/감소/동일', () => {
    expect(fmtDiff(10, fmt)).toEqual({ text: '↑ +10분', up: true });
    expect(fmtDiff(-10, fmt)).toEqual({ text: '↓ -10분', up: false });
    expect(fmtDiff(0, fmt)).toEqual({ text: '= 동일', up: null });
  });
});

describe('getStreakTitle', () => {
  test('경계값', () => {
    expect(getStreakTitle(0)).toBe(null);
    expect(getStreakTitle(1)).toBe('씨앗 심는 중');
    expect(getStreakTitle(3)).toBe('작심삼일 돌파!');
    expect(getStreakTitle(7)).toBe('일주일의 기적');
    expect(getStreakTitle(365)).toBe('전설');
  });
});

describe('getTier — 티어 경계 (presets)', () => {
  test('등급 경계값', () => {
    expect(getTier(103).id).toBe('SS');
    expect(getTier(100).id).toBe('SS');
    expect(getTier(99).id).toBe('S+');
    expect(getTier(93).id).toBe('S+');
    expect(getTier(92).id).toBe('S');
    expect(getTier(86).id).toBe('S');
    expect(getTier(85).id).toBe('A');
    expect(getTier(76).id).toBe('A');
    expect(getTier(75).id).toBe('B');
    expect(getTier(66).id).toBe('B');
    expect(getTier(65).id).toBe('C');
    expect(getTier(56).id).toBe('C');
    expect(getTier(0).id).toBe('C'); // 최저 폴백
  });
});
