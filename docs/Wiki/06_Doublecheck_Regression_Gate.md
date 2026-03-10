# Doublecheck Regression Gate

> 문서 링크: [docs/Wiki/06_Doublecheck_Regression_Gate.md](./06_Doublecheck_Regression_Gate.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/06_Doublecheck_Regression_Gate.md)

## 목적
운세 기능 추가 이후 문서로 시작했지만, 현재는 **기존 사용자(학생)와 운영자(Admin/Super)의 체감 사용감이 변하지 않았음을 배포 전/후에 증빙하는 공통 실행 문서**입니다.
핵심 원칙은 **공개 API 불변과 시즌업데이트 리스크 분리**입니다.
이 문서는 아래 게이트 순서만 따릅니다.

1. 정적 영향 분석(static guard)
2. API 계약 baseline/candidate 비교
3. 역할별 UX 스모크
4. 구버전 백엔드 호환성 확인
5. 성능/운영 canary 확인

## 범위 선언(중요)
- 이 문서의 게이트는 공개 API 계약/기존 UX 불변 증빙을 위한 절차입니다.
- 시즌 import(update) 경로 검증은 별도 리스크 트랙이며, 이 문서 통과만으로 안전성을 대체할 수 없습니다.
- 시즌 update 리스크는 [05_Data_And_RBAC_Reference.md](./05_Data_And_RBAC_Reference.md)의 `sheetSchemaAudit` + `seasonImport*` 기준으로 분리 점검합니다.

## Gate 0: 사전 고정(Baseline Freeze)
배포 전 아래 값을 고정하고 증빙 파일에 기록합니다.

| 항목 | 값 |
|---|---|
| Baseline Apps Script URL | |
| Candidate Apps Script URL | |
| Baseline GitHub Pages URL | |
| Candidate GitHub Pages URL | |
| 테스트 시즌 alias | |
| 학생 전화번호(정상) | |
| 학생 전화번호(미등록/경계) | |
| season_admin 계정 | |
| super 계정 | |
| 측정 일시(UTC) | |

증빙 저장 경로 권장:
- `.artifacts/doublecheck-YYYYMMDD-HHMMSS/`

## Gate 1: 정적 영향 분석(자동)
변경 파일의 불변성 가드를 실행합니다.

```bash
node /Users/sbu/SBU/CloudClubAttendanceSystem/scripts/doublecheck_static_guard.js
```

검증 항목:
1. 기존 API 라우터 핵심 case 경로 존재
2. `SUPER_ONLY_TABS` 불변(`variables`, `seasonImport`, `adminUsers`)
3. 운세 탭 삽입 위치/스크립트 로딩/핸들러 연결
4. `ACTION_ACCESS_LEVELS` fortune 액션이 admin 레벨
5. 학생 운세 escape 적용
6. 핵심 수정 파일 문법 체크

### 컬럼 가변 회귀 시나리오(필수)
1. [ ] 프로필 커스텀 칼럼(예: `클둥대백과 작성`)을 중간 삽입해도 필수 헤더 매핑이 유지되는지 확인
2. [ ] 날짜 세션 칼럼을 오른쪽으로 이동/재배치해도 세션 탐지(헤더 패턴 기반)가 유지되는지 확인
3. [ ] 위 두 변경 후에도 출석 체크/출석현황/랭킹 계산 결과가 기존과 동일한지 확인

## Gate 2: API 계약 회귀 비교(자동)
baseline/candidate를 동일 파라미터로 호출해 정규화 응답을 비교합니다.

> 주의: Gate 2 통과는 공개 API 계약 불변을 증빙하는 절차입니다. `seasonImport*` 업데이트 리스크는 별도 점검 대상입니다.

### 권장 일괄 실행
```bash
/Users/sbu/SBU/CloudClubAttendanceSystem/scripts/run_doublecheck.sh \
  --baseline-url "https://script.google.com/macros/s/BASELINE_EXEC/exec" \
  --candidate-url "https://script.google.com/macros/s/CANDIDATE_EXEC/exec" \
  --season "season_09" \
  --valid-phone "01012345678" \
  --invalid-phone "01000000000" \
  --admin-token "<season_admin_token>" \
  --super-token "<super_token>" \
  --out-dir "/Users/sbu/SBU/CloudClubAttendanceSystem/.artifacts/doublecheck-$(date +%Y%m%d-%H%M%S)"
```

