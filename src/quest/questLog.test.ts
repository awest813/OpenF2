/**
 * Regression tests for the quest tracking and reputation/karma modules.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { QuestLog } from './questLog.js'
import { Reputation, KARMA_MIN, KARMA_MAX } from './reputation.js'

// ---------------------------------------------------------------------------
// QuestLog tests
// ---------------------------------------------------------------------------

describe('QuestLog', () => {
    let log: QuestLog

    beforeEach(() => {
        log = new QuestLog()
    })

    it('defaults to inactive for unknown quests', () => {
        expect(log.getState('q_unknown')).toBe('inactive')
        expect(log.isActive('q_unknown')).toBe(false)
        expect(log.isCompleted('q_unknown')).toBe(false)
        expect(log.isFailed('q_unknown')).toBe(false)
    })

    it('transitions inactive → active on start()', () => {
        log.start('q1')
        expect(log.getState('q1')).toBe('active')
        expect(log.isActive('q1')).toBe(true)
    })

    it('start() is idempotent when already active', () => {
        log.start('q1')
        log.start('q1') // should not throw or change state
        expect(log.getState('q1')).toBe('active')
    })

    it('transitions active → completed on complete()', () => {
        log.start('q1')
        log.complete('q1')
        expect(log.isCompleted('q1')).toBe(true)
        expect(log.isActive('q1')).toBe(false)
    })

    it('complete() no-ops when quest is not active', () => {
        log.complete('q1') // was inactive — should not throw
        expect(log.getState('q1')).toBe('inactive')
    })

    it('transitions active → failed on fail()', () => {
        log.start('q1')
        log.fail('q1')
        expect(log.isFailed('q1')).toBe(true)
    })

    it('fail() no-ops when quest is not active', () => {
        log.fail('q1')
        expect(log.getState('q1')).toBe('inactive')
    })

    it('start() no-ops when quest is completed', () => {
        log.start('q1')
        log.complete('q1')
        log.start('q1') // should not re-open
        expect(log.isCompleted('q1')).toBe(true)
    })

    it('getAll() returns entries in insertion order', () => {
        log.start('q1')
        log.start('q2')
        log.start('q3')
        const ids = log.getAll().map((e) => e.id)
        expect(ids).toEqual(['q1', 'q2', 'q3'])
    })

    it('getActive() returns only active quests', () => {
        log.start('q1')
        log.start('q2')
        log.complete('q1')
        expect(log.getActive().map((e) => e.id)).toEqual(['q2'])
    })

    it('round-trips via serialize / deserialize', () => {
        log.start('q1', 1000)
        log.complete('q1', 2000)
        log.start('q2', 3000)

        const restored = QuestLog.deserialize(log.serialize())
        expect(restored.getState('q1')).toBe('completed')
        expect(restored.getState('q2')).toBe('active')
        expect(restored.getState('q3')).toBe('inactive')
    })

    it('preserves stateChangedAt through serialization', () => {
        log.start('q1', 42)
        const entry = QuestLog.deserialize(log.serialize()).getAll()[0]
        expect(entry.stateChangedAt).toBe(42)
    })
})

// ---------------------------------------------------------------------------
// Reputation / karma tests
// ---------------------------------------------------------------------------

describe('Reputation — karma', () => {
    let rep: Reputation

    beforeEach(() => {
        rep = new Reputation()
    })

    it('initialises karma at 0', () => {
        expect(rep.getKarma()).toBe(0)
    })

    it('addKarma increases karma', () => {
        rep.addKarma(10)
        expect(rep.getKarma()).toBe(10)
    })

    it('addKarma with negative value decreases karma', () => {
        rep.addKarma(-30)
        expect(rep.getKarma()).toBe(-30)
    })

    it('karma is clamped to KARMA_MAX', () => {
        rep.setKarma(KARMA_MAX + 500)
        expect(rep.getKarma()).toBe(KARMA_MAX)
    })

    it('karma is clamped to KARMA_MIN', () => {
        rep.setKarma(KARMA_MIN - 500)
        expect(rep.getKarma()).toBe(KARMA_MIN)
    })

    it('setKarma is idempotent when value is unchanged', () => {
        rep.setKarma(100)
        rep.setKarma(100) // should not throw
        expect(rep.getKarma()).toBe(100)
    })
})

describe('Reputation — named reputations', () => {
    let rep: Reputation

    beforeEach(() => {
        rep = new Reputation()
    })

    it('defaults to 0 for unknown reputation', () => {
        expect(rep.getReputation('Childkiller')).toBe(0)
    })

    it('setReputation stores a value', () => {
        rep.setReputation('Berserker', 5)
        expect(rep.getReputation('Berserker')).toBe(5)
    })

    it('changeReputation increments the value', () => {
        rep.setReputation('Childkiller', 2)
        rep.changeReputation('Childkiller', 3)
        expect(rep.getReputation('Childkiller')).toBe(5)
    })

    it('setReputation is idempotent when value is unchanged', () => {
        rep.setReputation('Childkiller', 2)
        rep.setReputation('Childkiller', 2) // should not throw
        expect(rep.getReputation('Childkiller')).toBe(2)
    })

    it('changeReputation can decrement', () => {
        rep.setReputation('Childkiller', 4)
        rep.changeReputation('Childkiller', -1)
        expect(rep.getReputation('Childkiller')).toBe(3)
    })
})

describe('Reputation — serialization', () => {
    it('round-trips karma and named reputations', () => {
        const rep = new Reputation()
        rep.setKarma(150)
        rep.setReputation('Childkiller', 2)
        rep.setReputation('Berserker', 1)

        const restored = Reputation.deserialize(rep.serialize())
        expect(restored.getKarma()).toBe(150)
        expect(restored.getReputation('Childkiller')).toBe(2)
        expect(restored.getReputation('Berserker')).toBe(1)
        expect(restored.getReputation('Unknown')).toBe(0)
    })

    it('deserialize handles missing reputations field gracefully', () => {
        const rep = Reputation.deserialize({ karma: 50, reputations: {} })
        expect(rep.getKarma()).toBe(50)
        expect(rep.getReputation('anything')).toBe(0)
    })

    it('deserialize clamps out-of-range karma', () => {
        const rep = Reputation.deserialize({ karma: 99999, reputations: {} })
        expect(rep.getKarma()).toBe(KARMA_MAX)
    })
})
