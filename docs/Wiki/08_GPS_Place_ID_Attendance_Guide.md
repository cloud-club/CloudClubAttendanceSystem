# GPS · Google Place ID 출석 운영 가이드

> 배경과 결정 이유: [History 032](../History/032_출석_GPS_장소검증_Google_Maps_Place_ID_서버리스_도입기록_2026-07-13.md)

## 1. 결론

이 기능은 별도 서버를 추가하지 않는다. GitHub Pages가 관리자 장소 선택과 학생 위치 권한 UI를 담당하고, 기존 Apps Script가 Google Place ID 해석과 500m 판정을 수행하며, Google Sheets의 각 회차 헤더가 정책 저장소가 된다.

코드 변경은 `web/*`, `Appsscript/*`, Pages workflow에 걸쳐 있다. 운영 반영에는 Apps Script와 GitHub Pages를 모두 배포해야 하며, GCP·Apps Script·GitHub에서 사람이 직접 설정할 값이 있다.

## 2. 데이터 계약

```text
과거 호환: 2026-09-20-14:00~16:00
제한 없음: 2026-09-20-14:00~16:00|v=1|gps=0
위치 필수: 2026-09-20-14:00~16:00|v=1|gps=1|pid=<URL encoded Place ID>|r=500
```

- 헤더 셀 값: 날짜, 시간, 장소 제한 여부, Google Place ID, 500m 반경
- 헤더 셀 Note: 관리자가 웹에서 입력한 학생용 장소 안내/회차 메모
- 회원 행의 회차 셀: 기존과 동일한 출석 시각 또는 유고/수동 승인 값
- `_session_meta`: 기존 시간 정책 7열 유지, 장소 데이터 저장 안 함
- 참가자 좌표: 판정 후 폐기, Sheets/Note/localStorage 미저장
- Google 장소 좌표: Apps Script Cache에 최대 6시간, Sheets 미저장

## 3. 처음 한 번 수동으로 할 일

### 3.1 Google Cloud 프로젝트 준비

가능하면 기존 Google OAuth와 Apps Script 운영에 사용하는 Google 계정의 표준 Cloud 프로젝트를 사용한다. 레포는 실제 연결 프로젝트를 알 수 없으므로 Apps Script `Project Settings > Google Cloud Platform (GCP) Project`에서 사람이 확인한다.

