// 스토어 리뷰 요청 정책 + 실행 (순수 판정 로직은 shouldAskReview — 테스트 대상)
// 정책: 누적 완료 세션 20회부터(2주차 정착 사용자 — 수락률 고려), 조건 만족 시 모두에게 동일하게 요청 (보상 없음).
// '나중에'는 30일 뒤 재요청, 3회 미루면 더 묻지 않음. 남기기 선택 시 종료.
import { Platform, Linking, Alert } from 'react-native';

export const REVIEW_MIN_SESSIONS = 20;
export const REVIEW_LATER_COOLDOWN_MS = 30 * 86400000;
export const REVIEW_MAX_LATER = 3;

const IOS_REVIEW_URL = 'https://apps.apple.com/app/id6759892516?action=write-review';
const AOS_REVIEW_URL = 'market://details?id=com.yeolgong.timer&showAllReviews=true';
const AOS_WEB_URL = 'https://play.google.com/store/apps/details?id=com.yeolgong.timer';

export const shouldAskReview = (sessionCount, settings = {}, now = Date.now()) => {
  if (sessionCount < REVIEW_MIN_SESSIONS) return false;
  if (settings.reviewAskDone) return false;
  if ((settings.reviewAskLaterCount || 0) >= REVIEW_MAX_LATER) return false;
  if (settings.reviewAskLaterAt && now - settings.reviewAskLaterAt < REVIEW_LATER_COOLDOWN_MS) return false;
  return true;
};

// 스토어 리뷰 페이지 직접 열기 — 인앱 리뷰 API(Play In-App Review)는 패널을 못 띄워도
// 성공으로 조용히 끝나는 구조라(사이드로드/쿼터 등) 신뢰할 수 없어 URL 방식으로 통일
const openStoreReview = async () => {
  const url = Platform.OS === 'ios' ? IOS_REVIEW_URL : AOS_REVIEW_URL;
  try {
    await Linking.openURL(url);
  } catch {
    if (Platform.OS === 'android') { try { await Linking.openURL(AOS_WEB_URL); } catch {} }
  }
};

// 결과 모달이 닫힌 뒤 호출 — 조건 판정 + 프롬프트 + 설정 기록까지 담당
export const maybeAskReview = (sessionCount, settings, updateSettings) => {
  if (!shouldAskReview(sessionCount, settings)) return;
  Alert.alert(
    '열공메이트가 도움이 되고 있나요?',
    '별점과 한 줄 리뷰가 다음 업데이트를 만드는 큰 힘이 돼요. 잠깐 시간 내주실 수 있나요?',
    [
      {
        text: '나중에', style: 'cancel',
        onPress: () => updateSettings({
          reviewAskLaterAt: Date.now(),
          reviewAskLaterCount: (settings.reviewAskLaterCount || 0) + 1,
        }),
      },
      {
        text: '리뷰 남기기',
        onPress: () => { updateSettings({ reviewAskDone: true }); openStoreReview(); },
      },
    ],
  );
};
