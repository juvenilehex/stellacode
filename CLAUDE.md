# PJ12_stellacode -- Code Observatory

## 프로젝트 개요

**StellaCode**: 코드베이스를 3D 별자리로 시각화하는 관측소.
파일 = 별, import = 별자리 선, co-change = 숨은 커플링, AI agent 활동 = 궤적.

- npm 패키지: `npx stellacode` (v1.3.0)
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
| 파서 | Regex 기반 (TypeScript/JavaScript/Python) |
| 테스트 | Vitest |
| Node | >= 20.0.0 |

## 프로젝트 구조

```
PJ12_stellacode/
├── bin/stellacode.js          # CLI 엔트리포인트 (npx stellacode)
├── package.json               # 루트 (npm workspaces)
├── tsconfig.json              # 루트 TS 설정
├── .env.example               # 환경변수 템플릿
│
├── client/                    # 프론트엔드 (React + R3F)
│   ├── src/
│   │   ├── App.tsx            # 메인 앱 컴포넌트
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
│   │   ├── index.ts           # 서버 메인 (Express + WS + API 라우트)
│   │   ├── config.ts          # 설정
│   │   ├── metrics.ts         # 프로젝트 메트릭 계산
│   │   ├── ws.ts              # WebSocket 브로드캐스터
│   │   ├── watcher.ts         # 파일 변경 감시 (chokidar)
│   │   ├── usage-tracker.ts   # 사용 통계 추적
│   │   ├── parser/            # 코드 파서 (TS/JS/Python)
│   │   ├── graph/             # 그래프 빌더 + force layout
│   │   ├── agent/             # AI 에이전트 활동 추적 (git 기반)
│   │   └── __tests__/         # 서버 테스트
│   └── package.json
│
├── bot/                       # Discord 봇 (별도 패키지)
├── .github/                   # CI/CD, Dependabot, Funding
├── .internal/                 # 내부 설정
├── docs/                      # 문서
├── screenshots/               # 스크린샷
├── public/                    # 정적 파일
└── ref/                       # 참조 자료
```

## 핵심 명령어

```bash
npm install              # 의존성 설치 (workspaces)
npm run dev              # 서버 + 클라이언트 동시 실행 (concurrently)
npm run build            # 프로덕션 빌드 (server -> client 순서)
npm test                 # 전체 테스트 (server + client)
npm run lint             # 타입 체크 (server + client)
```

서버 기본 포트: 3001 (STELLA_PORT 환경변수로 변경 가능)

## API 엔드포인트

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/graph` | 전체 그래프 (노드, 엣지, 통계) |
| `GET /api/graph/node/:id` | 단일 노드 + 연결 정보 |
| `GET /api/stats` | 프로젝트 통계 |
| `GET /api/git/stats` | Git 분석 (커밋, 브랜치, 히트맵, co-change) |
| `GET /api/git/log?limit=50` | 파싱된 git 로그 |
| `GET /api/git/co-changes` | 시간적 커플링 분석 |
| `GET /api/agent/events` | AI 에이전트 활동 이벤트 |
| `GET /api/agent/sessions` | 활성 에이전트 세션 |
| `POST /api/target` | 대상 디렉토리 변경 |

WebSocket: `ws://localhost:3001/ws` -- `graph:update`, `file:change`, `agent:live` 이벤트

## 환경 변수

```
STELLA_PORT=3001         # 서버 포트
STELLA_TARGET=.          # 스캔 대상 프로젝트 경로
STELLA_CORS_ORIGINS=     # 추가 CORS 오리진 (쉼표 구분)
```

## 핵심 기능

- **3D 별자리 시각화**: force-directed graph + golden ratio spiral layout
- **Git 인텔리전스**: co-change 탐지, conventional commit 파싱, hot files, 활동 히트맵
- **AI 에이전트 추적**: Claude Code, Copilot, Cursor, Aider 등 11개 에이전트 감지
- **타임 트래블**: 커밋별 리플레이, 타임라인 슬라이더
- **관측 모드**: `O` 키로 UI 숨기고 별자리만 감상

## 작업 규칙

- **포지셔닝**: "생산성 도구가 아닌 사고 도구" -- 효율/속도 강조 금지
- 모노레포 구조: client와 server는 별도 workspace. 각각의 package.json 존재
- 파서 확장 시 server/src/parser/에 추가
- UI 컴포넌트는 client/src/ui/에, 3D 관련은 client/src/three/에 배치
- 테스트는 각 workspace 내 vitest 사용
