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

## 같은 deployment 재배포 vs 새 deployment
- 같은 deployment를 `Edit > Deploy`로 재배포하면 기존 `.../exec` URL 유지
- 새 deployment를 만들면 URL이 바뀔 수 있음
- URL이 바뀌면 Secret 갱신과 Pages 재배포가 추가로 필요

## Script Properties에서 확인할 값
- `FRONTEND_ADMIN_BASE_URL`
- `FRONTEND_STUDENT_BASE_URL`
- `GOOGLE_OAUTH_CLIENT_ID`

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
