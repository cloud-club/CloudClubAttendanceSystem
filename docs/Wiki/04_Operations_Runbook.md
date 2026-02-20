# Operations Runbook

> 문서 링크: [docs/Wiki/04_Operations_Runbook.md](./04_Operations_Runbook.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/04_Operations_Runbook.md)

## 빠른 흐름도
```mermaid
flowchart LR
  A["운영 장애 징후 확인"] --> B["원인 계층 분리(UI/API/Auth/Data)"]
  B --> C["복구 순서 Gate 실행"]
  C --> D["canary/역할별 검증"]
  D --> E["증빙 기록 및 종료"]
```

## 런북 사용 범위
이 런북은 기능 설명 문서가 아니라, 운영 중 실제 장애가 발생했을 때 복구 순서를 고정하기 위한 문서입니다. 특히 인증/배포/권한 문제는 증상이 비슷하게 보이므로, 원인 분리를 먼저 수행해야 복구 시간이 짧아집니다.

적용 대상은 관리자 로그인 실패, API 응답 코드 이상, 배포 반영 불일치, 권한 오판정 등 운영 연속성을 깨는 이슈입니다.

## 왜 복구 순서를 고정하는가
운영 장애는 급할수록 여러 설정을 동시에 건드리기 쉬운데, 이 방식은 원인 추적을 어렵게 만듭니다. 그래서 이 프로젝트는 Gate 방식으로 선행 조건을 통과한 뒤 다음 단계로 넘어가도록 고정합니다.

이 순서를 지키면 “무엇이 효과가 있었는지”를 명확히 기록할 수 있어, 다음 운영진이 같은 장애를 반복하지 않게 됩니다.

## 표준 배포/복구 순서
아래 절차는 정상 배포와 장애 복구에서 공통으로 쓰는 기본 시퀀스입니다.

1. Apps Script Web App 최신 배포와 `.../exec` URL 확인
2. GitHub Secret `APPS_SCRIPT_WEB_APP_URL` 갱신
3. GitHub Pages 워크플로우 재배포
4. 관리자 페이지 하드 리로드 후 `apiInfo`/로그인 canary 확인
5. 역할별 계정(Super/Admin/User) 분기 검증

## 장애 유형별 분기
장애는 관측 코드/메시지 기준으로 분기해야 합니다. 콘솔 경고만 보고 대응하지 말고, API 에러 코드를 기준으로 우선순위를 정합니다.

1. OAuth 설정 계열
- 증상: `invalid_client`, `no registered origin`
- 우선 조치: Google Cloud OAuth Origin/Consent 정합성 확인

2. Apps Script 권한 계열
- 증상: `AUTH_SERVER_SCOPE_MISSING`, `UrlFetchApp.fetch` 권한 오류
- 우선 조치: `__authorizeExternalRequest()` 실행 후 동일 배포 재배포

3. 관리자 등록/활성 계열
- 증상: `AUTH_ADMIN_NOT_REGISTERED`, `AUTH_ADMIN_INACTIVE`
- 우선 조치: `_admins`, 최신 시즌 운영진 데이터, `is_active` 확인

4. 배포 반영 계열
- 증상: 설정은 맞는데 웹 반영이 안 됨
- 우선 조치: Secret 값과 Pages 재배포 이력, 런타임 `env.js` 값 대조

## 운영 점검 우선순위
모든 이슈를 같은 레벨로 처리하면 운영 리소스가 분산됩니다. 아래 우선순위로 대응하면 실제 영향도를 기준으로 의사결정할 수 있습니다.

- P1: 출석 기록 실패, 세션 인식 실패, 대량 사용자 영향
- P2: 인증 권한 오류, URL 불일치, 업로드 finalize 실패
- P3: 표기/UI 불일치, 안내 문구 이슈

## 증빙 기록 템플릿
복구 완료만큼 중요한 것이 기록 품질입니다. 다음 장애에서 재현 가능하도록 최소 항목을 남깁니다.

| 항목 | 필수 내용 | 예시 |
|---|---|---|
| 장애 시각/환경 | 발생 시각, 운영 URL, 계정 유형 | `2026-02-20 18:40`, admin 계정 |
| 관측 코드 | API error code, 브라우저 메시지 | `AUTH_SERVER_SCOPE_MISSING` |
| 수행 조치 | Gate 단계별 실행 내용 | Gate3 승인, Gate4 재배포 |
| 검증 결과 | canary + 역할별 로그인 결과 | Super/Admin 성공, User 거절 |
| 후속 조치 | 재발 방지 항목 | OAuth Origin 점검 체크리스트 갱신 |

## 핵심 참조
- 배포 워크플로우: [/.github/workflows/deploy-gh-pages.yml](../../.github/workflows/deploy-gh-pages.yml) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/.github/workflows/deploy-gh-pages.yml)
- canary 스크립트: [scripts/auth_canary_snapshot.sh](../../scripts/auth_canary_snapshot.sh) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/scripts/auth_canary_snapshot.sh)
- 백엔드: [Code.gs](../../Code.gs) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/Code.gs)

## 관련 문서
- 관리자 가이드: [02_Admin_Side_Guide.md](./02_Admin_Side_Guide.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/02_Admin_Side_Guide.md)
- History 011: [011_배포_Secret_API_URL_주입_트러블슈팅_런북.md](../History/011_배포_Secret_API_URL_주입_트러블슈팅_런북.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/011_%EB%B0%B0%ED%8F%AC_Secret_API_URL_%EC%A3%BC%EC%9E%85_%ED%8A%B8%EB%9F%AC%EB%B8%94%EC%8A%88%ED%8C%85_%EB%9F%B0%EB%B6%81.md)
- History 019: [019_구글인증_권한오류_트러블슈팅_검증_배포_런북_2026-02-20.md](../History/019_구글인증_권한오류_트러블슈팅_검증_배포_런북_2026-02-20.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/019_%EA%B5%AC%EA%B8%80%EC%9D%B8%EC%A6%9D_%EA%B6%8C%ED%95%9C%EC%98%A4%EB%A5%98_%ED%8A%B8%EB%9F%AC%EB%B8%94%EC%8A%88%ED%8C%85_%EA%B2%80%EC%A6%9D_%EB%B0%B0%ED%8F%AC_%EB%9F%B0%EB%B6%81_2026-02-20.md)
