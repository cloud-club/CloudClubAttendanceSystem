# Mission Attendance Dashboard Plan (A-2)

## 1) 목적과 범위
- 대상: 관리자 `출석현황` 탭
- 목표: 대시보드(필터/KPI/차트/드릴다운) + 기존 조회/순위 유지
- 비범위: Google OAuth, 시즌 생성/업로드(A-1), 관리자 테이블 권한모델(C)

## 2) KPI 정의
- 전체 인원: 현재 필터에 포함된 멤버 수
- OB 인원: `member.season < selectedSeasonNo`
- YB 인원: `member.season === selectedSeasonNo`
- 평균 출석률: `sum(attended) / sum(effective)`
- 평균 지각률: `sum(late) / sum(effective)`
- 평균 결석률: `sum(absent) / sum(effective)`

설명:
- `effective`는 `on_time|late|absent` 모수이며 `excused`는 제외
- 미래 회차(`future`)는 KPI 계산에서 제외

## 3) 필터 정의
- 그룹: `all|ob|yb`
- 기간: `dateFrom`, `dateTo` (회차 시작일 기준)
- 행사: 다중 선택(`sessionKeysCsv`)
- Top-N: 이벤트 Top 테이블 행 수
- 정렬: `attendanceRate|absenceRate|participants`
- 차트 타입: 출석률 차트 `bar|line`

필터 반영 범위:
- KPI
- 차트
- 드릴다운 테이블
- 순위 카드
- 기존 전화번호 개인조회는 기존 동작 유지

## 4) 차트 구성
- 차트 A: 행사별 출석률 (bar/line 전환)
  - 클릭 시 행사 드릴다운
- 차트 B: 행사별 출석/지각/결석/유고 분포 (stacked bar)
  - 클릭 시 행사 드릴다운
- 차트 C: 개인별 출석 시간 추이 (line)
  - 다중 멤버 선택/검색 지원
  - hover tooltip: 오프셋/상태/출석일시/유고 note
  - 클릭 시 개인 드릴다운

## 5) 드릴다운 정의
- event drilldown:
  - 출력: 멤버, 그룹, 상태, 출석일시, note
- member drilldown:
  - 출력: 회차, 상태, 출석일시, 오프셋, note

note 정책:
- 원본 시트 셀 Note를 사용
- `adminToken` 인증 요청에서만 반환

## 6) API 계약

### 6-1. attendanceDashboardSummary
- 인증: `adminToken` 필수
- 입력:
  - `season`
  - `group`
  - `dateFrom`, `dateTo`
  - `sessionKeysCsv`
  - `topN`
  - `sortBy`
  - `chartType`
  - `disableCache`
- 출력:
  - `kpi`
  - `charts.attendanceRateBySession`
  - `charts.statusDistributionBySession`
  - `ranking`
  - `table.eventTopRows`
  - `meta.availableSessions`, `meta.memberOptions`, `meta.defaultMemberKeys`

### 6-2. attendanceDashboardDrilldown
- 인증: `adminToken` 필수
- 입력:
  - `season`
  - `drillType` (`event|member`)
  - `key` (sessionKey 또는 phone)
  - 요약 API와 동일 필터
- 출력:
  - `drillType`
  - `rows`
  - `summary`

## 7) 성능/캐시
- summary API:
  - `CacheService` 90초 캐시
  - 키: `season + 필터` 조합
  - 캐시 저장 상한: 약 90KB
- drilldown API:
  - on-demand 호출
  - 프런트 메모리 캐시(멤버 시계열)

## 8) UX 운영 편의
- 프리셋:
  - 전체, YB만, OB만, 최근 4회차, 결석 높은 회차
- 뷰 링크 복사:
  - 현재 필터를 URL query로 직렬화
- CSV 내보내기:
  - 현재 drilldown 우선, 없으면 이벤트 Top 테이블
- 마지막 설정 복원:
  - `localStorage` 기반

## 9) 테스트 계획
- 기능:
  - 필터 일관성(KPI/차트/드릴다운/순위)
  - 차트 hover/click 동작
  - 개인 추이 tooltip note 노출
- 회귀:
  - 기존 전화번호 조회 정상
  - 기존 순위 렌더 정상
- 엣지:
  - 빈 시즌, 회차 없음, 멤버 없음
  - note 없음, 유고만 존재
- 보안:
  - adminToken 미제공 시 대시보드 API 차단

## 10) 롤백 전략
- 프런트: status 탭 대시보드 카드 숨김
- 백엔드: 신규 API 액션 disable 또는 미호출
- 기존 조회/순위 경로 유지로 서비스 지속

## 11) 확장 TODO
- `TODO(member_role)`:
  - 현직자/학생 컬럼 도입 시 그룹 축 확장
  - KPI/필터/차트 분해 기준 추가
