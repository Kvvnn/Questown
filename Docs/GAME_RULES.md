# Questown Game Rules

## 1. 핵심 루프

Questown의 기본 게임 루프는 아래 순서로 고정한다.

1. 컨텍스트 또는 추천이 루틴 진입 기회를 만든다.
2. 사용자가 루틴 세션을 시작한다.
3. 세션 안에서 3~6개의 step을 수행한다.
4. step 결과로 점수, combo, grace 상태가 누적된다.
5. 세션 종료 시 결과 등급과 총점이 계산된다.
6. `Clear` 이상인 세션은 floor 1개를 생성한다.
7. 하루 리뷰에서 floor들이 building으로 정리되고 roof가 닫힌다.
8. building 결과가 해당 월의 town plot에 반영된다.

제품의 최소 플레이 단위는 개별 todo가 아니라 **routine session**이다.

## 2. 루틴 정의

루틴은 특정 상황에서 실행되는 게임 스테이지다.

각 루틴은 다음 요소를 가진다.

- 이름
- 카테고리
- 발동 조건
- 예상 총 소요 시간
- step 목록
- 기본 성공 기준
- 보너스 조건
- 시각 테마
- 보상 성격

기본 카테고리는 아래를 표준으로 사용한다.

- `morning_reset`
- `leave_home_sprint`
- `commute_focus`
- `arrival_setup`
- `night_shutdown`
- `weekend_reset`
- `custom`

## 3. 트리거 규칙

### 3.1 지원하는 trigger type

- `manual`
- `time`
- `location`
- `ai_recommended`

### 3.2 MVP에서 활성인 trigger

MVP에서 실제 동작시키는 trigger는 아래다.

- `manual`
- `time`
- `ai_recommended`

`location`은 데이터 모델에는 존재하지만 MVP에서는 비활성이다.

### 3.3 트리거 우선순위

동일 시점에 여러 trigger가 겹치면 아래 우선순위를 따른다.

1. 사용자가 직접 누른 `manual`
2. 사용자가 수락한 `ai_recommended`
3. 예약된 `time`
4. 비활성 placeholder인 `location`

### 3.4 동시 노출 규칙

- 홈에는 동시에 여러 루틴을 크게 보여주지 않는다.
- `지금 시작 가능한 루틴` 1개와 `다음 예정 루틴` 1개만 강조한다.
- proactive surprise quest는 하루 최대 1개만 메인 추천으로 올린다.

## 4. 루틴 세션 상태 머신

세션 상태는 아래 상태 머신을 따른다.

`idle -> active_step -> paused -> completed -> reviewed`

보조 전이:

- `active_step -> active_step` : step 전환
- `paused -> active_step` : resume
- `active_step -> completed` : 마지막 step 종료 또는 중도 종료 정산
- `completed -> reviewed` : 결과 화면 확인 후 종료

규칙:

- 한 번 시작한 세션은 항상 `RoutineSession` 레코드를 만든다.
- 앱을 닫아도 `active_step` 또는 `paused` 세션은 복구 가능해야 한다.
- `reviewed` 이후 세션 자체는 수정하지 않는다.

## 5. step 규칙

### 5.1 step 구성

- 루틴은 3~6개의 step으로 구성한다.
- 각 step은 `order`를 가진다.
- step은 기본적으로 순서대로 진행한다.
- MVP에서는 동시에 여러 step을 열지 않는다.

### 5.2 step 조작

각 step에서 사용 가능한 행동은 아래다.

- `complete`
- `pause`
- `resume`
- `skip`

### 5.3 타이머 규칙

- 각 step은 `recommendedDurationSec`를 가진다.
- 세션이 step에 진입하면 타이머가 바로 시작된다.
- `pause` 중에는 elapsed time 증가를 멈춘다.
- `resume` 시 같은 step에서 다시 진행한다.

### 5.4 step 결과 상태

step 결과는 아래 중 하나다.

- `success`
- `grace_completed`
- `late_completed`
- `skipped`

판정 규칙:

- `success`: 권장 시간 이내 완료
- `grace_completed`: 권장 시간을 넘겼지만 `+25%` 이내이며, 해당 세션의 grace 미사용 상태에서 완료
- `late_completed`: grace를 쓰지 못했거나 권장 시간 `+25%`를 넘겨 완료
- `skipped`: 사용자가 skip 선택

