# Project Map

## 한 줄 정의
CloudClub 출석 시스템은 `GitHub Pages UI + Google Apps Script API/RBAC + Google Sheets 데이터`로 운영되는 2-tier 출석 운영 시스템입니다.

## 왜 이 구조인가
- 과거 1-tier Apps Script HTML 렌더링 구조는 화면, 인증, 데이터 이슈가 한 배포 단위에 섞여 원인 분리가 어려웠습니다.
- 현재 구조는 UI와 API/데이터를 분리해 장애 분석, 롤백, 인수인계를 쉽게 만드는 데 목적이 있습니다.

## 책임 경계
- `web/*`
  - 학생 / 관리자 UI
  - GitHub Pages로 배포
  - `web/shared/env.js`에서 런타임 API URL 사용
- `Appsscript/*`
  - `doGet`, `handleApiRequest`, 권한 가드, 인증, 시트 반영
  - Apps Script Web App으로 배포
- `Google Sheets`
  - 회원 데이터, 출석 세션 헤더, `_admins`, `_session_meta`, `_import_meta` 등 메타 시트

## 핵심 파일
- API 엔트리: [`Appsscript/00_entry_api.gs`](../../Appsscript/00_entry_api.gs)
- 권한 정본: [`Appsscript/01_constants_access.gs`](../../Appsscript/01_constants_access.gs)
- 관리자 UI 엔트리: [`web/admin/admin.js`](../../web/admin/admin.js)
- 학생 UI 엔트리: [`web/student/student.js`](../../web/student/student.js)
- Secret 주입 / canary: [`/.github/workflows/deploy-gh-pages.yml`](../../.github/workflows/deploy-gh-pages.yml)
- 런타임 API URL 반영: [`web/shared/env.js`](../../web/shared/env.js)

## 정본 우선순위
1. 현재 질문용 압축 정본: 이 디렉토리
2. 현재 운영 기준: [`docs/Wiki`](../Wiki/)
3. 과거 배경 / 회고: [`docs/History`](../History/)
4. 실제 계약 / 권한 / 배포 사실: 코드

## 운영 설계 의도
- 공개 API 계약은 쉽게 바꾸지 않습니다.
- 권한 판정은 `ACTION_ACCESS_LEVELS`를 기준으로 봅니다.
- 시즌 시트는 헤더 기반 해석을 우선하며, `Phone`을 주요 키로 사용합니다.
- 학생 Latest 경로와 과거 시즌 접근은 같은 규칙이 아닙니다. latest는 공개 경로, 과거 시즌은 관리자 인증이 필요할 수 있습니다.
