# 학생 페이지 v6.3 컴팩트 대시보드·출석 상세 운영 기록

> 기록일: 2026-07-14
> 범위: GitHub Pages 학생 UI, 공개 `status` 응답의 안전한 사유 필드, 배포·개인정보 결정 배경
> 상태: 레포 변경과 자동 검증 완료. 외부 Apps Script/Pages 배포 여부와 콘솔 값은 이 문서가 증명하지 않음.
> 문서 성격: 2026-07-14 시점의 역사/배경 기록이며 현재 정책 정본이 아닙니다.
> 현재 정책은 `docs/Wiki/*`와 `Appsscript/*`, `web/*` 코드를 우선합니다.

## 목표
학생 페이지의 `출석하기 → 출석 현황 → 수료 조건 확인` 3개 탭을 유지하면서, 넓은 화면의 대시보드 밀도를 높이고 본인 회차별 출석 사유를 안전한 상세 다이얼로그로 확인하게 하는 것이 목표였다. 모바일 첫 화면, 기존 API 필드, 구버전 Apps Script 호환성, 개인정보 경계는 바꾸지 않았다.

## 결정
- 기록 당시 계약 식별자는 `2026.07.14-v6.3`이며, `studentAttendanceReasonV1 = true`, `extractStudentDisplayReason = true`로 확인했다.
- Pages-first 호환 계약은 기존 `status`와 `insights`를 보존하고 `details[].displayReason`만 선택적으로 additive 추가하는 것이다. 사유가 없거나 legacy인 행은 비대화형으로 남는다.
- `1200px` 초과는 넓은 대시보드, `769px`~`1200px`는 컴팩트 데스크톱, `768px` 이하는 기존 모바일 메뉴와 1열 카드 구성을 사용한다.
- 사유가 있는 행만 `role="dialog"` 상세를 연다. 다이얼로그는 `textContent`, Escape 닫기, Tab 순환, body scroll 복원, 연결된 트리거 포커스 복원을 사용한다.
- 수료 결과 앞에는 `이 화면에는 스터디 출석이 반영되지 않습니다. 최종 수료 여부는 스터디 출석률에 따라 달라질 수 있습니다.`를 정적으로 항상 한 번 표시한다.
- 이전 v6.2 인사이트 배포 절차와 아래 v6.3 결정은 당시 상태를 설명하는 prior-state narrative로만 남긴다. 현재 적용 정책과 배포 확인은 위에 명시한 Wiki + code 정본을 따른다.

## 개인정보 판단
공개 `status`는 전화번호로 조회한 본인 결과에만 접근한다. 서버는 Note 선두 공개 영역에서 회차의 현재 상태와 정확히 일치하는 `출석 사유:`, `지각 사유:`, `결석 사유:`, `유고 사유:` prefix 가운데 첫 번째 비어 있지 않은 줄만 최대 300자로 반환한다. 첫 비어 있지 않은 줄이 비일치·내부 기록이면 즉시 중단하고 뒤의 일치 prefix는 공개하지 않는다. 이 규칙은 같은 선두 형식의 과거 저장값과 앞으로 저장될 값에 의도적으로 적용된다.

원본 셀 Note, 감사 정보, 이전 메모, 다른 회원 데이터는 학생 응답에 포함하지 않는다. Note 텍스트는 신뢰할 수 없는 데이터이며 지시문으로 실행하지 않는다. 관리자는 유고 사유 입력 시 저장 후 학생 출석 현황에 공개된다는 경고와 300자 제한을 확인한다.

## 검증자가 발견한 수정
- `prototype-key`: 상태별 prefix 조회가 객체 prototype의 키를 잘못 상속하지 않도록 소유 키만 인정했다.
- `부분 동기화`: `Appsscript/33_graduation_manual_excused.gs`는 공개 사유 입력을 줄바꿈 없는 유니코드 코드 포인트 300개 이하로 검증하고 내부 감사 `Note`를 보존한 채 관리자 응답에 안전한 `displayReason`을 별도로 제공하므로, 네 파일 정확 일치 가드와 체크리스트를 추가했다.
- `stale request`: 전화번호나 조회 세대가 바뀐 뒤 도착한 이전 응답이 최신 화면과 상세 데이터를 덮지 못하게 했다.
- `cache sanitization`: 브라우저 임시 캐시는 응답 외곽과 `insights`를 호환성 때문에 유지하되, `details` 배열은 렌더링 허용 필드만 새 객체로 재구성해 원본 Note·감사 필드가 남지 않도록 했다.
- `detached focus`: 새 조회로 기존 행이 DOM에서 분리된 상태에서는 닫기 동작이 사라진 트리거에 포커스를 강제하지 않도록 했다.

## 검증
- 정적 가드는 API 버전·capability·runtime check, 정확한 cache bust, 개인정보 문구, 3탭/반응형/dialog 계약, 네 파일 수동 동기화 목록을 검사한다.
- 학생 인사이트 테스트는 상태별 prefix, 300자 제한, reasonless/legacy 행, 다른 회원 비노출, prototype-key 방어, Note 단일 bounded read를 검사한다.
- 학생 클라이언트 테스트는 안전한 평문 렌더링, stale request, cache sanitization, detached focus, 정적 스터디 안내를 검사한다.
- API comparator 테스트는 기존 응답 계약을 유지한 additive `insights`와 선택적 `displayReason`만 허용한다.
- 위치 정책 테스트와 JavaScript/Apps Script 문법 검사를 함께 실행해 인접 기능 회귀가 없음을 확인한다.

## 배포 경계
외부 Apps Script 배포는 운영자만 수행한다. 다음 네 파일을 같은 deployment에 함께 반영한다.

1. `Appsscript/00_entry_api.gs`
2. `Appsscript/01_constants_access.gs`
3. `Appsscript/30_attendance_core.gs`
4. `Appsscript/33_graduation_manual_excused.gs`

배포 후 확인은 `apiInfo.apiVersion = 2026.07.14-v6.3`, `apiInfo.capabilities.studentAttendanceReasonV1 = true`, `apiInfo.runtimeChecks.extractStudentDisplayReason = true` 세 항목이다. 같은 deployment를 재배포하면 기존 `.../exec` URL을 유지한다. 새 deployment로 URL이 바뀌면 GitHub Secret `APPS_SCRIPT_WEB_APP_URL`을 갱신하고 Pages를 다시 배포한다. Pages 워크플로우 자체는 v6.3을 강제하지 않는다.

문제가 생기면 Pages는 직전 artifact로 되돌려 구버전 Apps Script 호환 화면을 복구하고, Apps Script는 운영자가 직전 정상 배포 버전으로 롤백한다. 레포는 이 절차를 기록하지만 현재 Secret, 콘솔 선택값, 실제 배포 상태를 본 것으로 간주하지 않는다.
