# PJ12_stellacode -- Code Observatory

> **코딩 에이전트 지침의 정본은 이 파일이다.** `CLAUDE.md` 는 `@AGENTS.md` 로 이 파일을 가져오기만
> 한다(Claude Code 가 문서화한 공유 방식). 지침을 고칠 때는 여기만 고친다 — 두 벌을 두면 한쪽이 표류한다.
> 사람용 안내(설치·기능·조작)는 `README.md` 가 정본이다.

## 프로젝트 개요

**StellaCode**: 코드베이스를 3D 별자리로 시각화하는 관측소.
파일 = 별, import = 별자리 선, co-change = 숨은 커플링, AI agent 활동 = 궤적.

- npm 패키지: `npx stellacode` (버전 정본 = 루트 `package.json`. 화면 표기도 빌드 때 여기서 유도)
- 라이선스: MIT
- 리포: github.com/juvenilehex/stellacode

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 빌드 | Vite 6 |
| 프론트엔드 | React 19 + TypeScript |
| 3D | React Three Fiber (R3F) + drei + postprocessing |
| 상태 관리 | Zustand 5 |
| CSS | Tailwind CSS 4 |
| 서버 | Express 5 + ws (WebSocket) + chokidar (파일 감시) |
| 파서 | Regex 기반 (TypeScript/JavaScript/Python/Go) |
| 테스트 | Vitest |
| Node | >= 20.0.0 |

## 프로젝트 구조

```
PJ12_stellacode/
├── bin/stellacode.js          # CLI 엔트리포인트 (npx stellacode)
├── package.json               # 루트 (npm workspaces)
├── tsconfig.json              # 루트 TS 설정
├── .env.example               # 환경변수 템플릿
├── scripts/smoke-server.js    # 서버 스모크 (npm run smoke:server)
│
├── client/                    # 프론트엔드 (React + R3F)
│   ├── src/
│   │   ├── App.tsx            # 메인 앱 컴포넌트 (단축키 포함)
│   │   ├── main.tsx           # 엔트리포인트
│   │   ├── three/             # 3D 씬 컴포넌트 (노드, 엣지, 별자리, 에이전트 궤적)
│   │   ├── ui/                # UI 패널 (사이드바, 검색, Git, Agent, 타임라인 등)
│   │   ├── store/             # Zustand 스토어
│   │   ├── hooks/             # 커스텀 훅
│   │   ├── types/             # 타입 정의
│   │   └── utils/             # 유틸리티
│   └── package.json
│
├── server/                    # 백엔드 (Express + WebSocket)
│   ├── src/
│   │   ├── index.ts           # 기동·방송 (Express + WS + 라우터 연결)
│   │   ├── target-session.ts  # 관측 대상 owner (빌드·재빌드·대상 전환·감시자)
│   │   ├── routes/            # HTTP API 라우터 (graph·git·metrics·quality)
│   │   ├── domain.ts          # 도메인 상수 (WsMessageType·에이전트 이름 등)
│   │   ├── config.ts          # 설정 (에이전트 감지 패턴 agentPatterns 포함)
│   │   ├── metrics.ts         # 프로젝트 메트릭 계산
│   │   ├── ws.ts              # WebSocket 브로드캐스터
│   │   ├── watcher.ts         # 파일 변경 감시 (chokidar)
│   │   ├── usage-tracker.ts   # 사용 통계 추적
│   │   ├── parser/            # 코드 파서 (TS/JS/Python/Go)
│   │   ├── graph/             # 그래프 빌더 + force layout
│   │   ├── agent/             # AI 에이전트 활동 추적 (git + Claude Code 세션)
│   │   └── __tests__/         # 서버 테스트
│   └── package.json
│
├── bot/                       # Discord 봇 (별도 패키지)
├── .github/                   # CI/CD, Dependabot, Funding
├── .internal/                 # 내부 문서 (gitignore — 공개 안 함)
├── docs/                      # 문서
├── screenshots/               # 스크린샷 (README 3장만 추적)
├── public/                    # 정적 파일
└── ref/                       # 참조 이미지
```

## 핵심 명령어

```bash
npm install              # 의존성 설치 (workspaces)
npm run dev              # 서버(3001) + 클라이언트(Vite 5173, /api·/ws 를 3001 로 프록시) 동시 실행
npm run build            # 프로덕션 빌드 (server -> client 순서)
npm test                 # 전체 테스트 (server + client)
npm run lint             # 타입 체크 (server + client)
```

서버 기본 포트: 3001 (STELLA_PORT 환경변수로 변경 가능)

## API — 정본은 코드다

