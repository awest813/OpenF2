# OpenF2

OpenF2 is a browser-first reimplementation of the Fallout 2 engine (with long-term Fallout 1 compatibility goals).

> Historical note: this project was previously called **Harold** in older docs and code comments.

The codebase is based on [darkfo](https://github.com/darkf/darkfo) and has been modernized around TypeScript + Python tooling.

## Current status

OpenF2 is playable in parts, but still experimental and incomplete.

### Implemented (partial or stable)

- Map loading and traversal
- Walking/running movement
- NPC dialogue and basic barter
- Random encounters (partial)
- Core scripting support (partial INT VM)
- Basic combat flow (limited weapons/content coverage)
- Lighting and WebGL rendering
- Alpha save/load

### Known gaps

- UI still mixes DOM and WebGL; bitmap-font parity is incomplete
- Armor/equipment and ammo systems are incomplete
- World map placement/travel still has bugs
- Some animations and combat outcomes are inaccurate
- Pip-Boy map and other systems are still missing

See [ROADMAP.md](./ROADMAP.md) for the prioritized plan.

## Requirements

- A legal Fallout 2 installation
- Python 3.9+
- [Pipenv](https://github.com/pypa/pipenv)
- Node.js + npm (for TypeScript compile)

Optional:

- `acm2wav` if you want to run `convertAudio.py` for broader sound support
- Homebrew users can run `brew bundle` to install many dependencies from `Brewfile`

## Quick start

1. Install JS dependencies:
    ```bash
    npm install
    ```
2. Install Python dependencies:
    ```bash
    pipenv install
    ```
3. Prepare game assets:
    ```bash
    pipenv run python setup.py /path/to/Fallout2
    ```
4. Compile TypeScript:
    ```bash
    npx tsc
    ```
5. Run a local web server from the repo root:
    ```bash
    python -m http.server
    ```
6. Open:
    ```
    http://localhost:8000/play.html?artemple
    ```

If startup fails, check the browser console for missing assets or script errors.

## Development notes

- Main engine source: `src/`
- Config toggles: `src/config.ts` (recompile after TS changes)
- Asset conversion/utility scripts: repository root (`*.py`)

## Contributing

Contributions are welcome, especially around:

- Combat and equipment correctness
- UI migration to full WebGL rendering
- Save/load reliability
- Fallout 1 asset/runtime support

If you plan a major feature, open an issue first so roadmap priorities stay aligned.
