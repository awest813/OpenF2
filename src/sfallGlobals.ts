/**
 * sfall extended opcode compatibility — global variable store and version constant.
 *
 * This module is intentionally free of browser-only dependencies so that it
 * can be imported from both the engine (scripting.ts) and unit tests.
 *
 * sfall is the community DLL patcher for the original Fallout 2 executable.
 * Many Fallout 2 mods use sfall-specific APIs; this module provides the
 * subset needed for compatibility with those scripts.
 */

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/**
 * The sfall compatibility version reported by `metarule(56, 0)`.
 *
 * Encoded as  major * 1_000_000 + minor * 1_000 + patch  (matches the
 * convention used by real sfall installations so mod scripts can parse it).
 *
 * Reporting v4.0.0 indicates compatibility with the sfall 4.x API surface.
 */
export const SFALL_VER = 4_000_000

// ---------------------------------------------------------------------------
// String-keyed global variable store
// ---------------------------------------------------------------------------

/** Internal storage for sfall string-keyed globals. */
const sfallGlobals: Map<string, number> = new Map()

/**
 * Get a sfall global variable by string key.
 * Returns `0` if the variable has never been set (matching sfall behaviour).
 */
export function getSfallGlobal(name: string): number {
    return sfallGlobals.get(name) ?? 0
}

/**
 * Set a sfall global variable by string key.
 * Overwrites any existing value for `name`.
 */
export function setSfallGlobal(name: string, value: number): void {
    sfallGlobals.set(name, value)
}

// ---------------------------------------------------------------------------
// Integer-indexed global variable store
// ---------------------------------------------------------------------------

/**
 * Maximum number of integer-indexed sfall global slots (matches real sfall
 * default of 4096 entries).
 */
export const MAX_SFALL_INT_GLOBALS = 4096

/** Internal storage for sfall integer-indexed globals. */
const sfallGlobalInts: number[] = new Array(MAX_SFALL_INT_GLOBALS).fill(0)

/**
 * Get a sfall integer-indexed global variable.
 * Returns `0` for out-of-range indices (matching sfall behaviour).
 */
export function getSfallGlobalInt(index: number): number {
    if (index < 0 || index >= MAX_SFALL_INT_GLOBALS) return 0
    return sfallGlobalInts[index]
}

/**
 * Set a sfall integer-indexed global variable.
 * Out-of-range indices are silently ignored (matching sfall behaviour).
 */
export function setSfallGlobalInt(index: number, value: number): void {
    if (index < 0 || index >= MAX_SFALL_INT_GLOBALS) return
    sfallGlobalInts[index] = value
}

// ---------------------------------------------------------------------------
// Persistence helpers (used by saveload.ts)
// ---------------------------------------------------------------------------

/**
 * Serialized form of the sfall global variable stores.
 *
 * Integer-indexed globals are stored as a sparse map (only non-zero entries)
 * to keep save files compact — most of the 4096 slots are typically zero.
 */
export interface SerializedSfallGlobals {
    /** String-keyed sfall globals (set_sfall_global / get_sfall_global). */
    stringKeyed?: Record<string, number>
    /** Integer-indexed sfall globals stored as sparse { index: value } map. */
    intIndexed?: Record<number, number>
}

/**
 * Return a serializable snapshot of the current sfall global variable stores.
 * Only non-zero integer-indexed entries are included to keep saves compact.
 *
 * Note: We iterate all MAX_SFALL_INT_GLOBALS slots to find non-zero entries.
 * This is O(4096) which is negligible at save time (< 0.1 ms in practice).
 * A dirty-set approach would be faster but adds complexity not warranted here.
 */
export function serializeSfallGlobals(): SerializedSfallGlobals {
    const stringKeyed: Record<string, number> = {}
    for (const [k, v] of sfallGlobals.entries()) {
        stringKeyed[k] = v
    }

    const intIndexed: Record<number, number> = {}
    for (let i = 0; i < MAX_SFALL_INT_GLOBALS; i++) {
        if (sfallGlobalInts[i] !== 0) {
            intIndexed[i] = sfallGlobalInts[i]
        }
    }

    return { stringKeyed, intIndexed }
}

/**
 * Restore sfall global variable stores from a persisted snapshot.
 * Overwrites all current state; call after a save is loaded.
 */
export function deserializeSfallGlobals(data: SerializedSfallGlobals): void {
    sfallGlobals.clear()
    if (data.stringKeyed) {
        for (const [k, v] of Object.entries(data.stringKeyed)) {
            if (typeof v === 'number' && Number.isFinite(v)) sfallGlobals.set(k, v)
        }
    }

    sfallGlobalInts.fill(0)
    if (data.intIndexed) {
        for (const [rawKey, v] of Object.entries(data.intIndexed)) {
            const idx = Number(rawKey)
            if (Number.isInteger(idx) && idx >= 0 && idx < MAX_SFALL_INT_GLOBALS && typeof v === 'number' && Number.isFinite(v)) {
                sfallGlobalInts[idx] = v
            }
        }
    }
}

/**
 * Reset both sfall global stores to their initial (all-zero / empty) state.
 * Called when starting a new game or resetting for tests.
 */
export function resetSfallGlobals(): void {
    sfallGlobals.clear()
    sfallGlobalInts.fill(0)
}
