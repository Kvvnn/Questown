# Questown Phase Plan

## 계획 원칙

이 문서는 `docs/PRD.md`를 구현 가능한 순서로 쪼갠 실행 문서다. 목표는 현재 quest/todo 앱 구조를 routine/session 게임 구조로 단계적으로 전환하는 것이다.

전체 원칙:

- phase마다 독립적인 완료 기준이 있어야 한다.
- phase 종료 시 다음 phase로 넘길 체크포인트와 blocker를 기록한다.
- MVP 종료 지점은 `수동 시작 + 시간 기반 진입 + AI 제안/난이도 조절`까지다.
- 위치 기반 trigger는 post-MVP다.

## Phase 0. Vocabulary Reset

### 목표

현재 quest/todo 중심 용어를 routine/session/building/town 용어로 재정렬한다.

### 포함 범위

- PRD 기반 glossary 확정
- canonical product noun 정리
- 문서 간 용어 충돌 제거
- 현재 코드베이스를 baseline으로 보는 migration 선언

### 선행 조건

- `docs/PRD.md` 확정

### 구현 산출물

- `docs/PRODUCT_BRIEF.md`
- `docs/UI_PRINCIPLES.md`
- `docs/GAME_RULES.md`
- `docs/DATA_MODEL.md`
- `docs/PHASE_PLAN.md`

### 완료 기준

- `todo`, `quest` 대신 `routine`, `session`, `floor`, `roof`, `town`이 canonical 용어로 합의됨
- 문서 5종의 용어와 MVP 범위가 일치함

### 제외 범위

- 코드 수정
- UI 리네이밍 실제 반영

### 체크포인트

- 이후 phase의 타입명, 폴더명, UI 카피 기준이 문서화되어 있어야 한다.

### blocker

- PRD와 실제 제품 방향이 다시 바뀌면 이후 phase 전체를 다시 정렬해야 한다.

## Phase 1. Domain Foundation

### 목표

quest 기반 모델과 별도로 routine/session 기반 도메인 계층을 도입한다.

### 포함 범위

- `Routine`, `RoutineStep`, `RoutineTrigger`, `RoutineSession`, `SessionStepResult` 타입 추가
- `DailyBuilding`, `Floor`, `TownMonth`, `AiSuggestion`, `ReviewSummary` 타입 정의
- 새 persisted slice 구조 설계
- 기존 `QuestItem / DailyRecord`와 병행 가능한 adapter 또는 migration boundary 정의

### 선행 조건

- Phase 0 문서 정렬 완료

### 구현 산출물

- 새 domain types와 selector skeleton
- sample seed routine 2종 이상
- migration meta 설계 초안

### 완료 기준

- 새 domain model만으로 루틴, session, building을 표현할 수 있다.
- 기존 quest 타입에 의존하지 않는 테스트 fixture를 만들 수 있다.

### 제외 범위

- 홈 UI 재구성
- 타이머 런타임
- scoring 로직

### 체크포인트

- 다음 phase에서 manual start를 위한 최소 routine seed와 persistence가 준비되어 있어야 한다.

### blocker

- source of truth와 cache 모델 경계가 모호하면 이후 scoring과 town phase에서 중복 저장 문제가 생긴다.

## Phase 2. Launcher Home

### 목표

현재 list board 중심 홈을 launcher 중심 홈으로 바꾼다.

### 포함 범위

- `지금 시작 가능한 루틴` 카드
- `다음 예정 루틴` 카드
- 오늘 building 진행 요약
- streak / combo 요약
- surprise quest 슬롯
- 수동 시작 루틴 진입

### 선행 조건

- Phase 1의 routine seed와 selector 기본 구현

### 구현 산출물

- launcher selector
- home UI 재구성
- manual start CTA와 세션 진입 라우팅

### 완료 기준

- 사용자가 홈에서 1~2탭 안에 루틴을 시작할 수 있다.
- 홈이 더 이상 긴 quest list를 기본 콘텐츠로 사용하지 않는다.

### 제외 범위

- 시간 기반 알림
- 세션 타이머 세부 동작

### 체크포인트

- 세션 화면으로 진입할 수 있는 route/state contract가 고정되어야 한다.

### blocker

- 홈에 레거시 quest UI가 메인으로 남아 있으면 이후 세션 중심 UX가 무너진다.

## Phase 3. Session Runtime

### 목표

step 타이머와 session 상태 머신을 구현한다.

### 포함 범위

- session state machine
- current step / next step 모델
- timer 진행
- complete / pause / resume / skip
- background 후 resume 가능한 상태 저장

### 선행 조건

- Phase 2의 manual session entry 완료

### 구현 산출물

- session runtime hook/store
- full-screen session UI
- step transition animation

