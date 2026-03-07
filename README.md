# OpenF2

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE.txt)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)
[![Phase](https://img.shields.io/badge/phase-4%20Fidelity%20%26%20Modding-orange.svg)](ROADMAP.md)
[![Tests](https://img.shields.io/badge/tests-Vitest-6e9f18.svg)](https://vitest.dev/)
[![Node](https://img.shields.io/badge/Node.js-LTS-339933.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.9%2B-3776AB.svg)](https://www.python.org/)

**OpenF2 is a browser-first reimplementation of the Fallout 2 engine that aims to let you play the complete classic RPG in any modern browser — no installation required.**

OpenF2 reads your own legal copy of the original game data and runs it entirely in the browser via WebGL rendering and HTML5 Audio. Once the full vanilla experience is solid, optional quality-of-life upgrades (widescreen support, extended resolution, UI improvements, and more) will be available as opt-in toggles that never alter core gameplay.

> **Note:** older docs may still reference the former project name **Harold**.

Origins: forked from [darkfo](https://github.com/darkf/darkfo) and extensively modernized.

---

![OpenF2 screenshot](screenshot.png)

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Project Architecture](#project-architecture)
4. [Repository Structure](#repository-structure)
5. [Requirements](#requirements)
6. [Quick Start](#quick-start)
7. [Installation](#installation)
8. [Build Instructions](#build-instructions)
9. [Running the Project](#running-the-project)
10. [Testing](#testing)
11. [Status](#status)
12. [Roadmap](#roadmap)
13. [Contributing](#contributing)
14. [Troubleshooting](#troubleshooting)
15. [FAQ](#faq)
16. [License](#license)
17. [Credits](#credits)

---

## Overview

OpenF2 is an open-source, browser-native reimplementation of the **Fallout 2** game engine. The original Fallout 2 (1998, Interplay) is a landmark isometric RPG. OpenF2 aims to preserve and modernize that experience so it runs natively in any modern web browser — without requiring a native install, compatibility layer, or emulator.

**What problem does it solve?**
Running Fallout 2 natively on modern hardware requires compatibility shims, older OS versions, or third-party patching tools. OpenF2 eliminates that friction by rebuilding the engine runtime in TypeScript targeting WebGL and HTML5 APIs — the same technology stack powering modern web applications.

**Who is it for?**

- Players who want to experience Fallout 2 without a native install
- Developers and modders who want to extend or study the engine
- Preservationists interested in the long-term playability of classic games

**North star:** every location, quest, NPC, scripted event, and ending should work exactly as in the original game. Browser-native portability comes second, and optional QoL improvements come last — always as toggleable additions that never change the base experience.

---

## Features

- **WebGL rendering** — all gameplay panels rendered via the `ui2` WebGL path; no DOM-based UI in the critical rendering loop
- **Full SPECIAL stats system** — complete derived-stats pipeline for Strength, Perception, Endurance, Charisma, Intelligence, Agility, and Luck
- **Scripting VM** — INT bytecode interpreter with growing opcode and procedure coverage, including sfall extended opcodes
- **Combat engine** — turn-based combat with DT/DR damage reduction, ammo modifiers, AP rules, and critical hit tables
- **Inventory and equipment** — full item management, equip/unequip, weight/size constraints, and barter
- **Skills, traits, and perks** — all 18 skills with tag, progression, and checks; trait and perk systems with prerequisite enforcement
- **Leveling, XP, quests, karma, and reputation** — complete character advancement and quest-tracking loop
- **Save/load with schema migration** — versioned save format that forward-migrates older saves automatically
- **Map loading and traversal** — DAT2 archive reading, FRM sprite rendering, PRO prototype loading, and hex-grid pathfinding
- **Audio** — HTML5 Audio playback with ACM/WAV support via asset conversion pipeline
- **Fallout 1 compatibility layer** — engine version switching to serve both classic titles from the same codebase
- **Mod support** — DAT override stacking and mod manifests (`src/mods.ts`)
- **In-browser developer tools** — DebugOverlayPanel (F3/backtick), MapViewerPanel (F5), ScriptDebuggerPanel (F6), PrototypeInspectorPanel (F7)
- **Performance instrumentation** — `SpriteBatch` draw-call batching, `AssetCache` LRU streaming cache, VM slow-call telemetry, pathfinding counters

---

## Project Architecture

OpenF2 is split into three tiers: a **Python asset pipeline** that converts original game data offline, a **TypeScript engine runtime** that runs in the browser, and a **WebGL UI layer** that renders all gameplay panels.

```
Your Fallout 2 / Fallout 1 install
            │
            ▼
  Python Asset Pipeline  (setup.py, dat2.py, exportImages.py, convertAudio.py …)
            │   converts DAT archives → PNG/WebP sprites, JSON map/proto data, WAV audio
            ▼
     Static asset files  (served from repo root via http.server)
            │
            ▼
  TypeScript Engine Runtime  (src/)
  ┌──────────────────────────────────────────────────┐
  │  engine.ts / main.ts       engine lifecycle       │
  │  map.ts / data.ts          map loading & objects  │
  │  scripting.ts / vm*.ts     INT bytecode VM        │
  │  combat.ts / combat/       turn-based combat      │
  │  ecs/                      entity-component sys.  │
  │  character/                stats, perks, traits   │
  │  inventory.ts              items & equipment      │
  │  audio.ts                  HTML5 Audio playback   │
  │  assetStore.ts             LRU streaming cache    │
  │  mods.ts                   mod manifest loading   │
  │  compat/fallout1.ts        F1 compatibility layer │
  └──────────────────────────────────────────────────┘
            │
            ▼
  WebGL UI Layer  (src/ui2/)
  ┌──────────────────────────────────────────────────┐
  │  gamePanel / dialoguePanel / barterPanel          │
  │  inventoryPanel / lootPanel / characterScreen     │
  │  pipboy / worldMapOverlay / elevatorPanel         │
  │  debugOverlay / mapViewer / scriptDebugger        │
  └──────────────────────────────────────────────────┘
            │
            ▼
   Browser  (play.html  +  WebGL canvas)
```

### Core subsystems

| Subsystem | Key files | Description |
|-----------|-----------|-------------|
| Engine lifecycle | `src/engine.ts`, `src/main.ts`, `src/init.ts` | Bootstrap, game loop, state management |
| Map & world | `src/map.ts`, `src/data.ts`, `src/geometry.ts` | DAT loading, hex grid, map objects |
| Scripting VM | `src/scripting.ts`, `src/vm_opcodes.ts`, `src/vm_bridge.ts` | INT bytecode interpreter + sfall opcodes |
| Combat | `src/combat.ts`, `src/combat/` | Turn-based combat, damage formulas, criticals |
| Entity/ECS | `src/ecs/` | Entity manager, components, derived stats |
| Character | `src/character/` | SPECIAL, skills, traits, perks, leveling |
| Inventory | `src/inventory.ts` | Item management, equipment, weight |
| Rendering | `src/images.ts`, `src/lighting.ts`, `src/renderBatch.ts` | WebGL sprite rendering, lighting, batching |
| UI (WebGL) | `src/ui2/` | All gameplay panels on the WebGL path |
| Audio | `src/audio.ts` | HTML5 Audio, SFX, music |
| Save/Load | `src/saveload.ts`, `src/saveSchema.ts` | Versioned save with schema migration |
| Assets | `src/assetStore.ts` | LRU streaming cache with telemetry |
| Mods | `src/mods.ts` | DAT override stacking, mod manifests |
| Compat | `src/compat/fallout1.ts` | Fallout 1 data format compatibility |

---

## Repository Structure

```
OpenF2/
├── src/                    Main TypeScript engine source
│   ├── engine.ts           Engine lifecycle and game loop
│   ├── map.ts              Map loading and world state
│   ├── scripting.ts        INT bytecode scripting engine
│   ├── vm_opcodes.ts       Opcode dispatch table
│   ├── vm_bridge.ts        sfall extended opcodes
│   ├── combat.ts           Combat system
│   ├── combat/             Combat sub-modules (damage formula, etc.)
│   ├── character/          SPECIAL stats, skills, traits, perks, leveling
│   ├── ecs/                Entity-component system (manager, factory, components)
│   ├── ui2/                WebGL gameplay panels
│   ├── compat/             Fallout 1 compatibility layer
│   ├── formats/            Low-level file-format parsers
│   └── *.test.ts           Test files (co-located with source)
├── lut/                    Precomputed lookup tables (color, criticals, elevators)
├── maps/                   Sample/null map JSON for testing
├── shaders/                WebGL GLSL shaders (vertex, fragment, lighting, font)
├── lib/                    Vendored browser libraries (pathfinding)
├── docs/                   Internal contributor documentation
├── *.py                    Python asset-extraction and conversion scripts
├── setup.py                One-shot asset extraction entry point
├── play.html               Browser entry point
├── colortest.html          Color palette test page
├── package.json            Node dependencies and test scripts
├── Pipfile                 Python dependencies (Pipenv)
├── Brewfile                macOS system dependencies (Homebrew)
├── ROADMAP.md              Full milestone plan and phase history
├── CONTRIBUTING_ROADMAP.md In-depth contributor guide and architecture notes
└── LICENSE.txt             Apache 2.0 license
```

---

## Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Fallout 2 game data** | any | Legal copy required; GOG/Steam editions work |
| **Node.js + npm** | LTS | Used to install dependencies and run tests |
| **Python** | 3.9+ | Required for asset extraction scripts |
| **Pipenv** | any | Manages Python virtual environment |
| **TypeScript** | 4.6+ | Installed via `npm install` |

**Optional:**
- `acm2wav` — broader audio format support for `convertAudio.py`
- **macOS:** `brew bundle` installs all system dependencies listed in `Brewfile`

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/awest813/OpenF2.git
cd OpenF2

# 2. Install Node.js and Python dependencies
npm install
pipenv install

# 3. Extract and convert your Fallout 2 game data
pipenv run python setup.py /path/to/your/Fallout2

# 4. Compile TypeScript
npx tsc

# 5. Start a local web server from the repository root
python -m http.server

# 6. Open in your browser
#    http://localhost:8000/play.html?artemple
```

If anything fails, open the **browser developer console** first — missing assets and runtime errors are reported there.

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/awest813/OpenF2.git
cd OpenF2
```

### 2. Install Node.js dependencies

```bash
npm install
```

This installs TypeScript, Vitest, and ESLint as dev dependencies. There are no production npm dependencies — the engine runs directly from compiled TypeScript output.

### 3. Install Python dependencies

```bash
pipenv install
```

The Python environment provides NumPy and Pillow, which the asset-extraction scripts depend on.

**macOS shortcut:**

```bash
brew bundle     # installs system-level tools from Brewfile
pipenv install
npm install
```

---

## Build Instructions

### Compile TypeScript

```bash
npx tsc
```

Output is written to the `js/` directory and served directly by `python -m http.server`.

> **Note:** `npm test` passes cleanly. `npx tsc` currently reports type errors in `src/scripting.ts` that are pre-existing and tracked on the roadmap. The compiled output is still functional for browser use.

### Type-check only (no output)

```bash
npx tsc --noEmit
```

### Lint

```bash
npx eslint src/
```

---

## Running the Project

### 1. Extract game assets (once, or after game data changes)

```bash
pipenv run python setup.py /path/to/your/Fallout2
```

This runs the full extraction pipeline: DAT archives → PNG sprites, JSON maps/prototypes, WAV audio.

### 2. Start a local web server

```bash
python -m http.server
```

### 3. Open the game in your browser

```
http://localhost:8000/play.html?artemple
```

`artemple` is the Arroyo Temple — the opening area of Fallout 2. Replace it with any converted map name (the filename without extension of a `.json` file in `maps/`) to load a different area.

### In-browser developer tools

| Panel | Shortcut | Description |
|-------|----------|-------------|
| DebugOverlayPanel | F3 / backtick | Live HP, AP, entity count, VM call timing |
| MapViewerPanel | F5 | In-browser map inspection |
| ScriptDebuggerPanel | F6 | Active script, procedure name, step count |
| PrototypeInspectorPanel | F7 | Prototype data, mod override visibility |

Engine and UI toggles can be adjusted in `src/config.ts` (requires recompile).

---

## Testing

Tests use [Vitest](https://vitest.dev/) and live alongside source files in `src/`.

```bash
# Run the full test suite
npm test

# Run a specific test file
npx vitest run src/phase1.test.ts

# Run only the UI2 gameplay panel tests
npm run test:ui2:gameplay

# Watch mode during development
npx vitest --watch
```

### Test coverage areas

| File(s) | Coverage |
|---------|----------|
| `src/phase1.test.ts` – `src/phase25.test.ts` | Roadmap milestone regressions and scripting fidelity |
| `src/vm.test.ts` | Script VM bytecode execution and opcode correctness |
| `src/ui2/ui2.test.ts`, `src/ui2/panelParity.test.ts` | WebGL UI rendering and panel parity |
| `src/combat.integration.test.ts`, `src/combat/damageFormula.test.ts` | Combat integration and damage math |
| `src/skills.test.ts`, `src/skillCheck.test.ts` | Skill calculations and checks |
| `src/inventory.test.ts` | Item management and constraints |
| `src/saveload.test.ts` | Save/load and schema migration |
| `src/ecs/entityManager.test.ts`, `src/ecs/derivedStats.test.ts` | ECS and derived stats |
| `src/character/leveling.test.ts` | Character leveling flow |
| `src/geometry.test.ts` | Hex grid geometry |
| `src/campaignSmoke.test.ts` | End-to-end campaign smoke tests |

For the complete list, browse `src/**/*.test.ts`.

---

## Status

**Active phase:** Phase 4 — Fidelity, Modding, and Tooling  
Phases 0–3 are complete. The engine loads and runs Fallout 2 maps with working combat, stats, scripting, and UI. The remaining work focuses on closing scripting gaps and raising fidelity until the full game is completable end-to-end.

### What works today

| Area | State |
|------|-------|
| Map loading, traversal, and actor movement | ✅ Stable |
| SPECIAL stats + derived stats pipeline | ✅ Stable |
| Skills (18), traits, and perks | ✅ Stable |
| Combat damage formulas (DT/DR, ammo, AP, criticals) | ✅ Stable |
| Inventory and equipment management | ✅ Stable |
| Leveling, XP, quests, karma, and reputation | ✅ Stable |
| All gameplay UI panels via `ui2` WebGL | ✅ Stable |
| Versioned save/load with schema migration | ✅ Stable |
| Core scripting VM (INT bytecode) | 🔶 Partial |
| Dialogue and barter | 🔶 Partial |
| WebGL rendering + lighting | 🔶 Partial |
| Fallout 1 compatibility layer | 🔶 Partial |

### Known gaps

- **Scripting coverage:** many Fallout 2 procedures and sfall opcodes remain stubs; closing these is the critical path to a fully-playable game
- **UI fidelity:** edge-case visual and interaction parity work is ongoing
- **Animation and rendering fidelity:** edge-case timing and correctness still need polish

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full milestone plan and phase history.

| Goal | Status |
|------|--------|
| Phase 0 — Stabilize core architecture | ✅ Complete |
| Phase 1 — Playable core RPG loop | ✅ Complete |
| Phase 2 — Full Fallout 2 system coverage | ✅ Complete |
| Phase 3 — Fallout 1 compatibility | ✅ Complete |
| Phase 4 — Fidelity, modding, and tooling | 🔶 Active |
| Phase 5 — End-to-end completability (1.0) | ⬜ Upcoming |
| Post-1.0 — Optional QoL layer | ⬜ Future |

**Critical path to 1.0:** scripting VM completeness — every de-stubbed procedure and sfall opcode unblocks more of the game world.

---

## Contributing

Everything that gets the game closer to fully playable is a priority. Contributions are especially welcome in:

- **Scripting VM** — opcode/procedure coverage is the critical path to a completable game; every de-stubbed procedure unblocks more of the world
- **Rendering and animation** — edge-case fidelity and timing polish so the game looks right
- **UI migration** — moving any remaining panels from DOM to the `ui2` WebGL path
- **QoL features** — once vanilla fidelity is solid, optional improvements (widescreen, UI tweaks, extended sfall opcodes) are welcome as toggleable additions that never break the base experience

### Workflow

1. Fork the repository and create a feature branch
2. Make your changes, keeping them focused and minimal
3. Add or update tests in `src/` as appropriate
4. Run `npm test` to confirm the test suite still passes
5. Open a pull request with a clear description of the change

For major features, open an issue first so the work stays aligned with the [roadmap](./ROADMAP.md).  
For in-depth contributor guidance, architecture notes, and debugging tips, see [CONTRIBUTING_ROADMAP.md](./CONTRIBUTING_ROADMAP.md).

---

## Troubleshooting

**The browser shows a blank screen or nothing loads**
- Open the browser developer console (F12). Missing assets and runtime errors appear there.
- Confirm that `setup.py` completed successfully and that extracted assets are present in the repo root.
- Make sure you are serving from the repository root, not from a subdirectory.

**`npx tsc` reports errors**
- There are pre-existing type errors in `src/scripting.ts` tracked on the roadmap. The compiled output is still functional for browser use. Use `npm test` to validate logic correctness.

**`python -m http.server` is inaccessible**
- The default port is 8000. If it is already in use, run `python -m http.server 8080` and adjust the URL accordingly.

**Audio is missing or silent**
- The `convertAudio.py` script requires `acm2wav` for ACM audio files. Install it and re-run the audio conversion step.

**Pathfinding or movement feels wrong on a map**
- Check the browser console for scripting stub warnings. A missing procedure may affect NPC pathing or trigger execution.

---

## FAQ

**Do I need to own Fallout 2?**  
Yes. OpenF2 does not include any game data. You must supply your own legal copy (GOG and Steam editions both work).

**Does this replace or compete with the original game?**  
No. OpenF2 is a reimplementation of the *engine runtime* only, designed to preserve long-term access to the game. The original game data is required and unmodified.

**Can I play Fallout 1 too?**  
Partial Fallout 1 compatibility is maintained via `src/compat/fallout1.ts`. Full F1 fidelity is a secondary goal after F2 is completable.

**Is there a hosted/online demo?**  
Not currently. You run the engine locally using your own copy of the game data.

**How is this different from Fallout 2 CE (Community Edition) or other fan projects?**  
Those projects typically patch or wrap the original native binary. OpenF2 is a clean-room reimplementation of the engine in TypeScript targeting the browser — no native binary involved.

**Can I mod the game?**  
Basic mod support via DAT override stacking and mod manifests exists in `src/mods.ts`. A full mod editor is planned post-1.0.

---

## License

Apache License 2.0. See [LICENSE.txt](./LICENSE.txt) for the full text.

---

## Credits

- **[darkfo](https://github.com/darkf/darkfo)** — the original open-source Fallout engine browser project that OpenF2 was forked from
- **[Interplay Entertainment](https://en.wikipedia.org/wiki/Interplay_Entertainment)** / **[Black Isle Studios](https://en.wikipedia.org/wiki/Black_Isle_Studios)** — creators of the original Fallout and Fallout 2
- **[TeamX / Fallout community researchers](https://fallout.wiki/)** — community documentation of FRM, DAT, MAP, PRO, and INT file formats that made this reimplementation possible
- **[sfall](https://sourceforge.net/projects/sfall/)** — extended scripting opcode reference used to implement sfall-compatible opcodes in `src/vm_bridge.ts`
- **[pathfinding.js](https://github.com/qiao/PathFinding.js)** — browser pathfinding library (`lib/pathfinding-browser.js`)
