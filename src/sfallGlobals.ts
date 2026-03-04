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
