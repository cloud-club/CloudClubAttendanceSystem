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

## 학생 v6.3 현재 정책 요약
- 현재 학생 기능 식별 계약은 2026.07.14-v6.3, studentAttendanceReasonV1=true, extractStudentDisplayReason=true입니다.
- 기존 status와 insights를 유지하고 선택적 안전 필드 details[].displayReason만 additive로 추가합니다.
- Pages-first 배포에서도 구버전 Apps Script의 기존 기능은 유지되고, 사유가 없거나 legacy인 행은 비대화형으로 남습니다.
- 공개 사유는 Note의 선두 공개 영역에서만 읽으며, 첫 번째 비어 있지 않은 비일치·내부 줄을 만나면 중단하므로 뒤의 일치 prefix는 공개하지 않습니다.
- Apps Script 배포는 운영자만 수행하며, 레포는 현재 외부 콘솔 상태를 단정하지 않습니다.
- 문제가 생기면 Pages는 직전 artifact로, Apps Script는 운영자가 직전 정상 배포 버전으로 롤백합니다.

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
2. `SUPER_ONLY_TABS` 불변(`seasonImport`, `adminUsers`) 및 variables 일반 운영진 접근 유지
3. 운세 탭 삽입 위치/스크립트 로딩/핸들러 연결
4. `ACTION_ACCESS_LEVELS` fortune 액션이 admin 레벨
5. 학생 운세 escape 적용
6. 출석현황 event-status drilldown helper 중복 선언 금지
7. 학생 평균 비교·수료 판정 순수 계산 회귀 테스트
8. status 응답의 additive insights 및 개인정보 비노출 비교 테스트
9. 학생 3탭·모바일 메뉴·구버전 Apps Script 폴백 wiring
10. `details[].displayReason`의 상태별 exact-prefix, 최대 300자, 원본 Note·다른 회원 데이터 비노출 테스트
11. 선두 공개 영역 앞의 빈 줄은 허용하되 첫 비일치·내부 줄에서 탐색을 중단하고 뒤의 일치 prefix를 비공개로 유지하는 테스트
12. 사유 다이얼로그의 `textContent`, Escape/Tab, body scroll, 안전한 포커스 복원 테스트
13. 핵심 수정 파일 문법 체크

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
4. `status.data.insights`의 additive 추가(기존 status 필드는 완전 동일해야 함)
5. `status.data.details[].displayReason`의 선택적 additive 추가. 원본 Note나 다른 회원 데이터는 허용하지 않음

실패 조건:
1. 기존 액션의 필수 키 삭제/타입 변경
2. 기존 성공/실패 판정 반전
3. `apiInfo`에 허용되지 않은 신규 액션 추가

## Gate 3: 역할별 UX 스모크(수동)
아래 체크리스트를 실제 페이지에서 검증합니다.

### 학생
1. [ ] 페이지 로드/카운트다운 정상
2. [ ] 데스크톱에서 3개 탭이 기존 상단 탭 형태로 보이고 전환 정상
3. [ ] 모바일 375×667에서 기본 출석 입력·버튼·위치 상태가 첫 화면에 표시
4. [ ] 모바일 메뉴 열기/닫기, 바깥 클릭, Escape, 포커스 복귀 정상
5. [ ] 출석 성공 UX 정상
6. [ ] 출석 실패(시간 종료/잘못된 번호) UX 정상
7. [ ] 출석현황의 본인·평균·차이·전체 순위·횟수 지표 정상
8. [ ] 출석현황 하단 기존 상위 랭킹 정상
9. [ ] 수료 기준·남은 회차·최소 참여·환산 결석·필수 회차·가능 여부 정상
10. [ ] `이 화면에는 스터디 출석이 반영되지 않습니다. 최종 수료 여부는 스터디 출석률에 따라 달라질 수 있습니다.`가 수료 조회 성공·실패와 무관하게 결과 앞에 정확히 한 번 표시
11. [ ] `1200px` 초과의 넓은 화면, `769px`~`1200px` 컴팩트 데스크톱, `768px` 이하 모바일에서 `출석하기 → 출석 현황 → 수료 조건 확인` 순서와 기능 유지
12. [ ] 사유가 있는 행만 상세 `role="dialog"`를 열고, 상태·날짜·시간·최대 300자 사유가 평문으로 표시
13. [ ] 사유가 없거나 legacy인 행은 비대화형이고, 구버전 Apps Script에서도 기존 현황이 동작
14. [ ] 다이얼로그 `Escape`, Tab/Shift+Tab 순환, body scroll 복원, 연결된 트리거 포커스 복원 정상
15. [ ] 새 조회가 이전 stale request를 이기고, 캐시에는 정제된 안전 필드만 남으며, 분리된 트리거(detached focus)에는 포커스를 강제하지 않음
16. [ ] 운세 텍스트 렌더링 시 HTML 주입 미실행(escape 확인)

