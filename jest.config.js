// 순수 로직(utils, stats helpers) 단위 테스트 전용 설정
// RN 컴포넌트/네이티브 모듈 테스트는 불가 — EAS 빌드 + 실기기로 검증
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.js'],
};