세션당 grace는 최대 1회만 쓴다.

## 6. 점수 시스템

### 6.1 기본 점수

- step 기본 점수: `100`
- 세션 완주 보너스: `150`
- 하루 첫 세션 보너스: `100`

### 6.2 시간 보너스

- `success`: `+40`
- `grace_completed`: `+20`
- `late_completed`: `+0`
- `skipped`: `+0`

### 6.3 combo 보너스

combo는 성공적으로 이어지는 흐름을 보상한다.

- `success` 또는 `grace_completed` 발생 시 combo `+1`
- `late_completed`는 combo를 유지하지만 증가시키지 않는다.
- `skipped`는 combo를 `0`으로 리셋한다.
- `pause`는 combo를 유지하지만 `Focus Bonus` 자격을 잃게 만든다.

combo bonus 계산식:

- 각 step 종료 시 `max(combo - 1, 0) * 25`
- 세션 총 combo bonus는 각 step bonus의 합이다.

### 6.4 추가 보너스

- `Clean Run Bonus`: skip 없이 세션 종료 시 `+120`
- `Focus Bonus`: pause 없이 세션 종료 시 `+80`
- `Streak Milestone Bonus`: 동일 루틴 스트릭이 `3 / 7 / 14 / 30`일에 각각 `+30 / +60 / +100 / +150`

### 6.5 normalized session score

루틴 품질 계산을 위해 세션 점수를 0~1 범위로 정규화한다.

정의:

`normalizedScore = totalScore / maxExpectedScore`

`maxExpectedScore`는 해당 루틴에서 모든 step이 `success`이고, `Clean Run`, `Focus Bonus`를 모두 받은 경우의 점수다.

## 7. 결과 등급

세션 결과 등급은 아래 순서를 따른다.

- `Perfect`
- `Great`
- `Clear`
- `Partial`

판정 규칙:

### Perfect

- 모든 필수 step 완료
- `skipped` 없음
- `pause` 없음
- `grace_completed` 없음
- `normalizedScore >= 0.9`

### Great

- 모든 필수 step 완료
- `skipped` 없음
- `pause <= 1`
- `grace_completed + late_completed <= 1`
- `normalizedScore >= 0.75`

### Clear

- 모든 필수 step 완료
- `normalizedScore >= 0.5`

### Partial

- 세션이 시작되었지만 `Clear` 조건을 만족하지 못함

Questown은 session-level hard fail을 두지 않는다. 실패 서사는 `Partial`로 흡수한다.

## 8. 콤보와 스트릭

### 8.1 session combo

- session combo는 step 흐름 보상이다.
- 세션 내부에서만 누적된다.
- 결과 화면과 순간 피드백에 사용된다.

### 8.2 routine streak

- 동일 routine 또는 category를 날짜 기준 연속으로 `Clear` 이상 완료하면 쌓인다.
- 하루에 같은 routine을 여러 번 해도 스트릭 증가는 최대 1회다.
- 스트릭은 점수 보너스보다 ornament, light, detail 강화에 더 크게 반영한다.

### 8.3 meta streak

- 하루 단위 리뷰 품질이 누적되면 월간 메타 보상으로 이어진다.
- 메타 streak는 monthly landmark, season accent, special object 등장 조건으로 사용한다.

## 9. 하루 building 규칙

### 9.1 floor 생성 규칙

- `Clear` 이상인 세션 1회 = floor 1개
- `Partial` 세션은 floor를 만들지 않는다.
- floor는 해당 세션의 `routineCategory`, `resultGrade`, `ornament` 정보를 가진다.

### 9.2 floor 품질 tier

- `Clear` -> `standard`
- `Great` -> `refined`
- `Perfect` -> `signature`

### 9.3 building 집계 규칙

하루 building은 해당 날짜의 `Clear` 이상 세션들로 집계한다.

- floor 순서는 세션 종료 시각 기준
- 같은 날짜의 성공 세션이 많을수록 building이 높아진다
- routine streak와 surprise quest 성공은 building ornament에 반영된다

## 10. 지붕 규칙

