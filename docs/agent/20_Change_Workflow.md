# Change Workflow

## 먼저 분류할 4가지
1. `web/*` 변경인가
2. `Appsscript/*` 변경인가
3. 문서 / 운영 기준 변경인가
4. GitHub / Google Cloud / Apps Script 콘솔 변경인가

## 빠른 결정 트리
### 1. 화면, 버튼, 렌더링, 프런트 호출 파라미터가 문제인가
- 주로 `web/*`
- 보통 GitHub Pages 배포가 필요합니다.

### 2. 권한, 인증, 응답 코드, 시트 반영, API 계약이 문제인가
- 주로 `Appsscript/*`
- 보통 Apps Script 배포가 필요합니다.

### 3. 새 Apps Script deployment를 만들었거나 `.../exec` URL이 바뀌는가
- Apps Script 배포 + `APPS_SCRIPT_WEB_APP_URL` Secret 갱신 + Pages 재배포가 필요합니다.

### 4. README / Wiki / runbook만 바뀌는가
- 코드 배포는 필요 없고 문서 반영만 하면 됩니다.

### 5. OAuth origin, consent, Script Properties, Secret 값 자체가 문제인가
- 코드보다 외부 콘솔 작업이 먼저입니다.

## 변경 유형별 기본 참조
- 탭 수정: [`docs/Wiki/03_Admin_Tab_Change_Map.md`](../Wiki/03_Admin_Tab_Change_Map.md)
- 권한 / 데이터: [`docs/Wiki/05_Data_And_RBAC_Reference.md`](../Wiki/05_Data_And_RBAC_Reference.md)
- 운영 / 배포 / 복구: [`docs/Wiki/04_Operations_Runbook.md`](../Wiki/04_Operations_Runbook.md)

## 배포 영향 매트릭스
| 변경 대상 | 보통 필요한 반영 |
|---|---|
| `web/*`만 변경 | GitHub Pages 배포 |
| `Appsscript/*`만 변경 | Apps Script 배포 |
| `web/*` + `Appsscript/*` | 둘 다 |
| Apps Script URL 변경 | Apps Script 배포 + Secret 갱신 + Pages 재배포 |
| 문서만 변경 | 배포 없음 |
| OAuth / Script Properties / Secret 값 문제 | 외부 콘솔 수정 우선 |

## 출석현황 탭처럼 영향 범위가 큰 수정
- 프런트: `web/admin/scripts/20_attendance.js`, `web/admin/scripts/21_dashboard.js`
- API: `attendanceDashboardSummary`, `attendanceDashboardDrilldown`, `status`, `ranking`
- 백엔드: `Appsscript/30_attendance_core.gs`, `Appsscript/31_dashboard.gs`
- 정책 문서: [`docs/Wiki/03_Admin_Tab_Change_Map.md`](../Wiki/03_Admin_Tab_Change_Map.md)

## 답변할 때 포함할 기본 문장
- 이 변경이 코드 수정인지, 배포 절차인지, 외부 콘솔 수정인지 먼저 분리합니다.
- 외부 설정이 섞인 문제면 코드 변경과 별도로 사람이 확인해야 하는 콘솔 항목을 같이 적습니다.
