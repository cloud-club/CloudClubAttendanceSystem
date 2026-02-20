# 011 배포, Secret, API URL 주입 트러블슈팅 런북

## 1. 배경(어떤 이유로 추가됐는지)
운영 중 가장 치명적인 장애 중 하나는 “코드는 정상인데 API_BASE_URL이 비어 동작하지 않는 상태”였다. 원인은 대부분 아래였다.

- `APPS_SCRIPT_WEB_APP_URL` Secret을 바꿨지만 Pages를 재배포하지 않음
- `env.js` placeholder 치환 방식이 불안정해 런타임 조건이 깨짐
- GitHub Pages 소스가 legacy branch 방식이라 `Run workflow` 버튼이 보이지 않음

이 문제의 어려움은 장애가 코드 버그처럼 보인다는 점이다. 실제로는 비즈니스 로직이 아니라 배포 산출물 주입 문제인데, 증상은 모든 API 호출 실패로 나타난다. 그래서 운영자는 출석/변수/일정 기능이 동시에 고장난 것처럼 느끼고, 원인 추적에 시간을 많이 소모하게 된다.

이 문서는 배포 체인과 복구 절차를 운영자가 바로 실행할 수 있도록 정리한다.

## 2. 사용자 절차(어떻게 사용하는지)
### 2-1. 정상 배포 절차
1. Apps Script 새 버전 배포 후 `.../exec` URL 확인
2. GitHub Secret `APPS_SCRIPT_WEB_APP_URL` 갱신
3. `Deploy GitHub Pages` 워크플로우 실행(`workflow_dispatch` 또는 push)
4. 배포 완료 후 관리자 페이지 강력 새로고침
5. 변수 탭 상단의 API URL(마스킹)/`apiVersion`으로 반영 확인
6. 로그인 전 canary(`authGoogleLogin(dummy)`)가 `AUTH_SERVER_SCOPE_MISSING`이 아닌지 확인

핵심은 순서를 뒤집지 않는 것이다. Secret을 먼저 바꾸고 재배포를 생략하면, 저장소 설정은 최신인데 실제 서비스 페이지는 구 URL을 계속 사용한다. 이 상태는 로그상으로 즉시 드러나지 않기 때문에, 위 절차를 체크리스트처럼 고정해 반복하는 것이 가장 안전하다.

### 2-2. `Run workflow` 버튼이 안 보일 때
1. 저장소 `Settings > Pages`에서 Source를 `GitHub Actions`로 변경
2. 기본 브랜치(`main`)에도 같은 워크플로우 파일이 존재하는지 확인
3. `Actions` 탭에서 워크플로우를 열고 수동 실행 버튼 노출 여부 확인

### 2-3. 즉시 진단 체크
- 콘솔에 `API_BASE_URL이 설정되지 않았습니다`가 뜨면 env 주입 실패 또는 구배포 페이지 가능성이 높다.
- `/web/shared/env.js` 라이브 파일에서 실제 URL이 들어있는지 먼저 확인한다.

## 3. 설계 의도(왜 이렇게 했는지)
### Secret 단일 소스
API URL은 코드 하드코딩이 아니라 Secret 단일 기준으로 관리해야 운영자가 URL 교체를 통제할 수 있다.

### 배포 가드
Secret이 비어 있거나 주입 실패면 배포를 실패시켜야 조용한 장애를 막을 수 있다.

### 런타임 가시성
관리자 화면에서 API 버전/URL을 표시해 “내 브라우저가 지금 어떤 백엔드를 보고 있는지” 즉시 확인 가능하게 했다.

결국 런북의 목적은 기술 문서를 늘리는 것이 아니라 운영자의 의심 순서를 표준화하는 것이다. “기능 탓인지, 배포 탓인지”를 빨리 구분할 수 있어야 장애 복구 시간이 짧아진다. 이 문서는 그 구분 순서를 고정하기 위한 실행 문서다.

## 4. API/데이터 영향
| 항목 | 변경 내용 | 영향 |
|---|---|---|
| `apiInfo` | 서버 버전/지원 액션/타임존 조회 | 프런트-백엔드 버전 불일치 진단 가능 |
| `env.js` | Secret URL 주입 방식 안전화 | `API_BASE_URL` 미설정 장애 재발률 감소 |
| workflow 검증 | Secret/주입/API 헬스 체크 실패 시 배포 중단 | 불완전 산출물 배포 차단 |
| auth canary 검증 | `authGoogleLogin(dummy)`에서 scope 오류 감지 시 배포 중단 | `AUTH_SERVER_SCOPE_MISSING` 상태의 운영 배포 방지 |

