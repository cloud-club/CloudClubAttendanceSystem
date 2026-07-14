# Usage And Operations

## 운영 URL
- 관리자: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/admin/`
- 학생 Latest: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/student/latest/`
- 랜딩: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/`

## 학생 사용 흐름
1. 학생은 보통 Latest URL 또는 QR로 진입합니다.
2. 현재 세션 상태를 보고 전화번호로 출석합니다.
3. 데스크톱의 상단 탭 또는 모바일 메뉴에서 `출석하기 → 출석 현황 → 수료 조건 확인` 3개 화면을 이동합니다.
4. 출석 결과는 Apps Script가 최종 판정합니다.
5. 출석 현황에서 본인 지표와 회차별 기록을 보고, 공개 사유가 있는 행만 상세 다이얼로그로 엽니다. 사유가 없는 과거·legacy 행은 비대화형입니다.
6. 수료 화면의 안내인 `이 화면에는 스터디 출석이 반영되지 않습니다. 최종 수료 여부는 스터디 출석률에 따라 달라질 수 있습니다.`를 확인합니다.
7. 출석현황 / 랭킹 / 수료 조건도 같은 Apps Script API 계층을 거쳐 조회합니다.

학생 공개 사유는 전화번호로 조회한 본인 상태에만 한정됩니다. 서버가 Note 선두 공개 영역의 현재 상태 prefix에서 추출한 최대 300자의 `details[].displayReason`만 UI가 `textContent`로 표시합니다. 첫 번째 비어 있지 않은 줄이 비일치·내부 기록이면 탐색을 끝내고, 원본 Note나 다른 회원 데이터는 표시하지 않습니다.

## 관리자 사용 흐름
1. Google OAuth 로그인
2. 관리자 / 시즌 접근 권한 검증
3. 관리자 탭에서 운영 작업 수행
4. Apps Script API가 시트 반영
5. 출석현황, 런북, canary로 검증

## latest 시즌 규칙
- 공개 액션(`session`, `attendance`, `status`, `ranking`)은 latest 시즌 기준으로는 토큰 없이 허용될 수 있습니다.
- 과거 시즌(`season_08` 같은 명시 시즌)은 관리자 인증(`adminToken`)이 필요합니다.
- 관리자 페이지는 로그인 후에도 시즌별 요청마다 `adminToken` 전달을 유지해야 합니다.

## 학생 v6.3 현재 정책 요약
- 현재 학생 기능 식별 계약은 2026.07.14-v6.3, studentAttendanceReasonV1=true, extractStudentDisplayReason=true입니다.
- 기존 status와 insights를 유지하고 선택적 안전 필드 details[].displayReason만 additive로 추가합니다.
- Pages-first 배포에서도 구버전 Apps Script의 기존 기능은 유지되고, 사유가 없거나 legacy인 행은 비대화형으로 남습니다.
- 공개 사유는 Note의 선두 공개 영역에서만 읽으며, 첫 번째 비어 있지 않은 비일치·내부 줄을 만나면 중단하므로 뒤의 일치 prefix는 공개하지 않습니다.
- Apps Script 배포는 운영자만 수행하며, 레포는 현재 외부 콘솔 상태를 단정하지 않습니다.
- 문제가 생기면 Pages는 직전 artifact로, Apps Script는 운영자가 직전 정상 배포 버전으로 롤백합니다.

## 운영자가 자주 하는 일
- 출석 처리와 수동 승인
- 출석현황 대시보드 확인
- 일정 관리
- 유고 / 수료 보정
- 시즌 업로드와 관리자 관리
- 운세 데이터 버전 업로드
- 유고 사유를 입력할 때 저장 후 학생 출석 현황에 공개된다는 경고와 300자 제한 확인

## 학생 v6.3 운영 경계
- 레포의 현재 계약은 `2026.07.14-v6.3`, `studentAttendanceReasonV1 = true`, `extractStudentDisplayReason = true`입니다.
- Pages-first 배포는 기존 `status`/`insights`가 유지되고 `details[].displayReason`만 선택적으로 추가되는 호환성을 전제로 합니다.
- 실제 Apps Script deployment, Script Properties, GitHub Secret의 현재 값은 외부 콘솔에서 운영자가 확인해야 합니다.
- 같은 Apps Script deployment를 재배포하면 `.../exec` URL이 유지되고, 새 deployment로 URL이 바뀌면 `APPS_SCRIPT_WEB_APP_URL` 갱신과 Pages 재배포가 필요합니다.

## 사람이 직접 읽기 좋은 기준 문서
- 관리자 전체 흐름: [`docs/Wiki/02_Admin_Side_Guide.md`](../Wiki/02_Admin_Side_Guide.md)
- 탭별 수정 지도: [`docs/Wiki/03_Admin_Tab_Change_Map.md`](../Wiki/03_Admin_Tab_Change_Map.md)
- 운영 런북: [`docs/Wiki/04_Operations_Runbook.md`](../Wiki/04_Operations_Runbook.md)

## 에이전트가 먼저 설명해야 하는 포인트
- 현재 질문이 사용자 흐름인지 관리자 운영인지
- latest 시즌인지 과거 시즌인지
- 공개 경로인지 관리자 권한 경로인지
- 데이터 반영 기준이 UI가 아니라 Apps Script + Sheets라는 점