### 개별 실행
```bash
node /Users/sbu/SBU/CloudClubAttendanceSystem/scripts/doublecheck_api_snapshot.js \
  --base-url "https://script.google.com/macros/s/BASELINE_EXEC/exec" \
  --out ".artifacts/baseline.json" \
  --season "season_09" \
  --valid-phone "01012345678" \
  --invalid-phone "01000000000" \
  --admin-token "<season_admin_token>" \
  --super-token "<super_token>"

node /Users/sbu/SBU/CloudClubAttendanceSystem/scripts/doublecheck_api_snapshot.js \
  --base-url "https://script.google.com/macros/s/CANDIDATE_EXEC/exec" \
  --out ".artifacts/candidate.json" \
  --season "season_09" \
  --valid-phone "01012345678" \
  --invalid-phone "01000000000" \
  --admin-token "<season_admin_token>" \
  --super-token "<super_token>"

node /Users/sbu/SBU/CloudClubAttendanceSystem/scripts/doublecheck_api_compare.js \
  --baseline ".artifacts/baseline.json" \
  --candidate ".artifacts/candidate.json" \
  --out ".artifacts/compare-report.json"
```

화이트리스트:
1. `apiInfo.apiVersion` 차이
2. `apiInfo.supportedActions`의 `fortune*` 추가
3. 시간/랜덤 필드(`ts`, `timestamp`, 출석 `fortune/time`)

실패 조건:
1. 기존 액션의 필수 키 삭제/타입 변경
2. 기존 성공/실패 판정 반전
3. `apiInfo`에 허용되지 않은 신규 액션 추가

## Gate 3: 역할별 UX 스모크(수동)
아래 체크리스트를 실제 페이지에서 검증합니다.

### 학생
1. [ ] 페이지 로드/카운트다운 정상
2. [ ] 출석 성공 UX 정상
3. [ ] 출석 실패(시간 종료/잘못된 번호) UX 정상
4. [ ] 출석현황/순위 조회 정상
5. [ ] 운세 텍스트 렌더링 시 HTML 주입 미실행(escape 확인)

### season_admin
1. [ ] 로그인 정상
2. [ ] attend/status/schedule/excused/graduation 탭 기존 동작 정상
3. [ ] Super 전용 탭 접근 차단 유지
4. [ ] 운세 탭 접근/검증/저장/다운로드 정상
5. [ ] 출석현황 탭에서 멤버 미선택 시 상단 3번째 차트가 전체 평균으로 보임
6. [ ] 멤버 1명 선택 시 상단 3번째 차트가 개인 추이처럼 해석 가능하고, 드릴다운 표가 개인 상세로 열림
7. [ ] 멤버 2명 이상 선택 시 상단 3번째 차트가 평균값 1개 라인으로 보이고, KPI/랭킹/도넛은 그대로 유지됨
8. [ ] 상단 3번째 차트의 점 클릭 시 행사 drilldown이 열림

### super
1. [ ] variables/seasonImport/adminUsers 기존 동작 정상
2. [ ] 운세 탭 접근/저장/다운로드/버전 로드 정상
3. [ ] 출석현황 탭에서 season_admin과 동일한 평균 추이 시나리오가 재현됨

## Gate 4: 구버전 백엔드 호환성(수동)
조건: `fortune*` 미지원 백엔드 URL로 관리자 페이지 연결.

1. [ ] 운세 탭에서만 “미지원” 차단 메시지 노출
2. [ ] 다른 탭은 정상 동작
3. [ ] 전역 JS 오류/화이트스크린 없음

## Gate 5: 성능/운영 안전성
1. [ ] 학생 첫 로드 체감(3회 평균) baseline 대비 10% 이내
2. [ ] 관리자 탭 전환 체감(3회 평균) baseline 대비 10% 이내
3. [ ] 인증 canary 정상

```bash
/Users/sbu/SBU/CloudClubAttendanceSystem/scripts/auth_canary_snapshot.sh "https://script.google.com/macros/s/CANDIDATE_EXEC/exec"
```

## 별도 리스크 트랙: 시즌업데이트
공개 API 회귀 게이트와 분리하여 아래를 별도로 검토합니다.

1. `sheetSchemaAudit` 결과(필수 헤더/세션 헤더 패턴) 정상
2. `seasonImport*`의 diff/finalize 단계별 차단/복구 동작 정상
3. 운영 공지/체크리스트 보고 시 “회귀 통과”와 “시즌업데이트 안전성”을 분리 기록

## 배포 게이트
1. Gate A(API 계약) 통과 전 배포 금지
2. Gate B(역할별 스모크) 통과 전 배포 금지
3. Gate C(구버전 호환성) 통과 전 배포 금지
4. 실패 시 Apps Script 이전 배포 버전으로 즉시 롤백

## 증빙 산출물
아래 파일을 배포 PR/운영 기록에 첨부합니다.

1. `api-baseline.json`
2. `api-candidate.json`
3. `api-compare-report.json`
4. 역할별 수동 스모크 체크 결과(스크린샷/체크표)
5. 인증 canary 결과 로그
