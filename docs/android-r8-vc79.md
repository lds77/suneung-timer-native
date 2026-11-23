# Android 1.0.44 (vc79) R8 실기기 점검표

2026-11-23 기준으로 설정과 소스를 점검했다. 아래 칸은 R8을 켠 열공메이트의 실제 결과를 기록할 자리다.

## 보존 규칙을 결정한 근거

| 경로 | SDK 56 설치본과 앱 소스에서 확인한 동작 |
|---|---|
| Expo의 headless 로더 | `expo-modules-core/android/src/main/AndroidManifest.xml`에 구현 클래스가 문자열로 들어간다. `AppLoaderProvider.createLoader`가 이 값으로 `Class.forName`과 인자 없는 생성자를 호출한다. `RNHeadlessAppLoader.kt`의 `@DoNotStrip`은 생성자에 붙고 core의 consumer 규칙은 이 경우 멤버만 보존한다. 이 클래스의 이름과 공개 기본 생성자만 앱 규칙으로 보존했다. |
| 위젯 5종 | `react-native-android-widget`에는 자체 consumer 규칙이 없다. `app.plugin.js`가 각 변형의 `<패키지>.widget.<이름>`을 receiver로 manifest에 등록하므로 AAPT가 이름과 생성자를 보존한다. `RNWidgetProvider`의 simple name, `RNWidgetUtil`의 이름 끝 비교, `AlarmReceiver`의 구형 OS 폴백, JS 핸들러의 키가 일치해야 한다. API 25 이하의 기존 폴백 목록에는 TodayTodo가 빠져 있으므로 그 기종의 종료 시각 갱신은 별도로 기록한다. |
| WorkManager | 위젯의 `RNWidgetBackgroundTaskWorker → HeadlessJsTaskWorker → ListenableWorker` 경로. 설치 캐시의 `work-runtime-2.8.1.aar!/proguard.txt`에 ListenableWorker 하위 클래스와 공개 생성자를 지키는 규칙이 있다. 앱이 꺼진 상태의 클릭·갱신이 검사 대상이다. |
| 화면 고정·상시 알림 | `modules/screen-pin`, `modules/timer-notif`는 Expo autolinking이 클래스 참조를 생성한다. `expo-modules-core/android/proguard-rules.pro`가 Module 생성자·definition과 Record 멤버를 보존한다. `TimerNotifModule.ShowOptions`의 @Field, manifest receiver인 `AlarmReceiver`, 직접 호출되는 `AwayWatch`에 추가 규칙은 없다. `notification_icon`은 이름으로 찾는 리소스라 리소스 축소를 끈다. |
| 알림·Firebase | `expo-notifications/android/proguard-rules.pro`가 알림 모델·트리거를 보존한다. 예약 알림은 직렬화되므로 업그레이드도 확인한다. 네이티브 FCM 경로의 registrar는 `firebase-components-19.0.0.aar!/proguard.txt`가 보존한다. 스터디룸 Auth·RTDB는 Firebase **JS SDK**와 Android AsyncStorage를 사용한다. 자체 Gson DTO·네이티브 RTDB 모델·인앱결제 연동은 발견되지 않았다. |
| 나머지 네이티브 경로 | ReactAndroid의 consumer 규칙이 NativeModule·JNI·ReactProp을, expo-updates와 react-native-svg가 각각 자체 규칙을 제공한다. AsyncStorage·gesture-handler의 이름 기반 ReactModuleInfoProvider 조회에는 직접 등록 폴백이 있다. view-shot·zip-archive에는 개별 consumer 규칙이 없어 실제 캡처·압축 왕복으로 확인한다. ImagePicker의 크롭 화면에는 private 멤버 반사가 있지만 현재 카메라·앨범 호출은 편집을 요청하지 않는다. SVG의 pointerEvents 반사도 라이브러리 전체를 추가 보존할 근거로 삼지 않았다. |

`focus-shield`와 `live-activity`는 Apple 전용이다. Android 집중 잠금은 screen-pin에서 확인한다.

