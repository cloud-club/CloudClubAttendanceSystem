# Secrets, Auth, And External Consoles

## 이 문서의 목적
레포만으로 답할 수 있는 사실과, 사람이 외부 콘솔에서 직접 확인해야 하는 값을 분리합니다.

## GitHub 쪽에서 확인할 것
### Secret
- 이름: `APPS_SCRIPT_WEB_APP_URL`
- 위치: `GitHub Repo > Settings > Secrets and variables > Actions`
- 역할: Pages 배포 산출물의 API 기준 URL

### Workflow
- 파일: [`/.github/workflows/deploy-gh-pages.yml`](../../.github/workflows/deploy-gh-pages.yml)
- 역할:
  - Secret 형식 검증
  - `web/shared/env.js`에 URL 주입
  - `apiInfo` health check
  - `authGoogleLogin(dummy)` canary

## Apps Script 쪽에서 확인할 것
### Script Properties
- 위치: `Project Settings > Script Properties`
- 주요 키:
  - `FRONTEND_ADMIN_BASE_URL`
  - `FRONTEND_STUDENT_BASE_URL`
  - `GOOGLE_OAUTH_CLIENT_ID`

### Deployment
- 위치: `Deploy > Manage deployments`
- 확인 포인트:
  - 운영 deployment가 맞는지
  - `Execute as: Me`
  - `Who has access: Anyone`
  - URL이 기존 `.../exec`와 같은지

## Google Cloud 쪽에서 확인할 것
### OAuth 2.0 Client
- 위치: `Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client ID (Web)`
- 확인 포인트:
  - `Authorized JavaScript origins`
  - 운영 origin이 실제 관리자 페이지 origin과 일치하는지

### Consent Screen
- 위치: `Google Cloud Console > APIs & Services > OAuth consent screen`
- 확인 포인트:
  - Publishing 상태
  - 테스트 모드라면 운영 계정이 test users에 포함돼 있는지

## 레포가 직접 보여주는 코드 지점
- Secret 주입 결과 반영: [`web/shared/env.js`](../../web/shared/env.js)
- 배포 기본값 예시: [`web/shared/config.example.js`](../../web/shared/config.example.js)
- OAuth clientId 사용: [`Appsscript/10_auth_admin.gs`](../../Appsscript/10_auth_admin.gs)

## 에이전트가 절대 추정하면 안 되는 것
- 현재 Secret 값
- 현재 Google Cloud origin 값
- 현재 Script Properties 실제 저장값
- 현재 운영 deployment가 어느 버전인지

## 이런 질문에는 이 문서를 먼저 본다
- `GitHub Secret과 Google OAuth 설정 위치를 요약해줘.`
- `이 문제에서 사람이 직접 확인해야 하는 외부 설정은 뭐야?`
- `왜 레포를 다 봐도 로그인 문제 원인이 안 보이지?`