## 5. 커밋 근거표(커밋 ID, 변경 파일, 핵심 diff 요약)
| 커밋 | 핵심 변경 | 주요 파일 |
|---|---|---|
| `3880291` | 배포 가드 강화 + `apiInfo` 기반 호환성 체크 + 변수탭 차단 로직 | `/Users/sbu/SBU/CloudClubAttendanceSystem/.github/workflows/deploy-gh-pages.yml`, `/Users/sbu/SBU/CloudClubAttendanceSystem/Code.gs`, `/Users/sbu/SBU/CloudClubAttendanceSystem/web/admin/admin.js` |
| `b085ea9` | `env.js`/`config.js` 병합 우선순위 보정, API_BASE_URL 장애 수정 | `/Users/sbu/SBU/CloudClubAttendanceSystem/web/shared/env.js`, `/Users/sbu/SBU/CloudClubAttendanceSystem/web/shared/config.js`, `/Users/sbu/SBU/CloudClubAttendanceSystem/web/shared/api-jsonp.js` |
| `ddf07dd` (`main`) | 기본 브랜치에 workflow 추가(수동실행 버튼 노출 기반) | `/Users/sbu/SBU/CloudClubAttendanceSystem/.github/workflows/deploy-gh-pages.yml` |
| `6cacb9d` | Pages 재배포 트리거 커밋 | `/Users/sbu/SBU/CloudClubAttendanceSystem` |

## 6. 운영상 주의점
- Secret 업데이트만으로는 배포 산출물이 갱신되지 않는다. 반드시 재배포가 필요하다.
- 브라우저 캐시 때문에 이전 `env.js`를 볼 수 있으므로 하드 리로드를 기본으로 한다.
- `Pages Source=GitHub Actions`가 아니면 workflow 수동 실행 UX가 제한될 수 있다.

## 7. 검증 시나리오
1. Secret 변경 전/후 `window.CLOUDCLUB_CONFIG.API_BASE_URL` 값을 비교한다.
2. `api=apiInfo` 호출이 최신 버전 정보를 반환하는지 확인한다.
3. 관리자 페이지 초기 로딩에서 `MISSING_API_BASE_URL` 에러가 사라졌는지 확인한다.
4. `env.js`에 placeholder(`__API_BASE_URL__`)가 남아있지 않은지 확인한다.
5. workflow 로그에서 Secret 검증, 주입 검증, 헬스체크 단계가 모두 통과했는지 확인한다.
6. workflow 로그에서 `Auth scope canary` 단계가 통과했는지 확인한다.

## 8. 실제 운영 사례(실패 예시/대응 예시)
### 사례 1. Secret은 바꿨는데 관리자 페이지는 계속 `API_BASE_URL 미설정`이 뜬 경우
실패 상황: GitHub Secrets에 새 Apps Script URL을 넣었지만 관리자/학생 화면 모두 API 호출이 실패했다.  
원인: Secret 변경 후 Pages 재배포를 하지 않아 기존 배포 산출물의 `env.js`가 계속 사용됐다.  
대응: workflow를 수동 실행해 새 산출물을 배포하고, `apiInfo`와 `window.CLOUDCLUB_CONFIG.API_BASE_URL`로 반영 여부를 즉시 확인했다.  
재발 방지: Secret 변경 작업에 “재배포 완료 스크린샷”을 필수 증빙으로 넣어, 설정 변경만 하고 종료하는 실수를 차단했다.

### 사례 2. `Run workflow` 버튼이 보이지 않아 재배포를 못 한 경우
실패 상황: 운영자는 배포를 다시 하고 싶었지만 Actions 화면에 수동 실행 UI가 없었다.  
원인: Pages Source가 legacy branch 방식이거나 기본 브랜치에 workflow 파일이 없어서 수동 실행 조건을 만족하지 못했다.  
대응: Pages Source를 GitHub Actions로 변경하고, `main` 브랜치에도 동일 workflow 파일을 배치했다.  
재발 방지: 저장소 초기 세팅 문서에 “Pages Source / 기본 브랜치 workflow 존재 여부” 점검 항목을 고정했다.

## 9. 남은 리스크/차기 개선 포인트
- GitHub Actions 권한이 제한된 저장소에서는 운영자가 직접 배포를 트리거하지 못할 수 있다.
- 다중 환경(dev/stage/prod) 분리가 필요해지면 Secret 세분화와 환경별 Pages 사이트 전략이 필요하다.

## 관련 문서
- `/Users/sbu/SBU/CloudClubAttendanceSystem/docs/005_관리자기능_확장_연대기_2026-02-18.md`
- `/Users/sbu/SBU/CloudClubAttendanceSystem/docs/012_운영자_개발자_통합_검증체크리스트.md`
- `/Users/sbu/SBU/CloudClubAttendanceSystem/docs/013_시즌업데이트_운영한계_및_임시운영정책.md`
- `/Users/sbu/SBU/CloudClubAttendanceSystem/docs/014_시즌업로드_파일정규화_및_파싱트러블슈팅_런북.md`
- `/Users/sbu/SBU/CloudClubAttendanceSystem/docs/015_시즌업데이트_Diff고도화_로드맵.md`
