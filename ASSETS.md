# OpenF2 Asset Pipeline

This document explains how Fallout 2 game assets get from the original game files into the browser engine, where every file lives, and how to re-run the pipeline when needed.

---

## Quick Reference

```
Fallout 2 install dir          OpenF2 project                Browser runtime
─────────────────────          ──────────────                ────────────────
master.dat ──┐
critter.dat ─┤  setup.py ──►  data/          (raw extract)
fallout2.exe─┘                 art/           (PNG + imageMap.json)
                               proto/pro.json (all prototypes)
                               maps/*.json    (map data + image lists)
                               lut/*.json     (tables from EXE)
                                    │
                                    ▼  src/main.ts loads via XHR/fetch
                               Engine runs in browser
```

---

## 1. Running the Pipeline

```bash
# Prerequisites: Python 3.7+, numpy, Pillow
pip install numpy Pillow

# Full re-extraction from scratch (takes ~5-10 min):
python setup.py "D:\SteamLibrary\steamapps\common\Fallout 2"

# Skip slow FRM→PNG conversion (keeps data/art/*.frm raw files):
python setup.py "D:\SteamLibrary\steamapps\common\Fallout 2" --no-export-images

# Options:
#   --no-extract-dat      Skip DAT extraction (reuse existing data/)
#   --no-export-images    Skip FRM→PNG conversion (saves time; *.frm files remain in data/art/)
#   --fo1                 Parse protos in Fallout 1 mode
```

**Pipeline stages (in order):**

| Stage | Input | Output | Script |
|-------|-------|--------|--------|
| Verify | `master.dat`, `critter.dat` | — | `setup.py:setup_check()` |
| Critical tables | `fallout2.exe` | `lut/criticalTables.json` | `parseCritTable.py` |
| Elevator table | `fallout2.exe` | `lut/elevators.json` | `parseElevatorTable.py` |
| DAT extraction | `master.dat` + `critter.dat` | `data/` (raw files) | `dat2.py` |
| Image conversion | `data/art/*.frm` | `art/*.png` + `art/imageMap.json` | `exportImagesPar.py` |
| Proto conversion | `data/proto/*.pro` | `proto/pro.json` | `exportPRO.py` → `proto.py` |
| Map conversion | `data/maps/*.map` | `maps/*.json` + `maps/*.images.json` | `fomap.py` |

**Audio** is NOT automated. Run separately: `python convertAudio.py INSTALL_DIR` (requires `acm2wav.exe`).

> **Note on version differences**: Re-extracting from a different FO2 installation may produce
> slightly different results (different patch level, sfall version, or mods present in `data/`).
> The current project was extracted from a Steam FO2 v1.02d install at
> `D:\SteamLibrary\steamapps\common\Fallout 2`. The extraction yielded 1443 `.int` scripts
> and a ~2.8 MB `pro.json`. After re-extraction, run `npm test` to verify all 122 test files
> (5204 tests) still pass before committing.

---

## 2. Directory Layout

### Extracted raw data (`data/`)

Direct copy of what's inside `master.dat` + `critter.dat`:

```
data/
  color.pal                   # 256-entry palette + 0x8000-byte color table
  font0.fon ... font5.fon     # Bitmap fonts (some have .aaf alternates)
  art/
    critters/                 # Critter FRM sprites + critters.lst
    items/                    # Item FRMs + items.lst
    scenery/                  # Scenery FRMs + scenery.lst
    walls/                    # Wall FRMs + walls.lst
    misc/                     # Misc FRMs + misc.lst
    intrface/                 # UI interface art + intrface.lst
    tiles/                    # Tile FRMs + tiles.lst
    inven/                    # Inventory art
    heads/                    # Talking head FRMs
    backgrnd/, cuts/, skilldex/, splash/
  data/
    city.txt                  # World map areas (INI format)
    maps.txt                  # Map metadata (INI format)
    ai.txt                    # AI packet definitions
    worldmap.txt              # World map configuration
    vault13.gam               # Global script variables
    *.txt                     # Message files, karma, quests, etc.
  maps/
    *.map                     # Binary map files
    *.gam                     # Per-map script variables
  proto/
    items/                    # Item .pro files + items.lst
    critters/                 # Critter .pro files + critters.lst
    scenery/, walls/, misc/, tiles/
  scripts/
    *.int                     # Compiled scripts (~1443 files, varies by patch level)
    scripts.lst               # Script name → file mapping
  text/english/game/
    *.msg                     # Message files (dialog, item descriptions, etc.)
```

