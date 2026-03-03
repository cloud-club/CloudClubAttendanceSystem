# CloudClub 통합 위키

> 문서 링크: [docs/Wiki/README.md](./README.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/README.md)

## 빠른 흐름도
```mermaid
flowchart LR
  A["운영진/개발자 위키 진입"] --> B["배경과 목적 이해"]
  B --> C["User/Admin 가이드 선택"]
  C --> D["탭별 변경 맵 확인"]
  D --> E["운영 런북/정책 문서 확인"]
  E --> F["필요 시 History 원문 추적"]
```

## 이 위키의 목적
이 디렉토리는 현재 CloudClub 출석 시스템을 운영할 때 따라야 할 **기준 문서(SSOT)** 입니다. 핵심 목표는 “기능 설명”보다 “운영 판단 근거”를 전달하는 데 있습니다.

즉, 누가 문서를 읽더라도 같은 결론에 도달할 수 있도록, 각 문서는 배경과 선택 이유를 먼저 설명하고 실제 절차를 뒤에 배치합니다. 이를 통해 운영진 교체 시에도 설명 누락 없이 시스템을 이어갈 수 있습니다.

## 어떤 배경에서 이 구조가 만들어졌나
기존 8기 운영은 Apps Script가 화면과 데이터 처리를 동시에 담당하는 1티어 구조였습니다. 초기 구축에는 유리했지만, 운영이 복잡해지면서 인증/배포/데이터 이슈가 섞여 원인 분리가 어려워졌습니다.

2026년 2월 17~18일 전후로 구조를 2티어(정적 프런트 + OAuth 인증 + 시트/API 게이트웨이)로 전환한 이유도 여기에 있습니다. 위키는 이 전환 배경을 반영해, 현재 운영 방식이 왜 필요한지까지 읽히도록 설계되어 있습니다.

## 역할별 온보딩 경로 (신규 운영진/개발 기여자)
처음부터 모든 문서를 읽는 대신, 역할에 맞는 경로로 진입하면 맥락을 빠르게 잡을 수 있습니다.

- 신규 운영진: [02_Admin_Side_Guide.md](./02_Admin_Side_Guide.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/02_Admin_Side_Guide.md) → [04_Operations_Runbook.md](./04_Operations_Runbook.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/04_Operations_Runbook.md)
- 사용자 안내 담당: [01_User_Side_Guide.md](./01_User_Side_Guide.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/01_User_Side_Guide.md)
- 코드 수정 담당: [03_Admin_Tab_Change_Map.md](./03_Admin_Tab_Change_Map.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/03_Admin_Tab_Change_Map.md) + [05_Data_And_RBAC_Reference.md](./05_Data_And_RBAC_Reference.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/05_Data_And_RBAC_Reference.md)

## 문서 구성
아래 문서들은 서로 보완 관계입니다. 개별 문서만 읽기보다 연결 순서대로 보면 운영 기준이 더 명확해집니다.

- 사용자 가이드: [01_User_Side_Guide.md](./01_User_Side_Guide.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/01_User_Side_Guide.md)
- 관리자 가이드(10개 탭, 운세 관리 포함): [02_Admin_Side_Guide.md](./02_Admin_Side_Guide.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/02_Admin_Side_Guide.md)
- 탭별 변경/점검 맵: [03_Admin_Tab_Change_Map.md](./03_Admin_Tab_Change_Map.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/03_Admin_Tab_Change_Map.md)
- 운영 런북: [04_Operations_Runbook.md](./04_Operations_Runbook.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/04_Operations_Runbook.md)
- 데이터/RBAC 레퍼런스: [05_Data_And_RBAC_Reference.md](./05_Data_And_RBAC_Reference.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/05_Data_And_RBAC_Reference.md)
- 회귀 더블체크 게이트: [06_Doublecheck_Regression_Gate.md](./06_Doublecheck_Regression_Gate.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/06_Doublecheck_Regression_Gate.md)

