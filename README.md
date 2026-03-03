# CloudClub Attendance Documentation Hub

> 문서 링크: [README.md](./README.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/README.md)

## 빠른 흐름도
```mermaid
flowchart LR
  A["학생/운영진이 웹 진입"] --> B["GitHub Pages 정적 UI"]
  B --> C["Apps Script API(Appsscript/*)"]
  C --> D["Google Sheets 데이터 저장/조회"]
  D --> C
  C --> B
```

## 문서 네비게이션 흐름도
```mermaid
flowchart LR
  A["처음 온 운영진/기여자"] --> B["docs/Wiki/README"]
  B --> C["01_User_Side_Guide"]
  B --> D["02_Admin_Side_Guide"]
  D --> E["03_Admin_Tab_Change_Map"]
  D --> F["04_Operations_Runbook"]
  D --> G["05_Data_And_RBAC_Reference"]
  B --> H["docs/History/README"]
```

## 프로젝트 배경과 전환 이유
CloudClub 출석 시스템은 8기까지 Google Apps Script가 화면과 데이터 처리를 함께 담당하는 1티어 구조로 운영되었습니다. 이 방식은 시작이 빠르다는 장점이 있었지만, 운영 규모가 커질수록 문제 원인 분리가 어렵고 인수인계 난이도가 높아졌습니다.

특히 2026년 2월 17~18일 전후로 운영 이슈가 반복되면서, 화면 배포와 데이터/인증 로직을 분리해야 한다는 합의가 생겼습니다. 그 결과 현재는 **GitHub Pages(프런트) + Google OAuth 인증 + Apps Script/Google Sheets(API/DB)** 구조로 고도화되었고, 문서도 같은 시점부터 “교체 가능한 운영진”을 전제로 다시 설계되었습니다.

## 시스템 전체 흐름
현재 구조의 핵심은 기능 추가보다 책임 경계를 명확히 한 데 있습니다. 학생/관리자 화면은 GitHub Pages로 독립 배포하고, 출석 판정·권한 검사·시트 반영은 `Appsscript/*`에서 일관되게 처리합니다. 그래서 장애가 나더라도 UI 문제인지 API/데이터 문제인지 빠르게 분리해서 대응할 수 있습니다.

운영 관점에서 이 구조는 “누가 이어받아도 같은 기준으로 운영할 수 있는 시스템”을 만드는 데 목적이 있습니다. 문서에서 동일한 용어와 순서를 반복하는 이유도, 코드 지식이 없는 운영진까지 포함해 공통 의사결정 기준을 맞추기 위함입니다.

## 운영 기준 (SSOT)
- 이 백엔드 코드는 Google Sheets에 연결된 Google Apps Script 프로젝트에서 운영된다.
- 레포는 운영 소스를 버전관리/문서화하기 위한 관리 저장소이며, 실제 반영은 Apps Script 배포가 기준이다.
- 시스템 책임 경계:
  - `web/*`: GitHub Pages 정적 UI
  - `Appsscript/*`: API/권한/시트 로직
- 운영 비밀값 관리:
  - OAuth/운영 속성은 Script Properties 및 시트에서 관리한다.
  - 비밀값은 레포에 커밋하지 않는다.
- 배포 순서 SSOT:
  - Apps Script 배포
  - Secret 반영(`APPS_SCRIPT_WEB_APP_URL`)
  - GitHub Pages 배포
  - canary/health 검증
- 무중단/롤백 원칙:
  - `.../exec` URL을 기준점으로 운영한다.
  - 이상 시 이전 Apps Script 배포 버전으로 즉시 롤백한다.
- 코드 분할 원칙:
  - Apps Script `.gs` 파일 간 `import/export`를 사용하지 않는다.
  - 외부 API 계약(액션명/파라미터/응답 스키마)은 변경하지 않는다.
- 시트 컬럼 운영 원칙:
  - 표준 헤더(`Name~운영진 여부`)는 권장 SSOT로 유지한다.
  - 런타임 파서는 헤더명을 기준으로 컬럼을 해석하므로, 운영 중 프로필 커스텀 칼럼 삽입/순서 변경이 있어도 출석 날짜 컬럼은 헤더 패턴으로 탐지한다.
  - 출석 날짜 컬럼은 위치보다 헤더 형식(`YYYY-MM-DD-HH:MM` 또는 `YYYY-MM-DD-HH:MM~HH:MM`)이 우선이다.