### Processed assets (engine-ready)

```
art/                          # PNG spritesheets converted from FRM
  imageMap.json               # Master image metadata {path: {numFrames, fps, frameOffsets, ...}}
  critters/, items/, scenery/, walls/, misc/, intrface/, tiles/, inven/

maps/                         # JSON map data converted from .map
  *.json                      # Full map data (tiles, objects, scripts, spatials)
  *.images.json               # Per-map tile image path lists (for preloading)

proto/
  pro.json                    # All prototypes: {items: {id: {...}}, critters: {...}, ...}

lut/                          # Lookup tables
  criticalTables.json         # Critical hit tables (from fallout2.exe)
  elevators.json              # Elevator definitions (from fallout2.exe)
  colorTable.json             # 0x8000-entry color table for lighting shader
  color_rgb.json              # Palette index → [R, G, B]
  color_lut.json              # Packed RGB int → palette index
  intensityColorTable.js      # 65536-entry intensity lookup (JS, not JSON)

shaders/                      # GLSL vertex/fragment shaders
```

---

## 3. File Formats

### 3.1 DAT Archives (`dat2.py`)

Fallout 2 uses the DAT2 format (little-endian):
- Last 8 bytes of file: `dirTreeSize` (u32) + `archiveSize` (u32)
- Directory tree at `archiveSize - dirTreeSize`: per-file entries with filename, compressed flag, sizes, offset
- Compression: zlib (deflate)
- Files are lowercased, backslashes → forward slashes on extraction

Fallout 1 uses DAT1 format (`dat1.py`): big-endian headers, LZSS compression.

### 3.2 PRO — Prototypes (`proto.py` → `proto/pro.json`)

Big-endian binary format. Common header for all types:

| Offset | Size | Field |
|--------|------|-------|
| 0 | u32 | objectTypeAndID: `(type << 24) \| id` |
| 4 | u32 | textID (message table index) |
| 8 | u32 | frmTypeAndID: `(frmType << 24) \| frmPID` |
| 12 | u32 | lightRadius |
| 16 | u32 | lightIntensity |
| 20 | u32 | flags |

Type-specific `extra` follows. Key types:
- **Type 0 (Item)**: subType 0=armor, 1=container, 2=drug, 3=weapon, 4=ammo, 5=misc, 6=key
- **Type 1 (Critter)**: baseStats (7 SPECIAL + derived), bonusStats, skills, XPValue, killType
- **Type 2 (Scenery)**: subType 0=door, 1=stairs, 2=elevator, 3-4=ladder, 5=generic
- **Type 3 (Wall)**, **Type 4 (Tile)**, **Type 5 (Misc)**

**Known bug fixed**: `FO1` flag was hardcoded to `True`, causing `damageType` to be skipped for FO2 critters. Now defaults to `False`.

### 3.3 FRM — Sprite Images (`frmpixels.py` → `art/*.png` + `art/imageMap.json`)

Big-endian binary format:
- Header: version, fps, actionFrame, numFrames, 6 direction offsets, frame buffer size
- Frames: width, height, pixelDataSize, x/y offsets, then palette-indexed pixel data
- Multi-direction: `.fr0` through `.fr5` files combined into single spritesheet
- Output: horizontal spritesheet PNG (all frames side by side) + metadata in imageMap.json
- Palette color index 0 = transparent

