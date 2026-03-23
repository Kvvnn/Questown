# Questown MVP

Duolingo-inspired 게임형 Todo 웹앱 MVP입니다.

## 기술 스택
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Zustand (localStorage persist)
- Framer Motion

## 실행 방법
1. 의존성 설치
```bash
npm install
```
2. 개발 서버 실행
```bash
npm run dev
```
3. 브라우저에서 `http://localhost:3000` 접속

## 폴더 구조
- `app/`: Next.js App Router 페이지/글로벌 스타일
- `components/`: UI 및 화면 컴포넌트
  - `animated-building.tsx`: 애니메이션 렌더러 추상화 + CSS/Framer fallback 구현
  - `today-view.tsx`: Today 화면
  - `monthly-town-view.tsx`: Monthly Town 화면
- `domain/`: 도메인 타입/계산/날짜 util
  - `building.ts`: 층수/완료율/지붕 계산
  - `date.ts`: 날짜 키/월 이동/기본 레코드 생성
  - `types.ts`: 핵심 타입 정의
- `store/questown-store.ts`: 상태 관리 + localStorage persistence
- `lib/utils.ts`: 공통 유틸

## 핵심 아키텍처
- UI 컴포넌트, 도메인 로직, 저장 로직 분리
- 층수(buildingHeight)와 지붕(roofType) 계산 로직 분리
- 날짜 변경 시 당일 레코드 자동 hydrate
- 일간 마감/개발용 다음날 이동 지원

## 주요 컴포넌트 역할
- `TodayView`
  - 할 일 추가/완료/삭제
  - 실시간 건물 성장(완료 수 기반)
  - 완료율/상태 피드백
  - 오늘 마감 / 다음 날로 넘기기
- `MonthlyTownView`
  - 월간 타일 그리드 렌더링
  - 날짜별 건물 높이/지붕 상태 시각화
  - 날짜 클릭 상세(todo 요약)
- `CssFramerBuildingRenderer`
  - 렌더러 인터페이스 기반 fallback 구현
  - 층 추가/지붕 등장 애니메이션 제공

## MVP 이후 확장 아이디어
- Rive 렌더러 어댑터 추가 (현 인터페이스 교체 가능)
- 서버 DB 연동 및 멀티 디바이스 동기화
- 주간/연간 town 리포트
- streak/quest/보상 아이템 시스템
- 접근성 강화(키보드 내비게이션/스크린리더 라벨)