## 역할별 문서 진입 경로
각 역할은 필요한 문서가 다르기 때문에, 아래 순서로 읽으면 가장 빠르게 맥락을 잡을 수 있습니다.

- 신규 운영진: [docs/Wiki/README.md](./docs/Wiki/README.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/README.md) → [docs/Wiki/02_Admin_Side_Guide.md](./docs/Wiki/02_Admin_Side_Guide.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/02_Admin_Side_Guide.md) → [docs/Wiki/04_Operations_Runbook.md](./docs/Wiki/04_Operations_Runbook.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/04_Operations_Runbook.md)
- 사용자 안내 담당: [docs/Wiki/01_User_Side_Guide.md](./docs/Wiki/01_User_Side_Guide.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/01_User_Side_Guide.md)
- 개발/수정 담당: [docs/Wiki/03_Admin_Tab_Change_Map.md](./docs/Wiki/03_Admin_Tab_Change_Map.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/03_Admin_Tab_Change_Map.md) + [docs/Wiki/05_Data_And_RBAC_Reference.md](./docs/Wiki/05_Data_And_RBAC_Reference.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/05_Data_And_RBAC_Reference.md)

## 문서를 읽는 순서 (인수인계 기준)
인수인계 목적이라면 기능 설명만 읽는 것보다 “왜 이 순서인지”를 이해하는 것이 중요합니다. 먼저 위키 메인에서 현재 운영 기준을 잡고, 관리자 가이드로 실제 탭 운영 흐름을 익힌 뒤, 런북으로 복구 절차를 확인하면 운영 공백을 최소화할 수 있습니다.

그 다음에는 필요한 경우에만 History 원문을 열어 의사결정 배경을 추적합니다. 이렇게 하면 현재 운영 기준(SSOT)을 흔들지 않으면서도, 과거 변경 이유를 정확히 역추적할 수 있습니다.

## 시작 경로
- 위키 메인(현재 운영 기준): [docs/Wiki/README.md](./docs/Wiki/README.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/README.md)
- 히스토리 인덱스(과거 기록): [docs/History/README.md](./docs/History/README.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/README.md)
- 기술 문서 진입점: [TECH_DOCS.md](./TECH_DOCS.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/TECH_DOCS.md)

## 운영 URL
- 관리자: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/admin/`
- 학생(Latest): `https://cloud-club.github.io/CloudClubAttendanceSystem/web/student/latest/`
- 랜딩: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/`

## 회귀 더블체크
- 실행기: [scripts/run_doublecheck.sh](./scripts/run_doublecheck.sh) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/scripts/run_doublecheck.sh)
- 정적 가드: [scripts/doublecheck_static_guard.js](./scripts/doublecheck_static_guard.js) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/scripts/doublecheck_static_guard.js)
- API 비교: [scripts/doublecheck_api_snapshot.js](./scripts/doublecheck_api_snapshot.js), [scripts/doublecheck_api_compare.js](./scripts/doublecheck_api_compare.js)
- 운영 체크리스트: [docs/Wiki/06_Doublecheck_Regression_Gate.md](./docs/Wiki/06_Doublecheck_Regression_Gate.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/06_Doublecheck_Regression_Gate.md)

## 핵심 코드 경로
- 백엔드 엔트리: [Appsscript/00_entry_api.gs](./Appsscript/00_entry_api.gs) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/Appsscript/00_entry_api.gs)
- 백엔드 권한/상수: [Appsscript/01_constants_access.gs](./Appsscript/01_constants_access.gs) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/Appsscript/01_constants_access.gs)
- Appsscript 운영 가이드: [Appsscript/README.md](./Appsscript/README.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/Appsscript/README.md)
- 관리자 화면: [web/admin/index.html](./web/admin/index.html) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/web/admin/index.html)
- 관리자 스크립트: [web/admin/scripts/](./web/admin/scripts/) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/tree/gh-pages/web/admin/scripts)
- 학생 화면: [web/student/latest/index.html](./web/student/latest/index.html) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/web/student/latest/index.html)
- 학생 스크립트: [web/student/student.js](./web/student/student.js) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/web/student/student.js)
