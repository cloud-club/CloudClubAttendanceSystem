# Mission 1 Result - 합격자 업로드 -> 신규 시즌 생성 (v2) 구현 결과

> 문서 링크: [docs/History/mission-1-result.md](./mission-1-result.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/mission-1-result.md)

## 빠른 흐름도
```mermaid
flowchart LR
  A["문제/배경"] --> B["의사결정"]
  B --> C["구현/배포"]
  C --> D["검증/회귀"]
  D --> E["운영 교훈"]
```


## 1) 변경 파일 목록
- `Code.gs`
- `web/admin/admin.js`
- `web/admin/index.html`
- `web/shared/api-jsonp.js`
- `web/student/student.js`
- `docs/History/baseline.md`
- `docs/History/mission-1-plan.md`
- `docs/History/mission-1-result.md`
- `docs/History/mission-2-plan.md`

## 2) 설정/환경변수
- 신규 환경변수 추가 없음.
- 기존 `adminToken` 인증 체계 재사용.

## 3) 시트 탭/컬럼/템플릿 변경
- 신규 운영 API: `sheetSchemaAudit`
- import 메타 시트: `_import_meta` (숨김)
- import 스테이징 시트: `_import_<season_alias>_<timestamp>_<rand>` (숨김)
  - 헤더: v2 `A~L` + 내부 `_phone_key`
- finalize 시:
  - `_phone_key` 제거
  - 최종 시즌 헤더 `A~L` 고정
  - 시트명 `season_nn`으로 rename

## 4) 구현 핵심
1. 백엔드 듀얼 스키마 리졸버
- `resolveMemberSchemaFromHeaders` 도입.
- v1/v2/custom 헤더 모두 읽고 session start를 동적으로 계산.

2. phone 슈퍼키 단일화
- 멤버 조회/출석/수동승인/유고/랭킹/수료가 phone 기준으로 통일.
- 중복 발견 시 `PHONE_SUPERKEY_DUPLICATE` 에러 반환.

3. import v2 전환
- 클라이언트/서버 필드셋 12개 확장.
- required: `name`, `season`, `phone`, `email`.
- dedupe: phone only.
- boolean/email optional 필드 오류는 warning 후 빈값 처리.

4. 유연 파싱 + 미리보기
- 헤더 추론 + 셀 패턴 프로파일링 + 수동 매핑.
- 디버그 코드/레벨(BLOCKER/WARNING/INFO) 출력.
- 가상 시트 A:L 렌더와 업로드 게이팅 적용.

5. 호환 응답 확장
- `grade` 유지.
- `season`, `seasonLabel` 병행 반환.
- admin/student UI에서 `seasonLabel || grade` 사용.

## 5) 테스트 시나리오 및 결과
- `node --check /tmp/Code_gs_check.js`: 통과
- `node --check web/admin/admin.js`: 통과
- `node --check web/student/student.js`: 통과
- `node --check web/shared/api-jsonp.js`: 통과
- 실시트 E2E(수동): 이 작업 환경에서는 미실행

## 6) 운영 절차 (관리자)
1. 관리자 로그인 후 시즌 선택.
2. `합격자 업로드로 시즌 생성` 탭 이동.
3. 시즌 번호/모드 입력, 파일 선택.
4. `파싱/미리보기 분석` 실행.
5. 스키마 추론/수동 매핑 검토 후 `현재 매핑 확정`.
6. 디버그 패널에서 BLOCKER 0 확인.
7. 미리보기 확인 체크.
8. `시즌 생성 + 업로드 반영` 실행.
9. 필요 시 같은 탭의 `시트 스키마 감사`로 헤더/중복/결측 점검.

## 7) 추론 품질 기록(초기)
- 자동 추론 + 수동 보정 혼합 흐름을 기본 UX로 확정.
- 샘플 데이터 기준:
  - `기합!!!` -> season 힌트로 인식 가능
  - `Discor ID` 오타 -> `Discord ID` 동의어 허용
- 운영 중 오탐 사례는 향후 `mission-1-result`에 누적 기록 예정.

## 8) 다음 미션 설계서 초안
- `docs/History/mission-2-plan.md`
