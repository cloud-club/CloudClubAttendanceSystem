# CloudClub Attendance System Agent Guide

이 파일은 이 저장소에서 Codex, Claude, Gemini 같은 에이전트가 공통으로 따라야 하는 운영 정본입니다.

## 프로젝트 정의
- 이 저장소는 CloudClub 출석 시스템의 운영 정본입니다.
- 구조는 `GitHub Pages UI + Apps Script API/RBAC + Google Sheets 데이터`의 2-tier 운영 모델입니다.
- 실제 운영 반영 기준은 Apps Script 배포와 GitHub Pages 배포이며, 외부 콘솔의 현재 상태는 레포 밖에 있습니다.

## 구조와 책임 경계
- `web/*`: 학생/관리자 UI, 정적 자산, 클라이언트 API 호출
- `Appsscript/*`: API 라우팅, 권한 판정, 인증, 시트 읽기/쓰기, 운영 보조 로직
- `docs/Wiki/*`: 현재 운영 기준과 런북
- `docs/History/*`: 과거 배경, 회고, 장애 기록, 결정 이유
- `.github/workflows/deploy-gh-pages.yml`: `APPS_SCRIPT_WEB_APP_URL` 검증, `web/shared/env.js` 주입, canary

## 정본 우선순위
1. 현재 질문의 공통 안내: `AGENTS.md`
2. 질문형 압축 정본: `docs/agent/*`
3. 현재 운영 정책: `docs/Wiki/*`
4. 과거 배경과 의사결정 이유: `docs/History/*`
5. 실제 계약과 런타임 사실: `Appsscript/*`, `web/*`, `.github/workflows/*`

## 자주 참고할 핵심 파일
- 프로젝트 구조 / 경계: `docs/agent/00_Project_Map.md`
- 사용 흐름 / 운영 URL: `docs/agent/10_Usage_And_Operations.md`
- 수정 절차 / 영향 범위 판정: `docs/agent/20_Change_Workflow.md`
- Apps Script 수동 작업: `docs/agent/30_Manual_Apps_Script_Work.md`
- Secret / OAuth / 외부 콘솔: `docs/agent/40_Secrets_Auth_And_External_Consoles.md`
- FAQ: `docs/agent/50_FAQ.md`
- API 엔트리: `Appsscript/00_entry_api.gs`
- 권한 정본: `Appsscript/01_constants_access.gs`
- 배포 주입: `.github/workflows/deploy-gh-pages.yml`
- 런타임 API 주입 지점: `web/shared/env.js`

## 반드시 설명해야 하는 5개 항목
에이전트는 질문에 답할 때 가능하면 아래 항목을 먼저 정리합니다.

1. 이 프로젝트의 실제 운영 구조와 책임 경계
2. 해당 요청이 코드 수정인지, 배포 절차인지, 외부 콘솔 수정인지
3. 운영 중 수동 작업이 필요한 지점
4. 레포가 알고 있는 사실과 외부에서 사람이 확인해야 하는 상태의 경계
5. 다음으로 이어서 물을 만한 질문

## 변경 요청을 받을 때의 기본 절차
1. 요청이 어느 계층인지 먼저 분류합니다.
   - UI / UX / 클라이언트 동작: `web/*`
   - API / 권한 / 시트 반영: `Appsscript/*`
   - 배포 반영 / Secret / OAuth 문제: 외부 콘솔 + 런북
   - 운영 기준 변경: `docs/Wiki/*`
2. 그다음 배포 영향 범위를 판정합니다.
   - `web/*`만 바뀌면 보통 Pages 배포
   - `Appsscript/*`만 바뀌면 Apps Script 배포
   - 둘 다 바뀌면 둘 다 필요
   - 새 Apps Script deployment로 `.../exec` URL이 바뀌면 `APPS_SCRIPT_WEB_APP_URL` Secret 갱신과 Pages 재배포가 추가로 필요
3. 사람이 직접 확인해야 하는 외부 상태를 분리합니다.
   - GitHub Secret 값
   - Google Cloud OAuth origins / consent
   - Apps Script Script Properties
   - Apps Script deployment 선택과 권한 승인 상태

## 수동 작업 경계
- Apps Script `Deploy > Manage deployments` 조작
- `__authorizeExternalRequest()` 실행과 권한 승인
- Script Properties 수정
- GitHub `Settings > Secrets and variables > Actions` 수정
- Google Cloud Console의 OAuth Origin / Consent 수정

에이전트는 위 항목의 절차와 확인 포인트는 설명할 수 있지만, 현재 콘솔 값 자체를 본 것처럼 말하면 안 됩니다.

## 답변 규칙
- 먼저 결론을 씁니다.
- 다음에 관련 파일 / 문서 / 외부 콘솔 위치를 나눠서 제시합니다.
- 외부 상태는 추정하지 말고, `레포가 말하는 절차`와 `사람이 실제로 확인할 값`을 분리해 설명합니다.
- 현재 정책은 `Wiki + code` 우선으로 답하고, History는 배경 설명용으로만 씁니다.
- 가능하면 답변 마지막에 후속 질문 2~4개를 제안합니다.

## 후속 질문 예시
- `학생/운영진 관점에서 하루 사용 흐름을 설명해줘.`
- `현재 운영 기준은 Wiki, History, 코드 중 무엇을 우선 보면 되는지 알려줘.`
- `기능 수정 전에 알아야 할 구조와 책임 경계를 요약해줘.`
- `이 프로젝트에서 수동으로 관리해야 하는 외부 설정은 무엇인지 정리해줘.`

## 금지 사항
- Secret 값, OAuth 설정값, 배포 화면 현재 상태를 직접 본 것처럼 단정하지 말 것
- History만 읽고 현재 정책이라고 답하지 말 것
- `ACTION_ACCESS_LEVELS`, 배포 순서, latest 시즌 규칙처럼 코드/런북에 있는 정본을 무시하지 말 것
