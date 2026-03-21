# Vision

## One-Line Definition

**StellaCode** -- Code Observatory. Observe your codebase as a living constellation.

## Where This Comes From

We live in an era where one prompt creates code. Files multiply, projects grow, and somewhere along the way you realize you're not quite sure what connects to what anymore. The AI changed things while you were thinking about something else. Files you've never seen keep breaking together.

It's not anyone's fault. It's just hard to keep up.

We thought maybe it would help if you could simply look at your project -- not as lines of text, but as something you can take in at a glance. Something that breathes.

## What a Code Observatory Is

Static analysis shows you "now." Git analysis shows you "how we got here." Combine both, and you start to see where the code might be going.

This doesn't fit neatly into existing categories. It's not quite a visualizer, not quite a static analyzer, not quite an observability tool. It brings together static analysis + temporal analysis (git) + real-time observation + AI agent awareness. We've been calling it a **Code Observatory**.

```
                  Temporal Analysis (git history)
                        |
  Dependency Cruiser ───┼─── StellaCode *
                        |         |
  Static Analysis ◄─────┼─────────► Real-time Observation
                        |
         Code City ─────┼─── IDE built-in
                        |
                  Snapshot (current state only)
```

| Tool | Static | Temporal | Real-time | AI Awareness |
|------|:------:|:--------:|:---------:|:------------:|
| Dependency Cruiser | O | - | - | - |
| Code City | O | - | - | - |
| IDE built-in | O | - | O | - |
| **StellaCode** | **O** | **O** | **O** | **O** |

## Metaphor Dictionary

| Metaphor | Meaning | Visual |
|----------|---------|--------|
| **Star** | A file. Size = complexity (symbol count), color = language | Octahedron / Sphere |
| **Constellation Line** | Import relationship. Declared dependency | Pink edge |
| **Co-change (Milky Way)** | Hidden dependency discovered from git history | Teal edge |
| **Trail** | Path an AI agent has touched | Glowing particle trail |
| **Pulse** | Real-time file change | Node bloom effect |
| **Diamond** | Directory. Structure that groups stars together | Diamond geometry |
| **Deep Space** | Background. The void of the code universe | #08061A |

## Principles

### Observe, don't just analyze
Analysis finds answers. Observation discovers patterns. We'd rather make things visible than tell you what to think.

### Time over snapshot
The current state is only half the picture. Git history is the other half -- how the code got here and where it might be heading.

### Discover, don't just search
Search finds what you already know. Discovery reveals what you didn't. Co-change analysis is a good example -- connections you wouldn't have thought to look for.

### Three-line start
```bash
git clone <repo> && cd stellacode
npm install && npm run dev
```
If getting started feels like a chore, people won't stay.

## Technical Decisions

### Why Not tree-sitter?
node-gyp native compilation is problematic on Windows. Regex parsing is sufficient for extracting functions, classes, and imports. Can upgrade to TS Compiler API later.

### Why Force-Directed Layout?
Related files naturally cluster together (more import edges = closer proximity). 3D space handles large graphs better than 2D. Golden ratio spiral initialization + 80 iterations.

### Why Zustand?
R3F ecosystem standard (drei, pmndrs). Minimal boilerplate. `getState()` enables external access from Three.js callbacks.

### Why Git as First-Class?
The core question isn't "who did what" but "how is the code evolving." Every project already has git history -- zero setup required.

### Why "Code Observatory"?
- Code Visualizer: Only visualizes. StellaCode includes temporal analysis and agent tracking.
- Static Analyzer: Only sees the present. StellaCode observes evolution.
- Observability Tool: Monitors runtime. StellaCode observes code structure itself.

### Why Star/Constellation Metaphor?
Call a file a "node" and it becomes graph theory. Call it a "star" and it becomes observation. The metaphor shapes how users see their code.

## Documentation Style

- No emoji. Maintain a professional tone.
- Friendly but respectful. Neither too casual nor too rigid.
- Code examples first. No marketing copy.
- Lead with "why." Reasons and context before feature lists.

---

## Product Philosophy

More like a code aquarium than an analysis tool. Working with AI agents all day is already tiring enough. StellaCode is something you can put on and just watch for a while. Float your code universe on screen, let your eyes wander, and maybe notice something you wouldn't have found by searching: "huh, why is that star red?"

We care about how it feels before how much it does.

## Roadmap

### v1.0 -- Complete

Full pipeline from core to visual experience.

**Foundation**: Scanner, Parser (TS/JS/Python regex), Graph builder, Force layout, R3F 3D, WebSocket, Git intelligence, AI agent detection (6 agents), UI panels.

**Refinement**: UI overhaul, InstancedMesh (1000+ nodes), Color customization, Legend filters, Panel system, Bloom tuning.

**Living Constellation**: Entry animation, Complexity glow, Co-change pulse, Code age colors.

**Time Travel**: Commit replay, Evolution timeline slider, Playback controls.

**Agent Trails**: Per-agent trajectory trails, Agent color mode.

**Polish**: 3-point cinematic lighting, 4-layer starfield, Nebula clouds, Shooting stars, Observe mode, Capture (PNG export).

### v1.1 -- Current

Security hardening, bug fixes, self-improvement rounds. Agent detection expanded to 11 agents. Test suite (124 tests). Settings panel with theme system. CI/CD pipeline. npx distribution ready.

### Future

Core experience is complete. What follows is driven by need.

- **Performance** -- Barnes-Hut O(n log n), Edge bundling, Smart clustering
- **Deep Patterns** -- Circular dependency detection, Dead code detection, Type flow tracing
- **Platform** -- Electron wrapper, Plugin system
- **Agent Intelligence** -- Real-time agent detection, Territory colors, Human vs AI regions

---

## Long-Term Vision

We hope every developer can become a quiet astronomer of their own code.

A codebase is like the universe -- too vast, constantly changing, impossible for one person to fully understand. But you can observe it. And we'd like that to feel less like work and more like wonder.