`imageMap.json` structure per entry:
```json
{
  "art/critters/hmjmpsaa": {
    "numFrames": 6,
    "fps": 10,
    "numDirections": 1,
    "frameWidth": 64,
    "frameHeight": 90,
    "frameOffsets": [[ {"x":0, "y":0, "w":64, "h":90, "sx":0, "ox":0, "oy":0} ]]
  }
}
```

### 3.4 MAP — Game Maps (`fomap.py` → `maps/*.json`)

Big-endian binary format:
- Version (19=FO1, 20=FO2), map name, player position, elevation count
- Tile grids: 100×100 floor + roof tiles (indices into tiles.lst)
- Script section: map scripts, spatial triggers with tile/radius
- Objects per level: PID, position, orientation, inventory, script SID

### 3.5 INT — Compiled Scripts (`src/intfile.ts`)

Big-endian binary format:
- First 0x2A bytes: header (skipped)
- Procedure table: count + entries (nameIndex, flags, 2×reserved, offset, argc)
- Identifier table: length-prefixed strings (procedure and variable names)
- 0xFFFFFFFF signature
- String table: same format (string literals)
- Code section: 16-bit opcodes (dispatched via `opMap`)

### 3.6 PAL — Color Palette (`pal.py`)

256 RGB triplets (6-bit values × 4 = 8-bit), followed by 0x8000-byte color lookup table for lighting.

---

## 4. Runtime Loading Sequence

The engine loads assets in this order (`src/main.ts`):

```
1. Shaders (async fetch)          shaders/*.glsl
2. Fonts (async fetch)            data/font0-5.fon
3. WebGLRenderer.init()           Compiles shaders, loads color LUTs
4. UIManager init                 Creates UI panel system
5. IndexedDB cache init
6. imageMap.json (cached JSON)    art/imageMap.json → globalState.imageInfo
7. pro.json (cached JSON)         proto/pro.json → globalState.proMap
8. initGame()
   ├── Player + GameMap
   ├── Load starting map ('artemple')
   │   ├── maps/<name>.images.json  (sync XHR — tile image list)
   │   ├── maps/<name>.json         (sync XHR — full map data)
   │   ├── data/scripts/<name>.int  (sync binary XHR — map script)
   │   ├── Create objects from map data
   │   └── Async image loading via heart.graphics.newImage()
   ├── lut/criticalTables.json     (sync XHR)
   ├── Worldmap.init()             city.txt, worldmap.txt (sync)
   └── UI initialization
9. heart._init() — game loop starts
```

**Key insight**: Most asset loading uses **synchronous XHR** (`getFileText`, `getFileJSON`, `getFileBinarySync`). Only shaders, fonts, and map images use async fetch. The new `AssetStore` class provides async `fetchJSON/fetchText/fetchBinary` methods but the main loading path doesn't use them yet.

---

## 5. Key Runtime Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Bootstrap: loads imageInfo, proMap, creates renderer |
| `src/init.ts` | `initGame()`: creates Player/GameMap, loads starting map |
| `src/map.ts` | `GameMap.loadNewMap()`: loads map JSON, images, scripts, objects |
| `src/scripting.ts` | Script class with all opcode methods, `loadScript()`, `initScript()` |
| `src/intfile.ts` | `parseIntFile()`: binary INT file parser |
| `src/vm_bridge.ts` | Bridge opcode table (0x8000+), `bridged()` helper, `GameScriptVM` |
| `src/vm.ts` | `ScriptVM`: data stack, return stack, `step()`, `call()`, `run()` |
| `src/vm_opcodes.ts` | Core opcode table (arithmetic, control flow, stack ops) |
| `src/pro.ts` | `loadPRO()`, `makePID()`, `lookupArt()` — proto lookup and art resolution |
| `src/data.ts` | `loadAreas()`, `loadMessage()`, `getLstId()`, map info parsing |
| `src/util.ts` | `getFileText()`, `getFileJSON()`, `getFileBinarySync()`, `BinaryReader`, `parseIni()` |
| `src/globalState.ts` | Shared engine state: `proMap`, `imageInfo`, `player`, `gMap`, `gParty` |
| `src/object.ts` | `objFromMapObject()`: creates game objects from map data |
| `src/assetStore.ts` | Version-aware asset resolver (new, not fully integrated) |
| `src/mods.ts` | Mod overlay system (implemented but not connected to loading) |

