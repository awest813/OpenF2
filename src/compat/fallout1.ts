/**
 * Fallout 1 compatibility layer — Phase 3.
 *
 * This module centralises all engine behaviour that differs between
 * Fallout 1 and Fallout 2.  When `EngineVersion.FALLOUT1` is active every
 * subsystem should branch through helpers here rather than scattering
 * version checks across the codebase.
 *
 * Current scope (Phase 3):
 *   - Data-path resolution (DAT1 layout vs DAT2 layout)
 *   - MAP/PRO format version selection
 *   - Script procedure name remapping (F1 differs from F2 in some procedures)
 *   - Save-game schema extensions needed for F1 campaigns
 *   - World-map grid configuration (grid dimensions differ between F1 and F2)
 *   - Encounter rate table for F1 terrain frequency tokens
 *   - Cinematic sequence factories for F1 intro/ending presentations
 *
 * Things deliberately NOT done yet:
 *   - LZSS decompression (dat1.py handles extraction; the TypeScript side only
 *     reads already-extracted files just like F2)
 */

import { EngineVersion, dataPathPrefix, expectedMapVersion } from '../engineVersion.js'
import type { CinematicSequence } from '../cinematic.js'

// ---------------------------------------------------------------------------
// Active version
// ---------------------------------------------------------------------------

/**
 * The engine version currently in use.  Switch this (or derive it from
 * detected asset presence) before any subsystem initialises.
 *
 * Default is Fallout 2 so existing behaviour is unchanged.
 */
let _activeVersion: EngineVersion = EngineVersion.FALLOUT2

export function setEngineVersion(v: EngineVersion): void {
    _activeVersion = v
}

export function getEngineVersion(): EngineVersion {
    return _activeVersion
}

export function isF1Active(): boolean {
    return _activeVersion === EngineVersion.FALLOUT1
}

// ---------------------------------------------------------------------------
// Data paths
// ---------------------------------------------------------------------------

/**
 * Resolve a game-data relative path to the canonical URL used for fetch().
 *
 * F2 layout:  data/art/...  data/proto/...  etc.
 * F1 layout:  f1data/art/...  f1data/proto/...  etc.
 */
export function resolveDataPath(relativePath: string): string {
    const prefix = dataPathPrefix(_activeVersion)
    // Avoid double-slash if relativePath starts with a separator.
    if (relativePath.startsWith('/')) return prefix + relativePath
    return prefix + '/' + relativePath
}

/**
 * Returns the expected .MAP file version integer for the active engine.
 * Fallout 1 uses version 19; Fallout 2 uses version 20.
 */
export function activeMapVersion(): number {
    return expectedMapVersion(_activeVersion)
}

// ---------------------------------------------------------------------------
// Script procedure compatibility
// ---------------------------------------------------------------------------

/**
 * Some script procedures have different names (or are absent) between F1 and
 * F2.  This table maps canonical F2 procedure names to their F1 equivalents.
 * Only entries that actually differ are listed.
 *
 * Notes on F2-only procedures (no F1 equivalent; will be silently ignored
 * when running F1 content):
 *   - 'map_update_p_proc'  — continuous map-update loop added in F2
 *   - 'combat_p_proc'      — per-combat-turn hook added in F2
 *
 * The remaining procedures ('start', 'map_enter_p_proc', 'map_exit_p_proc',
 * 'critter_p_proc', 'use_p_proc', 'pickup_p_proc', 'destroy_p_proc',
 * 'look_at_p_proc', 'description_p_proc', 'use_skill_on_p_proc',
 * 'timed_event_p_proc', 'talk_p_proc', 'spatial_p_proc', 'damage_p_proc')
 * share identical names between F1 and F2 and require no remapping.
 */
const F1_PROC_NAME_MAP: Readonly<Record<string, string>> = {
    // Add divergent mappings here as F1 content is integrated:
    // 'some_f2_proc': 'f1_equivalent',
}

/**
 * Given a canonical (F2) procedure name, return the name to look up in
 * the INT file's procedure table for the currently active engine version.
 */
export function resolveProcName(canonicalName: string): string {
    if (!isF1Active()) return canonicalName
    return F1_PROC_NAME_MAP[canonicalName] ?? canonicalName
}

// ---------------------------------------------------------------------------
// Save schema extensions
// ---------------------------------------------------------------------------

/**
 * Marker type for any extra fields a Fallout 1 save might carry.
 * Kept minimal until the full F1 save format is reverse-engineered.
 */
export interface F1SaveExtension {
    /** Fallout 1 had a separate "game time" offset from the world epoch. */
    f1GameTimeOffset?: number
    /** Fallout 1 town reputation uses a flat array, not a keyed map. */
    f1TownReputations?: number[]
}

