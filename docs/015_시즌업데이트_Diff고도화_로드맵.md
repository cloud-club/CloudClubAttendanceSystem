# 015 시즌업데이트 Diff고도화 로드맵

## 1. 배경(어떤 이유로 추가됐는지)
현재 운영 정책은 안정성을 위해 `create` 우선으로 조정되어 있다. 이는 단기적으로 합리적이지만, 장기적으로는 기존 시즌 데이터를 안전하게 갱신할 수 있는 업데이트 경로가 필요하다.

실제 운영 요구는 다음과 같다.

- 기존 시즌 전체 시트를 기준으로 변경점만 정확히 반영하고 싶다.
- 동일 의미 데이터의 표현 차이(전화번호/이메일/공백/대소문자) 때문에 과잉 Diff가 발생하지 않아야 한다.
- 운영자가 “왜 변경으로 계산됐는지”를 설명할 수 있어야 한다.

따라서 본 문서는 **전체시트 기반 Diff 업데이트를 운영 가능한 품질로 끌어올리기 위한 단계형 구현 방향**을 정의한다.

## 2. 사용자 절차(어떻게 사용하는지)
### 2-1. 단기(현행)
1. 생성(create) 경로를 기본 운영으로 사용한다.
2. 업데이트(update)는 제한적 사용 + 수동 검증을 유지한다.

### 2-2. 중기(고도화 완료 후)
1. 전체시트 기반 canonical Diff를 계산한다.
2. 변경 이유(정규화 전/후 값 포함)를 미리보기에서 확인한다.
3. 위험도 높은 변경(대량 삭제 후보, 키 충돌)은 자동 차단 후 운영자 승인 절차로 분리한다.

## 3. 설계 의도(왜 이렇게 했는지)
Diff는 “기술적으로 계산 가능”한 것과 “운영자가 신뢰할 수 있는 것”이 다르다.  
고도화 목표는 단순 정확도 향상이 아니라 **설명 가능성 + 안전성 + 운영 속도**의 균형이다.

- 설명 가능성: 왜 바뀌었는지 근거를 UI에 노출
- 안전성: 대량 오탐/오반영을 가드로 차단
- 운영 속도: 정상 케이스는 빠르게, 위험 케이스는 보수적으로

## 4. API/데이터 영향 (목표 설계)
| 항목 | 제안 변경 | 기대 효과 |
|---|---|---|
| Diff 스냅샷 | canonical 전처리 결과 포함 | 표현 차이 노이즈 감소 |
| 변경 사유 | 필드별 reason code 확장 | 운영자 판단 속도 향상 |
| 요약 지표 | confidence/impact score 도입 | 위험 변경 자동 감지 |
| finalize 가드 | 삭제 후보 임계치/키 충돌 차단 | 대량 오반영 예방 |

## 5. 커밋 근거표(커밋 ID, 변경 파일, 핵심 diff 요약)
| 커밋 | 핵심 변경 | 주요 파일 |
|---|---|---|
| `50d3170` | 업로드·스키마 v2 기반 토대 구축 | `/Users/sbu/SBU/CloudClubAttendanceSystem/Code.gs`, `/Users/sbu/SBU/CloudClubAttendanceSystem/web/admin/admin.js` |
| `0424193` | update/diff 승인 플로우 도입 | `/Users/sbu/SBU/CloudClubAttendanceSystem/Code.gs`, `/Users/sbu/SBU/CloudClubAttendanceSystem/web/admin/admin.js` |
| `fbae7f5` | 업데이트 모드 보정 및 diff 통합 | `/Users/sbu/SBU/CloudClubAttendanceSystem/Code.gs`, `/Users/sbu/SBU/CloudClubAttendanceSystem/web/admin/admin.js` |
| `cdb3729` | OB 포함 정책 반영 | `/Users/sbu/SBU/CloudClubAttendanceSystem/Code.gs`, `/Users/sbu/SBU/CloudClubAttendanceSystem/web/admin/admin.js` |
| `e55537a` | active 세션 복구/중단, Diff UI 가시성 강화 | `/Users/sbu/SBU/CloudClubAttendanceSystem/Code.gs`, `/Users/sbu/SBU/CloudClubAttendanceSystem/web/admin/admin.js`, `/Users/sbu/SBU/CloudClubAttendanceSystem/web/admin/index.html` |

## 6. 운영상 주의점
- 고도화 이전까지는 업데이트를 기본 경로로 승격하지 않는다.
- 고도화 작업 중에도 create 경로의 안정성 회귀를 허용하지 않는다.
- “정확도 개선” 명목으로 자동 삭제 반영을 먼저 열지 않는다(삭제는 마지막 단계).

## 7. 검증 시나리오 (차기 구현 수용 기준)
1. 동일 의미/다른 표현 데이터에서 UPDATE/DELETE 과잉 탐지가 유의미하게 감소해야 한다.
2. 키 충돌/대량 삭제 후보가 발생하면 finalize가 자동 차단되어야 한다.
3. Diff 미리보기에서 필드별 변경 이유(reason code, before/after canonical)가 확인 가능해야 한다.
4. create 경로 E2E는 기존 대비 성능/안정성 회귀가 없어야 한다.

## 8. 실제 운영 사례(실패 예시/대응 예시)
### 사례 1. 표현 차이만 있는 파일에서 대량 변경으로 계산된 경우
실패 상황: 실제 업무 변경은 제한적이었으나 Diff가 광범위하게 표시되었다.  
원인: canonical 정규화 규칙이 충분히 표준화되지 않아 문자열 표현 차이가 변경으로 계산됨.  
대응(목표): field별 canonical 비교를 기본값으로 전환하고 raw 차이는 보조 정보로 분리 표시.  
재발 방지: 정규화 규칙 회귀 테스트를 고정하고, 신규 규칙 추가 시 샘플 세트를 함께 검증.

### 사례 2. 업데이트가 가능해 보여도 운영자는 반영 결정을 못 내린 경우
실패 상황: 미리보기에 변화는 보이지만 근거가 부족해 운영자가 반영을 주저했다.  
원인: “무엇이 왜 바뀌었는지” 설명 가능한 지표가 부족했다.  
대응(목표): reason code, impact score, 위험 배지를 도입해 판단 비용을 낮춘다.  
재발 방지: 운영자 관점 UI(변경만 보기, 위험 요약)와 백엔드 계산 근거를 동일 용어로 맞춘다.

## 9. 남은 리스크/차기 개선 포인트
- 데이터 다양성이 계속 확장되면 정규화 규칙 유지 비용이 증가할 수 있다.
- 부분적으로 자동화된 matching이 예외 케이스를 누락할 위험이 있다.
- 장기적으로는 템플릿 계약과 데이터 계약(스키마)을 함께 강화해야 update를 기본 경로로 승격할 수 있다.

## 관련 문서
- `/Users/sbu/SBU/CloudClubAttendanceSystem/docs/013_시즌업데이트_운영한계_및_임시운영정책.md`
- `/Users/sbu/SBU/CloudClubAttendanceSystem/docs/014_시즌업로드_파일정규화_및_파싱트러블슈팅_런북.md`
- `/Users/sbu/SBU/CloudClubAttendanceSystem/docs/002_시스템_기술_레퍼런스.md`