### 완료 기준

- 3~6 step 루틴을 실제로 끝까지 플레이할 수 있다.
- 앱을 잠깐 벗어났다 돌아와도 session 상태를 복구할 수 있다.

### 제외 범위

- 점수 확정
- 결과 화면 연출

### 체크포인트

- step start/end 이벤트와 pause/skip 이벤트가 일관된 로그로 남아야 한다.

### blocker

- 타이머 신뢰성이 낮으면 scoring phase 전체가 흔들린다.

## Phase 4. Scoring Engine

### 목표

점수, combo, grace, grade를 순수 계산 로직으로 고정한다.

### 포함 범위

- base/time/combo/clean/focus/streak bonus 계산
- grace 판정
- normalized score 계산
- `Perfect / Great / Clear / Partial` grade 계산

### 선행 조건

- Phase 3의 session step event log

### 구현 산출물

- pure scoring functions
- fixture 기반 테스트
- 결과 payload contract

### 완료 기준

- 같은 session log를 넣으면 항상 같은 score와 grade가 나온다.
- grace/skip/pause edge case 테스트가 모두 통과한다.

### 제외 범위

- floor 생성
- 결과 화면 UI polish

### 체크포인트

- Phase 5는 이 payload만 받아 floor와 result view를 만들 수 있어야 한다.

### blocker

- scoring이 UI state에 섞이면 회귀 테스트와 AI 입력 품질이 나빠진다.

## Phase 5. Result Loop

### 목표

세션 종료 후 짧고 만족스러운 결과 루프를 만든다.

### 포함 범위

- 결과 등급 화면
- 총점과 bonus 요약
- AI 코멘트 placeholder
- floor 생성
- quality tier 반영

### 선행 조건

- Phase 4 scoring payload 확정

### 구현 산출물

- session result overlay/view
- floor creation pipeline
- routine category별 visual mapping 기본형

### 완료 기준

- `Clear` 이상 session 종료 시 floor 1개가 생성된다.
- 결과 화면이 2~4초 안에 이해 가능한 수준으로 작동한다.

### 제외 범위

- 하루 review
- roof 계산

### 체크포인트

- 하루 building이 여러 floor를 쌓을 수 있는 상태가 되어야 한다.

### blocker

- 결과 화면이 길거나 복잡하면 세션 리듬이 끊긴다.

## Phase 6. Daily Review

### 목표

하루 단위 정산과 roof 계산을 구현한다.

### 포함 범위

- day review screen
- `DailyBuilding` 집계
- roof 계산
- streak snapshot 기록
- tomorrow suggestion placeholder
- missed review 시 next-day rollover finalize

### 선행 조건

- Phase 5 floor generation 완료

### 구현 산출물

- review aggregator
- review UI
- roof animation / presentation layer

### 완료 기준

- 같은 날짜의 성공 session들이 하나의 building으로 정리된다.
- review를 보거나 날짜가 넘어가면 roof와 summary가 확정된다.

### 제외 범위

- 시간 기반 추천
- AI 실제 생성

### 체크포인트

- `DailyBuilding`이 `TownMonth`의 입력으로 안정적으로 쓰일 수 있어야 한다.

### blocker

- review와 finalize 시점이 불명확하면 town 반영과 analytics가 꼬인다.

## Phase 7. Time Triggers

### 목표

수동 시작에서 시간 기반 context-assisted launcher로 확장한다.

### 포함 범위

- 시간대 기반 routine recommendation
- 예정 루틴 큐
- notification entry
- launcher reason copy

### 선행 조건

- Phase 6의 review / building cycle 완료

### 구현 산출물

- trigger evaluator
- notification/deep-link contract
- 시간대별 recommendation card

### 완료 기준

- 아침/밤 시간대에 해당 루틴이 홈에 자동 surfaced 된다.
- 알림을 누르면 해당 세션 또는 pre-session 화면으로 진입한다.

### 제외 범위

- 위치 trigger
- AI 제안

### 체크포인트

- AI phase는 이 evaluator 위에 suggestion layer만 얹을 수 있어야 한다.

### blocker

- 시간 창 계산이 로컬 타임존과 어긋나면 추천 신뢰가 무너진다.

## Phase 8. AI GM MVP

### 목표

AI를 게임 마스터 역할로 도입하되, 모든 출력은 제안형으로 제한한다.

### 포함 범위

- 루틴 추천
- step duration tuning
- surprise quest 초안 생성
- review commentary 생성
- explainable suggestion UI
- AI 실패 시 rule-based fallback

### 선행 조건

- Phase 7의 trigger evaluator와 review input payload

### 구현 산출물

