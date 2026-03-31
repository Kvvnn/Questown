# Questown MVP

Questown은 하루를 **퀘스트 로그**처럼 느끼게 만드는 게임형 생산성 웹앱입니다.

## 핵심 구조
- 완료한 퀘스트 1개 = 건물 1층
- 하루 완료율 = 지붕 타입(low/mid/high)
- 퀘스트 타입(daily/main/sub) = 각 층의 시각 스타일

세 규칙은 서로 분리되어 동작합니다.

## 기술 스택
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Zustand (localStorage persist)
- Framer Motion
- Vitest

## 실행 방법
```bash
npm install
npm run dev
```

테스트:
```bash
npm run test
```

프로덕션 빌드:
```bash
npm run build
```

## 폴더 구조
- `app/`
  - `layout.tsx`
  - `page.tsx`
  - `globals.css`
- `components/`
  - `today-view.tsx`
  - `monthly-town-view.tsx`
  - `manage-view.tsx`
  - `animated-building.tsx`
  - `animated-number.tsx`
  - `reward-toasts.tsx`
  - `ui.tsx`
- `domain/`
  - `types.ts` (Quest 중심 모델)
  - `date.ts` / `date.test.ts`
  - `building.ts` / `building.test.ts`
  - `quest.ts` / `quest.test.ts`
  - `execution.ts` / `execution.test.ts`
  - `recurrence.ts` / `recurrence.test.ts`
  - `floor-style.ts` / `floor-style.test.ts`
  - `progress.ts` / `progress.test.ts`
  - `town-map.ts` / `town-map.test.ts`
  - `town-navigation.ts` / `town-navigation.test.ts`
  - `animation.ts`
- `store/`
  - `questown-store.ts`

## 현재 구동 방식
- 앱은 `Today`, `Town`, `Manage` 3개 탭으로 동작합니다.
- `Today`
  - 오늘 날짜는 항상 열려 있는 작업 공간입니다. 퀘스트를 추가/완료/삭제할 수 있고, 리뷰를 열어도 다시 수정할 수 있습니다.
  - 화면 상단에는 항상 보이는 빠른 추가 컴포저가 있고, 그 아래에 작은 집중 카드와 `진행 중` 목록이 이어집니다.
  - `완료됨` 목록은 접을 수 있으며, 체크 시 행 상태가 즉시 바뀌고 작은 보상 토스트와 건물 애니메이션이 보조 피드백으로 동작합니다.
  - 퀘스트는 `daily / main / sub` 타입, 우선순위, 선행 의존성, 반복, 이월, 집중 고정을 가질 수 있습니다.
  - `오늘 리뷰`는 저장 상태를 바꾸는 마감 기능이 아니라, 현재 진행 상태를 전체 화면 오버레이로 보여주는 연출 레이어입니다.
  - 리뷰 오버레이에서는 건물/지붕 프리뷰 애니메이션과 완료 수, 완료율, streak, 대표 퀘스트 요약을 보여주고, 닫으면 다시 Today 화면으로 돌아옵니다.
- `Town`
  - 타운은 월간 2D 스트립 뷰로 렌더링됩니다.
  - 기록이 있는 날짜, 오늘, 현재 선택 날짜는 큰 `featured tile`로 보이고, 나머지 빈 날짜는 작은 `compact slot`으로 축약됩니다.
  - 기본 타운 화면에는 하단 고정 상세 패널이 없습니다. 날짜를 선택했을 때만 전체 화면 상세 오버레이가 열립니다.
  - 상세 오버레이에는 날짜, 구역 진행도, 완료율, 지붕, 중심 타입, 해당 날짜 퀘스트 목록이 표시됩니다.
  - 오늘 날짜 타일은 현재 퀘스트 진행 상태를 실시간으로 반영합니다.
- `Manage`
  - 일일 목표, 주간 main 목표, 앱 설치, 백업/복원, 로컬 스토리지 상태를 관리합니다.
  - 수동 `하루 마감` UI는 없습니다. 현재 날짜는 계속 수정 가능하고, 이전 날짜만 날짜 전환 시 자동 확정됩니다.
- 데이터 흐름
  - 상태는 Zustand + `localStorage`에 영속화됩니다.
  - 백업은 JSON으로 내보내고 다시 가져올 수 있습니다.
  - 날짜가 바뀌면 이전 날짜는 자동으로 확정되고, 오늘 날짜는 다시 열린 상태로 동기화됩니다.
  - 키보드로 Town 날짜 이동이 가능합니다. (`Arrow`, `Home`, `End`)

## 데이터 모델
- `QuestType = "daily" | "main" | "sub"`
- `QuestItem`
  - `id, title, type, completed, createdAt, completedAt?`
  - `priority, dependencyQuestIds?, focusPinned?`
  - `recurrencePattern?, recurrenceIntervalDays?, carryOverEnabled?, carryOverLimit?`
- `DailyRecord`
  - `date, quests, completedCount, totalCount, completionRate, roofType, isFinalized`
  - `isFinalized`는 수동 마감 상태가 아니라, 과거 날짜가 자동 확정되었는지를 나타내는 플래그입니다.
  - `completedByType, totalByType`
- `MonthlyTown`
  - `monthKey, dailyRecords`

## 확장 아이디어
- recurring quest 자동 생성 스케줄러
- streak 보상 배지/도시 랜드마크 시스템
- Rive 렌더러 어댑터(현재 애니메이션 추상화 기반)
- 서버 동기화 및 멀티 디바이스