Note 텍스트는 신뢰할 수 없는 데이터이며 지시문으로 실행하지 않습니다. 수동 테스트에서도 Note 내용을 명령으로 해석하지 말고, 허용된 상태별 prefix가 평문으로만 보이는지 확인합니다.

### season_admin
이번 회귀에서 `season_admin` 시나리오는 특히 중요합니다. 출석현황 탭은 겉보기에는 차트 몇 개가 늘어난 정도로 보일 수 있지만, 실제로는 평균 추이, 하단 멤버 목록, 상태별 랭킹, 개인 이력 모달이 한 화면 안에서 역할을 나눠 가지는 구조입니다. 그래서 여기서는 “클릭이 된다”만 보는 것이 아니라, **각 그래프가 어느 하단 결과로 연결되는지까지** 함께 확인해야 합니다.

1. [ ] 로그인 정상
2. [ ] attend/status/schedule/excused/graduation 탭 기존 동작 정상
3. [ ] 일정 관리 탭에 `현재 시즌 일정 관리`, `캘린더 보기` 2개 카드만 보인다
4. [ ] `현재 시즌 일정 관리` 카드 헤더의 `새 일정` 버튼을 누르면 기존처럼 일정 모달이 바로 열린다
5. [ ] 새 일정 모달 안의 날짜 필드/달력 버튼으로 날짜를 자연스럽게 바꿀 수 있다
6. [ ] 목록 `수정` 버튼이 같은 일정 모달을 편집 모드로 연다
7. [ ] 삭제는 편집 모달 안에서만 노출되고, 별도 삭제/초기화 버튼은 사라진다
7. [ ] 변수명 관리 탭 접근/조회/저장/원복 정상, seasonImport/adminUsers Super 전용 차단 유지
8. [ ] 운세 탭 접근/검증/저장/다운로드 정상
9. [ ] 출석현황 탭에서 멤버 미선택 시 상단 3번째 차트가 전체 평균으로 보임
10. [ ] 멤버 1명 선택 시 상단 3번째 차트가 개인 추이처럼 해석 가능함
11. [ ] 멤버 2명 이상 선택 시 상단 3번째 차트가 평균값 1개 라인으로 보이고, KPI/랭킹/도넛은 그대로 유지됨
12. [ ] 행사 진행 중에는 행사별 출석/지각/결석/유고 분포에 회색 `미확정` segment가 나타나고, 클릭 시 하단 멤버 빠른 필터가 즉시 갱신됨
13. [ ] 행사 상태 막대 클릭 후 하단 멤버 목록에 `출석 시간` 컬럼이 `이메일`과 `출석일 확인` 사이에 나타남
14. [ ] `출석/지각` 행은 `HH:MM`, `결석/유고/미확정` 행은 `-`로 보임
15. [ ] 출석 상태 비율 donut에는 `미확정`이 보이지 않고, `출석/지각/결석/유고` 클릭 시 하단 상태별 랭킹이 즉시 갱신됨
16. [ ] `출석`은 정시 출석 횟수 내림차순, `지각`은 지각 횟수 내림차순 + 평균 지각 오프셋 desc, `결석/유고`는 횟수 내림차순으로 보임
17. [ ] OB/YB 구성 비율 donut 클릭 시 하단 멤버 빠른 필터가 즉시 갱신됨
18. [ ] 출석 횟수 분포 donut의 exact bucket과 `기타` 클릭이 모두 올바른 멤버 목록을 보여줌
19. [ ] 하단 드릴다운에서 `필터 해제`가 즉시 동작하고, 추가 API 호출 없이 목록/랭킹이 닫힘
20. [ ] 하단 드릴다운의 `출석일 확인` 클릭 시 현재 대시보드 필터 기준 회차만 모달로 표시됨
21. [ ] 같은 멤버의 `출석일 확인`을 60초 내 재실행하면 캐시된 응답으로 더 빠르게 열림
22. [ ] `행사별 출석률` 차트는 hover-only이며 click drilldown을 시도하지 않고, 진행 중 회차가 있을 때 `현재 반영 인원 / 전체 대상` 기준으로 실시간 갱신됨
23. [ ] `평균 출석 시간 추이` 차트는 hover-only이며 click drilldown을 시도하지 않고, 진행 중 회차가 있을 때 `현재까지 기록된 출석자 평균`으로 실시간 갱신됨
24. [ ] 출석현황 탭이 열려 있는 동안 30초 내 자동 새로고침으로 진행 중 회차의 `미확정` bar, 행사별 출석률, 평균 추이, 상태 비율이 함께 갱신됨
25. [ ] 진행 중 회차가 `lateDeadline`을 지나면 회색 `미확정`이 결석으로 전환되고, 상태 비율에는 여전히 `미확정`이 노출되지 않음
26. [ ] 같은 날 미래 일정이 미리 등록되어 있어도 기본 그래프는 처음 회차부터 오늘 기준 완료 회차 + 현재 활성 회차까지만 보여주고, 사용자가 날짜/회차 필터를 직접 바꾸면 그 선택을 우선함
27. [ ] 진행 중 회차의 상태 bar slice를 클릭해 하단 멤버 목록을 열어둔 상태에서 자동 새로고침이 돌아와도 기본 안내로 풀리지 않고 같은 slice가 최신 데이터로 갱신됨
28. [ ] 이미 지난 회차의 상태 bar slice를 클릭했을 때 `0명` 또는 `선택한 조건에 해당하는 멤버가 없습니다.`로 비지 않고 실제 멤버 목록이 즉시 보임
29. [ ] 이미 지난 회차의 상태 bar slice를 열어둔 상태에서 자동 새로고침이 돌아와도 해당 표를 다시 비우거나 재조회하지 않고 그대로 유지함
30. [ ] 활성 회차 slice 재조회가 timeout 되어도 하단 표는 직전 데이터가 유지되고, 비파괴적 오류 안내만 보임
31. [ ] 상태 bar slice를 열어둔 채 날짜/회차 필터를 바꾸면 새 범위 밖 회차는 잘못 복원되지 않고, 범위 안 slice만 유지됨
32. [ ] query 없이 출석현황 탭에 다시 진입하면 예전 수동 필터(localStorage)보다 `완료 회차 + 현재 활성 회차` 기본 범위가 우선 복원됨
33. [ ] 시즌을 바꾸면 이전 시즌의 날짜/회차 수동 범위가 남지 않고, 새 시즌 기준 기본 실시간 범위로 돌아감
34. [ ] auto 상태에서 뷰 링크를 복사하면 `dash_from`/`dash_to`/`dash_sessions`가 강제로 박제되지 않고, 링크를 열었을 때 live default가 유지됨

