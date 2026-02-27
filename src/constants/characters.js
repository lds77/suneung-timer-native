// src/constants/characters.js
export const CHARACTERS = {
  toru: { id: 'toru', name: '토루', emoji: '🐻', desc: '따뜻하고 다정한 분홍 곰', bgColor: '#FDDCCC', image: require('../../assets/characters/toru.png') },
  paengi: { id: 'paengi', name: '팽이', emoji: '🐧', desc: '진지하고 걱정 많은 펭귄', bgColor: '#D6EDFF', image: require('../../assets/characters/paengi.png') },
  taco: { id: 'taco', name: '타코', emoji: '🐰', desc: '활발하고 긍정적인 토끼', bgColor: '#E2F5D3', image: require('../../assets/characters/taco.png') },
  totoru: { id: 'totoru', name: '토토루', emoji: '🐻', desc: '묵직하고 듬직한 회색 곰', bgColor: '#E4D8F0', image: require('../../assets/characters/totoru.png') },
};
export const CHARACTER_LIST = ['toru', 'paengi', 'taco', 'totoru'];
export const MESSAGES = {
  start: [{ char: 'toru', text: '오늘도 화이팅! 💕' },{ char: 'paengi', text: '시작이 반이야~ 화이팅!' },{ char: 'taco', text: '집중 모드 ON! 🔥' },{ char: 'totoru', text: '차분하게 시작해보자~' }],
  pause: [{ char: 'toru', text: '잠시 쉬는 것도 전략이야! 물 한 잔 💕' },{ char: 'paengi', text: '안 쉬면 혼낸다고 했지? 스트레칭 해~' },{ char: 'taco', text: '물 한 잔 마시고 와~ 💧' },{ char: 'totoru', text: '잠깐 눈 감고 쉬었다 가자' }],
  done: [{ char: 'toru', text: '완벽한 집중이었어! 💕' },{ char: 'paengi', text: '목표 달성! 대단해! 🎉' },{ char: 'taco', text: '역시 넌 할 수 있어! 🌟' },{ char: 'totoru', text: '묵묵히 해냈구나, 멋지다' }],
  pomoWork: [{ char: 'taco', text: '뽀모도로 완료! 쉬는 시간~ ☕' },{ char: 'paengi', text: '한 세트 끝! 잘했어!' },{ char: 'toru', text: '5분만 쉬자 💕' }],
  pomoBreak: [{ char: 'toru', text: '다시 집중! 할 수 있어 💪' },{ char: 'taco', text: '휴식 끝! 가보자고! 🔥' },{ char: 'totoru', text: '차분하게, 다시 시작' }],
  fiveMin: [{ char: 'toru', text: '5분 해냈어! 계속할래? 💕' },{ char: 'taco', text: '5분 성공! 이 기세로~! 🔥' },{ char: 'paengi', text: '벌써 5분이야! 대단해!' }],
  ultraStart: [{ char: 'toru', text: '🔥 집중 도전 시작! 같이 하자 💕' },{ char: 'paengi', text: '집중 도전! 이탈 0회 가보자!' },{ char: 'taco', text: '🔥모드 ON! 집중 도전이다! ⚡' },{ char: 'totoru', text: '조용히 집중하자. 할 수 있어.' }],
  ultraReturn: [{ char: 'toru', text: '돌아왔구나! 다시 집중하자 💕' },{ char: 'taco', text: '돌아왔어! 다시 집중! ⚡' },{ char: 'paengi', text: '빨리 돌아왔구나! 잘했어!' },{ char: 'totoru', text: '좋아, 다시 집중이다.' }],
  ultraExit: [{ char: 'toru', text: '어디 가는 거야... 같이 하기로 했잖아 😢' },{ char: 'paengi', text: '🔥모드인데! 다시 돌아와!' },{ char: 'taco', text: '잠깐! 공부 중이었잖아! 📱' },{ char: 'totoru', text: '...돌아올 거지?' }],
  ultraChallenge: [{ char: 'toru', text: '토루가 울고 있어... 😢💧' },{ char: 'paengi', text: '팽이가 실망했어... 😞' },{ char: 'taco', text: '타코가 기다리고 있었어... 🥺' },{ char: 'totoru', text: '토토루가 속상해...' }],
  ultraGiveUp: [{ char: 'toru', text: '다음엔 같이 하자... 토루가 기다릴게 😴💕' },{ char: 'paengi', text: '오늘은 여기까지... 내일 다시!' },{ char: 'taco', text: '괜찮아! 내일은 더 잘할 수 있어 💪' },{ char: 'totoru', text: '쉬는 것도 용기야. 내일 보자.' }],
  ultraPerfect: [{ char: 'toru', text: '이탈 0회!! Verified!! 토루가 춤춰~ 🎉💕' },{ char: 'taco', text: '완벽한 집중!! Verified!! 🏆⚡' },{ char: 'paengi', text: '한 번도 안 빠졌어?! 레전드야!!' },{ char: 'totoru', text: '...대단하다. 진심으로.' }],
  screenOff: [{ char: 'toru', text: '📖 편하게 공부 시작! 화면 꺼도 괜찮아 💕' },{ char: 'taco', text: '📖 조용히 집중! 화면 끄고 열공!' }],
  tierSPlus: [{ char: 'toru', text: '전설이야!! 토루가 감동 받았어!! 🎉👑' },{ char: 'taco', text: 'S+ 달성!! 네가 전교 1등이야!! 🏆' }],
  tierF: [{ char: 'toru', text: '다음엔 진짜 열심히 해보자… 토루가 안아줄게 💪' },{ char: 'totoru', text: '괜찮아, 오늘 앉은 것만으로도 대단해' }],
};
export const getRandomMessage = (type) => {
  const msgs = MESSAGES[type];
  if (!msgs || msgs.length === 0) return { char: 'toru', text: '화이팅! 💕' };
  return msgs[Math.floor(Math.random() * msgs.length)];
};
