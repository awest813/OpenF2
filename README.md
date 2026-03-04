# OpenF2

OpenF2 is a browser-first reimplementation of the classic Fallout engine runtime.

- **Current target:** Fallout 2 feature parity and fidelity
- **Secondary target:** Fallout 1 compatibility and shared engine behavior
- **Historical note:** older docs may still reference the former name **Harold**

The project started from [darkfo](https://github.com/darkf/darkfo) and has been modernized around TypeScript + Python tooling.

## Status snapshot

OpenF2 has completed Phases 1–3 and is currently in **Phase 4: Fidelity, Modding, and Tooling**.

Recent debugging update: the typed `EngineEvents` catalogue now includes the emitted ui2 panel events, restoring a clean TypeScript compile for those flows.

### Working today (stable or partial)

- Map loading, traversal, and movement
- Dialogue/barter foundations
- Core scripting runtime (partial INT VM coverage)
- SPECIAL, derived stats, skills, traits, and perks
- Combat formulas (DT/DR, ammo, AP rules, critical pathways)
- Inventory/equipment management
- Leveling, XP, quests, karma, and reputation tracking
- WebGL rendering + lighting foundations
- Versioned save/load with schema migration

### Current gaps

- UI still split between DOM and WebGL paths (OptionsPanel/SaveLoadPanel/BitmapFontRenderer migrated to ui2; dialogue, barter, inventory, and world map overlay still use DOM)
- Animation timing and edge-case combat fidelity still need polish
- Pip-Boy map and selected legacy UI systems are incomplete

See [ROADMAP.md](./ROADMAP.md) for prioritized milestones and [CONTRIBUTING_ROADMAP.md](./CONTRIBUTING_ROADMAP.md) for in-depth contributor guidance.

## Requirements

- Legal Fallout 2 game data
- Python 3.9+
- [Pipenv](https://github.com/pypa/pipenv)
- Node.js + npm

Optional:

- `acm2wav` for broader audio conversion support in `convertAudio.py`
- Homebrew users can run `brew bundle` from `Brewfile`

## Quick start

1. Install Node dependencies:
   ```bash
   npm install
   ```
2. Install Python dependencies:
   ```bash
   pipenv install
   ```
3. Prepare assets from your Fallout 2 install:
   ```bash
   pipenv run python setup.py /path/to/Fallout2
   ```
4. Compile TypeScript:
   ```bash
   npx tsc
   ```
5. Start a local web server from the repository root:
   ```bash
   python -m http.server
   ```
6. Open:
   ```
   http://localhost:8000/play.html?artemple
   ```

If startup fails, check browser console logs first for missing assets or script/runtime errors.

## Development notes

- Engine/runtime source: `src/`
- Config toggles: `src/config.ts` (recompile after TS edits)
- Asset conversion + support scripts: repository root (`*.py`)
- Validation commands: `npm test` and `npx tsc --noEmit`

## Contributing

Contributions are especially helpful in:

- Rendering/UI parity work
- World map and travel correctness
- Combat + animation fidelity
- Modding ergonomics and debugging tools

For major features, open an issue first so planning stays aligned with the roadmap.
