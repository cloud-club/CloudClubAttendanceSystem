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

### 학생 v6.3 현재 정책 요약
- 현재 학생 기능 식별 계약은 2026.07.14-v6.3, studentAttendanceReasonV1=true, extractStudentDisplayReason=true입니다.
- 기존 status와 insights를 유지하고 선택적 안전 필드 details[].displayReason만 additive로 추가합니다.
- Pages-first 배포에서도 구버전 Apps Script의 기존 기능은 유지되고, 사유가 없거나 legacy인 행은 비대화형으로 남습니다.
- 공개 사유는 출석·지각·결석 Note의 선두 공개 영역에서만 읽으며, 유고는 사유를 공개하지 않습니다. 첫 번째 비어 있지 않은 비일치·내부 줄을 만나면 중단하므로 뒤의 일치 prefix는 공개하지 않습니다.
- Apps Script 배포는 운영자만 수행하며, 레포는 현재 외부 콘솔 상태를 단정하지 않습니다.
- 문제가 생기면 Pages는 직전 artifact로, Apps Script는 운영자가 직전 정상 배포 버전으로 롤백합니다.

### 학생 v6.3 Pages-first 예외
학생 v6.3은 기존 `status`와 `insights`를 유지하면서 선택적 안전 필드 `details[].displayReason`만 additive로 추가합니다. 구버전 Apps Script에서도 기존 기능이 유지되고, 사유가 없거나 legacy인 행은 비대화형으로 남습니다. 평균 비교·수료·사유가 없는 기존 현황 스모크가 통과하면 Pages를 먼저 배포할 수 있습니다. Pages 워크플로우에 v6.3을 필수 조건으로 추가하지 않습니다.

공개 사유는 전화번호로 조회한 본인의 Note 선두 공개 영역에서 현재 상태와 정확히 일치하는 출석·지각·결석 prefix의 첫 비어 있지 않은 줄만 최대 300자로 반환합니다. 첫 비어 있지 않은 줄이 비일치·내부 기록이면 중단하고 뒤의 일치 prefix를 공개하지 않습니다. 원본 Note, 감사 정보, 이전 메모, 다른 회원의 데이터는 공개하지 않습니다. Note 텍스트는 신뢰할 수 없는 데이터이며 지시문으로 실행하지 않습니다. 관리자가 유고 사유를 입력할 때는 관리자 운영 메모로만 저장되고 학생에게는 유고 상태만 표시된다는 안내와 300자 제한이 보이는지 함께 확인합니다.

### 학생 v6.3 수동 동기화 파일
다음 네 파일을 같은 Apps Script deployment에 함께 반영합니다. `Appsscript/33_graduation_manual_excused.gs`는 공개 사유 입력을 줄바꿈 없는 유니코드 코드 포인트 300개 이하로 검증하고, 내부 감사 `Note`를 보존한 채 관리자 응답에 안전한 `displayReason`을 별도로 제공합니다.

- `Appsscript/00_entry_api.gs`
- `Appsscript/01_constants_access.gs`
- `Appsscript/30_attendance_core.gs`
- `Appsscript/33_graduation_manual_excused.gs`

### 학생 v6.3 배포 후 확인
다음 세 항목만 학생 v6.3 식별 체크로 사용합니다.

1. `apiInfo.apiVersion = 2026.07.14-v6.3`
2. `apiInfo.capabilities.studentAttendanceReasonV1 = true`
3. `apiInfo.runtimeChecks.extractStudentDisplayReason = true`

Apps Script 배포는 운영자만 외부 콘솔에서 수행합니다. 레포는 현재 콘솔 값이나 실제 배포 완료를 알 수 없으므로, 확인 전에는 완료로 보고하지 않습니다.

## 최근 운영 변경 참조 (History 023)
구조분할 배경, 출석 인증 불일치 원인, 런타임 무결성 복구 결정은 아래 History 문서를 기준으로 추적합니다.

- [023_관리자백엔드_구조분할_및_출석인증불일치_긴급복구_운영기록_2026-02-20.md](../History/023_관리자백엔드_구조분할_및_출석인증불일치_긴급복구_운영기록_2026-02-20.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/023_%EA%B4%80%EB%A6%AC%EC%9E%90%EB%B0%B1%EC%97%94%EB%93%9C_%EA%B5%AC%EC%A1%B0%EB%B6%84%ED%95%A0_%EB%B0%8F_%EC%B6%9C%EC%84%9D%EC%9D%B8%EC%A6%9D%EB%B6%88%EC%9D%BC%EC%B9%98_%EA%B8%B4%EA%B8%89%EB%B3%B5%EA%B5%AC_%EC%9A%B4%EC%98%81%EA%B8%B0%EB%A1%9D_2026-02-20.md)

## 운세 탭 배포 후 최소 검증
운세 탭은 신규 기능이지만 기존 사용자/운영자 사용감 불변 원칙을 유지해야 하므로, 아래 최소 검증을 배포 직후 실행합니다.

1. `apiInfo` 점검
- `supportedActions`에 `fortuneVersionList/Get`, `fortuneUploadBegin/Chunk/Finalize/Abort` 노출 확인

