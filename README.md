# OpenF2

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE.txt)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)
[![Phase](https://img.shields.io/badge/phase-4%20Fidelity%20%26%20Modding-orange.svg)](ROADMAP.md)

**OpenF2's mission is to deliver the complete Fallout 2 experience — every quest, every area, every line of dialogue — running entirely in your browser, no install required.**

OpenF2 is a browser-first reimplementation of the classic Fallout 2 engine runtime, built on TypeScript and Python tooling. It reads your own copy of the original game data and runs entirely in the browser via WebGL. Once the full vanilla experience is solid, optional quality-of-life upgrades (widescreen support, extended resolution, UI improvements, and more) will be available as an opt-in layer on top.

> **Note:** older docs may still reference the former project name **Harold**.

Origins: forked from [darkfo](https://github.com/darkf/darkfo) and extensively modernized.

---

![OpenF2 screenshot](screenshot.png)

---

## Table of Contents

1. [Goal](#goal)
2. [Status](#status)
3. [Requirements](#requirements)
4. [Quick Start](#quick-start)
5. [Development Notes](#development-notes)
6. [Testing](#testing)
7. [Contributing](#contributing)

---

## Goal

> **Play all of Fallout 2 in a modern browser, faithful to the original, with no native install.**

The project is built around a single, clear north star:

1. **Complete Fallout 2 fidelity** — every location, quest, NPC, scripted event, and ending should work exactly as they do in the original game.
2. **Browser-native** — the engine runs on WebGL + HTML5 Audio. No plugins, no native binaries. You bring a legal copy of the game data; the engine does the rest.
3. **Optional QoL layer** — once the vanilla experience is complete and stable, a curated set of quality-of-life improvements (higher resolutions, UI tweaks, optional sfall-style extensions) will be available as toggles that never alter core gameplay.

Fallout 1 compatibility is maintained as a secondary goal so the engine can serve both classic titles.

See [ROADMAP.md](./ROADMAP.md) for the full milestone plan and the path to 1.0.

---

## Status

**Active phase:** Phase 4 — Fidelity, Modding, and Tooling  
Phases 0–3 are complete. The engine can load and run Fallout 2 maps with working combat, stats, scripting, and UI. The remaining work is closing scripting gaps and raising fidelity until the full game is completable end-to-end.

### Working today

| Area | State |
|------|-------|
| Map loading, traversal, and movement | ✅ Stable |
| SPECIAL stats, derived stats pipeline | ✅ Stable |
| Skills, traits, and perks | ✅ Stable |
| Combat formulas (DT/DR, ammo, AP, criticals) | ✅ Stable |
| Inventory and equipment management | ✅ Stable |
| Leveling, XP, quests, karma, and reputation | ✅ Stable |
| Gameplay UI panels on `ui2` WebGL path | ✅ Stable |
| Versioned save/load with schema migration | ✅ Stable |
| Core scripting VM (INT bytecode) | 🔶 Partial |
| Dialogue and barter foundations | 🔶 Partial |
| WebGL rendering + lighting | 🔶 Partial |
| Fallout 1 compatibility layer (`src/compat/fallout1.ts`) | 🔶 Partial |

### Known gaps

- **Scripting coverage:** many Fallout 2 procedures and sfall opcodes are still stubs; completing these is the critical path to a fully-playable game.
- **UI fidelity/polish:** gameplay panels render through `ui2`; edge-case visual and interaction parity work continues.
- **Animation and rendering fidelity:** edge-case timing and correctness still need polish.
- **In-browser tooling:** contributor cockpit panels are available: DebugOverlayPanel (F3/backtick), MapViewerPanel (F5), ScriptDebuggerPanel (F6), and PrototypeInspectorPanel (F7). They expose live HP/AP/entity/map/script data plus mod priority/override visibility for regression debugging.

---

## Requirements

| Requirement | Version |
|-------------|---------|
| Fallout 2 game data (legal copy) | — |
| Python | 3.9+ |
| [Pipenv](https://github.com/pypa/pipenv) | any |
| Node.js + npm | any LTS |

**Optional:**
- `acm2wav` — broader audio format support for `convertAudio.py`
- Homebrew users: `brew bundle` installs all system dependencies from `Brewfile`

---

## Quick Start

1. **Install Node dependencies:**
   ```bash
   npm install
   ```

2. **Install Python dependencies:**
   ```bash
   pipenv install
   ```

3. **Extract and convert game assets** from your Fallout 2 installation:
   ```bash
   pipenv run python setup.py /path/to/Fallout2
   ```

4. **Compile TypeScript:**
    ```bash
    npx tsc
    ```

   **Current repo note:** the test suite passes, but `npx tsc` is presently blocked by existing type errors in `src/scripting.ts`. That prevents a clean browser build from a fresh checkout until those errors are resolved.

5. **Start a local web server** from the repository root:
    ```bash
    python -m http.server
    ```

6. **Open in your browser:**
   ```
   http://localhost:8000/play.html?artemple
   ```

If startup fails, open the browser developer console first — missing assets or runtime errors will be reported there.

---

## Development Notes

| Area | Location |
|------|----------|
| Engine/runtime source | `src/` |
| Configuration toggles | `src/config.ts` (recompile after changes) |
| Asset conversion scripts | repository root (`*.py`) |
| UI subsystems | `src/ui.ts` (DOM), `src/ui2/` (WebGL migration target) |
| Mod support | `src/mods.ts` |

**Validation commands:**

```bash
# Type-check without emitting
npx tsc --noEmit

# Run all tests
npm test
```

At the moment, `npm test` passes, while `npx tsc --noEmit` reports existing TypeScript errors in `src/scripting.ts`.

---

## Testing

Tests use [Vitest](https://vitest.dev/) and live alongside source files in `src/`.

```bash
# Run the full test suite
npm test

# Run a specific test file
npx vitest run src/phase1.test.ts

# Watch mode during development
npx vitest --watch
```

The current suite covers 42 test files across phase milestones and core systems. Representative entry points include:

| File | Coverage |
|------|----------|
| `src/phase1.test.ts` through `src/phase24.test.ts` | Roadmap milestone regressions and scripting fidelity work |
| `src/vm.test.ts` | Script VM bytecode execution |
| `src/ui2/ui2.test.ts` and `src/ui2/panelParity.test.ts` | UI2 rendering and gameplay panel parity |
| `src/combat.integration.test.ts` and `src/combat/damageFormula.test.ts` | Combat integration and damage math |
| `src/skills.test.ts` and `src/skillCheck.test.ts` | Skill calculations and checks |
| `src/inventory.test.ts` | Item management and constraints |
| `src/saveload.test.ts` | Save/load and schema migration |

For the full suite, browse `src/**/*.test.ts`.

---

## Contributing

Everything that gets the game closer to fully playable is a priority. Contributions are especially welcome in:

- **Scripting VM** — opcode/procedure coverage is the critical path to a completable game; every de-stubbed procedure unblocks more of the world
- **Rendering and animation** — edge-case fidelity and timing polish so the game looks right
- **UI migration** — moving any remaining panels from DOM to `ui2` WebGL rendering
- **QoL features** — once vanilla fidelity is solid, optional improvements (widescreen, UI tweaks, extended sfall opcodes) are welcome as toggleable additions that never break the base experience

For major features, open an issue first so the work stays aligned with the [roadmap](./ROADMAP.md).  
For in-depth contributor guidance, architecture notes, and debugging tips, see [CONTRIBUTING_ROADMAP.md](./CONTRIBUTING_ROADMAP.md).
