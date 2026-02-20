// src/constants/characters.js
// 캐릭터 데이터 + 메시지

export const CHARACTERS = {
  toru: {
    id: 'toru',
    name: '토루',
    emoji: '🐻',
    desc: '따뜻하고 다정한 분홍 곰',
    bgColor: '#FFE0E8',
    image: require('../../assets/characters/toru.png'),
  },
  paengi: {
    id: 'paengi',
    name: '팽이',
    emoji: '🐧',
    desc: '진지하고 걱정 많은 펭귄',
    bgColor: '#DBE8F5',
    image: require('../../assets/characters/paengi.png'),
  },
  taco: {
    id: 'taco',
    name: '타코',
    emoji: '🐰',
    desc: '활발하고 긍정적인 토끼',
    bgColor: '#E0F5E0',
    image: require('../../assets/characters/taco.png'),
  },
  totoru: {
    id: 'totoru',
    name: '토토루',
    emoji: '🐻‍❄️',
    desc: '묵직하고 듬직한 회색 곰',
    bgColor: '#E8E0F0',
    image: require('../../assets/characters/totoru.png'),
  },
};

export const CHARACTER_LIST = ['toru', 'paengi', 'taco', 'totoru'];

// 상황별 메시지
export const MESSAGES = {
  start: [
    { char: 'toru', text: '오늘도 화이팅! 💕' },
    { char: 'paengi', text: '시작이 반이야~ 화이팅!' },
    { char: 'taco', text: '집중 모드 ON! 🔥' },
    { char: 'totoru', text: '차분하게 시작해보자~' },
  ],
  pause: [
    { char: 'toru', text: '잠시 쉬는 것도 전략이야! 물 한 잔 💕' },
    { char: 'paengi', text: '안 쉬면 혼낸다고 했지? 스트레칭 해~' },
    { char: 'taco', text: '물 한 잔 마시고 와~ 💧' },
    { char: 'totoru', text: '잠깐 눈 감고 쉬었다 가자' },
  ],
  done: [
    { char: 'toru', text: '완벽한 집중이었어! 💕' },
    { char: 'paengi', text: '목표 달성! 대단해! 🎉' },
    { char: 'taco', text: '역시 넌 할 수 있어! 🌟' },
    { char: 'totoru', text: '묵묵히 해냈구나, 멋지다' },
  ],
  pomoWork: [
    { char: 'taco', text: '뽀모도로 완료! 쉬는 시간~ ☕' },
    { char: 'paengi', text: '한 세트 끝! 잘했어!' },
    { char: 'toru', text: '5분만 쉬자 💕' },
  ],
  pomoBreak: [
    { char: 'toru', text: '다시 집중! 할 수 있어 💪' },
    { char: 'taco', text: '휴식 끝! 가보자고! 🔥' },
    { char: 'totoru', text: '차분하게, 다시 시작' },
  ],
  fiveMin: [
    { char: 'toru', text: '5분 해냈어! 계속할래? 💕' },
    { char: 'taco', text: '5분 성공! 이 기세로~! 🔥' },
    { char: 'paengi', text: '벌써 5분이야! 대단해!' },
  ],
  ultraStart: [
    { char: 'toru', text: '폰 내려놓자! 토루가 기다릴게 💕' },
    { char: 'paengi', text: '울트라 포커스! 폰 뒤집어!' },
  ],
  ultraReturn: [
    { char: 'toru', text: '빠르게 돌아왔네! 대단해 💕' },
    { char: 'taco', text: '빠른 복귀! 보너스 획득! 🌟' },
  ],
  ultraExit: [
    { char: 'paengi', text: '어? 뒤집어 놓았는데 만지작거리는 거야? 😅' },
    { char: 'toru', text: '토루가 기다리고 있어~ 다시 뒤집어줘 💕' },
  ],
  tierSPlus: [
    { char: 'toru', text: '전설이야!! 토루가 감동 받았어!! 🎉👑' },
    { char: 'taco', text: 'S+ 달성!! 네가 전교 1등이야!! 🏆' },
  ],
  tierF: [
    { char: 'toru', text: '다음엔 진짜 열심히 해보자… 토루가 안아줄게 💪' },
    { char: 'totoru', text: '괜찮아, 오늘 앉은 것만으로도 대단해' },
  ],
};

export const getRandomMessage = (type) => {
  const msgs = MESSAGES[type];
  if (!msgs || msgs.length === 0) return { char: 'toru', text: '화이팅! 💕' };
  return msgs[Math.floor(Math.random() * msgs.length)];
};