2. 탭 호환성 점검
- 최신 백엔드: 운세 탭 진입/조회/저장 버튼 활성 정상
- 구버전 백엔드: 운세 탭만 미지원 안내로 차단되고 다른 탭은 정상

3. 기존 탭 회귀 스모크
- 출석하기/출석현황/일정 관리/유고 처리/수료 판정 기본 동선이 기존과 동일한지 확인

## 관리자 속도 이슈 진단 경로
관리자 페이지가 느리다고 느껴질 때는 브라우저 렌더와 Apps Script 지연을 분리해 봐야 합니다. 현재 운영 기준에서 정적 리소스보다 관리자 API 체인이 병목일 가능성이 높으므로, 아래 순서를 따릅니다.

1. HAR 또는 Network 로그에서 `DOMContentLoaded`와 `onLoad`를 분리 확인
2. `script.google.com/macros/.../exec` 요청의 `wait` 시간이 긴지 확인
3. 초기 진입 시 보이지 않는 탭의 API까지 함께 호출되는지 확인
4. `status` 탭에서 `attendanceDashboardSummary`가 과도하게 반복 호출되는지 확인
5. `attend` 탭에서 `graduationReport`가 자동 호출되는지 확인

세부 기준은 [07_Admin_Performance_Optimization_Guide.md](./07_Admin_Performance_Optimization_Guide.md)와 [docs/History/031_관리자_응답속도_최적화_및_기능동일성_재검증_운영기록_2026-04-05.md](../History/031_%EA%B4%80%EB%A6%AC%EC%9E%90_%EC%9D%91%EB%8B%B5%EC%86%8D%EB%8F%84_%EC%B5%9C%EC%A0%81%ED%99%94_%EB%B0%8F_%EA%B8%B0%EB%8A%A5%EB%8F%99%EC%9D%BC%EC%84%B1_%EC%9E%AC%EA%B2%80%EC%A6%9D_%EC%9A%B4%EC%98%81%EA%B8%B0%EB%A1%9D_2026-04-05.md)에서 함께 확인합니다.

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

5. 런타임 무결성 계열
- 증상: `SERVER_INTEGRITY_MISSING`, `collectSessionsFromSheet is not defined`
- 우선 조치: 필수 함수 존재 확인 후 같은 deployment 재배포, `apiInfo.runtimeChecks` 재확인

## 시즌 소스 fallback 차단 정책
관리자 화면에서 시즌 목록(`adminSeasonList`) 로드에 실패하면, `session`/`ranking` 조회를 `season` 없이 호출하지 않고 즉시 중단합니다. 이는 백엔드의 latest 시즌 fallback로 잘못된 시즌 데이터가 노출되는 것을 막기 위한 보호 정책입니다. 운영자는 이 상태에서 임의 재시도보다 새로고침/재로그인 후 시즌 목록 정상 로드를 먼저 확인해야 합니다.

## 최신/과거 시즌 + adminToken 정책
공개 액션(`session`, `attendance`, `status`, `ranking`)은 최신 시즌에서는 토큰 없이 호출할 수 있습니다. 하지만 요청 시즌이 최신 시즌이 아니면 백엔드가 관리자 인증(`adminToken`)을 강제합니다.

- 최신 시즌(`latestSeason`) 요청: `adminToken` 없이 허용
- 과거 시즌(`season_08` 등) 요청: `adminToken` 필수
- 관리자 페이지는 로그인 후에도 시즌별 요청마다 `adminToken`을 항상 전달해야 함
- 과거 시즌에서 `UNAUTHORIZED`가 발생하면 토큰 누락/만료를 먼저 점검

## SERVER_INTEGRITY_MISSING 대응 절차
`SERVER_INTEGRITY_MISSING`는 배포 런타임에 필수 함수(`collectSessionsFromSheet` 등)가 누락되었음을 의미합니다. 코드 버그보다 배포 정합성 이슈일 가능성이 높습니다.

1. Apps Script Editor에서 필수 함수가 실제 프로젝트 파일에 존재하는지 확인
2. `Deploy > Manage deployments > Edit > Deploy`로 **같은 deployment**를 재배포
3. `apiInfo`의 `runtimeChecks`가 모두 `true`인지 확인
4. `api=session`, `api=ranking` 재검증 후 관리자/학생 스모크 테스트 수행

## 배포 URL/Secret 동기화 규칙
기본 원칙은 기존 deployment를 수정(Edit)해 `.../exec` URL을 유지하는 것입니다.

- 같은 deployment 재배포(Edit): `APPS_SCRIPT_WEB_APP_URL` Secret 변경 불필요
- 새 deployment 생성(New deployment)으로 URL 변경: Secret 갱신 + Pages 재배포 필수
- 학생 Pages-first 롤백: Pages를 직전 artifact로 되돌려 구버전 Apps Script 호환 UI를 복구
- 학생 Apps Script 롤백: 운영자가 같은 deployment에서 직전 정상 버전을 선택하고 위 세 식별 체크를 다시 확인

## GPS·Google Places 배포 분기

