/**
 * Local-map automap / fog-of-war (parity Slice G / P1-11).
 *
 * Records visited hex tiles per map name + elevation so the Pip-Boy MAP tab
 * can render exploration progress without FO2 art assets.
 */

import globalState from '../globalState.js'
import { toTileNum, fromTileNum, MAP_GRID_SIZE } from '../tile.js'

export interface AutomapCell {
    visited: boolean
}

export interface AutomapGrid {
    width: number
    height: number
    cells: AutomapCell[][]
    playerX: number
    playerY: number
}

/** ``mapName|elevation`` → set of visited tile numbers. */
const visits = new Map<string, Set<number>>()

export function automapKey(mapName: string, elevation: number): string {
    return `${String(mapName || '').toLowerCase()}|${elevation | 0}`
}

export function resetAutomap(): void {
    visits.clear()
}

function getOrCreateSet(key: string): Set<number> {
    let set = visits.get(key)
    if (!set) {
        set = new Set()
        visits.set(key, set)
    }
    return set
}

/** Mark a single tile visited. */
export function markTileVisited(mapName: string, elevation: number, tileNum: number): void {
    if (!mapName || typeof tileNum !== 'number' || !Number.isFinite(tileNum)) return
    if (tileNum < 0 || tileNum >= MAP_GRID_SIZE * MAP_GRID_SIZE) return
    getOrCreateSet(automapKey(mapName, elevation)).add(tileNum | 0)
}

/**
 * Mark the player's hex and a small radius as explored.
 * Radius 1 ≈ FO2-ish local reveal without marking the whole vision cone.
 */
export function markExploredAround(
    mapName: string,
    elevation: number,
    x: number,
    y: number,
    radius = 1,
): void {
    if (!mapName) return
    const r = Math.max(0, Math.min(5, radius | 0))
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            // Rough hex distance: axial-ish Manhattan on our grid
            if (Math.abs(dx) + Math.abs(dy) > r * 2) continue
            const px = x + dx
            const py = y + dy
            if (px < 0 || py < 0 || px >= MAP_GRID_SIZE || py >= MAP_GRID_SIZE) continue
            markTileVisited(mapName, elevation, toTileNum({ x: px, y: py }))
        }
    }
}

/** Record exploration at the live player position on the current map. */
export function markPlayerExplored(radius = 1): void {
    const map = globalState.gMap
    const player = globalState.player
    if (!map?.name || !player?.position) return
    const elev = globalState.currentElevation ?? map.currentElevation ?? 0
    markExploredAround(map.name, elev, player.position.x, player.position.y, radius)
}

export function getVisitedTiles(mapName: string, elevation: number): ReadonlySet<number> {
    return visits.get(automapKey(mapName, elevation)) ?? new Set()
}

export function isTileVisited(mapName: string, elevation: number, tileNum: number): boolean {
    return visits.get(automapKey(mapName, elevation))?.has(tileNum) ?? false
}

/**
 * Build a downsampled Pip-Boy map grid from visited tiles.
 * Returns null when there is no current map / player.
 */
export function buildPipBoyMapData(gridSize = 40): AutomapGrid | null {
    const map = globalState.gMap
    const player = globalState.player
    if (!map?.name || !player?.position) return null

    const elev = globalState.currentElevation ?? map.currentElevation ?? 0
    const visited = getVisitedTiles(map.name, elev)
    const size = Math.max(8, Math.min(80, gridSize | 0))
    const cells: AutomapCell[][] = []

    for (let cy = 0; cy < size; cy++) {
        const row: AutomapCell[] = []
        for (let cx = 0; cx < size; cx++) {
            // Sample whether any hex in this cell was visited
            const x0 = Math.floor((cx * MAP_GRID_SIZE) / size)
            const x1 = Math.floor(((cx + 1) * MAP_GRID_SIZE) / size)
            const y0 = Math.floor((cy * MAP_GRID_SIZE) / size)
            const y1 = Math.floor(((cy + 1) * MAP_GRID_SIZE) / size)
            let any = false
            // Sparse check: only probe visited tiles that fall in range
            if (visited.size > 0) {
                for (const tile of visited) {
                    const p = fromTileNum(tile)
                    if (p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1) {
                        any = true
                        break
                    }
                }
            }
            row.push({ visited: any })
        }
        cells.push(row)
    }

    const playerX = Math.min(size - 1, Math.max(0, Math.floor((player.position.x * size) / MAP_GRID_SIZE)))
    const playerY = Math.min(size - 1, Math.max(0, Math.floor((player.position.y * size) / MAP_GRID_SIZE)))
    // Ensure player cell shows as visited
    if (cells[playerY]?.[playerX]) cells[playerY][playerX].visited = true

    return { width: size, height: size, cells, playerX, playerY }
}

export function serializeAutomap(): Record<string, number[]> {
    const out: Record<string, number[]> = {}
    for (const [key, set] of visits) {
        if (set.size === 0) continue
        out[key] = [...set]
    }
    return out
}

export function hydrateAutomap(data: Record<string, number[]> | null | undefined): void {
    resetAutomap()
    if (!data || typeof data !== 'object') return
    for (const [key, tiles] of Object.entries(data)) {
        if (!Array.isArray(tiles)) continue
        const set = getOrCreateSet(key)
        for (const t of tiles) {
            if (typeof t === 'number' && Number.isFinite(t) && t >= 0) set.add(t | 0)
        }
    }
}
