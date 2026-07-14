# Admin Scripts Split Guide

이 디렉토리는 기존 `web/admin/admin.js` 단일 파일을 동작 불변으로 도메인 분할한 운영 소스입니다.

## 원칙
- 기능/화면/권한 동작은 기존과 동일하게 유지합니다.
- 백엔드 API 계약(`action`, 파라미터, 응답 스키마)은 변경하지 않습니다.
- `type="module"` 없이 클래식 `<script>` 다중 로드 순서를 사용합니다.
- `index.html` 인라인 이벤트 핸들러와의 호환을 유지합니다.

## 로딩 순서
1. `00_namespace.js`
2. `01_state.js`
3. `02_utils.js`
4. `03_dom_refs.js`
5. `04_api_client.js`
6. `05_runtime_deps.js`
7. `06_front_cache.js`
8. `07_admin_shell.js`
9. `10_auth.js`
10. `20_attendance.js`
11. `21_dashboard.js`
12. `22_location.js`
13. `22_schedule.js`
14. `23_import.js`
15. `24_variables.js`
16. `25_graduation_excused.js`
17. `26_admin_users.js`
18. `27_qr_links.js`
19. `28_fortune.js`
20. `90_bootstrap.js`
21. `99_compat_handlers.js`

## 파일 책임
- `07_admin_shell.js`: 컴팩트 상단바, 단일 탭 탐색, 모바일 메뉴, 탭 ARIA 동기화
- `10_auth.js`: 로그인/세션/권한 게이트
- `20_attendance.js`: 출석/현황/수동 승인 핵심
- `21_dashboard.js`: 대시보드 집계/드릴다운/CSV
- `22_location.js`: 출석 장소 검색·Place ID 확인·위치 선택 상태
- `22_schedule.js`: 일정 CRUD/캘린더/충돌 처리
- `23_import.js`: 시즌 업로드 분석/실행/중단
- `24_variables.js`: 변수 조회/저장/호환성 체크
- `25_graduation_excused.js`: 수료 판정/유고 처리
- `26_admin_users.js`: 관리자 계정 CRUD
- `27_qr_links.js`: QR/URL 로딩 및 복사
- `28_fortune.js`: 운세 버전 조회·검증·업로드·다운로드

## 호환성
- 기존 전역 핸들러 이름(`openTab`, `saveSchedule`, `loadVariables` 등)은 유지됩니다.
- `99_compat_handlers.js`는 인라인 이벤트 함수 존재 여부를 점검합니다.

## 참고
- `web/admin/admin.js`는 롤백 대비용 레거시 참조 파일로 남아있습니다.
- 실제 페이지 로딩은 `web/admin/index.html`의 `scripts/*.js`를 기준으로 합니다.
