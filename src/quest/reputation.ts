/**
 * Reputation and karma tracking.
 *
 * In Fallout 2, "karma" is a single running score; "reputation" refers to
 * standing in specific towns/factions (stored as global variables by the
 * original engine).  This module owns:
 *
 *   - The player's global karma value.
 *   - Named reputation flags (e.g. "Childkiller", "Berserker") stored as a
 *     simple string → number map so scripting code can read/write them without
 *     depending on exact GVAR indices.
 *
 * Karma boundaries follow the Fallout 2 original: −2000 to +2000, clamped.
 */

import { EventBus } from '../eventBus.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const KARMA_MIN = -2000
export const KARMA_MAX = 2000

// ---------------------------------------------------------------------------
// Serialization shape
// ---------------------------------------------------------------------------

export interface SerializedReputation {
    karma: number
    reputations: { [name: string]: number }
}

// ---------------------------------------------------------------------------
// Reputation class
// ---------------------------------------------------------------------------

export class Reputation {
    private karma = 0
    private reputations: Map<string, number> = new Map()

    // ── Karma ────────────────────────────────────────────────────────────────

    getKarma(): number {
        return this.karma
    }

    setKarma(value: number): void {
        const clamped = Math.max(KARMA_MIN, Math.min(KARMA_MAX, value))
        const old = this.karma
        if (clamped === old) {return}
        this.karma = clamped
        EventBus.emit('player:karmaChange', { oldValue: old, newValue: clamped })
    }

    addKarma(amount: number): void {
        this.setKarma(this.karma + amount)
    }

    // ── Named reputations ────────────────────────────────────────────────────

    /**
     * Return the current value for a named reputation flag.
     * Defaults to 0 if the flag has never been set.
     */
    getReputation(name: string): number {
        return this.reputations.get(name) ?? 0
    }

    setReputation(name: string, value: number): void {
        const old = this.getReputation(name)
        if (value === old) {return}
        this.reputations.set(name, value)
        EventBus.emit('player:reputationChange', { name, oldValue: old, newValue: value })
    }

    /** Increment a named reputation by `amount` (may be negative). */
    changeReputation(name: string, amount: number): void {
        this.setReputation(name, this.getReputation(name) + amount)
    }

    // ── Serialization ────────────────────────────────────────────────────────

    serialize(): SerializedReputation {
        const reputations: { [name: string]: number } = {}
        for (const [k, v] of this.reputations) {reputations[k] = v}
        return { karma: this.karma, reputations }
    }

    static deserialize(data: SerializedReputation): Reputation {
        const rep = new Reputation()
        rep.karma = Math.max(KARMA_MIN, Math.min(KARMA_MAX, data.karma ?? 0))
        for (const [k, v] of Object.entries(data.reputations ?? {})) {
            rep.reputations.set(k, v)
        }
        return rep
    }
}
