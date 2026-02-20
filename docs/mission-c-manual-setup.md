# Mission C 수동 설정 가이드

## 1) Google 쪽에서 해야 할 것 (Sheets + Apps Script)

### 1-1. 최신 시즌 시트 데이터 준비 (Google Sheets)
최신 시즌 탭에서 아래를 지켜야 자동 권한이 동작합니다.

1. 시트명은 `season_nn` 형식 권장 (예: `season_09`)
2. 컬럼에 `Email`, `운영진 여부`가 있어야 함
3. 운영진으로 열어줄 사람은:
- `운영진 여부 = TRUE`
- `Email = gmail 계정` (`@gmail.com` 또는 `@googlemail.com`)

권한 회수는 최신 시즌 시트에서 해당 사람 `운영진 여부 = FALSE`로 바꾸면 됩니다.  
(다음 동기화 시 `_admins.is_active=false` 처리)

### 1-2. Apps Script Script Properties 설정
경로: 스프레드시트 > `확장 프로그램 > Apps Script` > `Project Settings` > `Script properties`

아래 3개 키 필수:

1. `GOOGLE_OAUTH_CLIENT_ID`
2. `FRONTEND_ADMIN_BASE_URL`
- 예: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/admin/`
3. `FRONTEND_STUDENT_BASE_URL`
- 예: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/student/`

### 1-3. Apps Script 재배포
경로: Apps Script > `Deploy > Manage deployments > Edit(또는 New) > Deploy`

설정:
1. `Execute as`: Me
2. `Who has access`: Anyone

배포 후 `.../exec` URL 복사해둡니다. (GitHub Secret에 넣을 값)

### 1-3-1. 운영 배포 대상 고정 (필수)
`AUTH_SERVER_SCOPE_MISSING`은 대부분 OAuth origin 문제가 아니라, 운영 배포의 실행 주체/권한 승인 불일치에서 발생합니다.

확인 순서:
1. 운영 `env.js`의 `API_BASE_URL`이 가리키는 `.../exec` URL을 확인
2. Apps Script `Deploy > Manage deployments`에서 **동일 URL의 배포**를 선택
3. 해당 배포 설정이 아래와 같은지 확인
- `다음 사용자 인증 정보로 실행`: `나(cloudclub2022@gmail.com)`
- `액세스 권한이 있는 사용자`: `모든 사용자`
4. 유사 배포가 여러 개면 운영에서 쓰지 않는 배포는 보관처리해 혼선을 제거

### 1-3-2. UrlFetchApp 권한 승인 강제 복구 (필수)
Google ID token 검증은 서버에서 `UrlFetchApp.fetch`를 사용하므로 `script.external_request` 권한이 필요합니다.

- 필요한 권한: `https://www.googleapis.com/auth/script.external_request`
- 대표 증상: 로그인 직후 `AUTH_SERVER_SCOPE_MISSING` 또는 `UrlFetchApp.fetch 권한 없음`

권장 복구 순서(기본 경로):
1. 배포 소유자 계정(`cloudclub2022@gmail.com`)으로 Apps Script 편집기 접속
2. 아래 임시 함수를 추가하고 1회 실행
```javascript
function __authorizeExternalRequest() {
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=dummy', {
    muteHttpExceptions: true
  });
}
```
3. 권한 승인 팝업이 뜨면 모두 승인
4. 같은 배포에서 `Deploy > Manage deployments > Edit > Deploy` 재배포
5. 임시 함수는 승인 후 삭제 가능

manifest 관련 기본 원칙:
1. `appsscript.json`에 `oauthScopes`가 없어도(자동 스코프) 위 승인 절차로 우선 복구합니다.
2. 위 절차 실패 시에만 `oauthScopes` 명시 모드로 전환합니다.
3. 명시 모드 전환 시에는 `script.external_request` 단독 추가가 아니라 전체 필요 스코프 목록 기반으로 반영합니다.