roof는 하루 품질의 메타 표시다.

### 10.1 daily quality score

`dailyQualityScore`는 해당 날짜의 `Clear` 이상 세션들의 `normalizedScore` 평균값이다.

성공 세션이 없으면 `dailyQualityScore`는 계산하지 않는다.

### 10.2 roof 판정

- `none`: 성공 세션 없음
- `low`: `dailyQualityScore < 0.6`
- `mid`: `0.6 <= dailyQualityScore < 0.8`
- `high`: `0.8 <= dailyQualityScore < 0.95`
- `gold`: `dailyQualityScore >= 0.95` 이고, 성공 세션 2개 이상이며, 전체 성공 세션에 필수 step skip이 없음

### 10.3 리뷰와 finalization

- 하루 review는 해당 날짜의 building과 roof를 확정하는 연출 레이어다.
- 사용자가 review를 놓쳐도 다음 날짜 rollover 시 building/roof는 자동 확정된다.
- review를 봤는지 여부와 building 확정 여부는 분리할 수 있다.

## 11. 타운 규칙

### 11.1 plot 규칙

- `1 day = 1 plot`
- plot에는 그날의 `DailyBuilding` 결과가 올라간다.

### 11.2 월간 집계

- `TownMonth`는 해당 월의 `DailyBuilding`들을 모아 만든다.
- `TownMonth`는 `seasonTheme`, `landmark`, `ornament distribution`을 가진다.

### 11.3 랜드마크 규칙

MVP 기본 랜드마크 milestone:

- 월간 성공 floor 10개: tier 1
- 월간 성공 floor 20개: tier 2
- 월간 성공 floor 35개: tier 3

### 11.4 타운 뷰 역할

- 타운은 계획 도구가 아니다.
- 월간 성과와 생활 리듬을 감상하는 공간이다.
- 세부 정보는 drill-down 또는 오버레이로 확인한다.

## 12. surprise quest 규칙

surprise quest는 핵심 루틴을 방해하지 않는 작은 라이브 이벤트다.

규칙:

- 하루 최대 1개를 메인 제안으로 노출
- context와 충돌하면 제안하지 않음
- 기본 보상은 ornament 또는 minor score bonus
- 미완료 시에도 벌점은 주지 않음

예시:

- 점심 전 물 마시기
- 귀가 후 책상 위 물건 3개 정리하기
- 오후 3시 전 3분 스트레칭

## 13. AI 게임 마스터 규칙

### 13.1 AI가 하는 일

- 루틴 초안 제안
- step 시간 조정 제안
- 너무 긴 루틴 분리 제안
- surprise quest 초안 생성
- 하루 리뷰 요약 생성
- 내일 추천 루틴 생성

### 13.2 AI가 하지 않는 일

- 사용자의 동의 없이 루틴 강제 변경
- 강제 스케줄링
- 과도한 압박 카피
- hard fail 강화
- 핵심 루틴을 surprise quest로 대체

### 13.3 AI 제안 노출 규칙

- 모든 AI 출력은 `제안`으로 노출한다.
- 제안에는 이유와 자신감이 함께 표시된다.
- 제안 적용 여부는 사용자 선택이다.
- AI가 실패하거나 응답하지 않아도 core loop는 멈추지 않아야 한다.

## 14. 실패 보호 규칙

- 시간 초과는 즉시 실패가 아니다.
- 세션당 grace 1회를 허용한다.
- `Partial`도 review에서 긍정적인 서사로 포함한다.
- 최근 성공률이 낮으면 다음 제안 루틴의 난이도와 시간이 완화된다.
- 유저가 skip을 자주 하더라도, 앱은 비난 대신 재배치 또는 단축 루틴을 제안한다.

## 15. 현재 코드베이스와의 관계

현재 저장소는 `QuestItem` 체크 기반 구조를 갖고 있다. 이는 목표 게임 규칙의 최종형이 아니다.

- 현재의 “퀘스트 1개 체크”는 장기적으로 “루틴 세션 안의 step” 또는 임시 `ManualQuickTask`로 흡수된다.
- 현재의 `DailyRecord`는 향후 `RoutineSession -> DailyBuilding` 집계 구조로 대체된다.
