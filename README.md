# Questown MVP+

Duolingo-inspired 게임형 Todo 웹앱입니다.

## 주요 기능
- Today Todo 관리 (추가/체크/삭제)
- 완료 Todo = 건물 층수 실시간 반영
- 하루 마감 시 완료율 기반 지붕 확정
- 마감 후 수정 잠금 + 마감 해제
- 자정 자동 날짜 롤오버
- Streak(연속 달성일) + 일일 목표치
- 주간 요약 카드
- Town 뷰(도시 장면 렌더: district/road/scenery/camera focus)
- 이벤트 기반 모션(완료/목표달성/연속달성/마감)
- 리워드 토스트 + 보상 시퀀스
- 접근성 개선(탭/패널 시맨틱, 라이브 리전, 키보드 Town 이동)
- Animated number 카운터 + dynamic 탭 로딩 최적화
- JSON 백업/복원

## 기술 스택
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Zustand (localStorage persist + migrate)
- Framer Motion
- Vitest (domain 유틸 테스트)

## 실행 방법
```bash
npm install
npm run dev
```

테스트:
```bash
npm run test
```

빌드:
```bash
npm run build
```

## 아키텍처
- `components/`: UI/화면 컴포넌트
- `domain/`: 타입 + 계산 유틸(building/date/progress/animation/town-map/town-navigation)
- `store/`: 상태/저장 로직(Zustand)
- `app/`: 엔트리 페이지, 탭 라우팅

핵심 분리 원칙:
- 층수/완료율/지붕 계산 분리
- 날짜 처리 유틸 분리
- 저장 로직(store)과 UI 분리

## 폴더 구조
- `app/`
  - `layout.tsx`, `page.tsx`, `globals.css`
- `components/`
  - `today-view.tsx`
  - `monthly-town-view.tsx`
  - `animated-building.tsx`
  - `animated-number.tsx`
  - `reward-toasts.tsx`
  - `ui.tsx`
- `domain/`
  - `types.ts`
  - `animation.ts`
  - `town-map.ts` / `town-map.test.ts`
  - `town-navigation.ts` / `town-navigation.test.ts`
  - `building.ts` / `building.test.ts`
  - `date.ts` / `date.test.ts`
  - `progress.ts` / `progress.test.ts`
- `store/questown-store.ts`
- `lib/utils.ts`

## 배포 메모
- Vercel CLI 배포 가능
- GitHub private repo 자동 연동은 Vercel 프로젝트에서 repo 권한 승인 후 활성화 권장

## 다음 확장 아이디어
- Rive 렌더러 어댑터
- 서버 동기화(멀티 디바이스)
- 시즌 이벤트/특수 건물/보상 아이템
- 접근성 고도화(키보드 동선/스크린리더)
