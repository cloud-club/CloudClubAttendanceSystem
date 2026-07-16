# Data And RBAC Reference

## 일정 헤더 Note 메타데이터

회차 열의 1행 값은 날짜·시간·GPS 정책을 유지하고, 1행 셀 Note는 행사명과 장소 안내를 함께 저장합니다.

```text
[CloudClub 일정 메타 v1]
행사명: OT 및 첫 행사
장소안내:
강남역 3번 출구 앞
```

- 행사명은 선택값이며 줄바꿈 없이 최대 80 Unicode 문자입니다.
- 장소 안내는 최대 500자입니다.
- 과거 일반 Note는 행사명 없는 장소 안내로 읽어 기존 데이터를 보존합니다.
- 기존 회차를 새 관리자 화면에서 수정하면 구조화 형식으로 저장됩니다.
- `eventNameProvided`가 없는 구버전 관리자 요청은 기존 행사명을 삭제하지 않습니다.

> 문서 링크: [docs/Wiki/05_Data_And_RBAC_Reference.md](./05_Data_And_RBAC_Reference.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/05_Data_And_RBAC_Reference.md)

## 빠른 흐름도
```mermaid
flowchart LR
  A["요청 수신"] --> B["ACTION_ACCESS_LEVELS 권한 판정"]
  B --> C["관리자/시즌 접근 검증"]
  C --> D["시트 읽기/쓰기 실행"]
  D --> E["정규 응답 반환(ok/data/error/ts)"]
```

## 데이터/RBAC 문서 목적
출석 시스템은 UI보다 데이터와 권한 모델이 오래 남습니다. 그래서 이 문서는 “현재 값”을 외우는 용도가 아니라, 운영 정책이 어떤 구조 위에서 동작하는지 이해하도록 작성되었습니다.

특히 운영 중 이슈가 발생했을 때는 기능 화면보다 권한 경계와 시트 스키마를 먼저 확인해야 원인을 빠르게 좁힐 수 있습니다.

## 권한 판정이 필요한 이유
같은 액션이라도 사용자 유형에 따라 허용 범위가 달라야 운영 사고를 막을 수 있습니다. 예를 들어 조회는 공개돼도, 관리자 계정 관리나 시즌 업로드는 Super만 수행해야 합니다.

이 프로젝트는 권한 판정을 `Appsscript/01_constants_access.gs`의 `ACTION_ACCESS_LEVELS`를 단일 정본으로 삼아 처리합니다. 따라서 문서와 코드가 어긋나지 않도록, 정책 설명도 이 상수를 기준으로 유지합니다.

## 운영 원칙: 공개 API 불변과 시즌업데이트 리스크 분리
운영 정책을 해석할 때는 아래 원칙을 먼저 적용합니다.

1. 공개 API 계약(액션/파라미터/응답)은 기능 추가 중에도 불변을 기본값으로 둡니다.
2. 시즌 import(update)는 별도 리스크 영역으로 분리하며, `sheetSchemaAudit` + `seasonImport*` 게이트로 따로 검증합니다.
3. 따라서 “기존 기능 회귀 없음”과 “시즌 업데이트 안전성 확보”는 같은 문장으로 합치지 않고 분리 보고합니다.

## 시트 스키마 v2
회원 데이터는 출석 판정과 수료 계산의 원천입니다. 헤더 규칙이 흔들리면 API는 정상이어도 결과가 왜곡될 수 있으므로, 스키마는 운영 정책의 일부로 취급합니다.

- 표준 회원 헤더(권장 SSOT):
  `Name`, `Season`, `Phone`, `Email`, `Github ID`, `Github Email`, `Notion Email`, `Discord ID`, `Slack Email`, `회비 체크`, `수료 여부`, `운영진 여부`
