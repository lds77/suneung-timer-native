// 오답노트 첨부 폴더를 안드로이드 '클라우드 자동 백업'에서 제외한다.
//
// 문제: 안드 자동 백업은 **앱당 25MB 상한**이고, 넘으면 백업이 통째로 실패한다.
// 첨부(사진)는 documentDirectory = files/ 아래에 쌓이는데 여기가 기본 백업 대상이라,
// 사진을 꽉 채운 노트 ~17개(장당 200~400KB × 5장)면 상한에 닿는다.
// 오답노트는 성실한 학생일수록 쌓이는 기능이라 실제로 도달 가능한 숫자다.
// 백업이 실패하면 `allowBackup: true`로 지키려던 것이 무너진다 —
// 재설치 시 익명 uid(스터디룸 계정)와 공부 데이터 복원이 **조용히** 안 된다
// (계정 영속 1단계, docs/account-persistence-design.md · 2026-07-19 사용자 승인).
//
// 해결: 첨부 폴더만 클라우드 백업에서 제외. AsyncStorage(uid·공부 데이터)는 그대로 백업된다.
// 잃는 것 없음 — JSON 백업/복원(storage.js BACKUP_KEYS)도 노트 기록만 담고 이미지 파일은
// 애초에 옮기지 않으므로, 자동 백업만이 사진을 옮기던 유일한 경로였고 그마저 25MB에서 깨졌다.
//
// 기기 간 직접 전송(device-transfer)은 용량 제한이 없으므로 **제외하지 않는다** —
// 새 폰으로 갈아탈 때는 사진도 따라간다.
//
// ※iOS(iCloud 백업 제외, NSURLIsExcludedFromBackupKey)는 별도 — expo-file-system에
//   해당 API가 없어 네이티브 작업이 필요하다. iOS는 uid가 키체인에 따로 있어
//   계정 영속은 안전하고, 남는 문제는 사용자 iCloud 용량 소모뿐이라 후순위.
//
// android/는 prebuild 생성물이라 여기(config 플러그인)에 둬야 로컬/EAS 모두에 적용된다.
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// documentDirectory = /data/user/0/<pkg>/files/ → domain="file", path는 그 아래 상대경로.
// attachments.js의 ATTACH_SUBDIR와 반드시 같아야 한다 (바꾸면 여기도 함께 고칠 것)
const ATTACH_DIR = 'reviewNotes/';

// API 31+ (Android 12~): 클라우드 백업과 기기 간 전송을 따로 정의
const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<!-- plugins/withAttachmentsNotBackedUp.js가 생성 — 직접 고치지 말 것 -->
<data-extraction-rules>
    <cloud-backup>
        <!-- 오답노트 첨부: 25MB 백업 상한을 넘겨 백업 자체를 실패시키므로 제외 -->
        <exclude domain="file" path="${ATTACH_DIR}" />
    </cloud-backup>
    <!-- device-transfer는 용량 제한이 없어 제외하지 않음 (새 폰으로 옮길 땐 사진도 따라감) -->
</data-extraction-rules>
`;

// API 30 이하: fullBackupContent
const BACKUP_RULES = `<?xml version="1.0" encoding="utf-8"?>
<!-- plugins/withAttachmentsNotBackedUp.js가 생성 — 직접 고치지 말 것 -->
<full-backup-content>
    <exclude domain="file" path="${ATTACH_DIR}" />
</full-backup-content>
`;

const writeXml = (projectRoot, name, contents) => {
  const dir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), contents, 'utf8');
};

module.exports = function withAttachmentsNotBackedUp(config) {
  // 1) res/xml/ 규칙 파일 생성
  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      writeXml(cfg.modRequest.projectRoot, 'data_extraction_rules.xml', DATA_EXTRACTION_RULES);
      writeXml(cfg.modRequest.projectRoot, 'backup_rules.xml', BACKUP_RULES);
      return cfg;
    },
  ]);

  // 2) 매니페스트 <application>에 두 규칙을 모두 연결 (구/신 API 양쪽 커버)
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
      app.$['android:fullBackupContent'] = '@xml/backup_rules';
    }
    return cfg;
  });
};
