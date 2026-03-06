# Vision

## One-Line Definition

**StellaAgent** — Code Observatory. 코드베이스를 살아있는 성좌로 관측한다.

## The Problem: Black-Box Codebases

바이브코딩 시대. "해줘" 한 마디면 코드가 생긴다. 하지만:

- 어디가 어디와 연결되어 있는지 **보이지 않는다**
- AI가 어떤 파일을 얼마나 바꿨는지 **모른다**
- 자주 같이 바뀌는 파일(숨겨진 의존성)이 **보이지 않는다**
- 프로젝트가 커질수록 이 블랙박스는 깊어진다

기존 도구들은 현재 상태의 스냅샷만 보여준다. 하지만 코드는 정적이지 않다 — 매일 변하고, 진화하고, 때로는 부패한다.

## The Solution: Code Observatory

천문대(Observatory)가 우주를 관측하듯, StellaAgent는 코드 우주를 관측한다.

정적 분석이 "지금"을 보여준다면, git 분석은 "어떻게 여기까지 왔는지"를 보여준다. 둘을 합치면 코드가 **어디로 가고 있는지** 보인다.

기존 카테고리(Visualizer, Static Analyzer, Observability Tool)에 정확히 맞지 않는다. 정적 분석 + 시간 분석(git) + 실시간 관측 + AI 에이전트 인식을 결합한 새로운 카테고리: **Code Observatory**.

### Positioning

```
                  시간 분석 (git history)
                        ▲
                        │
  Dependency Cruiser ───┼─── StellaAgent ★
                        │         │
  정적 분석 ◄───────────┼─────────► 실시간 관측
                        │
         Code City ─────┼─── IDE built-in
                        │
                        ▼
                  스냅샷 (현재 상태만)
```

| 도구 | 정적 분석 | 시간 분석 | 실시간 | AI 인식 |
|------|:---------:|:---------:|:------:|:-------:|
| Dependency Cruiser | O | - | - | - |
| Code City | O | - | - | - |
| IDE built-in | O | - | O | - |
| **StellaAgent** | **O** | **O** | **O** | **O** |

## Metaphor Dictionary

코드 우주의 천체 대응표.

| Metaphor | Meaning | Visual |
|----------|---------|--------|
| **Star** | 파일. 크기는 복잡도(심볼 수), 색은 언어 | Octahedron / Sphere |
| **Constellation Line** | import 관계. 선언된 의존성 | Pink edge |
| **Co-change (은하수)** | git에서 발견한 숨겨진 의존성. 같이 바뀌는 파일들 | Teal edge |
| **Trail** | AI 에이전트가 지나간 흔적 | Glowing particle trail |
| **Pulse** | 실시간 파일 변경 | Node bloom effect |
| **Diamond** | 디렉토리. 별들을 묶는 구조 | Diamond geometry |
| **Deep Space** | 배경. 코드 우주의 빈 공간 | #08061A |

## Principles

### Observe, don't just analyze
분석은 답을 찾는다. 관측은 패턴을 발견한다. StellaAgent는 코드를 분석하는 도구가 아니라 관측하는 도구다. 사용자에게 답을 주는 것이 아니라, 보이게 만드는 것.

### Time over snapshot
현재 상태만으로는 절반만 보인다. git history가 나머지 절반 — 코드가 어떻게 여기까지 왔고, 어디로 가고 있는지.

### Discover, don't just search
검색은 이미 아는 것을 찾는다. 발견은 몰랐던 것을 알게 된다. Co-change 분석이 대표적 — import에 없지만 항상 같이 바뀌는 파일을 발견한다.

### Three-line start
```bash
git clone <repo> && cd stellaagent
npm install
npm run dev
```
설정 없이 시작. 복잡한 설정은 사용을 막는다.

## Long-Term Vision

모든 개발자가 자기 코드의 천문학자가 되는 것.

- 코드를 이해하는 것이 아니라, **관측하는 것**
- 버그를 찾는 것이 아니라, **패턴을 발견하는 것**
- AI와 인간의 협업을 추적이 아니라, **관측하는 것**

코드베이스는 우주와 같다. 너무 크고, 끊임없이 변하고, 한 사람이 전부 이해할 수 없다. 하지만 관측할 수는 있다.