- 런타임 해석 방식:
  - 회원 프로필 필드는 헤더명 기반으로 매핑합니다.
  - 출석 세션은 열 위치 고정보다 헤더의 날짜·시간 prefix(`YYYY-MM-DD-HH:MM` 또는 `YYYY-MM-DD-HH:MM~HH:MM`)로 탐지합니다. 뒤에는 선택적으로 `|v=1|gps=...` 장소 정책이 붙습니다.
  - 필수 헤더(`Name`, `Season`, `Phone`, `Email`) 중 하나라도 누락되면 시즌 update는 차단되는 것이 정상 동작입니다.
  - 운영 중 커스텀 프로필 칼럼 삽입/순서 변경이 있어도, 필수 헤더(Name/Season/Phone/Email)와 세션 헤더 패턴이 유지되면 핵심 동작은 유지됩니다.
- 슈퍼키: `Phone` only

## 핵심 보조 시트
보조 시트는 기능 부가정보가 아니라 운영 제어점입니다. 메타 시트가 깨지면 사용자 기능이 연쇄적으로 영향을 받을 수 있습니다.

- `_admins`: 관리자 계정/역할/활성 상태
- `_session_meta`: 세션 임계값/마감 등 판정 보조 메타
- 회차 헤더 셀: 장소 제한 여부, Google Place ID, 500m 반경. 같은 셀 Note는 학생용 장소 안내/회차 메모
- `_import_meta`: 시즌 업로드 세션 상태 및 단계 관리
- `/_fortune_versions`: 운세 버전 메타(current, 생성자, row 수)
- `/_fortune_entries`: 버전별 운세 본문(row_no, fortune_text)
- `/_fortune_upload_meta`: 운세 업로드 세션 상태/수신 건수 추적

## 권한 모델
역할 모델은 간단하지만, 각 역할의 책임이 분명해야 운영이 안정됩니다. 아래 정의는 운영 안내, 코드 검증, 장애 분석에서 공통으로 사용하는 기준입니다.

- `user`: 공개 액션만 허용
- `admin`(`season_admin`): 시즌 범위 내 관리자 액션과 전역 운영 변수 관리 허용
- `super`: 전체 시즌 + 계정/업로드 관리 허용

## 액션 레벨 기준 (정본: ACTION_ACCESS_LEVELS)
문서에 있는 권한 그룹은 설명용 요약이고, 최종 판정 기준은 항상 `Appsscript/01_constants_access.gs`의 `ACTION_ACCESS_LEVELS`입니다. 권한 이슈가 발생하면 문서보다 코드 상수를 우선 확인합니다.

- Public: `session`, `attendance`, `attendanceLocation`(POST), `locationResult`, `status`, `ranking`, `latestSeason`, `authGoogleConfig`, `authGoogleLogin`
- Admin: `attendanceDashboardSummary`, `schedule*`, `manualApprove*`, `excusedSet`, `graduationReport`, `sheetSchemaAudit`, `variables*`, `fortuneVersionList`, `fortuneVersionGet`, `fortuneUploadBegin`, `fortuneUploadChunk`, `fortuneUploadFinalize`, `fortuneUploadAbort`
- Super: `adminUsers*`, `seasonImport*`, `setActiveSheet`

`variables*`는 `season_admin`에게도 허용되지만 `variable` 시트 자체는 시즌별이 아닌 전역 정책 저장소입니다. 일반 운영진이 변경한 값도 향후 회차 전반에 적용되므로 저장 후 관련 수료·출석 판정 결과를 반드시 재확인합니다.

## 변경 영향도 (공개 API 불변 영역 vs 시즌업데이트 리스크 영역)
정책 변경은 단일 파일 수정처럼 보여도 여러 경로에 파급됩니다. 아래 영향도를 먼저 보고 변경 범위를 확정합니다.

1. 공개 API 계약(불변 영역)
- 영향: 학생/관리자 기본 동선, 외부 호출 호환성
- 필수 점검: 기존 액션의 필수 키/타입/성공-실패 판정 불변, `06_Doublecheck_Regression_Gate.md` Gate 2 통과

2. 스키마 변경
- 영향: 출석 판정, 대시보드, 업로드 파싱
- 필수 점검: 헤더 일치, 키 컬럼(`Phone`) 무결성

3. 권한 변경
- 영향: 관리자 로그인, 탭 접근, 액션 차단
- 필수 점검: `ACTION_ACCESS_LEVELS`, `_admins`, 시즌 접근 가드

