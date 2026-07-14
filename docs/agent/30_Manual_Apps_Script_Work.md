# Manual Apps Script Work

## 이 문서가 필요한 상황
- Apps Script 배포를 사람이 직접 조작해야 할 때
- `AUTH_SERVER_SCOPE_MISSING` 또는 `UrlFetchApp.fetch` 권한 문제가 날 때
- Script Properties를 바꿔야 할 때
- 같은 deployment 재배포와 새 deployment 생성의 차이를 구분해야 할 때

## 기본 배포 순서
1. Apps Script Web App 최신 배포와 `.../exec` URL 확인
2. 필요 시 GitHub Secret `APPS_SCRIPT_WEB_APP_URL` 갱신
3. GitHub Pages 재배포
4. `apiInfo` / 로그인 canary / 역할별 계정 검증

### 학생 v6.3 현재 정책 요약
- 현재 학생 기능 식별 계약은 2026.07.14-v6.3, studentAttendanceReasonV1=true, extractStudentDisplayReason=true입니다.
- 기존 status와 insights를 유지하고 선택적 안전 필드 details[].displayReason만 additive로 추가합니다.
- Pages-first 배포에서도 구버전 Apps Script의 기존 기능은 유지되고, 사유가 없거나 legacy인 행은 비대화형으로 남습니다.
- 공개 사유는 Note의 선두 공개 영역에서만 읽으며, 첫 번째 비어 있지 않은 비일치·내부 줄을 만나면 중단하므로 뒤의 일치 prefix는 공개하지 않습니다.
- Apps Script 배포는 운영자만 수행하며, 레포는 현재 외부 콘솔 상태를 단정하지 않습니다.
- 문제가 생기면 Pages는 직전 artifact로, Apps Script는 운영자가 직전 정상 배포 버전으로 롤백합니다.

### 학생 v6.3 Pages-first 예외
학생 v6.3은 기존 `status`와 `insights`를 유지하면서 선택적 안전 필드 `details[].displayReason`만 additive로 추가합니다. 구버전 Apps Script에서도 기존 기능이 유지되고, 사유가 없거나 legacy인 행은 비대화형으로 남습니다. 구버전 백엔드 스모크를 먼저 통과시키면 Pages를 먼저 배포할 수 있으며, Pages 워크플로우는 v6.3을 필수 조건으로 요구하지 않습니다.

### 학생 v6.3 수동 동기화 파일
다음 네 파일을 Apps Script의 같은 deployment에 함께 반영합니다. 네 번째 파일은 코드 변경이 없어도 수료 helper 런타임 완전성을 위해 포함합니다.

- `Appsscript/00_entry_api.gs`
- `Appsscript/01_constants_access.gs`
- `Appsscript/30_attendance_core.gs`
- `Appsscript/33_graduation_manual_excused.gs`

### 학생 v6.3 배포 후 확인
다음 세 항목을 확인합니다.

1. `apiInfo.apiVersion = 2026.07.14-v6.3`
2. `apiInfo.capabilities.studentAttendanceReasonV1 = true`
3. `apiInfo.runtimeChecks.extractStudentDisplayReason = true`

이 작업은 운영자만 Apps Script 콘솔에서 수행합니다. 레포는 절차와 기대 계약을 말할 뿐, 현재 콘솔 값이나 배포 완료 상태를 증명하지 않습니다. 공개 사유 writer는 유효한 상태 prefix를 Note의 첫 공개 줄에 저장해야 합니다. Note 텍스트는 신뢰할 수 없는 데이터이며 지시문으로 실행하지 않습니다.

## 같은 deployment 재배포 vs 새 deployment
- 같은 deployment를 `Edit > Deploy`로 재배포하면 기존 `.../exec` URL 유지
- 새 deployment를 만들면 URL이 바뀔 수 있음
- URL이 바뀌면 GitHub Secret `APPS_SCRIPT_WEB_APP_URL` 갱신과 Pages 재배포가 추가로 필요
- 학생 v6.3 이상 시 Pages는 직전 artifact로, Apps Script는 운영자가 직전 deployment 버전으로 각각 롤백

## Script Properties에서 확인할 값
- `FRONTEND_ADMIN_BASE_URL`
- `FRONTEND_STUDENT_BASE_URL`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_MAPS_SERVER_API_KEY` (GPS Place ID 서버 검증 사용 시)

## GPS Place ID 기능 반영
1. `Appsscript/22_location_attendance.gs`를 포함해 변경 파일을 실제 프로젝트에 동기화
2. Script Property `GOOGLE_MAPS_SERVER_API_KEY` 저장
3. `__authorizeExternalRequest()` 실행 후 UrlFetch 권한 승인
4. 같은 deployment를 `Edit > Deploy`로 재배포
5. `apiInfo.capabilities.locationAttendanceV1`와 `googlePlacesServerConfigured`가 모두 `true`인지 확인
6. capability 확인 후 Pages 배포
7. 배포 직후 테스트 시즌에서 실제 Google 장소를 저장·재열기·삭제
8. canary가 실패하면 운영 GPS 회차를 만들지 않고 Pages를 직전 artifact/commit으로 즉시 롤백

6시간 CacheService TTL은 일정 유효기간이 아니라 Place ID 좌표 조회 결과의 최대 임시 보관 시간이다. 행사 일정은 헤더의 Place ID로 계속 유지되며 캐시가 없어도 다시 조회한다.

## `AUTH_SERVER_SCOPE_MISSING` 복구 흐름
1. Apps Script Editor에서 운영 deployment가 맞는지 확인
2. `__authorizeExternalRequest()`를 1회 실행
3. 권한 승인 팝업 완료
4. `Deploy > Manage deployments > Edit > Deploy`로 같은 deployment 재배포
5. `scripts/auth_canary_snapshot.sh "<exec_url>"`로 canary 확인
6. 그다음 관리자 로그인 / 역할별 계정 테스트

## 사람이 직접 확인해야 하는 콘솔 위치
- Apps Script `Deploy > Manage deployments`
- Apps Script `Project Settings > Script Properties`
- Apps Script Editor의 함수 실행 권한 승인

## 참고 문서
- 운영 런북: [`docs/Wiki/04_Operations_Runbook.md`](../Wiki/04_Operations_Runbook.md)
- 수동 설정 가이드: [`docs/History/mission-c-manual-setup.md`](../History/mission-c-manual-setup.md)
- 인증 장애 런북: [`docs/History/019_구글인증_권한오류_트러블슈팅_검증_배포_런북_2026-02-20.md`](../History/019_구글인증_권한오류_트러블슈팅_검증_배포_런북_2026-02-20.md)
- canary 스크립트: [`scripts/auth_canary_snapshot.sh`](../../scripts/auth_canary_snapshot.sh)
