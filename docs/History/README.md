# History 문서 인덱스

> 문서 링크: [docs/History/README.md](./README.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/README.md)

## 빠른 흐름도
```mermaid
flowchart LR
  A["과거 이슈/결정 조회"] --> B["시기/주제 문서 선택"]
  B --> C["원문 확인"]
  C --> D["현재 정본 Wiki와 비교"]
  D --> E["운영 판단/재사용"]
```

이 디렉토리는 과거 연혁/정책/런북 원문 보관 영역입니다. 현재 운영 기준은 `docs/Wiki`를 우선 참고하세요.

## 읽기 우선순위
- 프로젝트 기본 맥락: [001_프로젝트_개요_및_운영_가이드.md](./001_프로젝트_개요_및_운영_가이드.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/001_%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8_%EA%B0%9C%EC%9A%94_%EB%B0%8F_%EC%9A%B4%EC%98%81_%EA%B0%80%EC%9D%B4%EB%93%9C.md)
- 기술 레퍼런스: [002_시스템_기술_레퍼런스.md](./002_시스템_기술_레퍼런스.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/002_%EC%8B%9C%EC%8A%A4%ED%85%9C_%EA%B8%B0%EC%88%A0_%EB%A0%88%ED%8D%BC%EB%9F%B0%EC%8A%A4.md)
- 마이그레이션/장애 기록: [003_구글시트에서_깃허브페이지스_마이그레이션_기록.md](./003_구글시트에서_깃허브페이지스_마이그레이션_기록.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/003_%EA%B5%AC%EA%B8%80%EC%8B%9C%ED%8A%B8%EC%97%90%EC%84%9C_%EA%B9%83%ED%97%88%EB%B8%8C%ED%8E%98%EC%9D%B4%EC%A7%80%EC%8A%A4_%EB%A7%88%EC%9D%B4%EA%B7%B8%EB%A0%88%EC%9D%B4%EC%85%98_%EA%B8%B0%EB%A1%9D.md)
- 관리자 확장 연대기: [005_관리자기능_확장_연대기_2026-02-18.md](./005_관리자기능_확장_연대기_2026-02-18.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/005_%EA%B4%80%EB%A6%AC%EC%9E%90%EA%B8%B0%EB%8A%A5_%ED%99%95%EC%9E%A5_%EC%97%B0%EB%8C%80%EA%B8%B0_2026-02-18.md)
- 구조분할 + 출석 인증 긴급복구: [023_관리자백엔드_구조분할_및_출석인증불일치_긴급복구_운영기록_2026-02-20.md](./023_관리자백엔드_구조분할_및_출석인증불일치_긴급복구_운영기록_2026-02-20.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/023_%EA%B4%80%EB%A6%AC%EC%9E%90%EB%B0%B1%EC%97%94%EB%93%9C_%EA%B5%AC%EC%A1%B0%EB%B6%84%ED%95%A0_%EB%B0%8F_%EC%B6%9C%EC%84%9D%EC%9D%B8%EC%A6%9D%EB%B6%88%EC%9D%BC%EC%B9%98_%EA%B8%B4%EA%B8%89%EB%B3%B5%EA%B5%AC_%EC%9A%B4%EC%98%81%EA%B8%B0%EB%A1%9D_2026-02-20.md)
- 컬럼 유연화 무체감 안정화: [024_컬럼유연화_헤더기반스키마_무체감안정화_2026-03-03.md](./024_컬럼유연화_헤더기반스키마_무체감안정화_2026-03-03.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/024_%EC%BB%AC%EB%9F%BC%EC%9C%A0%EC%97%B0%ED%99%94_%ED%97%A4%EB%8D%94%EA%B8%B0%EB%B0%98%EC%8A%A4%ED%82%A4%EB%A7%88_%EB%AC%B4%EC%B2%B4%EA%B0%90%EC%95%88%EC%A0%95%ED%99%94_2026-03-03.md)
- 출석현황 평균 추이 전환 + 그래프 클릭 기반 빠른 멤버 필터: [025_관리자_출석현황_평균출석시간추이_전환_운영기록_2026-03-10.md](./025_관리자_출석현황_평균출석시간추이_전환_운영기록_2026-03-10.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/025_%EA%B4%80%EB%A6%AC%EC%9E%90_%EC%B6%9C%EC%84%9D%ED%98%84%ED%99%A9_%ED%8F%89%EA%B7%A0%EC%B6%9C%EC%84%9D%EC%8B%9C%EA%B0%84%EC%B6%94%EC%9D%B4_%EC%A0%84%ED%99%98_%EC%9A%B4%EC%98%81%EA%B8%B0%EB%A1%9D_2026-03-10.md)
- 출석현황 실시간 pending 표시 + 실시간 출석률/평균추이 + 상태 비율 해석 조정: [026_관리자_출석현황_실시간_pending표시_및_출석상태비율_회기준_운영기록_2026-03-31.md](./026_관리자_출석현황_실시간_pending표시_및_출석상태비율_회기준_운영기록_2026-03-31.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/026_%EA%B4%80%EB%A6%AC%EC%9E%90_%EC%B6%9C%EC%84%9D%ED%98%84%ED%99%A9_%EC%8B%A4%EC%8B%9C%EA%B0%84_pending%ED%91%9C%EC%8B%9C_%EB%B0%8F_%EC%B6%9C%EC%84%9D%EC%83%81%ED%83%9C%EB%B9%84%EC%9C%A8_%ED%9A%8C%EA%B8%B0%EC%A4%80_%EC%9A%B4%EC%98%81%EA%B8%B0%EB%A1%9D_2026-03-31.md)
- 관리자 응답속도 최적화 + 기능 동일성 재검증: [031_관리자_응답속도_최적화_및_기능동일성_재검증_운영기록_2026-04-05.md](./031_%EA%B4%80%EB%A6%AC%EC%9E%90_%EC%9D%91%EB%8B%B5%EC%86%8D%EB%8F%84_%EC%B5%9C%EC%A0%81%ED%99%94_%EB%B0%8F_%EA%B8%B0%EB%8A%A5%EB%8F%99%EC%9D%BC%EC%84%B1_%EC%9E%AC%EA%B2%80%EC%A6%9D_%EC%9A%B4%EC%98%81%EA%B8%B0%EB%A1%9D_2026-04-05.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/031_%EA%B4%80%EB%A6%AC%EC%9E%90_%EC%9D%91%EB%8B%B5%EC%86%8D%EB%8F%84_%EC%B5%9C%EC%A0%81%ED%99%94_%EB%B0%8F_%EA%B8%B0%EB%8A%A5%EB%8F%99%EC%9D%BC%EC%84%B1_%EC%9E%AC%EA%B2%80%EC%A6%9D_%EC%9A%B4%EC%98%81%EA%B8%B0%EB%A1%9D_2026-04-05.md)
- GPS 장소 검증 + Google Place ID 서버리스 도입: [032_출석_GPS_장소검증_Google_Maps_Place_ID_서버리스_도입기록_2026-07-13.md](./032_출석_GPS_장소검증_Google_Maps_Place_ID_서버리스_도입기록_2026-07-13.md)
- 관리자 UI 컴팩트 앱 셸 전면 개선: [033_관리자_UI_컴팩트_앱셸_전면개선_운영기록_2026-07-15.md](./033_관리자_UI_컴팩트_앱셸_전면개선_운영기록_2026-07-15.md)
- 관리자 로그인·푸터·출석 조회·일정 관리 컴팩트 보정: [034_관리자_로그인_푸터_출석조회_일정관리_컴팩트_보정_운영기록_2026-07-15.md](./034_관리자_로그인_푸터_출석조회_일정관리_컴팩트_보정_운영기록_2026-07-15.md)
- 학생 페이지 v6.3 컴팩트 대시보드·출석 상세 결정 배경: [student-page-v6.3-compact-dashboard-detail.md](./student-page-v6.3-compact-dashboard-detail.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/student-page-v6.3-compact-dashboard-detail.md). 이 문서는 배경 기록이며 현재 정책은 `docs/Wiki/*`와 `Appsscript/*`, `web/*` 코드를 우선합니다.
- 일정 행사명 메타데이터 도입: [036_일정_행사명_메타데이터_도입_운영기록_2026-07-16.md](./036_일정_행사명_메타데이터_도입_운영기록_2026-07-16.md)
- 관리자 공용 출석 이력 모달 통합: [037_관리자_공용_출석이력_모달_통합_운영기록_2026-07-16.md](./037_관리자_공용_출석이력_모달_통합_운영기록_2026-07-16.md)
- 출석현황 대시보드 밀도 제어: [038_출석현황_대시보드_밀도제어_운영기록_2026-07-16.md](./038_출석현황_대시보드_밀도제어_운영기록_2026-07-16.md)
- 학생 행사 일정과 수료 조항 안내: [039_학생_행사일정_수료조항_안내_운영기록_2026-07-16.md](./039_학생_행사일정_수료조항_안내_운영기록_2026-07-16.md)
- 운세 관리 + 회귀 게이트: [022_운세관리탭_버전형업로드_및_회귀더블체크_운영기록_2026-02-20.md](./022_운세관리탭_버전형업로드_및_회귀더블체크_운영기록_2026-02-20.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/History/022_%EC%9A%B4%EC%84%B8%EA%B4%80%EB%A6%AC%ED%83%AD_%EB%B2%84%EC%A0%84%ED%98%95%EC%97%85%EB%A1%9C%EB%93%9C_%EB%B0%8F_%ED%9A%8C%EA%B7%80%EB%8D%94%EB%B8%94%EC%B2%B4%ED%81%AC_%EC%9A%B4%EC%98%81%EA%B8%B0%EB%A1%9D_2026-02-20.md)

## 범주별 문서
- 운영 정책/확장: `006` ~ `026`
- 배포/인증 런북: `011`, `019`, `mission-c-manual-setup.md`
- 미션 계획/결과: `mission-*.md`, `baseline.md`
- 템플릿: `variable_template_v3_5.csv`

## 현재 정본 이동
- Wiki 메인: [docs/Wiki/README.md](../Wiki/README.md) | [GitHub](https://github.com/cloud-club/CloudClubAttendanceSystem/blob/gh-pages/docs/Wiki/README.md)
