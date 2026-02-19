# Mission 1 Plan - 합격자 업로드 -> 신규 시즌 생성 (v2)

## 1) 범위
- 관리자 전용 `시즌 생성/업로드` 탭 제공.
- CSV/TSV/XLSX 업로드 파일을 즉시 반영하지 않고 미리보기 우선.
- 헤더 의존도를 낮춘 content-based schema inference + 수동 매핑 보정.
- phone superkey 기준 dedupe + 서버 재검증.
- 스테이징 기반 finalize/abort 안전 반영.

## 2) 비범위
- Google OAuth/계정 연동.
- `member_role`(현직자/학생) 실데이터 반영.

## 3) 데이터 모델
### 최종 시즌 시트(v2)
- `A~L`:
  - `Name`, `Season`, `Phone`, `Email`, `Github ID`, `Github Email`, `Notion Email`, `Discord ID`, `Slack Email`, `회비 체크`, `수료 여부`, `운영진 여부`
- `M+`: 출석 세션 컬럼
- 슈퍼키: `Phone` only

### 스테이징 시트
- 헤더: `A~L` + `M=_phone_key`(내부 dedupe용, finalize 시 제거)

### import 메타 시트
- `_import_meta`
- 주요 필드: `importId`, `seasonAlias`, `status`, `importMode`, `schemaSummaryJson`, `inserted/skipped/dropped` 카운트

## 4) API 계약
- `seasonImportBegin`
  - in: `adminToken`, `season`, `importMode`, `schemaSummaryJson`
  - out: `importId`, `seasonAlias`, `stagingSheetName`
- `seasonImportChunk`
  - in: `adminToken`, `importId`, `chunkSeq`, `rowsJson`
  - out: chunk/cumulative 통계 + dropped reason
- `seasonImportFinalize`
  - in: `adminToken`, `importId`
  - out: 시즌 생성 결과 + 누적 통계
- `seasonImportAbort`
  - in: `adminToken`, `importId`
  - out: 중단 결과
- `sheetSchemaAudit`
  - in: `adminToken`, `season(optional)`
  - out: header map / required missing / phone duplicate / session start

## 5) 파싱/추론 정책
1. 파일 구조 인식
- CSV/TSV/XLSX 로드 + BOM/공백 정규화.
2. 헤더 후보 탐지
- 상위 1~5행 scoring, 불명확 시 headerless 모드.
3. 컬럼 프로파일링
- phone/email/season/name/boolean/id-like 분포 계산.
4. 필드 매핑 추론
- 점수 = 패턴(주) + 헤더 힌트(보조) - 결측 패널티.
- 필수 필드 우선 전역 할당 후 optional 배정.
5. 행 단위 fallback
- 필수값 누락 시 행 내 패턴 탐색으로 보완.
6. 행 분류
- `VALID_INSERT`, `SKIP_DUPLICATE`, `DROP_INVALID`, `SKIP_NON_TARGET_COHORT`.

## 6) 신뢰도/게이팅
- `HIGH >= 0.85`, `MEDIUM 0.60~0.85`, `LOW < 0.60`
- 필수 필드(name/season/phone/email) 기준:
  - LOW: BLOCKER
  - HIGH 미만 존재 시 수동 매핑 확정 전 업로드 버튼 비활성
- 최종 버튼 조건:
  - BLOCKER 0
  - 미리보기 확인 체크 완료

## 7) 오류/엣지 케이스
- 빈 파일, 파싱 실패, 헤더 누락/오타
- 시즌 중복, 진행 중 import 중복
- 필수 필드 누락/형식 오류
- phone 중복
- 혼합 기수(YB 모드 non-target skip)
- chunk 실패 시 abort

## 8) 테스트 계획
1. 헤더 완전 불일치 파일 (`성함/핸드폰/메일주소`) 자동 추론
2. 헤더 없는 파일 처리
3. 전화/이메일 컬럼 순서 변경
4. 다중 이메일 컬럼(주/보조) 처리
5. `기합!!!`, `기수`, 숫자형 season 혼합
6. bool 파싱(`TRUE/FALSE`, `Y/N`, `O/X`, `1/0`, `예/아니오`)
7. low confidence/필수 누락 시 진행 차단
8. preview와 finalize 결과 일치
9. 중간 실패 시 abort 롤백

## 9) 롤백
- 업로드 중 실패: `seasonImportAbort`로 staging 삭제.
- finalize 전에는 운영 시즌 데이터 무영향.
- finalize 후 문제 시: 백업 시트/복제본으로 시즌 탭 복원.
