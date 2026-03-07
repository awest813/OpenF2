# OpenF2

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE.txt)
[![TypeScript](https://img.shields.io/badge/engine-TypeScript-3178c6.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-Vitest-2ea44f.svg)](#contributing)
[![Platform](https://img.shields.io/badge/platform-browser%20first-orange.svg)](#mission)

OpenF2 is an open-source reimplementation of the Fallout 2 engine.

Its goal is to run the original game content (from your legal Fallout 2 install) on a modern, portable engine while preserving classic gameplay behavior.

## Mission

OpenF2 exists to make Fallout 2 playable on modern platforms without relying on the original proprietary executable.

Core goals:

- **Faithful reproduction of Fallout 2 gameplay mechanics** using original assets and data formats
- **Cross-platform runtime** via web technology (browser-first architecture)
- **Open engine development** with transparent implementation and tests
- **Mod-friendly architecture** with override layers and script extensibility
- **Future browser portability** (WASM + modern GPU backends)

---

## Screenshot

![OpenF2 screenshot](screenshot.png)

---

## Project Maturity Report (Code-Verified)

This summary is based on current code in `src/` and the existing test suite (validated with `npm test` during this documentation update).

### Engine Status Dashboard

| System | Status | Evidence |
|---|---|---|
| Engine lifecycle | **Working** | `src/engine.ts` module lifecycle state machine |
| Asset loading / VFS | **Working** | `src/assetStore.ts`, mod overlays in `src/mods.ts` |
| Map loading + traversal | **Working** | `src/map.ts`, map/world tests including campaign smoke |
| Entity system (ECS) | **Working** | `src/ecs/entityManager.ts`, `src/ecs/components.ts` |
| Rendering | **Working (WebGL)** | `src/renderer.ts`, `src/webglrenderer.ts`, `src/renderBatch.ts` |
| UI | **Working, still refining parity** | `src/ui2/` panels + `src/ui2/ui2.test.ts` |
| Audio | **Working** | `src/audio.ts` HTML5 engine |
| Save/Load | **Working (hardened, still maturing)** | `src/saveload.ts`, `src/saveSchema.ts` migrations + fallback |
| Combat loop | **Working (playable), AI fidelity partial** | `src/combat.ts`, `src/combat/damageFormula.ts` |
| Script runtime / VM | **Partial (largest remaining gap)** | `src/scripting.ts`, `src/vm*.ts`, `src/scriptingChecklist.ts` |
| Dialogue/Barter fidelity | **Partial** | Dialogue panels work; script/dialogue edge cases remain |
| World map + encounters | **Working** | `src/worldmap.ts`, `src/worldmapEncounter.test.ts` |
| Quest scripting completeness | **Partial** | Quest log works; full script parity still in progress |
| Weather/cinematics polish | **Partial / Missing pieces** | Fade/movie procedures are partial in scripting checklist |
| Multiplayer / netplay | **Missing (experimental future)** | No production multiplayer subsystem in `src/` |

### Current Script Runtime Snapshot

From `src/scriptingChecklist.ts`:

- A large share of tracked scripting/runtime entries are implemented
- A meaningful set of entries are still partial and remain the biggest fidelity risk
- No entries are currently marked as pure `stub`, but several high-impact behaviors are still incomplete

Most critical partials include `proto_data`, animation queue callbacks (`reg_anim_*`), and script-side visibility/LOS style helpers.

---

## Critical Path to First Fully Playable Build

To reach reliable start-to-end Fallout 2 playability on this engine, these are the most important blockers:

1. **Finish high-impact scripting parity**
   - Complete remaining partial procedures in `src/scripting.ts`
   - Continue closing checklist gaps in `src/scriptingChecklist.ts`
2. **Dialogue + barter correctness pass**
   - Resolve edge-case conversation branches and barter-script interactions
3. **Animation/script event fidelity**
   - Complete queued animation callback behavior used by encounter and quest scripts
4. **Campaign-scale validation**
   - Run long progression scenarios across major hubs and transitions
5. **Save/load long-run reliability**
   - Stress multi-map, multi-quest, long-session save/load cycles with real assets
6. **Combat AI behavior parity**
   - Improve tactical and behavior fidelity to original encounter expectations

These are the highest leverage items blocking “playable from beginning to end with confidence,” even though many core systems already run.

---

## Technical Architecture

OpenF2 is organized into a pipeline + runtime model:

```text
Fallout 2 install data
      |
      v
Python asset pipeline (setup.py, dat2.py, exportImages.py, convertAudio.py)
      |
      v
Converted assets (maps/, proto/, art/, audio/)
      |
      v
TypeScript runtime (src/)
  - engine.ts             lifecycle and module orchestration
  - map.ts                map loading, objects, elevation changes
  - scripting.ts/vm*.ts   Fallout script VM + bridge procedures
  - combat.ts             turn-based combat loop and AP logic
  - ecs/                  entity/component data model
  - ui2/                  WebGL UI panels (dialogue, inventory, barter, etc.)
  - saveload.ts           versioned persistence with migration
      |
      v
Renderer layer
  - renderer.ts / webglrenderer.ts (current backend)
```

### Core Subsystems

- **Core engine:** lifecycle, update loop, subsystem registration
- **Rendering:** isometric map/sprite rendering + batching
- **Asset layer:** DAT-derived asset resolution and runtime fetch/cache
- **Script runtime:** bytecode VM + game API bridge procedures/opcodes
- **Gameplay systems:** combat, inventory, dialogue, world map, quests, reputation
- **Persistence:** save schema migration + runtime hydration

---

## Repository Structure

```text
OpenF2/
├── src/
│   ├── engine.ts
│   ├── map.ts
│   ├── scripting.ts
│   ├── vm.ts / vm_opcodes.ts / vm_bridge.ts
│   ├── combat.ts
│   ├── worldmap.ts
│   ├── saveload.ts
│   ├── ecs/
│   ├── character/
│   ├── quest/
│   ├── ui2/
│   └── *.test.ts
├── maps/                 converted map data
├── proto/                converted prototype data
├── lut/                  lookup tables
├── shaders/              GLSL shaders
├── setup.py              asset extraction/conversion entry point
├── play.html             browser entry
├── README.md
└── ROADMAP.md
```

---

## Development Roadmap (High-Level)

See [ROADMAP.md](ROADMAP.md) for detailed milestones.

- **Phase 1 — Engine foundation:** lifecycle, rendering, core data loading
- **Phase 2 — Gameplay systems:** inventory, progression, quests, dialogue plumbing
- **Phase 3 — Combat and world systems:** turn-based combat, world map, encounters
- **Phase 4 — Full playability push (current):** script parity + fidelity blockers
- **Phase 5 — Browser/WASM expansion:** portability + web performance
- **Phase 6 — Optional future experiments:** WebGPU backend, multiplayer ideas

---

## Browser Support Plan

OpenF2 is browser-first and can evolve into broader web deployment:

- **Runtime target:** keep the current TypeScript/browser runtime as default, while optionally packaging performance-sensitive modules via WebAssembly where it provides clear benefits
- **Rendering targets:** current WebGL path, future WebGPU option
- **Tooling path:** Emscripten/wasm workflows where native code interop is required
- **Deployment goal:** playable in modern desktop browsers first, mobile exploration later

---

## Optional Rendering Upgrade — WebGPU

WebGPU is a planned optional future backend, not a prerequisite for core Fallout 2 completion.

Potential benefits:

- More modern GPU API for better throughput
- Improved sprite batching and buffer management
- Compute-shader opportunities for visibility/lighting preprocessing
- Cleaner long-term browser performance scaling

Proposed renderer architecture:

- Renderer abstraction (already present via renderer interfaces)
- **Backend A:** existing WebGL renderer
- **Backend B (future):** WebGPU renderer

---

## Experimental Features (Post-Core)

These are exploratory and explicitly **not required** for core Fallout 2 completion:

- Netplay experiments
- Cooperative gameplay prototypes
- Synchronized world-state research
- Browser multiplayer infrastructure experiments

---

## Contributing

New contributors should start by reproducing the local setup, then pick checklist items from the roadmap.

### Dependencies

- Node.js (LTS)
- npm
- Python 3.9+
- Pipenv
- Legal Fallout 2 game assets

### Build + test

```bash
git clone https://github.com/awest813/OpenF2.git
cd OpenF2
npm install
pipenv install

# Convert assets from your Fallout 2 installation
pipenv run python setup.py /path/to/Fallout2

# Compile
npx tsc

# Run tests
npm test

# Run browser build
python -m http.server
# open http://localhost:8000/play.html?artemple
```

### Where to help first

- `src/scripting.ts` + `src/scriptingChecklist.ts` (highest impact)
- Script/runtime regression tests (`src/phase*.test.ts`, `src/vm.test.ts`)
- Dialogue/barter behavior parity in `src/ui2/` and script bridge logic
- Save/load fidelity tests for long campaign progression

---

## License

Apache 2.0. See [LICENSE.txt](LICENSE.txt).

---

## Vision

**The ultimate goal of OpenF2 is to make Fallout 2 playable on modern platforms while preserving the original game experience.**
