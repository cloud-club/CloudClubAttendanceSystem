# Baseline (Mission 0) - 2026-02-19

> 문서 링크: [docs/History/baseline.md](./baseline.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/baseline.md)

## 빠른 흐름도
```mermaid
flowchart LR
  A["배경"] --> B["핵심 로직"]
  B --> C["적용/운영"]
  C --> D["검증"]
```


## 1) 스택 / 배포
- FE: 정적 웹 (`web/admin`, `web/student`)
- FE 공통 통신: JSONP (`web/shared/api-jsonp.js`)
- BE: Google Apps Script (`Code.gs`)
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
- 관리자 화면: `web/admin/index.html` + `web/admin/admin.js`
- 학생 화면: `web/student/index.html` + `web/student/student.js`
- 레거시 GAS HTML fallback은 제거됨(`Index.html`, `StudentInterface.html`, `AdminInterface.html` 삭제 완료)
- 집계 계산 위치: 서버(`Code.gs`)에서 계산 후 클라이언트 렌더.

## 6) 관리자 기능 접근 제한 (Google OAuth 전환 완료)
- 인증: `authGoogleLogin`(Google ID Token 검증) -> `adminToken` 세션 발급.
- 인가: `_admins` 화이트리스트 + 고정 Super Admin(`cloudclub2022@gmail.com`) + `is_active`.
- 관리자 전용 액션은 `requireAdmin()` 단일 지점으로 강제.
- 시즌 범위 액션은 `requireSeasonAccess()`로 강제(시즌 관리자는 본인 시즌만).
- 비밀번호 기반 `verifyAdminKey`는 `PASSWORD_LOGIN_DISABLED` 응답으로 고정.

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