/**
 * Migrate a raw save that originated from a Fallout 1 campaign into a shape
 * compatible with the shared SaveGame schema.
 *
 * Returns the raw save unchanged when not operating in F1 mode, so it is
 * safe to call unconditionally in the save-load pipeline.
 */
export function migrateF1Save(raw: Record<string, unknown>): Record<string, unknown> {
    if (!isF1Active()) return raw

    const save = { ...raw } as Record<string, unknown>

    // Provide empty questLog/reputation stubs that the shared migrateSave
    // function will fill in, so F1 saves flow through the common path.
    if (save['questLog'] === undefined) save['questLog'] = { entries: [] }
    if (save['reputation'] === undefined) save['reputation'] = { karma: 0, reputations: {} }

    return save
}

// ---------------------------------------------------------------------------
// World-map grid configuration
// ---------------------------------------------------------------------------

/**
 * Describes the world-map grid layout used by each engine version.
 *
 * Fallout 2 displays the world map as a 28×30 grid of 51×51 px squares
 * assembled from four 350×300 px tile images.
 *
 * Fallout 1 uses a single 1000×800 px image divided into a 20×16 grid of
 * 50×50 px cells.
 */
export interface WorldGridConfig {
    /** Number of grid columns (west–east). */
    columns: number
    /** Number of grid rows (north–south). */
    rows: number
    /** Side length of each square cell in pixels. */
    cellSize: number
}

const F2_WORLD_GRID: WorldGridConfig = { columns: 28, rows: 30, cellSize: 51 }
const F1_WORLD_GRID: WorldGridConfig = { columns: 20, rows: 16, cellSize: 50 }

/**
 * Returns the world-map grid configuration for the active engine version.
 */
export function worldGridConfig(): WorldGridConfig {
    return isF1Active() ? F1_WORLD_GRID : F2_WORLD_GRID
}

// ---------------------------------------------------------------------------
// Encounter rate table
// ---------------------------------------------------------------------------

/**
 * Returns the base encounter rate (0–100) for a worldmap frequency token,
 * calibrated for the active engine version.
 *
 * Fallout 1 uses a simpler 5-tier system.  Fallout 2 added intermediate
 * rates to give designers finer control over encounter density.
 *
 * These values are passed to the difficulty adjustment and clamping logic in
 * worldmap.ts before being compared against the random roll.
 */
export function encounterRateForFrequency(frequency: string): number {
    if (isF1Active()) {
        switch (frequency) {
            case 'forced':   return 100
            case 'frequent': return 60
            case 'common':   return 40
            case 'uncommon': return 20
            case 'rare':     return 5
            default:         return 0
        }
    }

    // Fallout 2 rates (matches the encounterRates table in worldmap.ts)
    switch (frequency) {
        case 'forced':   return 100
        case 'frequent': return 50
        case 'common':   return 30
        case 'uncommon': return 10
        case 'rare':     return 3
        default:         return 0
    }
}

// ---------------------------------------------------------------------------
// Fallout 1 cinematic sequence factories
// ---------------------------------------------------------------------------

/**
 * Build a CinematicSequence for a standard Fallout 1 presentation.
 *
 * The slide list uses `null` imagePaths so tests and headless environments
 * are not blocked on actual FRM assets.  Asset-specific content (converted
 * MVE images, audio cues) can be layered on top when assets are available
 * by populating `imagePath` fields and adding audio hooks via EventBus.
 *
 * @param type        Which sequence to build: 'intro', 'endingGood', or 'endingBad'.
 * @param onComplete  Optional callback invoked when playback finishes.
 */
export function buildF1CinematicSequence(
    type: 'intro' | 'endingGood' | 'endingBad',
    onComplete?: () => void,
): CinematicSequence {
    switch (type) {
        case 'intro':
            return {
                id: 'f1_intro',
                onComplete,
                slides: [
                    { imagePath: null, backgroundColor: '#000000', caption: 'War. War never changes.', duration: 6000 },
                    { imagePath: null, backgroundColor: '#0a0a0a', duration: 3000 },
                ],
            }
        case 'endingGood':
            return {
                id: 'f1_ending_good',
                onComplete,
                slides: [
                    { imagePath: null, backgroundColor: '#000000', caption: 'The Master is dead.', duration: 5000 },
                    { imagePath: null, backgroundColor: '#000000', caption: 'But the war goes on...', duration: 5000 },
                ],
            }
        case 'endingBad':
            return {
                id: 'f1_ending_bad',
                onComplete,
                slides: [
                    { imagePath: null, backgroundColor: '#000000', caption: 'You have failed.', duration: 5000 },
                ],
            }
    }
}