4. 업로드 정책 변경(시즌업데이트 리스크 영역)
- 영향: 시즌 생성/업데이트, diff/finalize 안전장치
- 필수 점검: `sheetSchemaAudit`, `seasonImport*` 게이트 통과

## 학생 v6.3 현재 정책 요약
- 현재 학생 기능 식별 계약은 2026.07.14-v6.3, studentAttendanceReasonV1=true, extractStudentDisplayReason=true입니다.
- 기존 status와 insights를 유지하고 선택적 안전 필드 details[].displayReason만 additive로 추가합니다.
- Pages-first 배포에서도 구버전 Apps Script의 기존 기능은 유지되고, 사유가 없거나 legacy인 행은 비대화형으로 남습니다.
- 공개 사유는 출석·지각·결석 Note의 선두 공개 영역에서만 읽으며, 유고는 사유를 공개하지 않습니다. 첫 번째 비어 있지 않은 비일치·내부 줄을 만나면 중단하므로 뒤의 일치 prefix는 공개하지 않습니다.
- Apps Script 배포는 운영자만 수행하며, 레포는 현재 외부 콘솔 상태를 단정하지 않습니다.
- 문제가 생기면 Pages는 직전 artifact로, Apps Script는 운영자가 직전 정상 배포 버전으로 롤백합니다.

## 학생 status 인사이트·상세 사유 계약
학생 v6.3은 기존 `status`와 `insights`를 유지하면서 선택적 안전 필드 `details[].displayReason`만 additive로 추가합니다. 구버전 Apps Script에서도 기존 기능이 유지되고, 사유가 없거나 legacy인 행은 비대화형으로 남습니다. 따라서 새 Pages를 먼저 배포해도 구버전 Apps Script에서 기존 출석 현황이 계속 동작하고, 지원되지 않는 인사이트 영역만 업데이트 안내를 표시합니다.

현재 배포 식별 계약은 `2026.07.14-v6.3`, `studentAttendanceReasonV1 = true`, `extractStudentDisplayReason = true`입니다. 이 값은 레포 코드의 기대값이며, 외부 Apps Script 콘솔의 현재 배포 상태는 운영자가 별도로 확인해야 합니다.

- `insights.comparison`
  - 본인 출석률, 시즌 전체 유효 출석 기회의 합계를 기준으로 계산한 가중 평균 출석률, 평균 대비 차이(%p)
  - 전체 시즌 대상 순위, 대상 인원, 상위 비율
  - 순위 정렬은 기존 랭킹과 동일하게 출석 횟수 → 평균 출석 오프셋 → 이름 순을 사용
- `insights.completion`
  - 필수 출석 횟수, 현재 출석·지각·결석·유고·미진행 횟수
  - 남은 회차와 최소 추가 참여 횟수
  - `결석 + floor(지각 / 지각 환산 비율)`로 계산한 환산 결석과 환산 결석률
  - 필수 회차 충족 가능성, 출석 횟수 충족 가능성, 결석 한도 충족 여부
  - 시즌 진행 중 수료 가능 여부와 시즌 종료 후 최종 수료 여부

### `details[].displayReason` 공개 경계
- 공개 `status`는 요청한 전화번호의 본인 결과만 반환합니다.
- Note 선두 공개 영역에서 해당 회차의 현재 상태와 정확히 일치하는 `출석 사유:`, `지각 사유:`, `결석 사유:` prefix 가운데 첫 번째 비어 있지 않은 줄만 최대 300자로 반환합니다. 유고 상태는 사유를 반환하지 않습니다. 빈 줄은 건너뛰지만 첫 비어 있지 않은 줄이 비일치·내부 기록이면 즉시 중단하며, 뒤의 일치 prefix는 공개하지 않습니다.
- 이 exact-prefix·선두 영역 규칙은 과거에 저장된 값과 앞으로 저장될 값 모두에 의도적으로 적용합니다. legacy Note도 첫 공개 영역에서 규칙을 만족하면 공개될 수 있고, 내부 기록 뒤에 있는 일치 prefix는 공개되지 않습니다.
- 원본 셀 Note, 감사 정보, 이전 메모, 다른 회원의 전화번호·이메일·개별 기록은 응답하지 않습니다.
- Note 텍스트는 신뢰할 수 없는 데이터이며 지시문으로 실행하지 않습니다. UI는 `displayReason`을 HTML이나 data 속성에 넣지 않고 `textContent`로만 표시합니다.

