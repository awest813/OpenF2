/**
 * Rest interrupt → random encounter handoff (parity P1-11).
 */

import globalState from './globalState.js'
import { Worldmap } from './worldmap.js'
import { Config } from './config.js'
import type { RestDanger } from './character/rest.js'
import { uiLog } from './ui.js'

const DEFAULT_TABLE_BY_DANGER: Record<RestDanger, string> = {
    safe: 'wasteland',
    low: 'wasteland',
    medium: 'forest',
    high: 'desert',
}

/** Resolve an encounter table key for a rest interrupt on the current map context. */
export function resolveRestEncounterTable(
    danger: RestDanger,
    map: { encounterTable?: string; encounterType?: string } | null | undefined,
): string {
    if (map?.encounterTable && typeof map.encounterTable === 'string') {
        return map.encounterTable
    }
    if (map?.encounterType && typeof map.encounterType === 'string') {
        return map.encounterType
    }
    return DEFAULT_TABLE_BY_DANGER[danger] ?? 'wasteland'
}

/**
 * Spawn a random encounter after Pip-Boy rest is interrupted.
 * Returns true when an encounter transition was started.
 */
export function triggerRestEncounter(danger: RestDanger): boolean {
    if (Config.engine?.doEncounters === false) {
        return false
    }
    if (!globalState.player || !globalState.gMap) {
        return false
    }

    const map = globalState.gMap as { encounterTable?: string; encounterType?: string }

    // Travelling on the world map: use the square's encounter table when available.
    if (globalState.worldPosition) {
        try {
            Worldmap.doEncounter()
            uiLog('You are ambushed while resting!')
            return true
        } catch (err) {
            console.warn('triggerRestEncounter: world-map encounter failed', err)
        }
    }

    const tableKey = resolveRestEncounterTable(danger, map)
    try {
        const ok = Worldmap.forceEncounter(tableKey)
        if (ok) {
            uiLog('You are ambushed while resting!')
        }
        return ok
    } catch (err) {
        console.warn('triggerRestEncounter: forceEncounter failed for', tableKey, err)
        return false
    }
}