---

## 6. PID Encoding

Prototype IDs encode both type and index:

```typescript
// From src/pro.ts
PID = (type << 24) | index

type: 0=item, 1=critter, 2=scenery, 3=wall, 4=tile, 5=misc
index: bits 0-15 (1-based proto index)

// Example: Leather Armor
PID = 0x00000002  →  type=0 (item), index=2
```

Art IDs (FID) use the same encoding:
```typescript
FID = (frmType << 24) | frmPID

// Example: Leather Armor sprite
FID = 0x00000021  →  frmType=0 (item art), frmPID=33
```

The `loadPRO(pid, pidID)` function resolves a PID to its proto record by:
1. Extracting type from `pid >> 24`
2. Looking up the LST file for that type at index `pidID - 1`
3. Using the filename's numeric prefix as the key into `proMap[type]`

---

## 7. Known Gaps and Future Work

### High Priority
- **`AssetStore` not integrated**: The new version-aware resolver exists but the engine still uses hardcoded paths via `getFileText()`. Migration would enable FO1/FO2 dual support.
- **Mod system disconnected**: `ModRegistry` is fully implemented but not wired into asset loading. The `AssetStore.resolve()` overlay loop now returns overlay paths but no caller uses it yet.
- **Object images not preloaded**: `maps/*.images.json` only contains tile paths. Object/scenery/critter images are lazy-loaded at runtime via `images.ts lazyLoadImage()`.

### Medium Priority
- **`fomap.py:159`**: `getCritterArtPath()` is flagged for rewrite — critter art resolution is complex and partially understood.
- **`fomap.py:476`**: Map exporter's `getImageList()` only collects tile images.
- **Synchronous XHR**: Most loading uses sync XHR which blocks the browser thread. The `AssetStore` async API exists but migrating to it requires refactoring the entire init sequence.
- **Audio not integrated**: `convertAudio.py` exists but is not called by `setup.py`.

### Low Priority
- **`frmpixels.py:59`**: FR[0-5] file ordering not validated.
- **`fomap.py:326`**: FO1 ladder destination offset unverified.
- **EXE offset hardcoding**: Critical/elevator table offsets are for vanilla US FO2 v1.02d only.
- **`fomap.py` map conversion errors**: Some maps (newr1a, newr2a, kladwtwn) fail to convert
  due to out-of-range LST lookups (`IndexError: list index out of range`). The setup script
  skips these with a warning. These maps will be regenerated on next full extraction.

---

## 8. Re-running Specific Stages

```bash
# Fast re-extraction from a different FO2 install (skip slow image conversion):
python setup.py "D:\SteamLibrary\steamapps\common\Fallout 2" --no-export-images

# Re-extract just images (after palette tweak):
python exportImagesPar.py data/color.pal data art both

# Re-export just protos:
python exportPRO.py

# Re-export a single map:
python fomap.py data data/maps/arteMple.MAP maps/artemple.json

# Re-extract a single proto:
python proto.py data/proto/items/00000001.pro

# Parse a single FRM:
python frmpixels.py data/art/items/beer.frm out.png data/color.pal
```

---

## 9. Testing

Real-asset integration tests live in:
- `src/phase100.test.ts` — Arroyo, Klamath, Modoc scripts parse + execute
- `src/phase107.test.ts` — New Reno scripts parse + execute
- `src/phase109.test.ts` — Proto data integrity, art paths, script parsing, PID round-trips (493 lines, 87 tests)

Other tests that verify real-asset pipeline output:
- `src/phase101.test.ts` — Stub/partial improvements verified against extracted data (565 lines, 57 tests)

These tests read from the actual `data/`, `proto/pro.json`, and `art/` directories, so they require the pipeline to have been run at least once.

**Full test suite**: 122 test files / 5204 tests. Run with `npm test`. All tests must pass
before committing after a re-extraction.
