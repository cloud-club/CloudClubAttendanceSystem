# Appsscript Backend Guide

> 문서 링크: [Appsscript/README.md](./README.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/Appsscript/README.md)

## 목적
- 이 디렉토리는 Google Sheets에 연결된 Google Apps Script 백엔드의 단일 소스 디렉토리(SSOT)입니다.
- 이 레포는 버전관리/문서화를 위한 관리 저장소이며, 실제 운영 반영은 Apps Script 배포 버전이 기준입니다.

## 운영 원칙
- `.gs` 파일 간 `import/export`를 사용하지 않습니다.
- Apps Script V8의 전역 스코프 공유를 활용해 함수만 목적별 파일로 분할합니다.
- `doGet`/`handleApiRequest` 엔트리는 `00_entry_api.gs`에 유지합니다.
- 외부 API 계약(액션명/파라미터/응답 스키마)은 변경하지 않습니다.
- Script Properties/시트의 비밀값(OAuth, 운영 속성)은 레포에 커밋하지 않습니다.

## 파일 구조
- `00_entry_api.gs`: API 엔트리(`doGet`, `handleApiRequest`)
- `01_constants_access.gs`: 상수/권한(`ACTION_ACCESS_LEVELS`)
- `10_auth_admin.gs`: 인증/관리자 계정 액션
- `20_season_sheet_resolver.gs`: 시즌/시트 해석
- `21_variables_sessionmeta.gs`: 변수/세션 메타
- `30_attendance_core.gs`: 출석 코어
- `31_dashboard.gs`: 대시보드 집계
- `32_schedule.gs`: 일정/스키마 점검
- `33_graduation_manual_excused.gs`: 수동승인/유고/수료
- `34_season_import.gs`: 시즌 업로드
- `90_common_utils.gs`: 공통 유틸
- `91_fortune.gs`: 시즌 메시지/fortune 로직

## 배포 순서 (SSOT)
1. Apps Script 신규 버전 배포
2. `APPS_SCRIPT_WEB_APP_URL` Secret 반영
3. GitHub Pages 배포
4. `health`/`apiInfo`/인증 canary 검증

학생 `status.data.insights`처럼 기존 공개 API에 필드만 추가하는 변경은 예외적으로 Pages를 먼저 배포할 수 있습니다. 이 경우 새 UI가 구버전 Apps Script의 기존 `status` 응답에서도 본인 출석률과 기본 조회를 유지하고, 새 인사이트 영역만 업데이트 안내로 대체해야 합니다. 이후 관련 `.gs` 파일을 한 deployment에 함께 반영하고 `apiInfo.capabilities.studentInsightsV1`와 관련 `runtimeChecks`가 모두 `true`인지 확인합니다.

## 롤백 원칙
- `.../exec` URL 기준으로 운영 상태를 확인합니다.
- 이상 시 이전 Apps Script 배포 버전으로 즉시 롤백합니다.
