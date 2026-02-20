# TECH_DOCS

> 문서 링크: [TECH_DOCS.md](./TECH_DOCS.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/TECH_DOCS.md)

## 빠른 흐름도
```mermaid
flowchart LR
  A["기술 이슈 또는 개선 요청"] --> B["문제 유형 분류"]
  B --> C["Wiki 기술 문서 확인"]
  C --> D["Code.gs/프런트 영향 범위 확인"]
  D --> E["History 원문으로 의사결정 배경 추적"]
  E --> F["런북 기준으로 검증/배포"]
```

## 기술 문서가 필요한 상황
운영 이슈는 겉으로는 비슷해 보여도, 실제 원인은 인증 설정·배포 URL·권한 정책·시트 데이터 중 어디에서든 발생할 수 있습니다. 그래서 이 문서는 단순 링크 목록이 아니라, 문제를 분기해서 올바른 문서로 빠르게 이동하기 위한 안내서로 구성합니다.

특히 신규 개발자나 임시 운영 인력이 투입될 때는 “어디부터 읽어야 하는지”를 모르면 같은 점검을 반복하기 쉽습니다. 아래 순서는 재현 가능한 운영 지식을 유지하기 위한 최소 경로입니다.

## 이슈 유형별 읽기 순서
먼저 이슈를 기능/운영/정책으로 나누면 읽어야 할 문서가 명확해집니다. 원인 분리가 선행되면 코드 수정 범위를 좁힐 수 있고, 불필요한 배포 리스크를 줄일 수 있습니다.

- 사용자 기능 이슈(출석/현황/랭킹): [docs/Wiki/01_User_Side_Guide.md](./docs/Wiki/01_User_Side_Guide.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/01_User_Side_Guide.md) → [docs/Wiki/02_Admin_Side_Guide.md](./docs/Wiki/02_Admin_Side_Guide.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/02_Admin_Side_Guide.md)
- 탭 수정/기능 확장: [docs/Wiki/03_Admin_Tab_Change_Map.md](./docs/Wiki/03_Admin_Tab_Change_Map.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/03_Admin_Tab_Change_Map.md) → [docs/Wiki/05_Data_And_RBAC_Reference.md](./docs/Wiki/05_Data_And_RBAC_Reference.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/05_Data_And_RBAC_Reference.md)
- 인증/배포 장애: [docs/Wiki/04_Operations_Runbook.md](./docs/Wiki/04_Operations_Runbook.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/04_Operations_Runbook.md) → [docs/History/019_구글인증_권한오류_트러블슈팅_검증_배포_런북_2026-02-20.md](./docs/History/019_구글인증_권한오류_트러블슈팅_검증_배포_런북_2026-02-20.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/019_%EA%B5%AC%EA%B8%80%EC%9D%B8%EC%A6%9D_%EA%B6%8C%ED%95%9C%EC%98%A4%EB%A5%98_%ED%8A%B8%EB%9F%AC%EB%B8%94%EC%8A%88%ED%8C%85_%EA%B2%80%EC%A6%9D_%EB%B0%B0%ED%8F%AC_%EB%9F%B0%EB%B6%81_2026-02-20.md)

## 코드 수정 전/후 점검 기준
수정을 시작하기 전에 “현재 정책과 충돌하는 변경인지”를 먼저 확인해야 합니다. 이 단계를 건너뛰면 배포 후 권한 회귀나 시트 포맷 불일치가 발생하기 쉽습니다.

수정 후에는 기능 성공 여부만 보지 말고, 권한 가드와 운영 절차까지 함께 검증해야 실제 운영에서 안전합니다.

1. 수정 전
- 대상 탭/액션이 어떤 권한 레벨(`public/admin/super`)인지 확인
- 연관 시트(`_admins`, `_session_meta`, 시즌 시트) 영향 범위 확인
- 운영 URL과 배포 브랜치(`gh-pages`) 기준 확인

2. 수정 후
- API 응답 포맷(`ok/data/error/ts`) 회귀 여부 확인
- 관리자 탭명/동작이 `web/admin/index.html`과 일치하는지 확인
- 런북 기준 canary 및 역할별 계정 검증 수행

## 기술 기준 문서
- 위키 메인: [docs/Wiki/README.md](./docs/Wiki/README.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/README.md)
- Admin Guide: [docs/Wiki/02_Admin_Side_Guide.md](./docs/Wiki/02_Admin_Side_Guide.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/02_Admin_Side_Guide.md)
- Tab Change Map: [docs/Wiki/03_Admin_Tab_Change_Map.md](./docs/Wiki/03_Admin_Tab_Change_Map.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/03_Admin_Tab_Change_Map.md)
- Operations Runbook: [docs/Wiki/04_Operations_Runbook.md](./docs/Wiki/04_Operations_Runbook.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/04_Operations_Runbook.md)
- Data/RBAC Reference: [docs/Wiki/05_Data_And_RBAC_Reference.md](./docs/Wiki/05_Data_And_RBAC_Reference.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/05_Data_And_RBAC_Reference.md)

## 원문 이력 추적
- History 인덱스: [docs/History/README.md](./docs/History/README.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/README.md)
- 마이그레이션 배경: [docs/History/003_구글시트에서_깃허브페이지스_마이그레이션_기록.md](./docs/History/003_구글시트에서_깃허브페이지스_마이그레이션_기록.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/003_%EA%B5%AC%EA%B8%80%EC%8B%9C%ED%8A%B8%EC%97%90%EC%84%9C_%EA%B9%83%ED%97%88%EB%B8%8C%ED%8E%98%EC%9D%B4%EC%A7%80%EC%8A%A4_%EB%A7%88%EC%9D%B4%EA%B7%B8%EB%A0%88%EC%9D%B4%EC%85%98_%EA%B8%B0%EB%A1%9D.md)
