# 오답노트(영구 학습 노트) 설계

2026-07-20 작성 — 파워유저 김진 님 건의(할일 메모가 다음날 사라져 오답 기록을 못 쌓음).
목적: 할일 메모를 **삭제 전까지 영구 보관**되는 과목별·챕터별 학습 노트로 이관·축적하는 공간.

> 관련: [[project_todo_custom_lists_2026_07_10]](할일 개편), [[project_bug_hunt_2026_07_19_stats]](고아 캐스케이드 교훈).
> 요청 #2(사진/오디오 첨부)는 네이티브 필요라 이 문서 3단계로 분리, #3(글자 색상)은 여기 색 라벨로 흡수.

## 핵심 결정

- **전부 로컬 데이터 → OTA 배포 가능** (사진 첨부만 네이티브·별도 빌드). 오답노트 본체는 네이티브 불필요.
- 새 저장 키 `@yeolgong/reviewNotes` (배열). 할일/세션과 **독립** — 일일 리셋이 절대 건드리지 않음.
- 노트 생성 경로 3가지: ① 할일에서 **수동 이관**('오답노트로 보내기'), ② 오답노트 화면에서 **직접 작성**,
  ③ (2단계) 할일 완료 시 **자동 이관**(`archiveOnComplete` 옵션).
  → 김진 님 표현 "옮기고 싶은 것"은 **명시적 선택**이므로 1단계는 수동 이관을 기본으로.

## 데이터 모델

```js
// @yeolgong/reviewNotes — 배열, 신규 키(OTA 안전). 백업/복원 대상에 추가.
reviewNote = {
  id,                                   // generateId('rn_')
  subjectId,                            // null = 미분류(과목 삭제 시로 흘러옴)
  subjectLabel, subjectColor, subjectIcon,  // 비정규화 — editSubject 캐스케이드로 동기화(할일과 동일 패턴)
  chapter,                              // 문자열 태그. '' = 미분류 챕터. (별도 엔티티 아님 — 자유입력+자동완성)
  title,                               // 짧은 제목(이관 시 할일 text 자동, 직접작성 시 입력)
  body,                                // 본문(이관 시 할일 memo, 직접작성 시 입력). 오답 내용 핵심
  color,                               // 강조 색 라벨(선택, 요청#3). null=기본
  sourceTodoId,                        // 이관 출처(선택). null=직접작성
  createdAt, updatedAt,                // ms
  // 2단계(네이티브 빌드): attachments: [{ type:'image'|'audio', uri, createdAt }]
}
```

**챕터**는 정식 엔티티가 아니라 노트당 문자열 태그다. UI에서 같은 과목의 기존 챕터를 칩으로 자동완성 제공,
그룹핑도 이 문자열 기준. 관리 화면(생성/이름변경/순서) 불필요 → 구현 단순 + "챕터 하위목록" 요구 충족.

## 저장소 (storage.js)

- `KEYS.REVIEW_NOTES = '@yeolgong/reviewNotes'`
- `saveReviewNotes / loadReviewNotes(기본값 [])`
- `BACKUP_KEYS`에 `'REVIEW_NOTES'` 추가, `BACKUP_KEY_SHAPES.REVIEW_NOTES = 'array'`
  → JSON 내보내기/가져오기 + 계정영속 자동백업에 자동 포함(전부 텍스트라 용량 부담 없음).

## 상태 (useAppState.js)

- `reviewNotes` 상태 + 자동저장(기존 sessions/todos와 동일 디바운스 패턴).
- `addReviewNote(partial)`, `updateReviewNote(id, patch)`, `deleteReviewNotes(ids[])`(일괄).
- `archiveTodoToNote(todoId, { chapter, keepTodo })`:
  해당 할일로 노트 생성(subject 비정규화 필드 복사, title=text, body=memo, sourceTodoId=todoId).
  `keepTodo=false`면 원본 할일 완료 처리 또는 삭제(UI 선택).
