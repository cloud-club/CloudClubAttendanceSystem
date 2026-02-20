# Operations Runbook

> 문서 링크: [docs/Wiki/04_Operations_Runbook.md](./04_Operations_Runbook.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/04_Operations_Runbook.md)

## 빠른 흐름도
```mermaid
flowchart LR
  A["운영 변경 발생"] --> B["Apps Script 배포 확인"]
  B --> C["GitHub Secret/Pages 재배포"]
  C --> D["canary/health 검증"]
  D --> E["계정별 권한 검증"]
  E --> F["증빙 저장"]
```

## 1. 표준 배포 순서
1. Apps Script Web App 최신 버전 배포(`.../exec` 확인).
2. GitHub Secret `APPS_SCRIPT_WEB_APP_URL` 갱신.
3. GitHub Pages 배포 워크플로우 실행.
4. 관리자 페이지 하드 리로드 후 `apiInfo`/로그인 canary 확인.

## 2. 인증 장애 기본 복구
1. OAuth Origin/Consent 확인.
2. Apps Script 배포 실행 주체(`Execute as Me`) 및 접근권한 확인.
3. `__authorizeExternalRequest()` 실행 후 동일 배포 재배포.
4. `scripts/auth_canary_snapshot.sh`로 `AUTH_SERVER_SCOPE_MISSING` 미발생 확인.

## 3. 운영 점검 우선순위
- P1: 출석 기록 실패, phone 중복, 세션 인식 실패
- P2: 인증 권한 오류, URL 불일치, 업로드 finalize 실패
- P3: 표기/UI 불일치

## 4. 핵심 참조
- 워크플로우: [/.github/workflows/deploy-gh-pages.yml](../../.github/workflows/deploy-gh-pages.yml) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/.github/workflows/deploy-gh-pages.yml)
- canary 스크립트: [scripts/auth_canary_snapshot.sh](../../scripts/auth_canary_snapshot.sh) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/scripts/auth_canary_snapshot.sh)
- 백엔드: [Code.gs](../../Code.gs) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/Code.gs)

## 관련 문서
- History 011: [011_배포_Secret_API_URL_주입_트러블슈팅_런북.md](../History/011_배포_Secret_API_URL_주입_트러블슈팅_런북.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/011_%EB%B0%B0%ED%8F%AC_Secret_API_URL_%EC%A3%BC%EC%9E%85_%ED%8A%B8%EB%9F%AC%EB%B8%94%EC%8A%88%ED%8C%85_%EB%9F%B0%EB%B6%81.md)
- History 019: [019_구글인증_권한오류_트러블슈팅_검증_배포_런북_2026-02-20.md](../History/019_구글인증_권한오류_트러블슈팅_검증_배포_런북_2026-02-20.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/019_%EA%B5%AC%EA%B8%80%EC%9D%B8%EC%A6%9D_%EA%B6%8C%ED%95%9C%EC%98%A4%EB%A5%98_%ED%8A%B8%EB%9F%AC%EB%B8%94%EC%8A%88%ED%8C%85_%EA%B2%80%EC%A6%9D_%EB%B0%B0%ED%8F%AC_%EB%9F%B0%EB%B6%81_2026-02-20.md)
