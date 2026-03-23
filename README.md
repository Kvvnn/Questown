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
  - `animated-building.tsx`
  - `animated-number.tsx`
  - `reward-toasts.tsx`
  - `ui.tsx`
- `domain/`
  - `types.ts` (Quest 중심 모델)
  - `date.ts` / `date.test.ts`
  - `building.ts` / `building.test.ts`
  - `quest.ts` / `quest.test.ts`
  - `floor-style.ts` / `floor-style.test.ts`
  - `progress.ts` / `progress.test.ts`
  - `town-map.ts` / `town-map.test.ts`
  - `town-navigation.ts` / `town-navigation.test.ts`
  - `animation.ts`
- `store/`
  - `questown-store.ts`

## 주요 기능
- Today 화면 3분할 섹션
  - Daily Quest (유지)
  - Main Quest (전진, 강조)
  - Sub Quest (성장)
- 퀘스트 추가/완료/삭제 + 타입 선택
- 체크 시 즉시 피드백 토스트 + building 애니메이션
- 하루 마감 시 완료율 기반 지붕 연출
- Town 화면에서 월간 도시 맵 + 날짜 상세
- 날짜 상세에 완료율, 타입별 요약, 퀘스트 목록 제공
- localStorage 영속화 + 백업/복원 JSON
- 키보드 Town 이동(화살표, Home/End)

## 데이터 모델
- `QuestType = "daily" | "main" | "sub"`
- `QuestItem`
  - `id, title, type, completed, createdAt, completedAt?, isRecurring?, recurrenceKey?`
- `DailyRecord`
  - `date, quests, completedCount, totalCount, completionRate, roofType, isFinalized`
  - `completedByType, totalByType`
- `MonthlyTown`
  - `monthKey, dailyRecords`

## 확장 아이디어
- recurring quest 자동 생성 스케줄러
- streak 보상 배지/도시 랜드마크 시스템
- Rive 렌더러 어댑터(현재 애니메이션 추상화 기반)
- 서버 동기화 및 멀티 디바이스
