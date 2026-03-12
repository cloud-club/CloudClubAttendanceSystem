# FAQ

## Q. 실제 백엔드는 어디에 있나?
A. 실제 백엔드는 `Appsscript/*`입니다. UI는 `web/*`에 있고, 데이터 저장은 Google Sheets에 있습니다. Apps Script가 API 엔트리, 권한, 인증, 시트 반영을 담당합니다.  
참조: [`Appsscript/00_entry_api.gs`](../../Appsscript/00_entry_api.gs), [`docs/agent/00_Project_Map.md`](./00_Project_Map.md)

## Q. README, Wiki, History, code 중 무엇이 정본인가?
A. 현재 질문용 압축 정본은 `AGENTS.md`와 `docs/agent/*`이고, 현재 운영 기준은 `docs/Wiki/*`, 과거 배경은 `docs/History/*`, 실제 계약과 권한은 코드가 정본입니다.  
참조: [`AGENTS.md`](../../AGENTS.md), [`docs/Wiki/README.md`](../Wiki/README.md)

## Q. 이 변경은 Apps Script 배포가 필요한가, Pages 배포가 필요한가?
A. `web/*`만 바뀌면 보통 Pages 배포, `Appsscript/*`만 바뀌면 Apps Script 배포, 둘 다 바뀌면 둘 다 필요합니다. 새 Apps Script deployment로 URL이 바뀌면 Secret 갱신과 Pages 재배포도 추가됩니다.  
참조: [`docs/agent/20_Change_Workflow.md`](./20_Change_Workflow.md)

## Q. `APPS_SCRIPT_WEB_APP_URL`은 어디서 바꾸고 어디에 반영되나?
A. GitHub Actions Secret에서 바꾸고, `deploy-gh-pages.yml`이 `web/shared/env.js`에 주입합니다. Secret만 바꾸면 끝이 아니라 Pages 재배포가 필요합니다.  
참조: [`/.github/workflows/deploy-gh-pages.yml`](../../.github/workflows/deploy-gh-pages.yml), [`web/shared/env.js`](../../web/shared/env.js)

## Q. Google OAuth origin / consent는 어디서 수정하나?
A. Google Cloud Console의 `APIs & Services` 아래에서 수정합니다. `Credentials > OAuth 2.0 Client ID (Web)`에서 origins를, `OAuth consent screen`에서 publishing / test users를 봅니다.  
참조: [`docs/agent/40_Secrets_Auth_And_External_Consoles.md`](./40_Secrets_Auth_And_External_Consoles.md)

## Q. Apps Script Script Properties는 어디서 수정하나?
A. Apps Script `Project Settings > Script Properties`에서 수정합니다. `FRONTEND_ADMIN_BASE_URL`, `FRONTEND_STUDENT_BASE_URL`, `GOOGLE_OAUTH_CLIENT_ID`를 확인합니다.  
참조: [`docs/agent/30_Manual_Apps_Script_Work.md`](./30_Manual_Apps_Script_Work.md)

## Q. `AUTH_SERVER_SCOPE_MISSING`를 어떻게 복구하나?
A. `__authorizeExternalRequest()` 실행, 권한 승인, 같은 deployment 재배포, canary 확인 순서로 복구합니다.  
참조: [`docs/agent/30_Manual_Apps_Script_Work.md`](./30_Manual_Apps_Script_Work.md), [`scripts/auth_canary_snapshot.sh`](../../scripts/auth_canary_snapshot.sh)

## Q. latest 시즌과 과거 시즌의 인증 규칙은 무엇인가?
A. latest 시즌의 공개 액션은 토큰 없이 허용될 수 있지만, 과거 시즌은 관리자 인증과 `adminToken`이 필요합니다.  
참조: [`docs/agent/10_Usage_And_Operations.md`](./10_Usage_And_Operations.md), [`docs/Wiki/04_Operations_Runbook.md`](../Wiki/04_Operations_Runbook.md)

## Q. 관리자 탭별로 어떤 프런트 파일 / API가 연결되나?
A. 가장 정확한 지도는 `docs/Wiki/03_Admin_Tab_Change_Map.md`입니다. 출석현황은 `web/admin/scripts/20_attendance.js`, `21_dashboard.js`, `attendanceDashboardSummary`, `attendanceDashboardDrilldown`, `Appsscript/31_dashboard.gs`를 우선 봅니다.  
참조: [`docs/Wiki/03_Admin_Tab_Change_Map.md`](../Wiki/03_Admin_Tab_Change_Map.md)

## Q. 에이전트가 직접 볼 수 없는 외부 상태는 무엇인가?
A. 현재 GitHub Secret 값, Google Cloud OAuth 설정값, Apps Script Script Properties 실제 값, 현재 운영 deployment 상태는 직접 볼 수 없습니다. 에이전트는 절차와 확인 포인트만 설명할 수 있습니다.  
참조: [`docs/agent/40_Secrets_Auth_And_External_Consoles.md`](./40_Secrets_Auth_And_External_Consoles.md)
