/**
 * Fallout 1 compatibility layer — Phase 3 scaffolding.
 *
 * This module centralises all engine behaviour that differs between
 * Fallout 1 and Fallout 2.  When `EngineVersion.FALLOUT1` is active every
 * subsystem should branch through helpers here rather than scattering
 * version checks across the codebase.
 *
 * Current scope (Phase 3 entry stubs):
 *   - Data-path resolution (DAT1 layout vs DAT2 layout)
 *   - MAP/PRO format version selection
 *   - Script procedure name remapping (F1 differs from F2 in some procedures)
 *   - Save-game schema extensions needed for F1 campaigns
 *
 * Things deliberately NOT done yet:
 *   - LZSS decompression (dat1.py handles extraction; the TypeScript side only
 *     reads already-extracted files just like F2)
 *   - Fallout 1 world-map tile placement (world-map module will consult
 *     `isF1Active()` once the assets are wired up)
 */

import { EngineVersion, dataPathPrefix, expectedMapVersion } from '../engineVersion.js'

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
 * Only entries that actually differ are listed.  Populate with real
 * divergences as F1 content is integrated.
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
