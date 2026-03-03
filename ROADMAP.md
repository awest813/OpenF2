# Harold Engine — OpenMW-Parity Roadmap

A complete reimplementation of the Fallout 1 & 2 engine, targeting full game compatibility,
modern extensibility, and modding support equivalent to what OpenMW delivers for Morrowind.

---

## What "OpenMW Parity" Means

OpenMW reached parity with the original Morrowind engine by delivering:

| Capability | OpenMW Equivalent | Our Target |
|---|---|---|
| Full game completion | All quests, factions, endings | All F1 + F2 quests, all endings |
| Original asset loading | Reads BSA, ESM/ESP | Reads DAT1/DAT2, MAP, PRO, INT, FRM |
| Physics | Bullet (mesh-accurate) | Hex grid pathfinding, line-of-sight, blocking volumes |
| Scripting | Morrowind Script + Lua extension | INT bytecode VM + Lua extension layer |
| Rendering | OpenSceneGraph → modern GL | WebGL 2.0 with accurate Fallout palette/lighting |
| Audio | OpenAL (3D positional) | Web Audio API (positional, ACM/WAV playback) |
| Save/Load | Full game state serialization | Full JSON-based state serialization |
| Modding | ESM override stacking | DAT override stacking, JSON asset injection |
| Editor | OpenCS | Harold-Editor (browser-based, Phase 4+) |
| Cross-platform | Linux/macOS/Windows | Browser-native; optional Electron/Tauri shell |

---

## Engine Coverage Gaps (Current State vs. Target)

### Working Now (Harold baseline)
- Map loading, hex grid, elevation changes
- Walk/run movement, pathfinding
- NPC dialogue (talk_p_proc), barter
- INT bytecode VM (partial opcode coverage)
- WebGL 2.0 renderer with palette-accurate lighting
- Basic turn-based combat (AGI-based AP, single weapon type tested)
- Random encounters (partial)
- Save/load (alpha)
- Asset pipeline: DAT2 extraction, FRM→PNG, MAP→JSON, PRO export

### Critical Gaps
- No Fallout 1 support (DAT1 format, MAP v1, different FRM layout)
- No armor / Damage Threshold / Damage Resistance system
- No ammo types or caliber matching
- Combat AI is shallow (no BSCORE/combat value decision tree)
- Character screen non-interactive (cannot level up properly)
- All 18 skills not implemented (only Lockpick, Repair partially done)
- No perks / traits system
- No PipBoy map
- UI rendered in DOM (cannot use Fallout bitmap fonts accurately)
- No full-screen scripted movies (death/ending slides)
- World map: entrances misplaced, overland travel buggy
- No Fallout 1 intro / vault sequence
- Audio: no hardcoded sound effects, no positional audio, no ACM decoder built-in

---

## Phased Roadmap

### Phase 0 — Foundation & Architecture (Current Sprint)
**Goal:** Solid architectural base that supports both Fallout 1 and 2, enables the phases that follow.

#### 0.1 Engine Module Registry & Version System
- [ ] `EngineVersion` enum: `FALLOUT1 | FALLOUT2`
- [ ] `GameModule` registry: pluggable sub-systems (combat, scripting, audio, ui…)
- [ ] Central `EventBus` for decoupled inter-module communication
- [ ] `Engine` singleton replacing scattered `globalState` references

#### 0.2 Typed Entity Component System
- [ ] `Component` base interface with `componentType` discriminant
- [ ] Core components: `PositionComponent`, `AnimationComponent`, `StatsComponent`,
  `InventoryComponent`, `ScriptComponent`, `CombatComponent`, `DialogueComponent`
- [ ] `Entity` = `{ id: number, components: Map<ComponentType, Component> }`
- [ ] `EntityManager` with fast per-type component queries
- [ ] Migrate existing `Obj` / `Critter` / `Player` to ECS (keep existing classes as facades)

#### 0.3 Fallout 1 Asset Pipeline
- [ ] DAT1 archive extractor (`dat1.py`) — LZSS decompression, different directory format
- [ ] Fallout 1 MAP format parser (`fomap.py` v1 branch)
- [ ] Fallout 1 PRO format differences (fewer fields, different stat layout)
- [ ] Unified asset resolver: `AssetStore` tries F1 or F2 paths based on `EngineVersion`

#### 0.4 Robust Save/Load
- [ ] Canonical save-state schema (JSON, versioned)
- [ ] `EntityManager` → JSON round-trip
- [ ] Map dirty-state serialization
- [ ] Global/local/map variable persistence
- [ ] Save slot management in UI