## 운영 원칙 고정: 공개 API 불변과 시즌업데이트 리스크 분리
이 위키의 운영 판단 기준은 아래 한 줄로 고정합니다.

- 공개 API(`session`, `attendance`, `status`, `ranking`, `latestSeason` 등) 계약은 기능 확장 중에도 불변을 우선 보장합니다.
- 시즌 import(update) 경로는 별도 리스크 트랙으로 분리해 관리하며, 회귀 게이트 통과 여부와 혼동하지 않습니다.
- 컬럼이 중간 삽입/이동되어도 필수 헤더 매핑과 날짜 헤더 패턴이 유지되면 출석 파싱/핵심 조회 동작은 동일하게 유지됩니다.
- 상세 기준은 [05_Data_And_RBAC_Reference.md](./05_Data_And_RBAC_Reference.md)와 [06_Doublecheck_Regression_Gate.md](./06_Doublecheck_Regression_Gate.md)에서 함께 확인합니다.

## 운영 URL
- 관리자: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/admin/`
- 학생(Latest): `https://cloud-club.github.io/CloudClubAttendanceSystem/web/student/latest/`
- 랜딩: `https://cloud-club.github.io/CloudClubAttendanceSystem/web/`

## 최근 운영 변경 (History)
최근 리팩터링/긴급복구의 배경과 결정 근거는 History 023/024를 함께 확인합니다.
023은 구조분할/긴급복구 기준을, 024는 컬럼 유연화 이후에도 **공개 API 불변과 시즌업데이트 리스크 분리** 원칙을 명시한 최신 기준입니다.

- [docs/History/023_관리자백엔드_구조분할_및_출석인증불일치_긴급복구_운영기록_2026-02-20.md](../History/023_관리자백엔드_구조분할_및_출석인증불일치_긴급복구_운영기록_2026-02-20.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/023_%EA%B4%80%EB%A6%AC%EC%9E%90%EB%B0%B1%EC%97%94%EB%93%9C_%EA%B5%AC%EC%A1%B0%EB%B6%84%ED%95%A0_%EB%B0%8F_%EC%B6%9C%EC%84%9D%EC%9D%B8%EC%A6%9D%EB%B6%88%EC%9D%BC%EC%B9%98_%EA%B8%B4%EA%B8%89%EB%B3%B5%EA%B5%AC_%EC%9A%B4%EC%98%81%EA%B8%B0%EB%A1%9D_2026-02-20.md)
- [docs/History/024_컬럼유연화_헤더기반스키마_무체감안정화_2026-03-03.md](../History/024_컬럼유연화_헤더기반스키마_무체감안정화_2026-03-03.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/024_%EC%BB%AC%EB%9F%BC%EC%9C%A0%EC%97%B0%ED%99%94_%ED%97%A4%EB%8D%94%EA%B8%B0%EB%B0%98%EC%8A%A4%ED%82%A4%EB%A7%88_%EB%AC%B4%EC%B2%B4%EA%B0%90%EC%95%88%EC%A0%95%ED%99%94_2026-03-03.md)

## 원문 이력
현재 위키가 “무엇을 어떻게 운영하는지”를 정의한다면, History는 “왜 이런 결정을 했는지”를 보여줍니다. 운영 판단이 필요할 때는 위키를 기준으로 하고, 의사결정 배경이 필요할 때만 History를 참조합니다.

- History 인덱스: [docs/History/README.md](../History/README.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/README.md)
- 마이그레이션 배경: [docs/History/003_구글시트에서_깃허브페이지스_마이그레이션_기록.md](../History/003_구글시트에서_깃허브페이지스_마이그레이션_기록.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/003_%EA%B5%AC%EA%B8%80%EC%8B%9C%ED%8A%B8%EC%97%90%EC%84%9C_%EA%B9%83%ED%97%88%EB%B8%8C%ED%8E%98%EC%9D%B4%EC%A7%80%EC%8A%A4_%EB%A7%88%EC%9D%B4%EA%B7%B8%EB%A0%88%EC%9D%B4%EC%85%98_%EA%B8%B0%EB%A1%9D.md)
