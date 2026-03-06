# OpenF2 — Developer Roadmap & Engine Guide

> A detailed reference for contributors who want to understand, debug, and extend the OpenF2 engine to make Fallout 2 fully playable (and maintain Fallout 1 compatibility).

---

## Table of Contents

1. [Engine Overview](#1-engine-overview)
2. [Core File Formats](#2-core-file-formats)
3. [Architecture Tour](#3-architecture-tour)
4. [Phase 1 — Core RPG Loop (Complete)](#4-phase-1--core-rpg-loop)
5. [Phase 2 — Full Fallout 2 Completion (Complete)](#5-phase-2--full-fallout-2-completion)
6. [Debugging Guide](#6-debugging-guide)
7. [Engine Extension Points (sfall Ecosystem)](#7-engine-extension-points-sfall-ecosystem)
8. [Community Reference Engines](#8-community-reference-engines)
9. [Suggested Learning Path](#9-suggested-learning-path)
10. [Future Work (Phase 4+)](#10-future-work-phase-4)
11. [Glossary](#11-glossary)

---

## 1. Engine Overview

OpenF2 is a **browser-first reimplementation** of the Fallout 2 engine, based on [darkfo](https://github.com/darkf/darkfo), modernized around **TypeScript + Python tooling**.

### What This Is

- A re-implementation of Interplay's Fallout 2 engine for the web
- Reads original game data files (DAT archives, FRM sprites, MAP files, PRO prototypes)
- Runs in-browser via WebGL rendering + HTML5 Audio
- Uses Python scripts to extract and convert original game assets
- Supports Fallout 1 data via a compatibility layer (Phase 3)

### What This Is NOT

- Not a game-data distribution (you need a legal Fallout 2 installation)
- Not a 1:1 disassembly — it's a clean-room reimplementation guided by community research
- Not a mod loader in the sfall sense (though basic mod override support exists in Phase 4)

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Engine core | TypeScript (strict, ES2021 target) |
| Rendering | WebGL (all gameplay panels via `ui2`) |
| Audio | HTML5 Audio API |
| Asset extraction | Python 3.9+ (NumPy, Pillow) |
| Testing | Vitest |
| Bundling | `tsc` → `js/` directory, served via `http.server` |

---

## 2. Core File Formats

Understanding what the engine loads is the first step to effective debugging.

### DAT Archives

All Fallout 2 assets live in DAT archives. Fallout 1 and Fallout 2 use different formats:

| Format | Game | Key Difference |
|--------|------|---------------|
| **DAT1** | Fallout 1 | LZSS-compressed, different header layout |
| **DAT2** | Fallout 2 | zlib-compressed entries, tree-structured directory |

- Reference: [DAT file format](https://fallout-archive.fandom.com/wiki/DAT_files)
- OpenF2 extraction: `dat2.py` (FO2), `dat1.py` (FO1)
- The Python `setup.py` handles full extraction and conversion automatically

### FRM — Sprites and Animations

FRM files contain all 2D art: critters, items, interface elements, talking heads, tiles, and scenery.

- **Structure**: 6 orientations × N frames, with per-frame offset data
- **Colour**: Indexed 8-bit palette (requires `color.pal` for rendering)
- Reference: [FRM File Format](https://fallout.wiki/wiki/FRM_File_Format) · [TeamX FRM spec](https://sucs.org/~grepwood/teamx/frm_2.html)
- OpenF2 conversion: `exportImages.py` converts FRM → PNG/WebP
- Related source: `src/images.ts` (runtime image loading), `frmpixels.py` (low-level FRM decoding)

### MAP — Map Layout

MAP files define the hex grid, placed objects, scripts, and elevation layers for each game area.

- **Structure**: Header (version, map dimensions, default elevation) + tile grid + object list
- **Fallout 1**: MAP version 19
- **Fallout 2**: MAP version 20 (adds extra fields)
- Reference: [MAP File Format](https://fallout.wiki/wiki/MAP_File_Format)
- OpenF2 conversion: `convertMaps.py` + `fomap.py` → JSON
- Related source: `src/map.ts` (runtime map loading)

### PRO — Prototype Definitions

PRO files define the behaviour templates for every object in the game: items, critters, walls, tiles, scenery.

- **Structure**: Type-discriminated records (item, critter, scenery, wall, tile, misc)
- Each object placed on a MAP references a PRO by its PID (Prototype ID)
- Reference: [PRO File Format](https://fallout.wiki/wiki/PRO_File_Format)
- OpenF2 conversion: `exportPRO.py` → JSON
- Related source: `src/pro.ts` (runtime prototype loading)

### INT — Compiled Scripts

INT files are compiled Fallout script bytecode, generated from the SSL scripting language.

- **Structure**: Procedure table + bytecode + string table + identifier table
- Related source: `src/intfile.ts` (INT file parser), `src/vm.ts` (script VM), `src/vm_opcodes.ts` (opcode handlers), `src/vm_bridge.ts` (game API bridge)

### Other Formats

| Format | Purpose | Notes |
|--------|---------|-------|
| ACM | Audio (compressed) | `convertAudio.py` converts to WAV |
| PAL | Color palette | 256-entry RGB palette, loaded at startup |
| MSG | Text/dialogue strings | Key-value indexed string tables |
| GAM | Save game | OpenF2 uses IndexedDB instead |
| CFG | Configuration | Replaced by `src/config.ts` |

- Hub reference: [Game Files](https://fallout.wiki/wiki/Game_Files) · [FO1/FO2 File Formats](https://falloutmods.fandom.com/wiki/Fallout_and_Fallout_2_file_formats)

---

## 3. Architecture Tour

### Directory Layout

```
src/
├── main.ts              # Entry point
├── engine.ts            # Engine lifecycle
├── config.ts            # Runtime configuration toggles
├── globalState.ts       # Shared mutable state
│
├── ecs/                 # Entity-Component-System
│   ├── components.ts    # Component type definitions (Stats, Skills, Inventory, etc.)
│   ├── entityManager.ts # Entity lifecycle and component queries
│   └── derivedStats.ts  # SPECIAL → derived stats formulas (HP, AP, AC, etc.)
│
├── character/           # Character systems
│   ├── traits.ts        # Trait definitions and application
│   ├── perks.ts         # Perk definitions, prerequisites, and granting
│   └── leveling.ts      # XP gain, level-up, skill point allocation
│
├── combat/              # Combat subsystem
│   └── damageFormula.ts # Canonical damage pipeline (DT/DR/ammo/criticals)
├── combat.ts            # Turn-based combat loop (AP, AI, attack resolution)
├── criticalEffects.ts   # Critical hit/failure tables
│
├── skills.ts            # Skill definitions and SPECIAL dependencies
├── skillCheck.ts        # d100 roll system with difficulty modifiers
├── inventory.ts         # Item add/remove, equipment management
│
├── worldmap.ts          # World map travel, area discovery, encounters
├── encounters.ts        # Random encounter system (condition parsing, formation)
│
├── vm.ts                # Script VM (bytecode execution)
├── vm_opcodes.ts        # Core opcode handlers (stack, control flow, arithmetic)
├── vm_bridge.ts         # Game API bridge (100+ opcodes mapped to engine functions)
├── scripting.ts         # High-level scripting interface
├── intfile.ts           # INT file parser
│
├── audio.ts             # Audio engine (SFX, music, ambient)
├── cinematic.ts         # Cinematic/cutscene player
├── eventBus.ts          # Typed event bus (inter-module communication)
│
├── compat/
│   └── fallout1.ts      # Fallout 1 compatibility layer
├── engineVersion.ts     # Engine version enum and helpers
├── mods.ts              # Mod manifest and DAT override stacking
│
├── quest/
│   └── questLog.ts      # Quest state machine and tracking
│
├── ui.ts                # DOM-based UI (legacy; gameplay panels migrated to ui2)
├── ui2/                 # WebGL-based UI (all gameplay panels)
│
├── map.ts               # Map loading and traversal
├── geometry.ts          # Hex grid geometry, pathfinding, line-of-sight
├── lighting.ts          # Lighting system
├── renderer.ts          # Rendering pipeline
├── webglrenderer.ts     # WebGL renderer
│
└── saveload.ts          # IndexedDB save/load system
```

### Key Design Patterns

1. **ECS (Entity-Component-System)**: Actors and items are entities with typed components (Stats, Skills, Inventory, Combat, etc.). The `EntityManager` provides O(1) component lookup.

2. **EventBus**: All inter-module communication goes through `eventBus.ts`. Modules subscribe to typed events rather than importing each other directly, preventing circular dependencies.

3. **Derived Stats Pipeline**: All derived values (HP, AP, AC, carry weight, resistances, etc.) flow from `recomputeDerivedStats()` in `derivedStats.ts`. No other module may invent derived values.

4. **Script VM Bridge**: The scripting VM executes INT bytecode. Game-specific opcodes (100+) are mapped through `vm_bridge.ts` to engine functions, creating a clean boundary between script execution and game logic.

---

## 4. Phase 1 — Core RPG Loop

**Status: ✅ Complete**

Phase 1 delivers the foundational RPG mechanics needed for a "start-to-first-hub" experience.

### Systems and Formulas

#### SPECIAL Stats + Derived Values

All derived stats flow from 7 primary attributes (S.P.E.C.I.A.L.) through `recomputeDerivedStats()`:

| Derived Stat | Formula | Source |
|-------------|---------|--------|
| Max HP | `15 + STR + 2×END + (level-1) × (2 + ⌊END/2⌋) + maxHpMod` | `derivedStats.ts:32-33` |
| Max AP | `5 + ⌈AGI/2⌉ + maxAPMod` | `derivedStats.ts:37` |
| Armor Class | `AGI` (unarmored) | `derivedStats.ts:40` |
| Carry Weight | `25 + 25×STR + carryWeightMod` | `derivedStats.ts:43` |
| Melee Damage | `max(1, STR - 5) + meleeDamageMod` | `derivedStats.ts:46` |
| Poison Resistance | `5×END + poisonResistanceMod` | `derivedStats.ts:52` |
| Radiation Resistance | `2×END + radiationResistanceMod` | `derivedStats.ts:55` |
| Sequence | `2×PER + sequenceMod` | `derivedStats.ts:58` |
| Healing Rate | `max(1, ⌊END/3⌋) + healingRateMod` | `derivedStats.ts:61` |
| Critical Chance | `LCK + criticalChanceMod` | `derivedStats.ts:64` |

**Key invariant**: The `combat.ts` AP formula in `ActionPoints.getMaxAP()` **must** use `Math.ceil(AGI/2)` to match the canonical formula. (This was a bug fixed in this PR — the old code used `Math.floor`.)

#### Skills System

18 skills, each derived from 1–2 SPECIAL attributes:

| Skill | Formula | Reference |
|-------|---------|-----------|
| Small Guns | `5 + 4×AGI` | Core combat skill |
| Lockpick | `10 + PER + AGI` | Utility skill |
| Outdoorsman | `2 × (END + INT)` | Travel/survival skill |
| Speech | `5 × CHA` | Dialogue skill |

Skill point cost brackets (Fallout 2):
- 0–100: 1 pt per point
- 101–125: 2 pts
- 126–150: 3 pts
- 151–175: 4 pts
- 176+: 5 pts
- Tagged skills: half cost (rounded up)

#### Traits

16 traits available at character creation. Maximum of 2 per character.

Notable interactions:
- **Skilled** (+5 SP/level, perks every 4 levels instead of 3)
- **Gifted** (+1 to all SPECIAL, -10% to all skills, -5 SP/level)
- **Finesse** (+10% crit chance; damage penalty handled in damage formula)
- **Kamikaze** (+10 sequence; AC penalty handled in armor equip path)

#### Perks

Earned every 3 levels (every 4 with Skilled trait). Each has level, SPECIAL, and skill prerequisites.

#### XP / Leveling

Fallout 2 triangular formula: Level N requires `N×(N-1)/2 × 1000` XP.

| Level | XP Required |
|-------|------------|
| 1 | 0 |
| 2 | 1,000 |
| 5 | 10,000 |
| 10 | 45,000 |
| 20 | 190,000 |

### Test Coverage

- `phase1.test.ts`: 54 tests covering HP/AP/carry formulas, skills, traits, perks, leveling
- `character/leveling.test.ts`: 35 tests for skill point costs, level-up mechanics
- `ecs/derivedStats.test.ts`: 25 tests for derived stat computations
- `progression.test.ts`: 11 tests for XP-to-level progression

---

## 5. Phase 2 — Full Fallout 2 Completion

**Status: ✅ Complete**

Phase 2 makes the full Fallout 2 experience completable end-to-end.

### Systems and Known Issues

#### World Map

The world map system (`worldmap.ts`) handles:
- Area discovery and fog-of-war (28×30 grid of 51px squares)
- Travel speed (terrain-dependent)
- Random encounter rolls during travel
- Area hotspot detection (click-to-visit)

**Fixed bugs (this PR)**:
1. **Offset calculation**: Click coordinates used bitwise OR (`|`) instead of addition (`+`) for page scroll offset, causing misplaced clicks when the page was scrolled.
2. **Bounds checking**: `didEncounter()` and `updateWorldmapPlayer()` lacked bounds validation before accessing the squares array, risking crashes at map edges.
3. **Undefined encounter rate**: When a square's frequency token didn't match any entry in the encounter rate table, the code silently operated on `undefined`, producing `NaN` comparisons.

#### Encounter Difficulty Scaling

The encounter rate is adjusted by difficulty before rolling:

```
easy:   encRate -= floor(encRate / 15)
normal: unchanged
hard:   encRate += floor(encRate / 15)
```

After adjustment, the rate is clamped to `[1, 99]` to prevent:
- `0` or negative (making encounters impossible)
- `100+` (forcing encounters)

#### Game Time

Time is tracked in "game ticks" (10 ticks = 1 second). The scripting VM bridges expose:

| Opcode | Function | Formula |
|--------|----------|---------|
| `0x8118` | `get_month` | `1 + (⌊days/30⌋ % 12)` where `days = ⌊ticks/(10×86400)⌋` |
| `0x8119` | `get_day` | `1 + days % 30` |
| `0x80F6` | `game_time_hour` | HHMM format from `⌊ticks/10⌋ % 86400` |

#### Audio

The `HTMLAudioEngine` handles ambient SFX using weighted random selection based on map-specific frequency tables. The selection algorithm iterates entries, subtracting each weight from the roll until the roll falls below the current weight.

#### Combat

The damage pipeline (`damageFormula.ts`) implements the canonical Fallout 2 formula:

```
raw     = roll(minDmg, maxDmg)
ammo    = floor(raw × ammoDmgMult / ammoDmgDiv)
postDT  = max(0, ammo - DT[type])
postDR  = floor(postDT × (1 - DR[type]/100))
final   = max(1, floor((postDR + bonusDamage) × critMult))
```

#### Scripting Runtime

The script VM (`vm.ts`) executes compiled INT bytecode. The bridge layer (`vm_bridge.ts`) maps 100+ opcodes to game functions including:
- Player/object management
- Game time/date calculations
- Inventory, skills, and critter stats
- Combat, dialogue, and animation
- UI controls and fade effects

### Test Coverage

- `phase2.test.ts`: 27 tests covering game time, encounter difficulty, bounds, offset calculation
- `phase3.test.ts`: 29 tests covering audio, encounter clamping, cinematics, F1 compat
- `combat/damageFormula.test.ts`: 25 tests for the damage pipeline
- `vm.test.ts`: 33 tests for script VM execution
- `skillCheck.test.ts`: 36 tests for d100 roll system

---

## 6. Debugging Guide

### Running Tests

```bash
# Run all tests
npx vitest run

# Run specific phase tests
npx vitest run src/phase1.test.ts
npx vitest run src/phase2.test.ts

# Run in watch mode during development
npx vitest --watch
```

### Contributor Cockpit (Phase 4 Tooling)

OpenF2 now ships a browser-native contributor cockpit that can stay open while reproducing map/script/mod regressions:

- **F3 / backtick — DebugOverlayPanel**: live HP/AP, entity count, map name, current script procedure, and latest script log line.
- **F5 — MapViewerPanel**: cursor hex/tile/elevation + nearby objects + active mod list (high→low priority) + resolved override winners.
- **F6 — ScriptDebuggerPanel**: current VM procedure and rolling script log.
- **F7 — PrototypeInspectorPanel**: selected PRO metadata/stats for map and script verification.

For regression debugging, keep F3+F5+F6 visible while reproducing and include screenshots/log excerpts in issue reports.

### Common Debugging Scenarios

#### "A SPECIAL-derived stat seems wrong"

1. Check the formula in `src/ecs/derivedStats.ts` against the Fallout 2 reference
2. Verify that `recomputeDerivedStats()` is being called after any stat/modifier change
3. Check for rounding: Fallout 2 uses `floor()` in most places, `ceil()` for AP only
4. Run the corresponding test: `npx vitest run src/ecs/derivedStats.test.ts`

#### "Combat AP doesn't match what I expect"

1. The canonical formula is `5 + ceil(AGI/2) + maxAPMod`
2. **Both** `derivedStats.ts` AND `combat.ts` must use `Math.ceil` — check both
3. Verify the `maxAPMod` from perks/traits is correct (Action Boy adds +1, Bruiser subtracts -2)

#### "A world map encounter seems buggy"

1. Check the square's frequency token in `data/data/worldmap.txt`
2. Verify the encounter rate table was parsed correctly (look at `encounterRates` in parsed worldmap)
3. Check difficulty adjustment: `Config.engine.encounterDifficulty`
4. Check bounds: ensure the player position maps to a valid square

#### "A script opcode isn't working"

1. Check if the opcode is implemented in `vm_bridge.ts` (search for the hex opcode)
2. If unimplemented, the VM will hit `doDisasmOnUnimplOp` and dump a disassembly
3. Check stack order: many opcodes pop arguments in reverse order
4. Compare with the sfall source for the expected behavior
5. Keep **F6** open while reproducing and record the `Proc:` and recent log lines

#### "A mod override is not being applied"

1. Open **F5 (MapViewerPanel)** and inspect the **Mods (high→low)** list
2. Check the **Overrides** section for the canonical path winner
3. If a winner appears wrong, confirm registration order in `src/mods.ts`
4. Add/adjust a test in `src/phase4.test.ts` to lock in the expected stacking behavior

#### "An item/critter/object doesn't load correctly"

1. Check the PRO extraction: verify `proto/` has the correct JSON for the PID
2. Check FRM conversion: verify `art/` has the image file
3. Check the MAP export: verify the object is placed in the JSON map
4. Run `setup.py` again if assets seem stale

### Useful Console Commands (Browser)

When running the engine in a browser, `globalState` is accessible from the console:

```javascript
// Check player stats
globalState.player.stats

// Check current map
globalState.gMap

// Check combat state
globalState.combat

// Toggle debug overlays
Config.ui.showHexOverlay = true
Config.ui.showCoordinates = true
Config.ui.showBoundingBox = true
```

---

## 7. Engine Extension Points (sfall Ecosystem)

[sfall](https://github.com/sfall-team/sfall) is the community's DLL-based engine patcher for the original Fallout 2 executable. Understanding sfall is essential because:

1. **It documents real engine limits and fixes** that any reimplementation must handle
2. **Many mods depend on sfall features** (extended scripting, UI hooks, bug fixes)
3. **The modders pack** ([SourceForge](https://sourceforge.net/projects/sfall/files/Modders%20pack/)) contains headers and docs that describe the scripting API in detail

### Key sfall Features Relevant to OpenF2

| sfall Feature | OpenF2 Status | Notes |
|--------------|---------------|-------|
| Bug fixes (hundreds) | Partial | Check sfall changelog for parity |
| Extended scripting opcodes | Not started | Would require vm_bridge.ts extensions |
| Hook scripts | Not started | Event-based script injection |
| Item ammo/damage patches | Partial | damageFormula.ts covers the pipeline |
| World map patches | Partial | Some fixes applied in this PR |
| UI scaling/customization | Not started | UI2 migration is prerequisite |

- Documentation: [sfall docs](https://sfall-team.github.io/sfall/)
- Source: [sfall GitHub](https://github.com/sfall-team/sfall)

---

## 8. Community Reference Engines

These projects provide invaluable cross-reference for understanding engine behavior:

### Fallout 2 Community Edition (fallout2-ce)

> C/C++ reimplementation that runs original FO2 data on modern platforms.

- Repository: [alexbatalov/fallout2-ce](https://github.com/alexbatalov/fallout2-ce)
- **Best for**: Understanding the exact behavior of specific engine functions
- **Cross-reference**: When a formula or behavior is unclear, search fallout2-ce for the function name

### Fallout 2 Reference Edition (fallout2-re)

> Reverse-engineered C source baseline; developer-facing.

- Repository: [alexbatalov/fallout2-re](https://github.com/alexbatalov/fallout2-re)
- **Best for**: Reading the original disassembled logic without cleanup/modernization

### Fallout 1 Equivalents

- [alexbatalov/fallout1-ce](https://github.com/alexbatalov/fallout1-ce) — Community Edition
- [alexbatalov/fallout1-re](https://github.com/alexbatalov/fallout1-re) — Reference Edition

### Falltergeist

> Open-source, cross-platform Fallout 2 engine in C++/SDL.

- Repository: [falltergeist/falltergeist](https://github.com/falltergeist/falltergeist)
- **Best for**: Alternative perspective on engine architecture and file format parsing

---

## 9. Suggested Learning Path

### For New Contributors

1. **Start with data formats**: Read [DAT files](https://fallout-archive.fandom.com/wiki/DAT_files) → [FRM](https://fallout.wiki/wiki/FRM_File_Format) → [MAP](https://fallout.wiki/wiki/MAP_File_Format) → [PRO](https://fallout.wiki/wiki/PRO_File_Format) to understand "what the engine loads."

2. **Run the test suite**: `npx vitest run` — all tests should pass. Read `phase1.test.ts` and `phase2.test.ts` to see how systems are verified.

3. **Trace a formula**: Pick a derived stat (e.g., HP), follow it from `derivedStats.ts` through `combat.ts` to `damageFormula.ts`. Verify the formula against the [Fallout wiki](https://fallout.wiki/wiki/Game_Files).

4. **Understand the scripting bridge**: Read `vm_bridge.ts` to see how INT opcodes map to engine functions. This is where most game logic connects.

5. **Jump to engine extensions**: Read [sfall docs](https://sfall-team.github.io/sfall/) + the modder pack to understand real-world engine limits and fixes.

6. **Use a modding guide to ground it**: The [NMA Fallout 2 Modding Guide](https://www.nma-fallout.com/attachments/fallout-2-modding-guide-v1-01-pdf.16913/) connects formats to practical quest/map/script creation.

### For Experienced Contributors

1. **Cross-reference with fallout2-ce**: When implementing a new feature, search the C source for the equivalent function.
2. **Check sfall**: Many "obvious" bugs were already fixed in sfall — don't reinvent the wheel.
3. **Write tests first**: Every formula and behavior change should have a regression test before the code change.

### Key Community Resources

- [NMA Resources Hub](https://www.nma-fallout.com/resources/) — Mods, tools, releases
- [Fallout 2 Editor Introduction](https://falloutmods.fandom.com/wiki/Fallout_2_editor_introduction) — Tool vs source code orientation
- [FO2 Modding Docs](https://github.com/mrowrpurr/fallout2-modding) — Curated links + workflow pointers
- [Game Files Hub](https://fallout.wiki/wiki/Game_Files) — Master index of all file formats

---

## 10. Future Work (Phase 4+)

### Phase 18 Completions (Save Reliability & Scripting Coverage)

Phase 18 landed the following improvements for reliable start-to-finish Fallout 2 play:

| Area | Change | Impact |
|------|--------|--------|
| **Save schema v7** | `mapVars` persisted across save/load (`getMapVars` / `setMapVars`) | High — map state (enemy kill flags, quest vars) no longer resets on reload |
| **`has_trait` TRAIT_PERK** | Type 0 now checks `Critter.perkRanks[perkId]` | High — perk-gated dialogue and combat branches work correctly |
| **`critter_add_trait` TRAIT_PERK** | Type 0 now writes `Critter.perkRanks[perkId]` | High — NPCs can have perks assigned by scripts |
| **`inven_cmds` 11/12** | `INVEN_CMD_LEFT_HAND` and `INVEN_CMD_RIGHT_HAND` return equipped hand items | Medium — item-use scripts can query weapon slots |
| **`obj_item_subtype` fallback** | Falls back to string→integer map when no `.pro` | Medium — item type scripts work for weaponless items |
| **`game_time_hour` dynamic** | Computed from `gameTickTime` instead of hardcoded `1200` | Medium — schedule and time-based NPC scripts now see the correct hour |
| **`metarule(21, …)`** | Returns large vendor cap budget (99999) | Low — barter scripts no longer stub-error |
| **`metarule(24, …)`** | Returns party NPC count via `gParty.getPartyMembers().length` | Medium — party-count checks in scripts work |
| **`proto_data` data_member 7** | Returns `flags2` / extended flags word | Low — script flag checks no longer stub |
| **`proto_data` data_members 23/24** | `WEAPON_MAX_RANGE_1/2` | Low — range checks in weapon scripts work |
| **`proto_data` data_members 28–31** | Ammo AC/DR/dmgMult/dmgDiv | Low — ammo formula scripts work |
| **sfall `string_compare` (0x8175)** | Case-sensitive and case-insensitive string equality | Low |
| **sfall `substr` (0x8176)** | Substring extraction with negative-length support | Low |
| **sfall `get_uptime` (0x8177)** | Session millisecond timer | Low |

### Near-Term Priorities

| Priority | Area | Description | Key Files |
|----------|------|-------------|-----------|
| 1 | World Map | Travel and entrance alignment fixes | `src/worldmap.ts` |
| 2 | Scripting | Opcode/procedure coverage expansion | `src/vm_bridge.ts`, `src/vm_opcodes.ts` |
| 3 | Audio | Effects, music logic, format handling completeness | `src/audio.ts` |
| 4 | Cinematics | Ending/intro/cinematic pipeline with real assets | `src/cinematic.ts` |

### Medium-Term Goals

- **Save/load robustness**: Long-campaign reliability, more migration strategies
- **Mod support**: Expand `ModRegistry` to handle DAT file override stacking, hook scripts
- **Combat accuracy**: Called shots, burst mechanics, companion AI improvements
- **Performance**: Rendering batch optimization, asset streaming, WebGL caching

### Long-Term Vision

- **sfall compatibility**: Implement high-value sfall features (extended opcodes, hook scripts)
- **In-browser editing tools**: Map viewer, script debugger, prototype inspector
- **Community mod ecosystem**: Structured mod packaging, dependency resolution

### Success Criteria

OpenF2 will be considered "1.0 ready" when:

- Fallout 2 is completable without major blockers
- Save/load survives long campaigns reliably
- Core combat, skills, and progression match expected behavior
- UI and scripting are stable enough for community mod work

---

## 11. Glossary

| Term | Definition |
|------|-----------|
| **ACM** | Audio Compressed Music — Fallout's audio format |
| **AP** | Action Points — determines what a character can do per combat turn |
| **DAT** | Data archive format used by Fallout 1 (DAT1) and Fallout 2 (DAT2) |
| **DR** | Damage Resistance — percentage of damage absorbed by armor |
| **DT** | Damage Threshold — flat damage subtracted before DR is applied |
| **ECS** | Entity-Component-System — the architectural pattern used for game objects |
| **FRM** | Frame — Fallout's sprite/animation image format |
| **INT** | Intermediate — compiled script bytecode format |
| **MAP** | Map file — hex grid layout with object placements |
| **MSG** | Message — indexed string table for dialogue and UI text |
| **PID** | Prototype ID — unique identifier for an item/critter/object template |
| **PRO** | Prototype — object definition file (stats, art, scripts) |
| **sfall** | Community DLL patcher for the original Fallout 2 executable |
| **SPECIAL** | The 7 primary attributes: Strength, Perception, Endurance, Charisma, Intelligence, Agility, Luck |
| **SSL** | Star-Trek Scripting Language — Fallout's scripting language (compiles to INT) |
