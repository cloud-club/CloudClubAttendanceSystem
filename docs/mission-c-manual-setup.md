# Mission C 수동 설정 가이드 (10분 Quick Start)

상세 배경/분기/증상 해석은 `/Users/sbu/SBU/CloudClubAttendanceSystem/docs/019_구글인증_권한오류_트러블슈팅_검증_배포_런북_2026-02-20.md`를 기준으로 합니다.

## 0) 언제 이 문서를 쓰는가
아래 중 하나면 이 문서 순서대로 즉시 실행합니다.

1. 관리자 로그인에서 `AUTH_SERVER_SCOPE_MISSING` 발생
2. `UrlFetchApp.fetch` 권한 오류 발생
3. 배포/Secret 변경 후 로그인 동작이 일관되지 않음

## 1) Apps Script 운영 배포 고정
경로: `Deploy > Manage deployments`

1. 운영 `exec` URL과 동일한 deployment를 선택합니다.
2. `Execute as: Me(cloudclub2022@gmail.com)` 확인
3. `Who has access: Anyone` 확인

왜 필요한가:
- 잘못된 deployment를 수정하면 운영 장애가 그대로 남습니다.

## 2) UrlFetch 권한 승인 트리거 실행 (debug helper)
경로: Apps Script Editor > `Code.gs`

1. `__authorizeExternalRequest()`를 1회 실행합니다.
2. 권한 승인 팝업을 완료합니다.

왜 필요한가:
- Google ID token 검증(`UrlFetchApp.fetch`) 권한(`script.external_request`)을 런타임에 승인하기 위한 단계입니다.

주의:
- 이 함수는 복구용 debug helper입니다.
- 함수 실행 후 반드시 다음 단계(재배포)를 수행해야 반영됩니다.

## 3) 같은 deployment 재배포
경로: `Deploy > Manage deployments > Edit > Deploy`

1. 1)에서 확인한 같은 deployment를 재배포합니다.

왜 필요한가:
- 승인된 권한 상태를 운영 deployment에 반영하기 위해 필요합니다.

## 4) GitHub Secret 갱신 + Pages 배포
경로: GitHub Repo > `Settings > Secrets and variables > Actions`

1. `APPS_SCRIPT_WEB_APP_URL`를 최신 `.../exec`로 저장합니다.
2. `Actions > Deploy GitHub Pages > Run workflow` 실행

왜 필요한가:
- Secret 변경만으로는 운영 웹 산출물(`env.js`)이 갱신되지 않습니다.

## 5) Canary로 서버 상태 선검증 (UI 전)
로컬 실행:
```bash
/Users/sbu/SBU/CloudClubAttendanceSystem/scripts/auth_canary_snapshot.sh "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec"
```

통과 기준:
1. `AUTH_SERVER_SCOPE_MISSING`가 아님
2. `AUTH_ID_TOKEN_VERIFY_FAILED` 또는 `AUTH_ID_TOKEN_PAYLOAD_INVALID`

왜 필요한가:
- UI 증상 전에 백엔드 인증 경로가 정상 단계까지 도달했는지 확인합니다.

## 6) 계정별 최종 확인
1. SuperAdmin: 로그인/관리자 진입 성공
2. 등록 Admin: 로그인 성공 + 시즌 권한 제한
3. 일반 User: 로그인 후 권한 거절(`AUTH_ADMIN_NOT_REGISTERED`)

참고:
- `Cross-Origin-Opener-Policy ... postMessage` 로그는 GIS 환경에서 발생 가능한 참고 경고이며, 실패 판정은 API 코드 기준으로 합니다.

## 7) 문제 지속 시
- Gate 기반 상세 분기, 증빙, 롤백 절차는 019 런북을 따릅니다.
- `/Users/sbu/SBU/CloudClubAttendanceSystem/docs/019_구글인증_권한오류_트러블슈팅_검증_배포_런북_2026-02-20.md`
