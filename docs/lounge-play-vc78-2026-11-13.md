# 열공메이트 Google Play vc78 제출 기록

**Google Play 심사 제출 완료 — 2026-11-13 07:58 KST 확인.** 프로덕션 78 (1.0.43) 한 건이 “검토 중인 변경사항”으로 표시됐다. 빠른 검사 진행 중이며 스토어 승인·출시 완료는 아니다. 관리형 게시 꺼짐, 100% 출시 설정으로 승인 후 자동 게시된다.

사용자 요청: 에버보드 빌드와 별도로 열공메이트 정식 빌드를 점검하여 Google Play에 제출한다. 2026-11-13 요청 및 실행 승인.

## 빌드

- Android **1.0.43 / versionCode 78**, production 채널, runtime **1.0.43**. iOS는 build61 그대로이며 이번 제출 대상이 아니다.
- 앱 버전을 유지하여 기존 Android/iOS 정식 OTA와 같은 runtime을 사용한다. Google Play의 새 바이너리는 증가한 versionCode로 구분한다.
- 소스 커밋 `3d437192ddae63db57a5d05c20a693e066ed5f30`. 앱 코드는 사용자가 확인한 `e06fb5f`와 동일하다. 추가 변경은 Android versionCode뿐이다.
- EAS 빌드 `6f25a7e8-256b-43f9-a302-c27fa4b73aa3`: https://expo.dev/accounts/leedongsik/projects/yeolgong-timer/builds/6f25a7e8-256b-43f9-a302-c27fa4b73aa3
- 원본의 미커밋 Live Activity 수정 등을 포함하지 않는 별도 worktree에서 빌드했다. EAS 클라우드를 사용하여 에버보드의 로컬 Gradle 작업은 건드리지 않았다.

## 검증 기준

- 같은 앱 소스의 정식 OTA 준비 때 전체 Jest 28 suites / 698 tests 통과, 양 플랫폼 export와 6개 핵심 파일 source map 대조 완료.
- 최종 미리보기 Android 실기기 사용자 확인: “굿. 완벽해.”
- 새 정식 AAB의 패키지·빌드 번호·서명·권한·필수 하드웨어·ABI를 vc76과 비교한다. Play의 지원 기기 변경도 확인한다.
- 최종 미리보기와 같은 일반 녹색 / 집중 황금빛 주황 / 울트라 진홍. 공부 중 배경 16%, 종료 직후 6%·점선 30%에서 30분 동안 옅어짐. 「오늘 이 방」 작은 점은 기존 승인 사양 유지.

## Play 확인

- 제출 준비 시 최신 출시 버전은 76 (1.0.43), 다른 대기 변경사항 없음. 관리형 게시 꺼짐.
- 앞선 데이터 보안 신고는 2026-11-13 게시 완료 상태이며 별도 재제출하지 않는다.
- 기존 vc76 대시보드에 DEX 난독화 최적화 안내(2027년 2월 기한)가 있다. 이번 UI 릴리스에서 난독화 설정은 변경하지 않는다.
- 프로덕션 vc78 한 건만 전송했다. 기존 국가 범위와 출시율 100% 유지.

## 최종 검증 결과와 파일

- EAS 빌드 FINISHED. AAB **87,342,580 bytes**. SHA-256 `a42cc7f5606ce4e6f5fab7b9768b2c7d1fd1b329cf321a841207b9de860c2084`.
- 보관 파일: `C:\suneung-timer-native\dist\yeolgong-1.0.43-vc78.aab`.
- Google bundletool 1.18.3 validate, JAR 서명 검증 통과. 서명 SHA-256은 vc76과 동일한 `01:66:BF:E8:26:78:C2:10:0E:F7:80:77:B3:8B:72:74:B3:6E:81:A1:F5:07:24:63:7F:AD:CD:09:D5:BB:6A:F1`.
- 패키지 `com.yeolgong.timer`, 최소 API24 / target36, ABI 4개, 권한·선택 하드웨어 요구조건이 vc76과 동일. debug 활성화 없음. OTA URL·production 채널·runtime 1.0.43 확인.
- 실제 AAB 내 Hermes 번들에서 새 모드 색 4개와 `loungeModeColors`·`warmOutline` 확인. vc76에는 이 신규 값들이 없다. Hermes bytecode 덤프에서 온기 강도를 배경·테두리에 곱하는 분기도 확인했다. AAB 번들 SHA-256 `09673b1ceaee704653cc45024699cdf7d295294f25928987e1d74251dc236fe6`. 소스맵을 포함한 전체 소스 대조는 앞선 동일 앱 소스의 OTA export 검증이며, AAB에서 소스맵을 추출한 것은 아니다.
- Play 지원 기기 변화 **모든 분류 0**: 전화12,611 / 태블릿6,844 / TV4 / 웨어러블0 / 차량11 / Chromebook77 / Android XR2 유지.
- Play 차단 오류 없음. 경고 1건은 기존과 같은 R8/ProGuard 가독화 파일 안내. 신규 설치46.3MB / 업데이트621KB는 콘솔 표시값으로 기기별 차이가 있을 수 있다.
- 검증 결과·manifest·서명·빌드 로그·Play 검토 및 제출 화면 기록: `C:\billiards-native\tmp\play-vc78-20261113`.
- 빌드 검증 도구 준비 중 Python 별칭이 실행되지 않아 PowerShell 검증기로 대체했다. Hermes 덤프 첫 시도에는 `-b`가 빠졌으며 실행 옵션을 고쳐 정상 확인했다. 앱/AAB는 수정하지 않았다.

## 출시 노트

스터디룸에서 공부를 마친 자리의 온기가 30분 동안 서서히 옅어져요.
집중모드는 황금빛 주황, 울트라모드는 진홍색으로 더 쉽게 구분할 수 있어요.
공부 중인 자리는 부드러운 배경과 실선으로, 방금 공부를 마친 자리는 옅은 배경과 점선으로 표시해요.
공부를 마친 뒤에도 마지막 공부 모드의 색이 유지되도록 개선했어요.
