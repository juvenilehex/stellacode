# Roadmap

StellaAgent의 진화 계획. 각 버전은 이전 버전 위에 쌓인다.

---

## v0.1 — Foundation (현재)

코드베이스를 3D 성좌로 렌더링하는 핵심 파이프라인.

- Scanner + Parser (TS/JS/Python regex)
- Graph builder + Force-directed layout
- React Three Fiber 3D 시각화
- WebSocket 실시간 업데이트
- Git intelligence: conventional commit 파싱, co-change 분석, hot files, heatmap
- AI 에이전트 감지 (Claude, Copilot, Cursor, Aider, Codeium, Tabnine)
- UI 패널: Sidebar, Search, NodeDetail, GitPanel, AgentPanel, Legend

**Status**: Complete.

---

## v0.2 — Refinement

성능 최적화와 시각적 완성도.

- **InstancedMesh**: 개별 mesh 대신 instanced rendering. 1000+ 노드 대응
- **Barnes-Hut approximation**: O(n^2) → O(n log n) force layout
- **Smart clustering**: 디렉토리 기반 자동 클러스터링. 펼치기/접기
- **Entry animation**: 별이 하나씩 나타나는 진입 시퀀스
- **Edge bundling**: 선이 많을 때 가독성 개선
- **LOD 개선**: 거리에 따른 디테일 레벨 자동 조절

---

## v0.3 — Deep Analysis

관측의 깊이를 더한다.

- **Co-change 시각화 강화**: coupling 강도별 선 두께, 필터링
- **Type flow tracing**: 타입이 파일 간에 어떻게 흐르는지 추적
- **Circular dependency detection**: 순환 의존성 감지 및 하이라이트
- **Complexity heatmap**: 파일별 복잡도를 색상 오버레이로 표시
- **Dead code detection**: 어디에서도 import되지 않는 파일 표시

---

## v0.4 — Multi-Agent Observatory

AI 에이전트 활동을 정밀하게 관측한다.

- **Multi-agent 실시간 감지**: Cursor, Copilot, Claude Code 동시 추적
- **Agent territory heatmap**: 에이전트별 영역 시각화 (어디를 주로 수정하는가)
- **Agent contribution analysis**: 에이전트별 기여도 통계
- **Human vs AI diff**: 사람이 쓴 코드와 AI가 쓴 코드의 영역 구분
- **Session timeline**: 에이전트 세션을 시간축으로 표시

---

## v0.5 — Time Travel

코드의 시간을 관측한다.

- **Refactoring diff**: 리팩토링 전/후 성좌 비교
- **Project evolution timeline**: 프로젝트 성장을 슬라이더로 재생
- **Code age visualization**: 오래된 코드일수록 어두운 별
- **Decay detection**: 오래 방치된 + 높은 복잡도 = 부패 경고
- **Commit replay**: 커밋 단위로 성좌 변화 재생

---

## v1.0 — Full Observatory

완전한 코드 천문대.

- **Dashboard mode**: 관측 결과를 대시보드로 정리
- **Team collaboration tracking**: 팀원별 활동 영역 시각화
- **CI/CD integration**: 빌드/테스트 결과를 성좌에 반영
- **Plugin system**: 파서, 시각화, 분석 모듈 플러그인화
- **Export**: 성좌 스냅샷을 이미지/JSON으로 내보내기
- **Electron wrapping** (선택): 독립 앱으로 배포

---

## Beyond v1.0

아직 탐색 중인 장기 아이디어.

- **Multi-repo observatory**: 여러 프로젝트를 하나의 우주에서 관측
- **Real-time collaboration**: 팀원들이 같은 성좌를 동시에 관측
- **AI architecture advisor**: 관측 데이터를 기반으로 아키텍처 제안
- **Code weather**: 변경 빈도와 패턴을 기반으로 "코드 날씨" 예보

---

## Self-Evolution Plan

StellaAgent로 StellaAgent 자신을 관측하는 자기참조 실험. 각 라운드에서 발견한 것을 다음 버전에 반영한다.

| Round | Timing | Focus |
|-------|--------|-------|
| 1 | v0.1 완료 직후 | 초기 구조 관측. 의존성 밀도, 핫 파일 확인 |
| 2 | v0.2 완료 후 | InstancedMesh 적용 후 성능 차이 관측 |
| 3 | v0.3 완료 후 | 순환 의존성, 복잡도 분포 자체 진단 |
| 4 | v0.4 완료 후 | AI 에이전트가 StellaAgent를 얼마나 수정했는지 추적 |
| 5 | v0.5 완료 후 | 프로젝트 전체 진화 타임라인 재생 |
