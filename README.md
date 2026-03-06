# OpenF2

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE.txt)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)
[![Phase](https://img.shields.io/badge/phase-4%20Fidelity%20%26%20Modding-orange.svg)](ROADMAP.md)

OpenF2 is a **browser-first reimplementation** of the classic Fallout 1/2 engine runtime, built on TypeScript and Python tooling. It reads original game data files and runs entirely in the browser via WebGL.

> **Note:** older docs may still reference the former project name **Harold**.

Origins: forked from [darkfo](https://github.com/darkf/darkfo) and extensively modernized.

---

![OpenF2 screenshot](screenshot.png)

---

## Table of Contents

1. [Status](#status)
2. [Requirements](#requirements)
3. [Quick Start](#quick-start)
4. [Development Notes](#development-notes)
5. [Testing](#testing)
6. [Contributing](#contributing)

---

## Status

**Active phase:** Phase 4 — Fidelity, Modding, and Tooling  
Phases 0–3 are complete. See [ROADMAP.md](./ROADMAP.md) for the full milestone plan.

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
| Fallout 1 compatibility layer | 🔶 Partial |

### Known gaps

- **UI fidelity/polish:** gameplay panels now render through `ui2`; edge-case visual and interaction parity work continues.
- **Animation and rendering fidelity:** edge-case timing and correctness still need polish.
- **In-browser tooling:** contributor cockpit panels are available now: DebugOverlayPanel (F3/backtick), MapViewerPanel (F5), ScriptDebuggerPanel (F6), and PrototypeInspectorPanel (F7). They expose live HP/AP/entity/map/script data plus mod priority/override visibility for regression debugging.

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

Key test files and what they cover:

| File | Coverage |
|------|----------|
| `src/phase1.test.ts` | HP/AP formulas, skills, traits, perks, leveling |
| `src/phase2.test.ts` | World map, encounters, game time, scripting |
| `src/phase3.test.ts` | Audio, cinematics, Fallout 1 compatibility |
| `src/phase4.test.ts` | Mod loading, pathfinding, geometry |
| `src/vm.test.ts` | Script VM bytecode execution |
| `src/skills.test.ts` | Skill calculations and checks |
| `src/inventory.test.ts` | Item management and constraints |
| `src/saveload.test.ts` | Save/load and schema migration |

---

## Contributing

Contributions are especially welcome in:

- **UI migration** — moving remaining panels from DOM to `ui2` WebGL rendering
- **Rendering and animation** — edge-case fidelity and timing polish
- **Scripting VM** — opcode/procedure coverage expansion
- **Modding ergonomics** — tooling and debug workflows

For major features, open an issue first so the work stays aligned with the [roadmap](./ROADMAP.md).  
For in-depth contributor guidance, architecture notes, and debugging tips, see [CONTRIBUTING_ROADMAP.md](./CONTRIBUTING_ROADMAP.md).
