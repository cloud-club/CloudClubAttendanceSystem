# 020 권한관리체계 user, admin, super 운영 정책

## 1. 목적
이 문서는 CloudClub 출석 시스템의 권한 모델을 운영/개발 기준으로 고정하기 위한 정책 문서입니다.

목표:
1. 사용자 역할별 허용 범위를 명확히 구분
2. 코드와 문서의 권한 정의를 일치
3. 장애 시 원인 분리를 빠르게 수행

## 2. 역할 모델
| 역할 | 의미 | 인증 필요 | 핵심 권한 |
|---|---|---|---|
| `user` | 일반 사용자 | 학생 페이지는 비로그인 사용 가능 | 공개 조회(출석/상태/랭킹 등) |
| `admin` (`season_admin`) | 시즌 운영 관리자 | Google 로그인 + 관리자 등록 필요 | 시즌 범위 관리자 기능 |
| `super` | 슈퍼 관리자 | Google 로그인 + 고정 super 정책 | 전체 관리자 기능 + 관리자 계정/시즌 시스템 관리 |

## 3. 권한 소스
1. 코드 상수
- `/Users/sbu/SBU/CloudClubAttendanceSystem/Code.gs`의 `ACTION_ACCESS_LEVELS`
2. 관리자 데이터
- `_admins` 시트
3. 자동 동기화 입력
- 최신 `season_nn` 시트의 `운영진 여부`, `Email`
4. 고정 정책
- `cloudclub2022@gmail.com`은 super로 취급

## 4. 액션 접근 레벨 매트릭스 (운영 기준)
### 4-1. Public
`health`, `apiInfo`, `authGoogleConfig`, `authGoogleLogin`, `session`, `attendance`, `status`, `ranking`, `sheets`, `verifyAdminKey`

### 4-2. Admin
`authSession`, `authLogout`, `adminSeasonList`, `attendanceDashboardSummary`, `attendanceDashboardDrilldown`, `studentUrl`, `adminUrl`, `sheetLink`, `scheduleList`, `scheduleSave`, `scheduleDelete`, `members`, `manualApprove`, `manualApproveBatch`, `excusedSet`, `graduationReport`, `sheetSchemaAudit`

### 4-3. Super
`adminUsersList`, `adminUsersUpsert`, `adminUsersDelete`, `setActiveSheet`, `variablesGet`, `variablesUpdate`, `variablesNormalize`, `variablesResetTemplate`, `seasonImportBegin`, `seasonImportChunk`, `seasonImportDiff`, `seasonImportFinalize`, `seasonImportAbort`

운영 규칙:
- 신규 액션 추가 시 반드시 `ACTION_ACCESS_LEVELS`와 본 문서를 동시에 갱신합니다.

## 5. 인증/인가 판정 순서
1. 요청 액션 확인
2. 액션 접근 레벨 확인(`public/admin/super`)
3. `admin` 이상이면 관리자 컨텍스트 검증
4. `super`면 추가 super 권한 검증
5. 시즌 대상 API는 시즌 접근 정책 검증

## 6. 표준 에러 코드 해석
| 코드 | 의미 | 운영자 조치 |
|---|---|---|
| `AUTH_SERVER_SCOPE_MISSING` | Apps Script 런타임 외부요청 권한 미승인 | `__authorizeExternalRequest()` 실행 + 재배포 + canary |
| `AUTH_ADMIN_NOT_REGISTERED` | 관리자 등록 없음 | `_admins`/최신 시즌 운영진 데이터 점검 |
| `AUTH_ADMIN_INACTIVE` | 관리자 비활성 | `_admins.is_active` 상태 확인 |
| `AUTH_ID_TOKEN_VERIFY_FAILED` | 토큰 검증 실패(더미/만료/서명 등) | canary 기준 코드로는 정상 경로 도달 의미 가능 |
| `UNAUTHORIZED` | 인증 상태 부족 | 로그인/세션 상태 점검 |
| `FORBIDDEN`/`FORBIDDEN_SEASON` | 권한 또는 시즌 범위 위반 | 역할/시즌 매핑 점검 |

## 7. 운영자 관리 절차
### 7-1. 관리자 추가
1. Super 권한으로 로그인
2. 관리자 관리 화면 또는 `_admins` 정책에 따라 등록
3. 필요 시 최신 시즌 운영진 데이터와 동기화 상태 확인

### 7-2. 관리자 비활성화
1. `_admins.is_active=false` 처리
2. 즉시 로그인 차단 확인

### 7-3. 시즌 관리자 자동 동기화
1. 최신 시즌 시트에서 `운영진 여부=TRUE` + Gmail 조건 충족 시 반영
2. 최신 시즌에서 제거되면 `season_admin` 자동 비활성 가능
3. 수동 비활성은 자동 복구하지 않음

## 8. 프런트엔드 정책
1. 관리자 페이지
- 인증 전 관리자 데이터 로드 금지
- 로그인 후 역할에 따라 UI 노출 분기
2. 학생 페이지
- 관리자 인증 없이 동작하는 공개 액션만 호출
- 관리자 전용 액션 호출 금지

## 9. 감사/증빙 기준
| 항목 | 최소 증빙 |
|---|---|
| 권한 변경 | 변경 계정, 역할, 시각, 변경자 |
| 인증 장애 복구 | canary 결과 코드, deployment URL, Secret 반영 이력 |
| 계정별 검증 | Super/Admin/User 결과표 |

권장 연계 문서:
- `/Users/sbu/SBU/CloudClubAttendanceSystem/docs/012_운영자_개발자_통합_검증체크리스트.md`
- `/Users/sbu/SBU/CloudClubAttendanceSystem/docs/019_구글인증_권한오류_트러블슈팅_검증_배포_런북_2026-02-20.md`

## 10. 변경관리 규칙
1. 권한 로직 변경 시 필수 동시 작업
- `Code.gs` 접근 레벨 상수 갱신
- 본 문서(020) 갱신
- 통합 검증 체크리스트(012) 갱신
2. 배포 전 필수 게이트
- canary 통과
- 계정별 분기 검증(Super/Admin/User)

## 11. 관련 문서
- `/Users/sbu/SBU/CloudClubAttendanceSystem/docs/018_관리자_인증전환_배경_구현방식_및_인프라구조.md`
- `/Users/sbu/SBU/CloudClubAttendanceSystem/docs/019_구글인증_권한오류_트러블슈팅_검증_배포_런북_2026-02-20.md`
- `/Users/sbu/SBU/CloudClubAttendanceSystem/docs/012_운영자_개발자_통합_검증체크리스트.md`
- `/Users/sbu/SBU/CloudClubAttendanceSystem/Code.gs`