---

### Phase 1 — Core Gameplay Systems
**Goal:** A playable slice of Fallout 1 and Fallout 2 from start to the first major hub.

#### 1.1 Full SPECIAL / Derived Stats System
- [ ] All 7 SPECIAL stats with correct initial range and display
- [ ] All 13 derived stats (HP, AC, AP, carry weight, melee damage, poison resistance, radiation resistance, sequence, healing rate, critical chance, better criticals, DT/DR per damage type)
- [ ] Leveling: XP thresholds, stat point gain, HP/skill point gain per level
- [ ] Character creation screen (browser UI)

#### 1.2 All 18 Skills
- [ ] Skill point allocation at character creation and level-up
- [ ] Tag skills (+20% base, ×2 SP cost)
- [ ] Skill checks (vs. target difficulty, return success/fail/critical)
- [ ] All skills wired to relevant game actions:
  - Small Guns, Big Guns, Energy Weapons, Unarmed, Melee Weapons, Throwing
  - First Aid, Doctor
  - Sneak, Lockpick, Steal, Traps
  - Science, Repair
  - Speech, Barter
  - Gambling, Outdoorsman

#### 1.3 Traits & Perks
- [ ] 16 Fallout 1 traits (Fast Metabolism, Bruiser, Small Frame, …)
- [ ] 62 Fallout 2 perks (gain perk every 3 levels, prerequisites enforced)
- [ ] Trait/perk stat modifiers fed into `StatsComponent`

#### 1.4 Combat Hardening
- [ ] Damage type system: Normal, Fire, Plasma, Laser, Explosive, Electrical, EMP
- [ ] Armor: `DT[type]` and `DR[type]` per body location
- [ ] Equippable armor from inventory
- [ ] Ammo types, caliber matching, ammo modifiers (`AC mod`, `DR mod`, `damage mult/div`)
- [ ] Weapon range (melee, thrown, ranged min/max hex range)
- [ ] Full AP costs from PRO data (not hardcoded 4)
- [ ] Called shots with per-region penalties
- [ ] Knockout, knockdown, cripple limb critical effects
- [ ] Combat AI: behavior flags from PRO (`retaliate_when_attacked`, `aggression_range`, `team_num`)

#### 1.5 Inventory & Item System
- [ ] Drag-to-equip, armor slots (head, torso, legs)
- [ ] Weapon hand slot (primary / secondary)
- [ ] Item condition / degradation stubs
- [ ] Stacking identical items
- [ ] Weight / carry limit enforcement
- [ ] Drug effects (Stimpak, RadAway, Mentats, …) via scripted `use_obj_on_p_proc`

#### 1.6 WebGL UI Layer
- [ ] Migrate all UI rendering from DOM to WebGL canvas with bitmap font support
- [ ] Bottom game panel (health, AP bar, weapon readout, mini-map stub)
- [ ] Inventory screen (two-panel with paper-doll)
- [ ] Character screen (SPECIAL, skills, perks, traits)
- [ ] PipBoy (stats, map, quests)
- [ ] Dialogue screen (NPC portrait, response list, scrolling text)
- [ ] Context menu (examine, talk, use, steal, push, attack)

---

### Phase 2 — World Completeness
**Goal:** Both games completable end-to-end.

#### 2.1 World Map Overhaul
- [ ] Correct hex-to-screen entrance placement for all areas
- [ ] Overland travel time calculation (Outdoorsman skill)
- [ ] All 49 Fallout 2 random encounter tables
- [ ] Fallout 1 world map (different resolution, different locations)
- [ ] Special encounters (Cafe of Broken Dreams, Bridge, etc.)
- [ ] Car travel (Fallout 2 car with fuel system)

#### 2.2 Scripting Completeness
- [ ] Full opcode coverage for both F1 and F2 INT bytecode
- [ ] All 400+ engine procedures (`op_*`) mapped and implemented
- [ ] Global / local / map variable isolation
- [ ] `metarule` and `metarule3` full implementation
- [ ] Scripted animations: `anim`, `anim_busy`, `anim_stand`
- [ ] Lua scripting extension layer (safe sandbox, read access to game state)

#### 2.3 Quest & Dialogue System
- [ ] Quest journal (PipBoy Quests tab)
- [ ] Global variable-based quest tracking
- [ ] Faction/reputation system (town reputations, Karma, Slaver/Champion/etc.)
- [ ] Bartering: barter value calculation from PRO data, Barter skill modifier
- [ ] All branching dialogue trees (currently working but font/layout rough)