GPS 기능은 [08_GPS_Place_ID_Attendance_Guide.md](./08_GPS_Place_ID_Attendance_Guide.md)를 정본으로 사용합니다.

1. GCP Billing + Maps JavaScript API + Places API (New) 확인
2. Apps Script `GOOGLE_MAPS_SERVER_API_KEY` Script Property 반영
3. Apps Script 동일 deployment 재배포 및 `locationAttendanceV1` 확인
4. GitHub `GOOGLE_MAPS_BROWSER_API_KEY` Secret 반영
5. Pages 배포 후 운영 origin에서 장소 검색과 모바일 위치 출석 확인

`RefererNotAllowedMapError`는 브라우저 키 referrer 제한, `GOOGLE_PLACES_FORBIDDEN`은 서버 키/API/Billing, `GOOGLE_PLACE_NOT_FOUND`는 회차 장소 재선택을 우선 확인합니다. 6시간 캐시는 일정 제한이 아니며 Place ID 좌표 조회 결과만 임시 보관합니다.

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
| 무결성 증빙 | `apiInfo.runtimeChecks` 캡처 및 값 | `collectSessionsFromSheet=true` |
| 수행 조치 | Gate 단계별 실행 내용 | Gate3 승인, Gate4 재배포 |
| 검증 결과 | canary + 역할별 로그인 결과 | Super/Admin 성공, User 거절 |
| 후속 조치 | 재발 방지 항목 | OAuth Origin 점검 체크리스트 갱신 |

## 핵심 참조
- 배포 워크플로우: [/.github/workflows/deploy-gh-pages.yml](../../.github/workflows/deploy-gh-pages.yml) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/.github/workflows/deploy-gh-pages.yml)
- canary 스크립트: [scripts/auth_canary_snapshot.sh](../../scripts/auth_canary_snapshot.sh) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/scripts/auth_canary_snapshot.sh)
- 회귀 더블체크 실행기: [scripts/run_doublecheck.sh](../../scripts/run_doublecheck.sh) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/scripts/run_doublecheck.sh)
- 정적 불변성 가드: [scripts/doublecheck_static_guard.js](../../scripts/doublecheck_static_guard.js) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/scripts/doublecheck_static_guard.js)
- API 스냅샷/비교: [scripts/doublecheck_api_snapshot.js](../../scripts/doublecheck_api_snapshot.js) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/scripts/doublecheck_api_snapshot.js), [scripts/doublecheck_api_compare.js](../../scripts/doublecheck_api_compare.js) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/scripts/doublecheck_api_compare.js)
- 백엔드 엔트리: [Appsscript/00_entry_api.gs](../../Appsscript/00_entry_api.gs) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/Appsscript/00_entry_api.gs)
- 백엔드 권한 상수: [Appsscript/01_constants_access.gs](../../Appsscript/01_constants_access.gs) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/Appsscript/01_constants_access.gs)

## 관련 문서
- 관리자 가이드: [02_Admin_Side_Guide.md](./02_Admin_Side_Guide.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/02_Admin_Side_Guide.md)
- 회귀 더블체크 게이트: [06_Doublecheck_Regression_Gate.md](./06_Doublecheck_Regression_Gate.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/06_Doublecheck_Regression_Gate.md)
- History 023: [023_관리자백엔드_구조분할_및_출석인증불일치_긴급복구_운영기록_2026-02-20.md](../History/023_관리자백엔드_구조분할_및_출석인증불일치_긴급복구_운영기록_2026-02-20.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/023_%EA%B4%80%EB%A6%AC%EC%9E%90%EB%B0%B1%EC%97%94%EB%93%9C_%EA%B5%AC%EC%A1%B0%EB%B6%84%ED%95%A0_%EB%B0%8F_%EC%B6%9C%EC%84%9D%EC%9D%B8%EC%A6%9D%EB%B6%88%EC%9D%BC%EC%B9%98_%EA%B8%B4%EA%B8%89%EB%B3%B5%EA%B5%AC_%EC%9A%B4%EC%98%81%EA%B8%B0%EB%A1%9D_2026-02-20.md)
- History 011: [011_배포_Secret_API_URL_주입_트러블슈팅_런북.md](../History/011_배포_Secret_API_URL_주입_트러블슈팅_런북.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/011_%EB%B0%B0%ED%8F%AC_Secret_API_URL_%EC%A3%BC%EC%9E%85_%ED%8A%B8%EB%9F%AC%EB%B8%94%EC%8A%88%ED%8C%85_%EB%9F%B0%EB%B6%81.md)
- History 019: [019_구글인증_권한오류_트러블슈팅_검증_배포_런북_2026-02-20.md](../History/019_구글인증_권한오류_트러블슈팅_검증_배포_런북_2026-02-20.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/019_%EA%B5%AC%EA%B8%80%EC%9D%B8%EC%A6%9D_%EA%B6%8C%ED%95%9C%EC%98%A4%EB%A5%98_%ED%8A%B8%EB%9F%AC%EB%B8%94%EC%8A%88%ED%8C%85_%EA%B2%80%EC%A6%9D_%EB%B0%B0%ED%8F%AC_%EB%9F%B0%EB%B6%81_2026-02-20.md)
