# CloudClub Attendance System

> 문서를 찾기 전에 에이전트에게 먼저 물어보세요.

이 저장소는 CloudClub 출석 시스템의 운영 정본입니다. 길게 읽기 전에 Codex, Claude, Gemini CLI 중 하나에서 아래 질문을 그대로 물어보는 흐름을 기본 진입점으로 사용합니다.

## 3줄 구조 설명
- `web/*` = GitHub Pages UI
- `Appsscript/*` = Google Apps Script API / RBAC / Sheets 게이트웨이
- `Google Sheets` = 운영 데이터와 메타 시트

## 바로 물을 질문
- `이 프로젝트가 어떤 문제를 해결하는지, 전체 구조와 함께 설명해줘.`
- `학생과 운영진은 각각 이 시스템을 어떻게 사용하면 되는지 알려줘.`
- `처음 인수인계받은 사람이면 어떤 순서로 문서와 코드를 보면 되는지 정리해줘.`
- `CloudClub 출석 시스템에서 web, Appsscript, Google Sheets가 각각 무슨 역할인지 쉽게 설명해줘.`
- `기능을 수정해야 할 때 보통 어디부터 보면 되는지 큰 흐름부터 알려줘.`
- `이 프로젝트에서 사람이 직접 해야 하는 수동 작업에는 뭐가 있는지 먼저 알려줘.`

## 에이전트별 진입
### Codex CLI
- 루트 [AGENTS.md](./AGENTS.md)를 공통 지침 정본으로 사용합니다.
- 먼저 `이 프로젝트가 어떤 문제를 해결하는지, 전체 구조와 함께 설명해줘.`처럼 구조 이해형 질문부터 시작하면 됩니다.

### Claude Code
- 루트 [CLAUDE.md](./CLAUDE.md)가 공통 코어인 [AGENTS.md](./AGENTS.md)와 `docs/agent/*`로 연결됩니다.
- 프로젝트 명령:
  - `/project-overview`
  - `/change-guide`
  - `/ops-guide`

### Gemini CLI
- 루트 [GEMINI.md](./GEMINI.md)와 [`.gemini/settings.json`](./.gemini/settings.json)이 공통 코어를 불러옵니다.
- 프로젝트 명령:
  - `/project:overview`
  - `/project:change`
  - `/project:ops`

## 한계 선언
- 에이전트는 레포 안의 구조, 정책, 코드, 문서, 절차를 설명할 수 있습니다.
- 에이전트는 실제 GitHub Secret 값, Google Cloud Console 현재 상태, Apps Script 배포 화면의 현재 선택값은 직접 볼 수 없습니다.
- 외부 설정은 항상 `레포가 설명하는 절차`와 `사람이 콘솔에서 확인해야 하는 값`을 분리해서 해석해야 합니다.

## 정본 우선순위
1. 현재 정책과 운영 절차: [AGENTS.md](./AGENTS.md) -> [`docs/agent`](./docs/agent/) -> [`docs/Wiki`](./docs/Wiki/)
2. 과거 배경과 결정 이유: [`docs/History`](./docs/History/)
3. 실제 계약과 런타임 사실: [`Appsscript/00_entry_api.gs`](./Appsscript/00_entry_api.gs), [`Appsscript/01_constants_access.gs`](./Appsscript/01_constants_access.gs), [`.github/workflows/deploy-gh-pages.yml`](./.github/workflows/deploy-gh-pages.yml), [`web/shared/env.js`](./web/shared/env.js)

## 빠른 운영 맵
- 프로젝트 구조와 설계 의도: [`docs/agent/00_Project_Map.md`](./docs/agent/00_Project_Map.md)
- 사용 흐름과 운영 URL: [`docs/agent/10_Usage_And_Operations.md`](./docs/agent/10_Usage_And_Operations.md)
- 수정 절차와 영향 범위 판정: [`docs/agent/20_Change_Workflow.md`](./docs/agent/20_Change_Workflow.md)
- Apps Script 수동 작업: [`docs/agent/30_Manual_Apps_Script_Work.md`](./docs/agent/30_Manual_Apps_Script_Work.md)
- Secret / OAuth / 외부 콘솔 위치: [`docs/agent/40_Secrets_Auth_And_External_Consoles.md`](./docs/agent/40_Secrets_Auth_And_External_Consoles.md)
- 반복 질문 모음: [`docs/agent/50_FAQ.md`](./docs/agent/50_FAQ.md)

## 사람이 직접 읽어야 할 문서
- 현재 운영 기준: [`docs/Wiki/README.md`](./docs/Wiki/README.md)
- 관리자 기능과 운영 흐름: [`docs/Wiki/02_Admin_Side_Guide.md`](./docs/Wiki/02_Admin_Side_Guide.md)
- 탭별 변경 지도: [`docs/Wiki/03_Admin_Tab_Change_Map.md`](./docs/Wiki/03_Admin_Tab_Change_Map.md)
- 운영 런북: [`docs/Wiki/04_Operations_Runbook.md`](./docs/Wiki/04_Operations_Runbook.md)
- 데이터 / RBAC 기준: [`docs/Wiki/05_Data_And_RBAC_Reference.md`](./docs/Wiki/05_Data_And_RBAC_Reference.md)

## 운영 URL
- 관리자: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/admin/`
- 학생 Latest: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/student/latest/`
- 랜딩: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/`