## 미리보기 APK

EAS 빌드 ID __________ · 기기 / Android 버전 __________ · 검사일 __________

- [ ] **기동·화면** — 새 설치 후 온라인·오프라인 콜드 스타트. 탭 전환, 스크롤·뒤로 가기, 플래너, 가로 시계, 아이콘·폰트·그림·SVG 차트 표시와 터치를 확인한다.
- [ ] **타이머·상시 알림** — 카운트다운·자유·뽀모도로·랩·연속/계획을 실행한다. 접힌/펼친 알림·잠금화면에서 과목명·증감하는 시간·아이콘, 알림 탭 복귀, 일시정지·재개·종료 후 알림 제거와 기록 저장을 확인한다.
- [ ] **정확 알람·예약 알림** — 알림·채널·정확 알람 설정 바로가기를 열고 권한 거부 후 허용 경로도 확인한다. 화면을 끈 채 완료·페이즈 전환의 시각·소리·진동, 중도 취소 후 중복 알림 부재, 주·월 리포트 예약·수신을 확인한다.
- [ ] **집중·울트라** — 이탈 넛지와 복귀 시 취소, 화면 끔·잠금 및 수신 전화 중 이탈 제외, 화면 밝기 복원, 화면 고정 진입·해제, 고정 중 종료 진동·알림음을 확인한다. 백그라운드에서 돌아온 뒤 결과의 이탈 횟수도 본다.
- [ ] **홈 위젯** — 오늘 공부시간·D-Day·과목 바로 시작·오늘 계획·오늘 할 일 5개를 추가·리사이즈한다. 과목/계획 탭으로 올바른 타이머를 열고 할 일 체크·해제가 앱에도 반영되는지 본다. 앱을 최근 목록에서 닫은 뒤 클릭, 타이머 종료 알람, 30분 주기 WorkManager 갱신과 기기 재시작 뒤 표시도 확인한다.
- [ ] **스터디룸·라운지** — 두 기기에서 익명 로그인, 방 생성·초대 코드 복사/붙여넣기·참여, 공부 시작/종료의 실시간 상태·라운지 온기를 확인한다. 오프라인 후 재접속하고 앱을 다시 열어 같은 사용자·방·공부 기록이 유지되는지 본다.
- [ ] **사진·소리** — 오답노트 카메라 촬영·앨범 다중 선택·리사이즈·다시 열기, 마이크 녹음·재생·삭제와 권한 거부 후 재시도를 확인한다. 녹음 전후 백색소음을 바꾸고 잠금/복귀 뒤에도 재생을 확인한다.
- [ ] **파일·공유** — 테스트 데이터로 JSON과 첨부 포함 ZIP을 각각 내보내고 시스템 문서 선택기로 복원한다. 오답 첨부와 기록을 다시 열고 일·주·월·잔디 통계 PNG를 캡처해 공유 대상에서 열어 본다.

## 정식 AAB

- [ ] 검사 통과한 `dist/production-<빌드 ID>/`의 AAB·mapping.txt·r8-metadata.dat를 보관한다. 세 비율 __________ / __________ / __________ %. 기존 EAS 빌드 다운로드를 재시도할 때는 `scripts/build-release.ps1 production -BuildId <빌드 ID>`를 사용한다.
- [ ] Play 내부 테스트에서 vc78에 vc79를 덮어 설치한다. 기존 위젯·예약 알림·익명 계정·스터디룸·기록·오답 첨부를 유지하며 실행되는지 확인한다. 1.0.44 내장 번들로 콜드 스타트하고 production 채널의 같은 런타임 업데이트가 있을 때 재실행해 수신도 확인한다.
- [ ] 16KB datastore의 NDK·정렬을 0-AAAAQ대로 확인하고, 업로드한 **vc79**의 Bundle 탐색기에서 난독화·최적화·코드 축소 각 25% 이상과 DEX/16KB 경고 해소를 기록한다.