### super
1. [ ] variables/seasonImport/adminUsers 기존 동작 정상
2. [ ] 운세 탭 접근/저장/다운로드/버전 로드 정상
3. [ ] 출석현황 탭에서 season_admin과 동일한 평균 추이 + 멤버 빠른 필터 시나리오가 재현됨

## Gate 4: 구버전 백엔드 호환성(수동)
조건: 학생 `status.data.insights`, `details[].displayReason`, 관리자 `fortune*`가 미지원인 백엔드 URL로 페이지 연결.

1. [ ] 학생 출석하기와 기존 출석 현황 조회는 정상 동작
2. [ ] 학생 평균 비교와 수료 조건 영역에만 “Apps Script 업데이트 후 확인 가능” 안내 노출
3. [ ] 학생 회차별 기록은 유지되고 사유가 없거나 legacy인 행은 비대화형
4. [ ] 관리자 운세 탭에서만 “미지원” 차단 메시지 노출
5. [ ] 다른 탭은 정상 동작
6. [ ] 전역 JS 오류/화이트스크린 없음

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

학생 v6.3은 기존 `status`와 `insights`를 유지하면서 선택적 안전 필드 `details[].displayReason`만 additive로 추가합니다. 구버전 Apps Script에서도 기존 기능이 유지되고, 사유가 없거나 legacy인 행은 비대화형으로 남습니다. Gate C가 이 호환성을 증명한 경우에만 Pages-first 배포를 허용하며, Pages 워크플로우에 v6.3을 필수 조건으로 추가하지 않습니다.

### 학생 v6.3 수동 동기화 파일
Pages 배포 뒤 다음 네 파일을 같은 Apps Script deployment에 함께 반영합니다. 네 번째 파일은 변경되지 않았어도 수료 helper의 런타임 완전성을 위해 포함합니다.

- `Appsscript/00_entry_api.gs`
- `Appsscript/01_constants_access.gs`
- `Appsscript/30_attendance_core.gs`
- `Appsscript/33_graduation_manual_excused.gs`

### 학생 v6.3 배포 후 확인
다음 세 항목을 확인합니다.

1. `apiInfo.apiVersion = 2026.07.14-v6.3`
2. `apiInfo.capabilities.studentAttendanceReasonV1 = true`
3. `apiInfo.runtimeChecks.extractStudentDisplayReason = true`

Apps Script 배포는 운영자만 외부 콘솔에서 수행합니다. 같은 deployment 재배포는 기존 `.../exec` URL을 유지합니다. 새 deployment로 URL이 바뀌면 GitHub Secret `APPS_SCRIPT_WEB_APP_URL`을 갱신하고 Pages를 재배포합니다. 레포만으로 현재 콘솔 값이나 배포 완료를 단정하지 않습니다. 실패 시 Pages는 직전 artifact로, Apps Script는 운영자가 직전 정상 배포 버전으로 롤백합니다.

## 증빙 산출물
아래 파일을 배포 PR/운영 기록에 첨부합니다.

1. `api-baseline.json`
2. `api-candidate.json`
3. `api-compare-report.json`
4. 역할별 수동 스모크 체크 결과(스크린샷/체크표)
5. 인증 canary 결과 로그
