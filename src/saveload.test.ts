/**
 * Regression tests for the save/load system, focusing on schema migration
 * and the new XP/level/karma fields added in version 2.
 */

import { describe, it, expect } from 'vitest'
import { migrateSave, SAVE_VERSION } from './saveSchema.js'

describe('migrateSave', () => {
    it('returns a v2 save unchanged', () => {
        const raw = {
            version: 2,
            name: 'Test',
            timestamp: 1234567890,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 94, y: 109 }, orientation: 3, inventory: [], xp: 500, level: 2, karma: 10 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.version).toBe(SAVE_VERSION)
        expect(save.player.xp).toBe(500)
        expect(save.player.level).toBe(2)
        expect(save.player.karma).toBe(10)
    })

    it('migrates a v1 save to v2 and adds default xp/level/karma', () => {
        const raw = {
            version: 1,
            name: 'OldSave',
            timestamp: 1000000,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 10, y: 20 }, orientation: 0, inventory: [] },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.version).toBe(SAVE_VERSION)
        expect(save.player.xp).toBe(0)
        expect(save.player.level).toBe(1)
        expect(save.player.karma).toBe(0)
    })

    it('does not overwrite existing xp/level/karma when migrating v1', () => {
        // If somehow a v1 save already had these fields (edge case), preserve them
        const raw = {
            version: 1,
            name: 'Edge',
            timestamp: 1000000,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 10, y: 20 }, orientation: 0, inventory: [], xp: 250, level: 3, karma: 5 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.version).toBe(SAVE_VERSION)
        // xp was already set — migration should not zero it out
        expect(save.player.xp).toBe(250)
        expect(save.player.level).toBe(3)
        expect(save.player.karma).toBe(5)
    })

    it('sets each field independently when only some are missing in v1 save', () => {
        // Only xp is missing; level and karma are present
        const raw = {
            version: 1,
            name: 'Partial',
            timestamp: 2000000,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], level: 5, karma: 3 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.player.xp).toBe(0)       // defaulted
        expect(save.player.level).toBe(5)    // preserved
        expect(save.player.karma).toBe(3)    // preserved
    })

    it('throws for an unknown save version', () => {
        const raw = { version: 999, player: {}, party: [], savedMaps: {} }
        expect(() => migrateSave(raw)).toThrow()
    })
})