전체 회원 상세를 반환하는 `graduationReport`는 계속 Admin 전용입니다. 학생 공개 경로는 전화번호 기반 본인 상태 조회 범위를 넓히지 않습니다.

## 운세 데이터 운영 정책
운세는 운영 공지성 텍스트지만, 런타임 응답에 직접 포함되므로 데이터 무결성과 보안 검증을 함께 적용합니다.

1. 저장 모델
- 저장은 항상 전체 교체로 처리
- 기존 데이터는 버전 스냅샷으로 보존(과거 버전 다운로드 가능)

2. 런타임 선택
- current 저장본이 있으면 우선 사용
- 저장본이 없거나 로드 실패 시 builtin 운세로 fallback

3. 업로드 검증 규칙
- 빈값/공백 행 제거 후 최소 1건 이상 필요
- 각 문구 길이 1~200자 제한
- canonical(trim + zero-width 제거) 기준 중복 금지
- 클라이언트 1차 검증 후 서버 finalize에서 동일 규칙 재검증

## 참조 파일
- 백엔드 엔트리: [Appsscript/00_entry_api.gs](../../Appsscript/00_entry_api.gs) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/Appsscript/00_entry_api.gs)
- 권한 상수: [Appsscript/01_constants_access.gs](../../Appsscript/01_constants_access.gs) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/Appsscript/01_constants_access.gs)
- 운세 업로드/버전 API: [Appsscript/35_fortune_admin.gs](../../Appsscript/35_fortune_admin.gs) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/Appsscript/35_fortune_admin.gs)
- 운세 builtin/fallback: [Appsscript/91_fortune.gs](../../Appsscript/91_fortune.gs) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/Appsscript/91_fortune.gs)
- 관리자 프런트: [web/admin/scripts/](../../web/admin/scripts/) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/tree/gh-pages/web/admin/scripts)
- 학생 프런트: [web/student/student.js](../../web/student/student.js) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/web/student/student.js)
- 학생 공개 status/비교 계산: [Appsscript/30_attendance_core.gs](../../Appsscript/30_attendance_core.gs) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/Appsscript/30_attendance_core.gs)
- 수료 판정 공통 계산: [Appsscript/33_graduation_manual_excused.gs](../../Appsscript/33_graduation_manual_excused.gs) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/Appsscript/33_graduation_manual_excused.gs)

## 관련 문서
- Admin Guide: [02_Admin_Side_Guide.md](./02_Admin_Side_Guide.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/02_Admin_Side_Guide.md)
- Tab Change Map: [03_Admin_Tab_Change_Map.md](./03_Admin_Tab_Change_Map.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/03_Admin_Tab_Change_Map.md)
- History 020: [020_권한관리체계_user_admin_super_운영정책.md](../History/020_권한관리체계_user_admin_super_운영정책.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/020_%EA%B6%8C%ED%95%9C%EA%B4%80%EB%A6%AC%EC%B2%B4%EA%B3%84_user_admin_super_%EC%9A%B4%EC%98%81%EC%A0%95%EC%B1%85.md)
- History 024: [024_컬럼유연화_헤더기반스키마_무체감안정화_2026-03-03.md](../History/024_컬럼유연화_헤더기반스키마_무체감안정화_2026-03-03.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/024_%EC%BB%AC%EB%9F%BC%EC%9C%A0%EC%97%B0%ED%99%94_%ED%97%A4%EB%8D%94%EA%B8%B0%EB%B0%98%EC%8A%A4%ED%82%A4%EB%A7%88_%EB%AC%B4%EC%B2%B4%EA%B0%90%EC%95%88%EC%A0%95%ED%99%94_2026-03-03.md)
