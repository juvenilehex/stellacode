# Vision

## One-Line Definition

**StellaCode** -- Code Observatory. 코드베이스를 살아있는 성좌로 관측한다.

## The Problem

바이브코딩 시대. "해줘" 한 마디면 코드가 생긴다. 하지만:

- 어디가 어디와 연결되어 있는지 보이지 않는다
- AI가 어떤 파일을 얼마나 바꿨는지 모른다
- 자주 같이 바뀌는 파일(숨겨진 의존성)이 보이지 않는다
- 프로젝트가 커질수록 이 블랙박스는 깊어진다

기존 도구들은 현재 상태의 스냅샷만 보여준다. 코드는 정적이지 않다 -- 매일 변하고, 진화하고, 때로는 부패한다.

## The Solution: Code Observatory

정적 분석이 "지금"을 보여준다면, git 분석은 "어떻게 여기까지 왔는지"를 보여준다. 둘을 합치면 코드가 어디로 가고 있는지 보인다.

기존 카테고리(Visualizer, Static Analyzer, Observability Tool)에 정확히 맞지 않는다. 정적 분석 + 시간 분석(git) + 실시간 관측 + AI 에이전트 인식을 결합한 새로운 카테고리: **Code Observatory**.

```
                  시간 분석 (git history)
                        |
  Dependency Cruiser ───┼─── StellaCode *
                        |         |
  정적 분석 ◄───────────┼─────────► 실시간 관측
                        |
         Code City ─────┼─── IDE built-in
                        |
                  스냅샷 (현재 상태만)
```

| 도구 | 정적 분석 | 시간 분석 | 실시간 | AI 인식 |
|------|:---------:|:---------:|:------:|:-------:|
| Dependency Cruiser | O | - | - | - |
| Code City | O | - | - | - |
| IDE built-in | O | - | O | - |
| **StellaCode** | **O** | **O** | **O** | **O** |

## Metaphor Dictionary

| Metaphor | Meaning | Visual |
|----------|---------|--------|
| **Star** | 파일. 크기는 복잡도(심볼 수), 색은 언어 | Octahedron / Sphere |
| **Constellation Line** | import 관계. 선언된 의존성 | Pink edge |
| **Co-change (은하수)** | git에서 발견한 숨겨진 의존성 | Teal edge |
| **Trail** | AI 에이전트가 지나간 흔적 | Glowing particle trail |
| **Pulse** | 실시간 파일 변경 | Node bloom effect |
| **Diamond** | 디렉토리. 별들을 묶는 구조 | Diamond geometry |
| **Deep Space** | 배경. 코드 우주의 빈 공간 | #08061A |

## Principles

### Observe, don't just analyze
분석은 답을 찾는다. 관측은 패턴을 발견한다. 사용자에게 답을 주는 것이 아니라, 보이게 만드는 것.

### Time over snapshot
현재 상태만으로는 절반만 보인다. git history가 나머지 절반 -- 코드가 어떻게 여기까지 왔고, 어디로 가고 있는지.

### Discover, don't just search
검색은 이미 아는 것을 찾는다. 발견은 몰랐던 것을 알게 된다. Co-change 분석이 대표적.

### Three-line start
```bash
git clone <repo> && cd stellacode
npm install && npm run dev
```
복잡한 설정은 사용을 막는다.

## Technical Decisions

### Why Not tree-sitter?
node-gyp 네이티브 컴파일이 Windows에서 문제. Regex 파싱이 함수/클래스/import 추출에 충분. TS Compiler API로 나중에 업그레이드 가능.

### Why Force-Directed Layout?
관련 파일이 자연스럽게 클러스터링된다 (import edge가 많으면 가까이). 3D 공간이 2D보다 큰 그래프를 잘 처리한다. Golden ratio spiral 초기화 + 80 iterations.

### Why Zustand?
R3F 생태계 표준 (drei, pmndrs). 최소 보일러플레이트. `getState()`로 Three.js 콜백에서 외부 접근 가능.

### Why Git as First-Class?
"누가 뭘 했는지"가 아니라 "코드가 어떻게 진화하는지"가 핵심. 모든 프로젝트에 이미 git history가 있다 -- 설정 없이 바로 사용.

### Why "Code Observatory"?
- Code Visualizer: 시각화만 한다. StellaCode는 시간 분석과 에이전트 추적을 포함한다.
- Static Analyzer: 현재 상태만 본다. StellaCode는 코드의 진화를 관측한다.
- Observability Tool: 런타임 모니터링이다. StellaCode는 코드 구조 자체를 관측한다.

### Why Star/Constellation Metaphor?
파일을 "노드"라 부르면 그래프 이론이 된다. 파일을 "별"이라 부르면 관측이 된다. 메타포가 사용자의 관점을 바꾼다.

## Documentation Style

- 이모티콘 사용 금지. 전문적인 톤을 유지한다.
- 친절하되 정중하게. 캐주얼하지도, 딱딱하지도 않은 톤.
- 기술 용어는 영어, 설명은 한국어/영어 자연스럽게 혼용.
- 코드 예시 중심. 마케팅 카피 배제.
- "왜"를 항상 먼저. 기능 나열보다 이유와 맥락이 우선한다.

---

## Roadmap

### v0.1 -- Foundation (Complete)

핵심 파이프라인: Scanner, Parser (TS/JS/Python regex), Graph builder, Force layout, R3F 3D, WebSocket, Git intelligence, AI 에이전트 감지 (6종), UI 패널.

### v0.2 -- Refinement

InstancedMesh (1000+ 노드), Barnes-Hut O(n log n), Smart clustering, Entry animation, Edge bundling.

### v0.3 -- Deep Analysis

Co-change 시각화 강화, Type flow tracing, Circular dependency detection, Complexity heatmap, Dead code detection.

### v0.4 -- Multi-Agent Observatory

실시간 에이전트 감지 (커밋 전에도), Agent territory heatmap, Human vs AI diff, Session timeline.

### v0.5 -- Time Travel

Refactoring diff, Project evolution timeline, Code age visualization, Commit replay.

### v1.0 -- Full Observatory

Dashboard, Team collaboration, CI/CD integration, Plugin system, Export, Electron (선택).

### Self-Evolution Plan

StellaCode로 자신을 관측하는 자기참조 실험. 각 버전 완료 후 발견한 것을 다음 버전에 반영.

---

## Long-Term Vision

모든 개발자가 자기 코드의 천문학자가 되는 것.

코드베이스는 우주와 같다. 너무 크고, 끊임없이 변하고, 한 사람이 전부 이해할 수 없다. 하지만 관측할 수는 있다.
