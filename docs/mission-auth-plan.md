# Mission Auth Plan - Google OAuth 관리자 전용 전환 (v1)

## 1) 목표
- 일반 출석 사용자는 기존 전화번호 출석 흐름 유지.
- 관리자 페이지는 Google OAuth + 관리자 Gmail 화이트리스트로만 접근.
- 인증 없는 관리자 API 데이터 조회를 서버에서 차단.
- Super Admin(`cloudclub2022@gmail.com`) 정책 고정.
- Super Admin 전용 관리자 CRUD(`_admins`) 제공.
- 시즌 권한 가드(시즌 관리자는 본인 시즌만) 서버 강제.
- 최신 시즌 시트의 `운영진 여부=TRUE` + Gmail 계정을 `season_admin`으로 자동 동기화.

## 2) 범위
- `/Users/sbu/SBU/CloudClubAttendanceSystem/Code.gs`
- `/Users/sbu/SBU/CloudClubAttendanceSystem/web/admin/index.html`
- `/Users/sbu/SBU/CloudClubAttendanceSystem/web/admin/admin.js`
- `/Users/sbu/SBU/CloudClubAttendanceSystem/web/shared/api-jsonp.js`
- 운영 문서/체크리스트 갱신

## 3) 비범위
- 학생 출석 공개 API(`session`, `attendance`, `status`, `ranking`) 인증 모델 변경
- 외부 인프라(Cloudflare Access/BFF/WAF) 추가

## 4) 인증/인가 설계
- AuthN: Google Identity Services -> `idToken` -> `authGoogleLogin`
- AuthZ: `email` 기준 `_admins` 조회 -> `role`/`season` 컨텍스트 생성
- 고정 정책: `cloudclub2022@gmail.com`은 항상 `super`
- 자동 동기화 정책:
  - 최신 시즌 운영진 TRUE + Gmail -> `season_admin` 자동 반영
  - 최신 시즌 운영진 목록에 없는 `season_admin` -> `is_active=false` 자동 해제
  - 수동 비활성(`is_active=false`)은 자동 복구하지 않음
- 단일 가드:
  - `requireAdmin(params)`
  - `requireSuperAdmin(ctx)`
  - `requireSeasonAccess(ctx, season)`

## 5) 데이터 모델
- 숨김 시트: `_admins`
- 컬럼: `name`, `season`, `phone`, `email`, `role`, `is_active`, `created_at`, `updated_at`
- 규칙:
  - email lower-case unique 정책
  - Gmail 도메인만 허용(`@gmail.com`, `@googlemail.com`)
  - 비활성 계정은 로그인/API 접근 차단

## 6) API 계약
신규:
- `authGoogleConfig`
- `authGoogleLogin`
- `authSession`
- `authLogout`
- `adminSeasonList`
- `adminUsersList`
- `adminUsersUpsert`
- `adminUsersDelete`

변경:
- `verifyAdminKey` -> `PASSWORD_LOGIN_DISABLED`
- 관리자 API는 `requireAdmin`/`requireSeasonAccess`/`requireSuperAdmin` 경유

에러 코드:
- `UNAUTHORIZED`, `FORBIDDEN`, `FORBIDDEN_SEASON`, `PASSWORD_LOGIN_DISABLED`, `CONFLICT_EMAIL`

## 7) 프런트 정책
- 인증 전: 로그인 게이트만 표시(`adminApp` 숨김)
- 인증 후: role 기반 탭 노출
  - `season_admin`: 시즌 범위 기능만
  - `super`: 전체 + 관리자 CRUD
- 세션 만료/로그아웃: 즉시 게이트 복귀

## 8) 레거시 정리
삭제:
- `/Users/sbu/SBU/CloudClubAttendanceSystem/AdminInterface.html`
- `/Users/sbu/SBU/CloudClubAttendanceSystem/StudentInterface.html`
- `/Users/sbu/SBU/CloudClubAttendanceSystem/Index.html`

정리:
- `Code.gs` fallback HTML 렌더 제거
- `generateStudentQRCodeUrl`, `getAdminAccessUrl`의 legacy `mode` URL fallback 제거

## 9) 배포/운영 체크
Script Properties:
- `GOOGLE_OAUTH_CLIENT_ID`
- `FRONTEND_ADMIN_BASE_URL`
- `FRONTEND_STUDENT_BASE_URL`

운영 순서:
1. `_admins` 초기 데이터 입력
2. Apps Script 배포
3. GitHub Pages 배포
4. OAuth 로그인/권한 스모크 테스트

## 10) 최소 검증
1. 미등록 Gmail 차단
2. 비활성 관리자 차단
3. 시즌 관리자의 타 시즌 접근 403
4. Super Admin 전체 접근 + 관리자 CRUD
5. 인증 없는 관리자 API 호출 `UNAUTHORIZED`
6. 로그아웃/만료 후 차단
7. 레거시 URL 404, `/web/*` 정상