- `AiSuggestion` contract
- prompt / fallback policy
- suggestion apply / dismiss flow
- surprise quest generation path

### 완료 기준

- AI가 없어도 core loop가 계속 동작한다.
- AI 제안은 이유, confidence, applied 상태를 가진다.
- surprise quest는 하루 1개 한도로 surfaced 된다.

### 제외 범위

- AI 자율 수정
- 장기 성격 모델링

### 체크포인트

- town과 analytics는 AI가 만든 suggestion도 동일한 session/building 파이프라인으로 처리해야 한다.

### blocker

- AI 출력이 직접 상태를 수정하면 fallback과 디버깅이 어려워진다.

## Phase 9. Town MVP

### 목표

월간 building 결과를 감상 가능한 town으로 만든다.

### 포함 범위

- month plot layout
- fake isometric 또는 2.5D layered sprite renderer
- daily building plot mapping
- ornament / roof 반영
- landmark milestone
- season theme 기본형

### 선행 조건

- Phase 6의 `DailyBuilding`
- Phase 8의 surprise quest / ornament 입력

### 구현 산출물

- `TownMonth` builder
- town overview UI
- plot detail overlay

### 완료 기준

- 월간 plot에서 날짜별 building 차이가 보인다.
- roof, ornament, landmark가 구분된다.
- true 3D 없이도 충분히 감상 가능하다.

### 제외 범위

- 실제 3D 카메라
- NPC
- 실시간 날씨 시스템

### 체크포인트

- 하드닝 phase에서는 town snapshot rebuild와 backup 호환을 검증할 수 있어야 한다.

### blocker

- town 렌더러가 source of truth를 가지면 rebuild와 migration이 어렵다.

## Phase 10. Migration / Backup / Analytics / Hardening

### 목표

기존 앱 사용자와 데이터 손실 없이 새 구조를 안정화한다.

### 포함 범위

- versioned migration
- legacy `QuestItem / DailyRecord` import path
- backup/export/import 포맷 정리
- analytics event 정리
- failure recovery
- hydration/storage 안전성

### 선행 조건

- Phase 1~9 주요 구조 완료

### 구현 산출물

- migration scripts
- backward-compatible backup schema
- analytics schema
- regression test suite

### 완료 기준

- 기존 데이터가 새 구조로 옮겨져도 앱이 깨지지 않는다.
- AI 비활성, storage degraded, partial review 누락 케이스에서도 앱이 복구 가능하다.

### 제외 범위

- 위치 trigger
- native shell

### 체크포인트

- MVP release candidate를 만들 수 있는 수준의 안정성을 확보해야 한다.

### blocker

- migration 규칙이 없으면 현재 사용자 데이터와 새 session 모델이 충돌한다.

## Post-MVP

### 포함 항목

- 위치 기반 trigger
- background geofence
- React Native / Expo 기반 native shell
- 고급 town 연출
- NPC, weather, panorama
- live events

### 목적

차별화와 장기 몰입 요소를 확장하되, core routine session loop가 검증된 뒤에만 진행한다.

## Cross-phase 테스트 원칙

- 모든 phase는 domain 로직을 pure function 테스트로 먼저 고정한다.
- UI phase는 최소 1개의 end-to-end 시나리오를 가져야 한다.
- migration과 backup은 snapshot 테스트보다 실제 import/export round-trip 테스트를 우선한다.
- AI phase는 deterministic fallback 테스트를 반드시 포함한다.

## MVP 종료 정의

아래가 모두 만족되면 MVP를 종료한다.

- 홈이 launcher 역할을 수행한다.
- 사용자가 수동 또는 시간 기반 추천으로 세션을 시작할 수 있다.
- 세션은 step timer, pause, skip, complete를 지원한다.
- 결과 등급과 점수가 계산된다.
- 성공 세션은 floor가 되고, 하루 review에서 roof가 정산된다.
- 월간 town에서 결과를 볼 수 있다.
- AI가 시간 조정, 추천, 리뷰 코멘트, surprise quest 초안을 제안한다.
- 위치 기반 trigger 없이도 제품의 핵심 재미가 검증된다.

## 현재 코드베이스 전환 메모

현재 저장소는 `Today / Town / Manage` 기반 quest 앱이므로, 실제 개발은 아래 전환 순서를 따라야 한다.

1. 새 routine/session domain을 병렬 도입한다.
2. 기존 home quest board를 launcher로 축소 또는 대체한다.
3. quest completion 중심 애니메이션을 session result 중심 연출로 옮긴다.
4. `DailyRecord` 기반 집계를 `DailyBuilding` snapshot 기반으로 바꾼다.
5. town은 레거시 month view를 재사용하더라도 입력 모델은 새 구조로 교체한다.
