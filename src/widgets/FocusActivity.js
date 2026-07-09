// src/widgets/FocusActivity.js
// iOS 잠금화면/Dynamic Island Live Activity 레이아웃 (expo-widgets, SDK 56~)
//
// ※ 'widget' 지시어 함수는 빌드 타임에 소스 문자열로 직렬화되어 위젯 익스텐션에서
//   해석 실행된다 — 함수 밖(모듈 스코프)의 헬퍼/상수를 참조하면 안 된다.
//   표시 문자열(제목/부제)은 앱 쪽(src/utils/liveActivity.js)에서 만들어 props로 전달한다.
//
// props (JSON 직렬화 가능해야 함):
//   title, subtitle: string
//   mode: 'down'(카운트다운) | 'up'(카운트업) | 'none'(일시정지/종료 — 타이머 숨김)
//   startMs, endMs: number — 타이머 구간(ms). 'up'은 startMs만 사용
//   tint, textColor, subColor, bg: string — 테마 색상(hex)
//     ※배너는 bg를 명시해야 함 — 미지정 시 시스템 기본 배경(잠금화면 검정) 위에
//       어두운 테마 글자가 깔려 빈 카드처럼 보인다 (빌드46 실기기에서 확인)
//     ※Dynamic Island는 항상 검정 배경 — 테마색 대신 고정 밝은 색 사용
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { background, font, foregroundStyle, frame, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

const FocusActivity = (props, environment) => {
  'widget';
  // 카운트업은 상한이 필요 — Live Activity 수명(최대 12시간)만큼 잡는다
  const upperMs = props.mode === 'up' ? props.startMs + 12 * 3600 * 1000 : props.endMs;
  const timerText = (size, color) =>
    props.mode === 'down' || props.mode === 'up' ? (
      <Text
        timerInterval={{ lower: new Date(props.startMs), upper: new Date(upperMs) }}
        countsDown={props.mode === 'down'}
        modifiers={[font({ size, weight: 'bold' }), monospacedDigit(), foregroundStyle(color)]}
      />
    ) : null;

  return {
    // 잠금화면/알림 배너 — HStack 안의 Spacer가 전체 폭으로 늘려 background가 카드 전면을 덮음
    banner: (
      <VStack modifiers={[padding({ top: 14, bottom: 14, leading: 20, trailing: 20 }), background(props.bg)]}>
        <HStack spacing={8}>
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(props.textColor)]}>
              {props.title}
            </Text>
            <Text modifiers={[font({ size: 13 }), foregroundStyle(props.subColor)]}>
              {props.subtitle}
            </Text>
          </VStack>
          <Spacer />
          {timerText(30, props.tint)}
        </HStack>
      </VStack>
    ),
    // Dynamic Island — 축소 (DI는 항상 검정 배경 — 타이머는 흰색 고정)
    compactLeading: <Image systemName="timer" modifiers={[foregroundStyle(props.tint)]} />,
    compactTrailing:
      props.mode === 'none' ? (
        <Image systemName="pause.fill" modifiers={[foregroundStyle(props.tint)]} />
      ) : (
        <Text
          timerInterval={{ lower: new Date(props.startMs), upper: new Date(upperMs) }}
          countsDown={props.mode === 'down'}
          modifiers={[font({ size: 14, weight: 'semibold' }), monospacedDigit(), foregroundStyle('#FFFFFF'), frame({ width: 56 })]}
        />
      ),
    minimal: <Image systemName="timer" modifiers={[foregroundStyle(props.tint)]} />,
    // Dynamic Island — 확장 (검정 배경 — 고정 밝은 색)
    expandedCenter: (
      <VStack alignment="center" spacing={2}>
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle('#FFFFFF')]}>
          {props.title}
        </Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle('#B0B0B8')]}>
          {props.subtitle}
        </Text>
      </VStack>
    ),
    expandedBottom: (
      <HStack>
        <Spacer />
        {props.mode === 'none' ? (
          <Image systemName="pause.fill" modifiers={[foregroundStyle(props.tint)]} />
        ) : (
          timerText(28, '#FFFFFF')
        )}
        <Spacer />
      </HStack>
    ),
  };
};

export default createLiveActivity('FocusActivity', FocusActivity);
