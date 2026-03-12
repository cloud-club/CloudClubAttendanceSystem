# Usage And Operations

## 운영 URL
- 관리자: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/admin/`
- 학생 Latest: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/student/latest/`
- 랜딩: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/`

## 학생 사용 흐름
1. 학생은 보통 Latest URL 또는 QR로 진입합니다.
2. 현재 세션 상태를 보고 전화번호로 출석합니다.
3. 출석 결과는 Apps Script가 최종 판정합니다.
4. 출석현황 / 랭킹도 같은 API 계층을 거쳐 조회합니다.

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

## 운영자가 자주 하는 일
- 출석 처리와 수동 승인
- 출석현황 대시보드 확인
- 일정 관리
- 유고 / 수료 보정
- 시즌 업로드와 관리자 관리
- 운세 데이터 버전 업로드

## 사람이 직접 읽기 좋은 기준 문서
- 관리자 전체 흐름: [`docs/Wiki/02_Admin_Side_Guide.md`](../Wiki/02_Admin_Side_Guide.md)
- 탭별 수정 지도: [`docs/Wiki/03_Admin_Tab_Change_Map.md`](../Wiki/03_Admin_Tab_Change_Map.md)
- 운영 런북: [`docs/Wiki/04_Operations_Runbook.md`](../Wiki/04_Operations_Runbook.md)

## 에이전트가 먼저 설명해야 하는 포인트
- 현재 질문이 사용자 흐름인지 관리자 운영인지
- latest 시즌인지 과거 시즌인지
- 공개 경로인지 관리자 권한 경로인지
- 데이터 반영 기준이 UI가 아니라 Apps Script + Sheets라는 점
