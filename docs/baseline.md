# Baseline (Mission 0) - 2026-02-19

## 1) 스택 / 배포
- FE: 정적 웹 (`/Users/sbu/SBU/CloudClubAttendanceSystem/web/admin`, `/Users/sbu/SBU/CloudClubAttendanceSystem/web/student`)
- FE 공통 통신: JSONP (`/Users/sbu/SBU/CloudClubAttendanceSystem/web/shared/api-jsonp.js`)
- BE: Google Apps Script (`/Users/sbu/SBU/CloudClubAttendanceSystem/Code.gs`)
- Data: Google Sheets (SpreadsheetApp 직접 접근)
- 배포: GitHub Pages + Apps Script Web App

## 2) 데이터 소스 (Sheets) 접근 방식
- 서비스 계정/외부 OAuth 토큰 없이 Apps Script 런타임 권한으로 읽기/쓰기.
- 프런트는 JSONP GET으로 API 액션 호출 (`api` 파라미터).
- import 대용량 전송은 `rowsJson` chunk 분할로 URL 길이 제한 대응.

## 3) 시즌 모델 / 탭 규칙
- 표준 시즌 alias: `season_nn`.
- 레거시 숫자 탭(`7`, `09`)은 alias 매핑으로 호환.
- 현재 운영 시즌은 Script Property `activeSheet`로 결정.
- 시즌 시트는 세션별 탭 분리 방식.

## 4) 회원/출석 스키마 (현행)
- v2 표준 헤더(12개):
  - `Name`, `Season`, `Phone`, `Email`, `Github ID`, `Github Email`, `Notion Email`, `Discord ID`, `Slack Email`, `회비 체크`, `수료 여부`, `운영진 여부`
- 세션 컬럼: `M+` (헤더 패턴 `YYYY-MM-DD-HH:MM` or `YYYY-MM-DD-HH:MM~HH:MM`)
- 식별 슈퍼키: `Phone` only.
- 서버는 헤더 기반 동적 해석(`resolveMemberSchemaFromHeaders`)으로 v1/v2/custom 모두 읽기 가능.

## 5) 기존 출석 페이지/집계 위치
- 관리자 화면: `/Users/sbu/SBU/CloudClubAttendanceSystem/web/admin/index.html` + `/Users/sbu/SBU/CloudClubAttendanceSystem/web/admin/admin.js`
- 학생 화면: `/Users/sbu/SBU/CloudClubAttendanceSystem/web/student/index.html` + `/Users/sbu/SBU/CloudClubAttendanceSystem/web/student/student.js`
- 레거시 fallback: `/Users/sbu/SBU/CloudClubAttendanceSystem/Index.html`, `/Users/sbu/SBU/CloudClubAttendanceSystem/StudentInterface.html`, `/Users/sbu/SBU/CloudClubAttendanceSystem/AdminInterface.html`
- 집계 계산 위치: 서버(`Code.gs`)에서 계산 후 클라이언트 렌더.

## 6) 관리자 기능 접근 제한 (Google OAuth 제외)
- 현재 인증: `verifyAdminKey` -> `adminToken` 발급/검증.
- 관리자 전용 액션은 `adminToken` 필수.
- 업로드/시즌 생성/스키마 감사 액션도 동일 정책 적용.
- OAuth 전환 대비 단일 권한 게이트 역할:
  - 현재 형태: 액션별 `verifyAdminToken` 검사.
  - 목표 추상화: `requireAdmin()`, `requireSeasonAccess(seasonId)` 형태로 치환 가능.

## 7) 업로드 파이프라인 현황 (Mission 1 반영)
- 2단계 반영: 미리보기 -> 확정 업로드.
- 유연 파싱: content-based schema inference + manual mapping.
- 안전 커밋: `seasonImportBegin` -> `seasonImportChunk` -> `seasonImportFinalize` (실패 시 `seasonImportAbort`).
- 메타/스테이징:
  - `_import_meta` (숨김)
  - `_import_<season_alias>_<timestamp>_<rand>` (숨김, finalize 시 시즌 탭으로 rename)
- 중복 기준: phone only.

## 8) 신규 운영 감사 포인트
- `sheetSchemaAudit` API로 시즌별 점검:
  - header map
  - required missing count (name/season/phone/email)
  - phone duplicate
  - session start col / session count
