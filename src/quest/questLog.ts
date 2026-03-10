/**
 * Quest log — tracks the state of every quest the player has interacted with.
 *
 * Each quest has an id (typically matching the Fallout 2 quest identifier or a
 * human-readable slug) and moves through a simple state machine:
 *
 *   inactive → active → completed
 *                    ↘ failed
 *
 * The log is intentionally free of game-data lookups so it can be unit-tested
 * without loading any assets.  Higher-level code (scripting bridge, UI) is
 * responsible for supplying quest ids and interpreting state.
 */

import { EventBus } from '../eventBus.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuestState = 'inactive' | 'active' | 'completed' | 'failed'

export interface QuestEntry {
    /** Unique quest identifier. */
    id: string
    state: QuestState
    /** Game-tick time (or wall-clock ms) at which the state last changed. */
    stateChangedAt: number
}

export interface SerializedQuestLog {
    entries: QuestEntry[]
}

// ---------------------------------------------------------------------------
// QuestLog
// ---------------------------------------------------------------------------

export class QuestLog {
    private entries: Map<string, QuestEntry> = new Map()

    /** Return the current state of a quest, defaulting to 'inactive'. */
    getState(id: string): QuestState {
        return this.entries.get(id)?.state ?? 'inactive'
    }

    isActive(id: string): boolean { return this.getState(id) === 'active' }
    isCompleted(id: string): boolean { return this.getState(id) === 'completed' }
    isFailed(id: string): boolean { return this.getState(id) === 'failed' }

    /**
     * Mark a quest as active.  Emits `quest:start`.
     * No-op if the quest is already active/completed/failed.
     */
    start(id: string, now: number = Date.now()): void {
        if (this.getState(id) !== 'inactive') {return}
        this.entries.set(id, { id, state: 'active', stateChangedAt: now })
        EventBus.emit('quest:start', { questId: id })
    }

    /**
     * Mark a quest as completed.  Emits `quest:complete`.
     * Only valid when the quest is active.
     */
    complete(id: string, now: number = Date.now()): void {
        if (!this.isActive(id)) {return}
        this.entries.set(id, { id, state: 'completed', stateChangedAt: now })
        EventBus.emit('quest:complete', { questId: id })
    }

    /**
     * Mark a quest as failed.  Emits `quest:fail`.
     * Only valid when the quest is active.
     */
    fail(id: string, now: number = Date.now()): void {
        if (!this.isActive(id)) {return}
        this.entries.set(id, { id, state: 'failed', stateChangedAt: now })
        EventBus.emit('quest:fail', { questId: id })
    }

    /** Return all quest entries in insertion order. */
    getAll(): QuestEntry[] {
        return Array.from(this.entries.values())
    }

    /** Return only active quests. */
    getActive(): QuestEntry[] {
        return this.getAll().filter((e) => e.state === 'active')
    }

    serialize(): SerializedQuestLog {
        return { entries: this.getAll() }
    }

    static deserialize(data: SerializedQuestLog): QuestLog {
        const log = new QuestLog()
        for (const entry of data.entries) {
            log.entries.set(entry.id, { ...entry })
        }
        return log
    }
}