1. [Google Cloud Console](https://console.cloud.google.com/)에서 대상 프로젝트 선택
2. Billing 연결 확인
3. `APIs & Services > Library`에서 `Maps JavaScript API` 활성화
4. `Places API (New)` 활성화
5. 예산 알림과 API 사용량/할당량 알림 설정

브라우저의 `navigator.geolocation`을 사용하므로 `Geolocation API`를 별도로 활성화할 필요는 없다.

#### 무료 사용량과 과금 경고

이 구성은 Google Maps Platform의 종량제 API를 사용하므로 Billing 연결이 필요하다. 사용량이 SKU별 월간 무료 한도 안이면 청구액은 0원이지만, 무료 전용 상품은 아니며 한도를 넘으면 과금될 수 있다. 2026-07-13 공식 가격 기준으로 현재 호출 표면은 다음과 같다.

- 학생의 `navigator.geolocation`: Google Maps 과금 대상 아님
- 관리자 신규 장소 선택: `displayName`을 포함한 자동완성 세션 종료 요청이 Place Details Enterprise + Atmosphere로 처리될 수 있으며 월 1,000건 무료
- 기존 장소 편집창 재조회: Place Details Pro, 월 5,000건 무료
- Apps Script의 `id,location` 조회: Place Details Essentials, 월 10,000건 무료
- 장소를 선택하지 않고 끝난 자동완성 검색: Autocomplete Requests, 월 10,000건 무료

현재 예상 운영량은 이 한도보다 매우 작지만, 반복 조회·오작동·키 악용까지 포함해 0원을 보장하지는 않는다. Budget 알림은 과금을 중단하지 않으므로 브라우저 키 제한과 함께 무료 한도보다 충분히 낮은 API 할당량을 설정하고 Billing Report를 정기적으로 확인한다. 가격과 세션 과금 규칙은 변경될 수 있으므로 배포 전 [공식 가격표](https://developers.google.com/maps/billing-and-pricing/pricing), [자동완성 세션 가격](https://developers.google.com/maps/documentation/javascript/session-pricing), [비용 관리 안내](https://developers.google.com/maps/billing-and-pricing/manage-costs)를 다시 확인한다.

### 3.2 브라우저 키 생성

`APIs & Services > Credentials > Create credentials > API key`에서 관리자 Pages용 키를 만든다.

- Application restrictions: `Websites`
- Website restrictions: 운영 origin을 포함하는 패턴. 현재 기본 운영 주소라면 `https://cloud-club.github.io/*`
- API restrictions: `Maps JavaScript API`, `Places API (New)`만 허용
- 로컬 테스트가 필요하면 운영 키를 넓히기보다 localhost 전용 키를 별도로 만든다.

이 키는 배포된 `env.js`에서 보인다. GitHub Secret은 소스 하드코딩을 막는 용도이며, 키 자체를 브라우저 사용자에게 숨기지 못한다. 보안 경계는 referrer 제한, API 제한, 할당량이다.

### 3.3 Apps Script 서버 키 생성

같은 프로젝트에서 Places 서버 조회 전용 키를 별도로 만든다.

- API restrictions: `Places API (New)`만 허용
- 브라우저 키와 재사용하지 않는다.
- Apps Script는 고정 전용 IP가 없으므로 무리한 IP 제한보다 API 제한과 할당량 모니터링을 우선한다.

Apps Script Editor에서 `Project Settings > Script Properties`에 다음 값을 추가한다.

```text
GOOGLE_MAPS_SERVER_API_KEY=<서버용 키>
```

값을 레포, 문서, 이슈, 스크린샷에 기록하지 않는다.

### 3.4 GitHub Actions Secret 추가

`GitHub Repo > Settings > Secrets and variables > Actions`에 다음 Secret을 추가한다.

```text
GOOGLE_MAPS_BROWSER_API_KEY=<웹사이트 제한 브라우저 키>
```

기존 `APPS_SCRIPT_WEB_APP_URL`도 유지한다. 브라우저 키를 추가한 뒤에만 Pages workflow가 통과한다.

### 3.5 공개 정책과 Google Maps 표시 확인

Google Places 정책상 공개 이용약관·개인정보 처리 안내와 Google Maps attribution은 배포 전 필수다.

1. `web/privacy.html`에서 현재 위치의 처리 목적, Apps Script 전송, 참가자 좌표 미저장, 문의처가 실제 운영 정책과 일치하는지 검토
2. `web/terms.html`에서 Google Maps 관련 약관 링크와 위치 판정 한계를 검토
3. 학생·관리자 페이지에서 두 정책 링크가 공개적으로 열리는지 확인
4. 관리자 장소 선택 영역에서 Place 이름·주소와 같은 컨테이너에 `Google Maps` attribution이 항상 보이는지 확인
5. Google이 Place 결과에 제3자 attribution을 반환하면 함께 표시되는지 확인

정책 정본은 [Google Places 정책과 attribution 요구사항](https://developers.google.com/maps/documentation/places/web-service/policies)이다. 레포의 기본 문구가 조직의 법적 검토를 대체하지는 않는다.

## 4. Apps Script 반영과 재배포

이 레포에는 Apps Script 콘솔의 현재 프로젝트나 deployment 상태가 들어 있지 않다. 아래 작업은 운영자가 직접 한다.

1. 변경된 `Appsscript/*.gs` 파일을 실제 Apps Script 프로젝트에 동기화
2. 새 파일 `22_location_attendance.gs`가 프로젝트에 존재하는지 확인
3. Script Property `GOOGLE_MAPS_SERVER_API_KEY` 저장 확인
4. Editor에서 기존 `__authorizeExternalRequest()`를 한 번 실행
5. 배포 소유자 계정으로 `UrlFetchApp` 외부 요청 권한 승인
6. `Deploy > Manage deployments`에서 운영 Web App 선택
7. `Edit > New version > Deploy`로 같은 deployment 갱신

같은 deployment를 갱신하면 보통 기존 `.../exec` URL이 유지되므로 `APPS_SCRIPT_WEB_APP_URL`을 바꿀 필요가 없다. 새 deployment를 만들어 URL이 바뀐 경우에만 해당 GitHub Secret도 갱신한다.

배포 후 아래 `apiInfo`를 확인한다.

```text
capabilities.locationAttendanceV1 = true
capabilities.locationHeaderPolicyV1 = true
capabilities.googlePlacesServerConfigured = true
```

마지막 값이 `false`면 Script Property 이름 또는 실제 운영 deployment의 프로젝트를 다시 확인한다.

`googlePlacesServerConfigured=true`는 Script Property가 비어 있지 않다는 뜻일 뿐, 키의 유효성·Billing·API 제한까지 증명하지 않는다. 최초 도입에서는 아직 새 관리자 UI와 브라우저 키가 Pages에 없으므로 이 단계에서 실제 장소 저장까지 검증할 수 없다. 여기서는 capability와 설정 존재만 확인하고 Pages를 배포한다.

## 5. GitHub Pages 배포

Apps Script 검증이 끝난 뒤 `Deploy GitHub Pages` workflow를 실행한다. workflow는 다음을 자동 확인한다.

- `APPS_SCRIPT_WEB_APP_URL` 형식
- `GOOGLE_MAPS_BROWSER_API_KEY` 존재
- `web/shared/env.js` 두 placeholder 치환
- Apps Script `locationAttendanceV1` capability
- 기존 OAuth/UrlFetch canary
- 공개 `privacy.html`, `terms.html`과 학생·관리자 정책 링크
- 관리자 장소 요약의 `Google Maps` attribution 표면

workflow가 성공해도 Maps referrer 제한과 장소 자동완성은 `curl`로 완전히 검증할 수 없다. 배포 직후, 운영 회차를 만들기 전에 다음 canary를 수행한다.

1. 실제 운영 관리자 URL로 접속
2. 운영 데이터와 분리된 테스트 시즌에서 미래 회차 생성
3. 실제 Google 장소를 선택하고 GPS 필수로 저장
4. 다시 열었을 때 Place 이름·주소·500m 정책·Note가 유지되는지 확인
5. 테스트 회차 삭제

이 저장 성공이 Apps Script의 실제 Place Details 호출, 서버 키, Billing/API 제한과 브라우저 referrer 제한을 함께 확인하는 최초 통합 검증이다. 실패하면 운영 GPS 회차를 만들지 말고 Pages를 직전 artifact/commit으로 즉시 롤백한다. 새 Apps Script는 레거시 헤더를 계속 지원하므로 canary 중 GPS 헤더가 남지 않았음을 확인한 뒤 백엔드는 유지해도 된다.

## 6. 관리자 사용 흐름

1. 관리자 로그인
2. `일정 관리`에서 새 회차 또는 기존 회차 열기
3. 날짜와 시간 입력
4. 필요한 회차만 `장소 기반 출석 확인 필수` 선택
5. Google 장소 검색 결과에서 실제 장소 선택
6. 학생에게 보여 줄 장소 안내/회차 메모를 선택적으로 입력
7. `500m` 반경 확인 후 저장

검색어를 타이핑만 하고 결과를 선택하지 않으면 Place ID가 없으므로 저장할 수 없다. 기존 장소 정책이 있는 회차에서 Google Maps 로드가 실패해도 저장된 Place ID는 자동 삭제하지 않는다. 장소를 해제해 저장한 경우에만 `gps=0`으로 바뀐다.

## 7. 학생 사용 흐름

1. 위치 제한 없는 회차는 기존처럼 전화번호만으로 출석
2. 위치 필수 회차는 출석 버튼 주변에 500m 안내 표시
3. 출석 버튼을 누른 시점에만 브라우저 위치 권한 요청
4. 최신 위치와 accuracy를 Apps Script에 POST
5. Apps Script가 Place ID 좌표와 Haversine 거리 계산
6. 500m 이내이고 accuracy가 100m 이내일 때만 출석 기록

위치 좌표는 URL query, Sheets, 셀 Note, localStorage에 저장하지 않는다. 네트워크 오류가 있더라도 오류 화면에는 좌표를 출력하지 않는다.

## 8. 배포 후 필수 검증

| 시나리오 | 기대 결과 |
|---|---|
| 배포 직후 테스트 시즌 Place 저장·재열기·삭제 | 실제 장소와 정책이 유지되고 테스트 회차가 제거됨 |
| 과거 헤더 회차 | 위치 권한 없이 기존 출석 성공 |
| 새 `gps=0` 회차 | 위치 권한 없이 기존 출석 성공 |
| `gps=1`, 행사장 내부 | 위치 확인 후 출석 성공 |
| 500m 초과 | `LOCATION_OUT_OF_RANGE`, 시트 미기록 |
| 위치 권한 거부 | 재허용 안내, 시트 미기록 |
| accuracy 101m 이상 | 정확도 개선 안내, 시트 미기록 |
| Place ID 누락/손상 | 정책 오류, 시트 미기록 |
| Places 키/권한 실패 | 서버 설정/서비스 오류, 시트 미기록 |
| 기존 GET API 직접 호출 | GPS 필수 회차는 `LOCATION_REQUIRED` |
| GPS 불가 참가자 | 관리자 수동 승인 및 기존 감사 Note 사용 |
| 일정 수정 중 동시 변경 | `LOCATION_POLICY_CHANGED_RETRY` 또는 `SCHEDULE_CHANGED_RETRY` |
| 손상된 장소 정책 | 학생 위치 권한을 요청하지 않고 운영진 문의 표시 |
| 정책/표시 | 개인정보·이용약관 링크 공개, 장소 요약 옆 `Google Maps` 표시 |

정적 회귀 검사는 다음 명령으로 실행한다.

```bash
node scripts/location_policy_test.js
node scripts/doublecheck_static_guard.js
```

## 9. 장애 분기

- `GOOGLE_PLACES_SERVER_NOT_CONFIGURED`: Apps Script Script Property 확인 후 같은 deployment 재배포
- `GOOGLE_PLACES_FORBIDDEN`: 서버 키의 프로젝트/API 제한, Places API 활성화, Billing 확인
- `GOOGLE_PLACES_QUOTA_EXCEEDED`: GCP 할당량과 사용량 확인
- `GOOGLE_PLACE_NOT_FOUND`: 관리자 화면에서 장소 재선택
- `RefererNotAllowedMapError`: 브라우저 키 Website restriction과 운영 origin 확인
- `ApiNotActivatedMapError`: Maps JavaScript API/Places API (New) 활성화 확인
- `LOCATION_PERMISSION_DENIED`: 브라우저 사이트 설정에서 위치 권한 허용
- `LOCATION_ACCURACY_TOO_LOW`: 위치 서비스·Wi-Fi를 켜고 신호가 좋은 곳에서 재시도
- `LOCATION_OUT_OF_RANGE`: 행사장 500m 이내로 이동
- `LOCATION_RESULT_TIMEOUT`: Apps Script Cache는 만료시각 전에 비워질 수도 있다. 출석현황에서 해당 회차 기록을 먼저 확인하고, 미기록일 때만 재시도

## 10. 롤백

1. 시즌 시트를 백업
2. 현재 GPS 호환 프런트·백엔드가 살아 있는 동안 롤백 대상 회차를 확인
3. 구버전으로 완전히 복귀해야 한다면 각 헤더에서 `|v=1|...` suffix를 제거해 `2026-09-20-14:00~16:00` 같은 legacy 헤더로 복구하고, 같은 셀 Note의 보존 여부를 확인
4. 헤더를 직접 수정하지 않으려면 새 `parseSessionHeader`를 포함한 호환 백엔드를 유지한 채 나머지 기능만 롤백
5. 이후 이전 Apps Script 버전과 Pages artifact/commit을 배포
6. `apiInfo`, legacy 회차 탐지, 기존 출석값, 학생 출석, 관리자 수동 승인을 다시 검증

관리자 화면의 `gps=0` 저장은 `|v=1|gps=0` suffix를 남기므로 anchored legacy parser용 복구가 아니다. 위치 정책을 저장한 뒤 단순히 백엔드만 구버전으로 내리는 것도 안전한 롤백이 아니다. 데이터 헤더와 런타임 파서 버전을 함께 본다.

## 11. 레포가 아는 것과 사람이 확인할 것

레포가 아는 것:

- Secret/Script Property 이름
- 헤더 문자열 형식
- 500m·100m 정확도 정책
- 배포 순서와 capability
- 테스트 코드와 기대 오류
- 공개 개인정보·이용약관 기본 페이지와 attribution 코드

사람이 외부 콘솔에서 확인할 것:

- 실제 GCP 프로젝트와 Billing 연결
- API 활성화 상태
- 두 키의 실제 값과 제한
- GitHub Secret 실제 값
- Apps Script Script Property 실제 값
- 운영 deployment 버전과 실행 계정
- 모바일 브라우저 위치 권한·실제 정확도
- Place ID의 현재 유효성
- 공개 정책 문구의 조직 적합성과 Google Maps attribution 실제 표시