### 1-3-3. 서버 canary 게이트 (UI 테스트 전 필수)
아래 canary가 통과하기 전에는 Super/Admin/User 계정 테스트를 진행하지 않습니다.

- 호출:
`https://<exec-url>?api=authGoogleLogin&idToken=dummy&callback=cb&_={timestamp}`
- 통과 기준:
1. `AUTH_SERVER_SCOPE_MISSING`가 아니어야 함
2. 기대 코드는 `AUTH_ID_TOKEN_VERIFY_FAILED` 또는 `AUTH_ID_TOKEN_PAYLOAD_INVALID`

기준점 스냅샷 권장:
1. `authGoogleConfig` 응답
2. `authGoogleLogin(dummy)` 응답
3. 운영 `env.js`의 `API_BASE_URL`

위 3개를 캡처/텍스트로 남겨두면 재발 시 원인 분리가 빠릅니다.

로컬 스크립트 사용(권장):
```bash
/Users/sbu/SBU/CloudClubAttendanceSystem/scripts/auth_canary_snapshot.sh "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec"
```

### 1-4. Google OAuth Client 생성(필수)
경로: [Google Cloud Console](https://console.cloud.google.com/)  
`APIs & Services > Credentials > Create Credentials > OAuth client ID > Web application`

필수:
1. `Authorized JavaScript origins`에 관리자 페이지 도메인 추가  
- `https://cloud-club.github.io`  
(커스텀 도메인 쓰면 그것도 추가)

또한 `OAuth consent screen`이 Testing이면 로그인할 계정을 `Test users`에 넣어야 합니다.

---

## 2) GitHub에서 해야 할 것

경로: GitHub Repo > `Settings > Secrets and variables > Actions`

1. Secret `APPS_SCRIPT_WEB_APP_URL` 설정
- 값: 위 Apps Script `.../exec` URL

2. 배포 실행
- `Actions > Deploy GitHub Pages > Run workflow`  
또는 `gh-pages` 브랜치 push

3. 확인
- 관리자: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/admin/`
- 학생: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/student/`

---

## 3) Google 로그인 팝업/인증 동작

### 팝업이 자동으로 뜨는지?
- **아니요. 자동 팝업 아님**
- 관리자 페이지 진입 시 로그인 게이트만 보이고,
- 사용자가 **Google 로그인 버튼 클릭** 시 팝업이 뜹니다.

### 서버 인증 흐름
1. 프런트에서 Google ID 토큰 획득
2. 서버에서 토큰 검증(`aud/iss/exp/email_verified`)
3. 서버가 최신 시즌 운영진 동기화 실행
- 최신 시즌 `운영진 TRUE + Gmail`이면 `_admins`에 자동 반영
- 최신 시즌에 없으면 기존 `season_admin`은 자동 비활성화
- 수동 비활성(`is_active=false`)은 자동 복구하지 않음
4. 최종적으로 `_admins` + Super 정책 확인 후 세션 발급
5. 이후 관리자 API는 세션 검증 + 주기 동기화로 계속 재검증

### 로그인 실패 주요 원인
1. 최신 시즌에서 `운영진 여부`가 TRUE가 아님
2. Email이 Gmail 형식이 아님
3. OAuth consent가 Testing인데 계정이 Test users에 없음
4. OAuth Client ID origin 설정이 GitHub Pages 도메인과 불일치
5. 브라우저 팝업 차단
6. Apps Script Web App이 `script.external_request` 권한 승인 없이 배포됨 (재배포+승인 필요)
7. 운영 `exec` URL과 Apps Script에서 확인한 배포가 서로 다른 배포를 가리킴

### 참고 로그 분류
- `Cross-Origin-Opener-Policy policy would block the window.postMessage call.` 경고는 GIS/브라우저 환경에서 자주 보이는 참고 로그입니다.
- 관리자 로그인 실패 판정은 API 에러 코드(`AUTH_SERVER_SCOPE_MISSING`, `AUTH_ADMIN_*`, `AUTH_ID_TOKEN_*`)를 기준으로 판단합니다.