#### 2.4 Audio Overhaul
- [ ] ACM decoder in TypeScript (no external tool dependency)
- [ ] Web Audio API positional audio (distance attenuation, panning)
- [ ] Hardcoded sound effects (footsteps, ambient, UI clicks, weapon fire)
- [ ] Music zones and crossfading (Wasteland, Hub, etc.)
- [ ] Fallout 1 soundtrack support

#### 2.5 Ending & Cinematic System
- [ ] Scripted slideshow endings (sequence of images + narration text + VO)
- [ ] Intro movie playback (WebM conversion of game videos)
- [ ] Death/bad ending screens

---

### Phase 3 — Fidelity & Polish
**Goal:** Indistinguishable from original games in behavior; modding foundation in place.

#### 3.1 Renderer Accuracy
- [ ] Correct sprite depth sorting (all edge cases)
- [ ] Animated tiles (water, fire, plasma)
- [ ] Full palette cycling (fire flicker, electrical hum)
- [ ] Accurate lighting attenuation (intensity table exact match)
- [ ] Roof hide/show transitions (fade alpha)
- [ ] Dead body decay over time

#### 3.2 Pathfinding & Spatial
- [ ] A* with proper blocking flags from PRO data
- [ ] Critter blocking (cannot walk through live critters)
- [ ] Spatial trigger accuracy (exact radius match)
- [ ] Line-of-sight (hex line-cast with blocking walls)

#### 3.3 Modding Infrastructure
- [ ] DAT override stacking (mod DATs override base game, ordered priority)
- [ ] JSON asset injection (add new maps, PROs, scripts without recompiling)
- [ ] Script hot-reload in dev mode
- [ ] Mod manifest format (name, author, version, load order)

#### 3.4 Performance
- [ ] Sprite batching / texture atlas for WebGL renderer
- [ ] Offscreen canvas for UI layer
- [ ] Map chunk streaming (load/unload map tiles by view frustum)
- [ ] Service Worker offline caching

---

### Phase 4 — Extensions & Editor
**Goal:** Exceeds original game capabilities; community tooling available.

#### 4.1 Lua Scripting Extension
- [ ] Fengari (Lua 5.3 in WASM) integration
- [ ] Safe sandbox: read game state, trigger events, register hooks
- [ ] Lua-based new content (new quests, new critters, new items)
- [ ] Hot-reload Lua scripts without page refresh

#### 4.2 Harold-Editor (Browser-Based)
- [ ] Map editor: place/remove tiles, objects, critters
- [ ] Script editor: edit INT scripts or Lua scripts in-browser
- [ ] PRO editor: create/modify item/critter prototypes
- [ ] Export to mod DAT overlay

#### 4.3 Multiplayer Stub
- [ ] Shared world-state via WebSocket server (`mpserv.py` basis)
- [ ] Deterministic combat resolution
- [ ] Cooperative party play (2 players)

---

## Architecture Principles (OpenMW-Inspired)

1. **No raw globals** — all state flows through `Engine`, `EntityManager`, or `EventBus`
2. **Version-agnostic core** — all game-specific logic is gated by `EngineVersion`
3. **Asset abstraction** — no code path imports directly from `art/` or `data/`; always through `AssetStore`
4. **Test-driven scripting** — each implemented opcode has a unit test
5. **Component isolation** — UI, rendering, audio, scripting, combat are separate modules with no circular imports
6. **Lua as the mod layer** — no C++/TS engine changes needed for new content (Phase 4)

---

## Milestone Summary

| Milestone | Phase | Estimated Complexity |
|---|---|---|
| F1 + F2 asset pipeline complete | 0 | Medium |
| ECS architecture in place | 0 | High |
| Full character creation | 1 | Medium |
| All 18 skills wired | 1 | Medium |
| Traits + Perks | 1 | Medium |
| Combat: armor, ammo, range | 1 | High |
| WebGL UI panels | 1 | High |
| World map accurate | 2 | Medium |
| Full opcode coverage | 2 | High |
| Quest journal + Karma | 2 | Medium |
| ACM decoder built-in | 2 | Medium |
| Both games completable | 2 | Very High |
| Palette-accurate rendering | 3 | Medium |
| Mod DAT override system | 3 | Medium |
| Harold-Editor alpha | 4 | Very High |
| Lua scripting extension | 4 | High |
