/**
 * World-map discovery state driven by scripts and travel: subtile fog states
 * (metarule3 MARK_SUBTILE / WM_SUBTILE_STATE) and per-entrance states
 * (metarule3 MARK_MAP_ENTRANCE, read by metarule MAP_KNOWN).
 *
 * Mirrors fallout2-ce worldmap.cc.  The engine's world map is a grid of
 * 350×300 px tiles split into 50 px subtiles; for in-bounds coordinates its
 * tile/subtile arithmetic reduces to a global (x / 50, y / 50) subtile grid,
 * which is what is stored here.  Subtile fill propagation (SUBTILE_FILL_S/W)
 * is not modelled because OpenF2 does not load worldmap.txt fill data.
 *
 * Persisted in saves (v27+).
 */

import { worldGridConfig } from './compat/fallout1.js'

export const WM_SUBTILE_SIZE = 50

export const SUBTILE_STATE_UNKNOWN = 0
export const SUBTILE_STATE_KNOWN = 1
export const SUBTILE_STATE_VISITED = 2

/** "sx,sy" → subtile state; absent means SUBTILE_STATE_UNKNOWN. */
let subtileStates: Record<string, number> = {}
/** "areaID:entranceIndex" → entrance state set by scripts (overrides city.txt). */
let entranceStates: Record<string, number> = {}

function subtileKey(sx: number, sy: number): string {
    return sx + ',' + sy
}

function inBounds(sx: number, sy: number): boolean {
    const grid = worldGridConfig()
    return sx >= 0 && sy >= 0 && sx < grid.columns && sy < grid.rows
}

function toSubtile(x: number, y: number): [number, number] | null {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {return null}
    const sx = Math.floor(x / WM_SUBTILE_SIZE)
    const sy = Math.floor(y / WM_SUBTILE_SIZE)
    return inBounds(sx, sy) ? [sx, sy] : null
}

/**
 * Engine `wmSubTileMarkRadiusVisited`: mark every subtile within `radius` of
 * world position (x, y) known (never downgrading a visited one) and the
 * subtile under (x, y) visited.  Returns 0 like the engine.
 */
export function markSubtileRadiusVisited(x: number, y: number, radius: number): number {
    const center = toSubtile(x, y)
    if (!center) {return 0}
    const r = Number.isFinite(radius) ? Math.max(0, Math.trunc(radius)) : 0
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            const sx = center[0] + dx
            const sy = center[1] + dy
            if (!inBounds(sx, sy)) {continue}
            const key = subtileKey(sx, sy)
            if ((subtileStates[key] ?? SUBTILE_STATE_UNKNOWN) === SUBTILE_STATE_UNKNOWN) {
                subtileStates[key] = SUBTILE_STATE_KNOWN
            }
        }
    }
    subtileStates[subtileKey(center[0], center[1])] = SUBTILE_STATE_VISITED
    return 0
}

/** Engine `wmSubTileGetVisitedState`: 0 unknown, 1 known, 2 visited. */
export function getSubtileState(x: number, y: number): number {
    const sub = toSubtile(x, y)
    if (!sub) {return SUBTILE_STATE_UNKNOWN}
    return subtileStates[subtileKey(sub[0], sub[1])] ?? SUBTILE_STATE_UNKNOWN
}

export function setEntranceState(areaID: number, entranceIndex: number, state: number): void {
    entranceStates[areaID + ':' + entranceIndex] = Math.trunc(state)
}

/** Script-set state for an entrance, or undefined when city.txt still applies. */
export function getEntranceStateOverride(areaID: number, entranceIndex: number): number | undefined {
    return entranceStates[areaID + ':' + entranceIndex]
}

export interface WorldmapMarksSave {
    subtiles: Record<string, number>
    entrances: Record<string, number>
}

export function serializeWorldmapMarks(): WorldmapMarksSave {
    return { subtiles: { ...subtileStates }, entrances: { ...entranceStates } }
}

function cleanRecord(raw: unknown, keyPattern: RegExp): Record<string, number> {
    const out: Record<string, number> = {}
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {return out}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (keyPattern.test(k) && typeof v === 'number' && Number.isFinite(v)) {out[k] = Math.trunc(v)}
    }
    return out
}

/** Sanitize a raw save value into a WorldmapMarksSave (used by save migration). */
export function sanitizeWorldmapMarks(raw: unknown): WorldmapMarksSave {
    const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
    return {
        subtiles: cleanRecord(obj.subtiles, /^\d+,\d+$/),
        entrances: cleanRecord(obj.entrances, /^\d+:\d+$/),
    }
}

export function hydrateWorldmapMarks(raw: unknown): void {
    const clean = sanitizeWorldmapMarks(raw)
    subtileStates = clean.subtiles
    entranceStates = clean.entrances
}

export function resetWorldmapMarks(): void {
    subtileStates = {}
    entranceStates = {}
}