- **editSubject 캐스케이드 확장**: 과목 이름/색/아이콘 변경 시 reviewNotes의 비정규화 필드도 갱신
  (할일·세션 갱신하는 기존 로직에 reviewNotes 한 줄 추가).
- **과목 삭제**: reviewNotes는 **삭제하지 않고** subjectId=null로 만들어 '미분류'로 이동
  (오답 기록은 사용자 자산 — 고아 유령 문제와 달리 여기선 보존이 옳다). subjectLabel도 '미분류'로.

## 순수 로직 (신규 src/utils/reviewNotes.js + 테스트)

- `groupBySubjectChapter(notes, subjects)` → [{ subject, chapters:[{ name, notes:[] }] }] (표시용 정렬 트리)
- `chapterSuggestions(notes, subjectId)` → 그 과목의 기존 챕터 문자열 목록(자동완성)
- `makeNoteFromTodo(todo)` → reviewNote 부분객체(비정규화 필드 매핑) — 이관 로직 단일화·테스트
- 정렬: 과목순 → 챕터순 → updatedAt desc

## UI

### 오답노트 화면 (풀스크린 모달, 신규 `src/screens/ReviewNotesScreen.js`)
- **진입점 2곳**: (a) 과목 탭 상단 '오답노트' 버튼(주 진입 — 과목별이므로 여기가 집),
  (b) 집중 탭 할일 섹션 헤더의 작은 '오답노트' 링크(이관 흐름과 근접).
- **상단**: 과목 필터 칩(전체 + 과목별), 정렬 토글(최신순/과목순), (선택)검색.
- **본문**: 과목 → 챕터 접이식 그룹. 노트 카드 = 좌측 색 라벨 바 + 제목 + 본문 2줄 미리보기 + 날짜.
- **노트 탭** → 상세/편집 시트: 제목, 본문(멀티라인), 과목 선택, 챕터(자동완성 칩), 색 라벨.
- **+ 버튼**: 새 오답 직접 작성.
- **다중 삭제**: 카드 길게 누르면 선택 모드 → 개별 체크 + 상단 '전체 선택' / '삭제(n)'.
  (요청의 "항목 전체클릭·개별클릭 일괄삭제" 충족)

### 할일 → 오답노트 이관
- 할일 확장(메모 보이는 상태) 또는 길게 누름 → 액션 '오답노트로 보내기'.
- 확인 시트: 과목(할일 과목 기본) + 챕터(자동완성) 입력 → 저장.
- 저장 후 원본 처리: '완료 표시' / '그대로 두기' 선택(기본 완료 표시).

## 단계

| 단계 | 범위 | 배포 |
|------|------|------|
| 1 ✅ | 데이터 모델 + storage/backup + reviewNotes.js(+테스트 10) + 오답노트 화면(CRUD·그룹·다중삭제) + 할일 수동 이관 + 직접작성 + 색 라벨 | **OTA** (2026-07-20 구현 완료, 테스트 406, 실기기 검증 대기) |
| 2 | 완료 시 자동 이관 옵션(`archiveOnComplete` — TodoFormSheet 토글), 검색/정렬 고도화, 목록 상한 상향 검토 | OTA |
| 3 | 사진/오디오 첨부(요청#2와 합류 — expo-image-picker/expo-file-system, 백업에 파일 동반) | 네이티브 빌드 |

## 확정된 결정 (2026-07-20 사용자)
- **D1 진입점**: 과목 탭 주(主) + 할일 섹션 보조. 탭 5개 유지, 새 탭 안 만듦. ✔
- **D2 이관 타이밍**: 1단계는 **수동 이관만**, 자동(완료시 `archiveOnComplete`)은 2단계. ✔
- **D3 과목 삭제 시**: 노트 **보존**('미분류'로 이동, subjectId=null). 삭제 아님. ✔
- **D4 목록 상한**: **지금 5→8로 상향 완료** (TodoSection.js `MAX_TODO_LISTS = 8`, 오답노트와 무관한 독립 OTA). ✔
