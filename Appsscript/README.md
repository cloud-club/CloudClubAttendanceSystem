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

### 학생 v6.3 현재 정책 요약
- 현재 학생 기능 식별 계약은 2026.07.14-v6.3, studentAttendanceReasonV1=true, extractStudentDisplayReason=true입니다.
- 기존 status와 insights를 유지하고 선택적 안전 필드 details[].displayReason만 additive로 추가합니다.
- Pages-first 배포에서도 구버전 Apps Script의 기존 기능은 유지되고, 사유가 없거나 legacy인 행은 비대화형으로 남습니다.
- 공개 사유는 출석·지각·결석 Note의 선두 공개 영역에서만 읽으며, 유고는 사유를 공개하지 않습니다. 첫 번째 비어 있지 않은 비일치·내부 줄을 만나면 중단하므로 뒤의 일치 prefix는 공개하지 않습니다.
- Apps Script 배포는 운영자만 수행하며, 레포는 현재 외부 콘솔 상태를 단정하지 않습니다.
- 문제가 생기면 Pages는 직전 artifact로, Apps Script는 운영자가 직전 정상 배포 버전으로 롤백합니다.

### 학생 v6.3 Pages-first 예외
학생 v6.3은 기존 `status`와 `insights`를 유지하면서 선택적 안전 필드 `details[].displayReason`만 additive로 추가합니다. 구버전 Apps Script에서도 기존 기능이 유지되고, 사유가 없거나 legacy인 행은 비대화형으로 남습니다. 따라서 구버전 백엔드 스모크가 통과한 경우 Pages를 먼저 배포할 수 있으며, Pages 워크플로우 자체는 v6.3을 필수 조건으로 만들지 않습니다.

### 학생 v6.3 수동 동기화 파일
다음 네 파일을 Apps Script의 같은 deployment에 함께 동기화합니다. `Appsscript/33_graduation_manual_excused.gs`는 공개 사유 입력을 줄바꿈 없는 유니코드 코드 포인트 300개 이하로 검증하고, 내부 감사 `Note`를 보존한 채 관리자 응답에 안전한 `displayReason`을 별도로 제공합니다.

- `Appsscript/00_entry_api.gs`
- `Appsscript/01_constants_access.gs`
- `Appsscript/30_attendance_core.gs`
- `Appsscript/33_graduation_manual_excused.gs`

### 학생 v6.3 배포 후 확인
다음 세 항목만 학생 v6.3 배포 식별 체크로 사용합니다.

1. `apiInfo.apiVersion = 2026.07.14-v6.3`
2. `apiInfo.capabilities.studentAttendanceReasonV1 = true`
3. `apiInfo.runtimeChecks.extractStudentDisplayReason = true`

외부 Apps Script 배포는 운영자만 수행하며, 레포만으로 현재 콘솔 값이나 배포 상태를 단정하지 않습니다. 같은 deployment를 재배포하면 기존 `.../exec` URL을 유지합니다. 새 deployment로 URL이 바뀌면 GitHub Secret `APPS_SCRIPT_WEB_APP_URL`을 갱신하고 Pages를 다시 배포합니다. 문제가 생기면 Pages는 직전 artifact로, Apps Script는 운영자가 직전 배포 버전으로 되돌립니다.

## 롤백 원칙
- `.../exec` URL 기준으로 운영 상태를 확인합니다.
- 이상 시 이전 Apps Script 배포 버전으로 즉시 롤백합니다.
