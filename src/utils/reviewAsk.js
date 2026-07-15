// 스토어 리뷰 요청 정책 + 실행 (순수 판정 로직은 shouldAskReview — 테스트 대상)
// 정책: 누적 완료 세션 5회부터, 조건 만족 사용자 모두에게 동일하게 1회 요청 (보상 없음).
// '나중에'는 30일 뒤 재요청, 3회 미루면 더 묻지 않음. 남기기 선택 시 종료.
import { Platform, Linking, Alert } from 'react-native';

export const REVIEW_MIN_SESSIONS = 5;
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

// 네이티브 인앱 리뷰 모듈은 1.0.34 바이너리에 없음 — require/호출 실패 시 스토어 리뷰 페이지로 폴백
const openStoreReview = async () => {
  try {
    const StoreReview = require('expo-store-review');
    if (await StoreReview.isAvailableAsync()) {
      await StoreReview.requestReview();
      return;
    }
  } catch {}
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
