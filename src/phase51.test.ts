/**
 * Phase 51 regression tests.
 *
 * Covers:
 *   A. BLK-035 — Player base stats + skill values persisted in save schema v14
 *   B. Save schema v14 — migration, normalization, sanitizeStringNumericRecord
 *   C. New sfall opcodes 0x81B6–0x81BD checklist entries
 *   D. Scripting: set_pc_stat, get_critter_stat_bonus, obj_art_name, get_item_type_int,
 *      num_critters_in_radius, get_object_ai_num, set_object_ai_num,
 *      get_critter_hostile_to_dude
 *   E. Checklist integrity — all Phase 51 entries present and implemented
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import { SAVE_VERSION, migrateSave } from './saveSchema.js'
import { StatSet } from './char.js'

// ===========================================================================
// Phase 51-A — Player base stats + skill values (BLK-035)
// ===========================================================================

describe('Phase 51-A — Player base stats/skills persistence (BLK-035)', () => {
    it('SAVE_VERSION is 14', () => {
        expect(SAVE_VERSION).toBe(14)
    })

    it('v13 → v14 migration adds playerBaseStats defaulting to {}', () => {
        const raw = {
            version: 13,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            sfallGlobals: {},
            playerPcFlags: 0,
            playerActiveHand: 0,
        }
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(14)
        expect(migrated.playerBaseStats).toEqual({})
    })

    it('v13 → v14 migration adds playerSkillValues defaulting to {}', () => {
        const raw = {
            version: 13,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            sfallGlobals: {},
            playerPcFlags: 0,
            playerActiveHand: 0,
        }
        const migrated = migrateSave(raw)
        expect(migrated.playerSkillValues).toEqual({})
    })

    it('v13 → v14 migration leaves playerSkillPoints as undefined by default', () => {
        const raw = {
            version: 13,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            sfallGlobals: {},
            playerPcFlags: 0,
            playerActiveHand: 0,
        }
        const migrated = migrateSave(raw)
        // After migration playerSkillPoints is undefined (not in old save)
        expect(migrated.playerSkillPoints).toBeUndefined()
    })

    it('old v1 save migrates all the way to v14 with playerBaseStats = {}', () => {
        const raw = {
            version: 1,
            name: 'ancient',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [] },
            party: [],
            savedMaps: {},
        }
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(14)
        expect(migrated.playerBaseStats).toEqual({})
        expect(migrated.playerSkillValues).toEqual({})
    })

    it('playerBaseStats with valid stat values is preserved through migration', () => {
        const raw = {
            version: 13,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            sfallGlobals: {},
            playerPcFlags: 0,
            playerActiveHand: 0,
            playerBaseStats: { HP: 75, AGI: 9, STR: 7 },
        }
        const migrated = migrateSave(raw)
        expect(migrated.playerBaseStats).toEqual({ HP: 75, AGI: 9, STR: 7 })
    })

    it('playerBaseStats with invalid values are dropped by sanitization', () => {
        const raw = {
            version: 14,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerBaseStats: { HP: 75, bad: NaN, alsoOkay: 5 },
        }
        const migrated = migrateSave(raw)
        // NaN value should be dropped; valid values remain
        expect(migrated.playerBaseStats?.HP).toBe(75)
        expect(migrated.playerBaseStats?.alsoOkay).toBe(5)
        expect(migrated.playerBaseStats?.bad).toBeUndefined()
    })

    it('playerBaseStats null input yields {}', () => {
        const raw = {
            version: 14,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerBaseStats: null,
        }
        const migrated = migrateSave(raw)
        expect(migrated.playerBaseStats).toEqual({})
    })

    it('playerSkillPoints integer value is preserved through migration', () => {
        const raw = {
            version: 14,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerSkillPoints: 25,
        }
        const migrated = migrateSave(raw)
        expect(migrated.playerSkillPoints).toBe(25)
    })

    it('playerSkillPoints non-integer value is discarded', () => {
        const raw = {
            version: 14,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerSkillPoints: 2.7,
        }
        const migrated = migrateSave(raw)
        expect(migrated.playerSkillPoints).toBeUndefined()
    })

    it('playerSkillPoints negative value is discarded', () => {
        const raw = {
            version: 14,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerSkillPoints: -5,
        }
        const migrated = migrateSave(raw)
        expect(migrated.playerSkillPoints).toBeUndefined()
    })
})

// ===========================================================================
// Phase 51-C — New sfall opcodes 0x81B6–0x81BD checklist entries
// ===========================================================================

describe('Phase 51-C — New sfall opcodes 0x81B6–0x81BD checklist entries', () => {
    const expectedEntries = [
        'sfall_get_critter_stat_bonus',
        'sfall_obj_art_name',
        'sfall_get_item_type_int',
        'sfall_set_pc_stat',
        'sfall_num_critters_in_radius',
        'sfall_get_object_ai_num',
        'sfall_set_object_ai_num',
        'sfall_get_critter_hostile_to_dude',
    ]

    for (const id of expectedEntries) {
        it(`checklist entry '${id}' is present`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry).toBeDefined()
        })

        it(`checklist entry '${id}' is implemented`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry?.status).toBe('implemented')
        })
    }

    it('player_stats_persistence checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'player_stats_persistence')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })
})

// ===========================================================================
// Phase 51-D — Scripting function tests
// ===========================================================================

describe('Phase 51-D — set_pc_stat scripting function', () => {
    let script: any

    beforeEach(() => {
        Scripting.init('test_phase51')
        script = new (Scripting as any).Script()
        // Minimal player stub
        ;(script as any)._playerStub = {
            level: 5,
            xp: 5000,
            karma: 50,
            skills: { skillPoints: 10 },
        }
    })

    it('set_pc_stat with unknown pcstat warns and does not throw', () => {
        // No player in test environment, just verify no crash
        expect(() => {
            script.set_pc_stat(99, 42)
        }).not.toThrow()
    })

    it('get_pc_stat(5) returns 5 (PCSTAT_max_pc_stat)', () => {
        expect(script.get_pc_stat(5)).toBe(5)
    })

    it('get_critter_stat_bonus with non-critter warns and returns 0', () => {
        expect(script.get_critter_stat_bonus({}, 0)).toBe(0)
    })

    it('get_critter_stat_bonus with invalid stat number returns 0', () => {
        // Use a mock critter-like object
        const mockCritter = {
            type: 'critter',
            position: { x: 0, y: 0 },
            stats: new StatSet({ HP: 50, 'Max HP': 100 }),
            skills: { get: () => 0 },
            inventory: [],
        }
        // Stat number 999 is unknown → should return 0
        expect(script.get_critter_stat_bonus(mockCritter, 999)).toBe(0)
    })

    it('obj_art_name with non-game-object warns and returns empty string', () => {
        expect(script.obj_art_name({})).toBe('')
    })

    it('obj_art_name with null returns empty string', () => {
        expect(script.obj_art_name(null)).toBe('')
    })

    it('get_item_type_int with non-game-object returns 0 (fallback)', () => {
        expect(script.get_item_type_int({})).toBe(0)
    })

    it('num_critters_in_radius with negative radius returns 0', () => {
        // When gMap is not set, should safely return 0
        expect(script.num_critters_in_radius(0, 0, -5)).toBe(0)
    })

    it('num_critters_in_radius with no map returns 0', () => {
        expect(script.num_critters_in_radius(12345, 0, 10)).toBe(0)
    })

    it('get_object_ai_num with non-critter warns and returns -1', () => {
        expect(script.get_object_ai_num({})).toBe(-1)
    })

    it('get_object_ai_num with null returns -1', () => {
        expect(script.get_object_ai_num(null)).toBe(-1)
    })

    it('set_object_ai_num with non-critter warns and does not throw', () => {
        expect(() => script.set_object_ai_num({}, 5)).not.toThrow()
    })

    it('get_critter_hostile_to_dude with non-critter warns and returns 0', () => {
        expect(script.get_critter_hostile_to_dude({})).toBe(0)
    })

    it('get_critter_hostile_to_dude with null returns 0', () => {
        expect(script.get_critter_hostile_to_dude(null)).toBe(0)
    })
})

// ===========================================================================
// Phase 51-E — Checklist integrity
// ===========================================================================

describe('Phase 51-E — Checklist integrity', () => {
    it('player_stats_persistence description mentions HP', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'player_stats_persistence')
        expect(entry?.description).toContain('HP')
    })

    it('player_stats_persistence description mentions playerBaseStats', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'player_stats_persistence')
        expect(entry?.description).toContain('playerBaseStats')
    })

    it('sfall_set_pc_stat description mentions skill_points', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_pc_stat')
        expect(entry?.description).toContain('skill_points')
    })

    it('sfall_num_critters_in_radius description mentions hexDistance', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_num_critters_in_radius')
        expect(entry?.description).toContain('hexDistance')
    })

    it('all Phase 51 sfall opcodes have kind=opcode', () => {
        const sfallIds = [
            'sfall_get_critter_stat_bonus',
            'sfall_obj_art_name',
            'sfall_get_item_type_int',
            'sfall_set_pc_stat',
            'sfall_num_critters_in_radius',
            'sfall_get_object_ai_num',
            'sfall_set_object_ai_num',
            'sfall_get_critter_hostile_to_dude',
        ]
        for (const id of sfallIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry?.kind).toBe('opcode')
        }
    })
})
