/**
 * Holodisk / Pip-Boy archives (parity Slice G / P1-11).
 *
 * Lightweight in-memory registry so quests can hand the player readable data
 * without shipping copyrighted FO2 text. Scripts/tests call `addHolodisk`.
 */

import globalState from '../globalState.js'

export interface HolodiskEntry {
    id: string
    title: string
    body: string
    /** gameTickTime when acquired. */
    acquiredAt: number
    read: boolean
}

const archive: HolodiskEntry[] = []

export function getHolodisks(): readonly HolodiskEntry[] {
    return archive
}

export function getHolodisk(id: string): HolodiskEntry | undefined {
    return archive.find((h) => h.id === id)
}

/**
 * Add or replace a holodisk in the player's archive. Returns the entry.
 */
export function addHolodisk(id: string, title: string, body: string): HolodiskEntry {
    const existing = archive.find((h) => h.id === id)
    if (existing) {
        existing.title = title
        existing.body = body
        return existing
    }
    const entry: HolodiskEntry = {
        id,
        title,
        body,
        acquiredAt: globalState.gameTickTime ?? 0,
        read: false,
    }
    archive.push(entry)
    return entry
}

export function markHolodiskRead(id: string): boolean {
    const entry = archive.find((h) => h.id === id)
    if (!entry) return false
    entry.read = true
    return true
}

export function removeHolodisk(id: string): boolean {
    const idx = archive.findIndex((h) => h.id === id)
    if (idx < 0) return false
    archive.splice(idx, 1)
    return true
}

/** Test helper. */
export function resetHolodisks(): void {
    archive.length = 0
}

export function serializeHolodisks(): HolodiskEntry[] {
    return archive.map((h) => ({ ...h }))
}

export function deserializeHolodisks(entries: HolodiskEntry[] | null | undefined): void {
    archive.length = 0
    if (!entries) return
    for (const e of entries) {
        if (!e || typeof e.id !== 'string') continue
        archive.push({
            id: e.id,
            title: String(e.title ?? e.id),
            body: String(e.body ?? ''),
            acquiredAt: typeof e.acquiredAt === 'number' ? e.acquiredAt : 0,
            read: !!e.read,
        })
    }
}