엔드포인트 목록은 손으로 적지 않는다(표로 적었을 때 23개 중 10개만 남아 있었다).

- **HTTP 라우트**: `server/src/routes/*.ts` 의 `router.get/post` (`/api` 아래에 마운트)
- **WebSocket** `ws://localhost:3001/ws` 메시지 종류: `server/src/domain.ts` 의 `WsMessageType`
- **대상 전환** `POST /api/target`: 읽을 수 있는 디렉터리라도 그래프가 무결성 검사에 실패하면
  422 + 사유를 돌려주고 대상은 그대로 둔다 — `routes/quality.ts` POST `/target`, `target-session.ts` `switchTarget`
- **그래프 순서** (`buildEpoch`, `buildId`): 판정 규칙은 `server/src/graph/builder.ts` `BUILD_EPOCH` 위 주석(서버 발급)과
  `client/src/store/graph-store.ts` `admitEpoch`(클라 수용·이전 epoch 은퇴)에 있다
- **빌드 무결성** `GET /api/integrity`·WS `build:integrity`: 현 대상의 최신 빌드 결과만 담고(거절된 전환 후보는
  기록 안 함) 옛 그래프를 유지한 실패 빌드에도 방송된다 — 서버 `target-session.ts`(기록)·`index.ts`
  `onBuildRecorded`(방송), 클라 `client/src/hooks/useWebSocket.ts`(연결·재연결마다 `/api/graph`·`/api/integrity`
  재조회)·`graph-store.ts` `setBuildStatus`·`client/src/types/ws.ts` `BuildIntegrity`
- 사용자용 주요 엔드포인트 안내는 `README.md` §API

## 환경 변수

```
STELLA_PORT=3001         # 서버 포트
STELLA_TARGET=.          # 스캔 대상 프로젝트 경로
STELLA_CORS_ORIGINS=     # 추가 CORS 오리진 (쉼표 구분)
```

## 핵심 기능

- **3D 별자리 시각화**: force-directed graph + golden ratio spiral layout
- **Git 인텔리전스**: co-change 탐지, conventional commit 파싱, hot files, 활동 히트맵
- **AI 에이전트 추적**: 커밋 기준 11개 에이전트 감지 (목록 정본 `server/src/config.ts` `agentPatterns`). 실시간 궤적·발광·Agent Activity 는 Claude Code 세션 로그(live-watcher)만 — 파일 감시 이벤트는 바꾼 주체를 알 수 없어 '출처 미상'으로 따로 센다(R624)
- **타임 트래블**: 커밋별 리플레이, 타임라인 슬라이더
- **관측 모드**: `O` 키로 UI 숨기고 별자리만 감상

## 작업 규칙

- **포지셔닝**: "생산성 도구가 아닌 사고 도구" -- 효율/속도 강조 금지
- 모노레포 구조: client와 server는 별도 workspace. 각각의 package.json 존재
- 파서 확장 시 server/src/parser/에 추가
- UI 컴포넌트는 client/src/ui/에, 3D 관련은 client/src/three/에 배치
- 테스트는 각 workspace 내 vitest 사용

## 문서 지도 — 새 문서를 만들기 전에 여기부터 본다

**규약** (Park 2026-08-25): 새 조사·설계·앵커를 쓰면 `docs/` 에 만들고 **그 자리에서 이 표에 한 줄
추가한다.** 등재 안 된 문서는 없는 문서다. 주제에 이미 소유자가 있으면 새 파일 말고 그 문서를 고친다.
측정: `python PJ00_develop/dev_projects/tools/doc_index_audit.py PJ12_stellacode`

| 문서 | 성격 | 쓰임 |
|---|---|---|
| `README.md` | 사람용 정본 (공개) | 설치·기능·조작·주요 API |
| `CHANGELOG.md` | 릴리스 기록 | Keep a Changelog 형식. 변경은 `[Unreleased]` 에 쌓는다 |
| `CONTRIBUTING.md` | 기여 안내 (공개) | 개발 환경·스크립트·커밋 규약 |
| `SECURITY.md` | 보안 정책 (공개) | 지원 버전·제보 경로·보안 모델 |
| `VISION.md` | 제품 철학 (공개) | 은유 사전·원칙·향후 방향. 한국어 원문은 `.internal/VISION_KR.md` |
| `DECISIONS.md` | 사료 — 수정 금지 | 2026-03-15 결정 보고서와 Park 답변 원문 |
| `docs/LAUNCH_COPY.md` | 카피 | 런치 카피 초안. 톤은 "생산성 도구 아닌 사고 도구" 포지셔닝을 따를 것 |
| `.internal/discord-channels.md` | 내부 (비공개) | Discord 서버 설정 안내 |
