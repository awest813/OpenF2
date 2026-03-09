/**
 * Phase 50 regression tests.
 *
 * Covers:
 *   A. BLK-033 — Critter status flags serialized (knockedOut, knockedDown,
 *                crippled*, blinded, onFire, isFleeing)
 *   B. BLK-034 — Player.activeHand tracking; active_hand() returns live value
 *   C. Save schema v13 — playerActiveHand migration and normalization
 *   D. Checklist status upgrades — proto_data, tile_is_visible, metarule_46,
 *      metarule_21, metarule_35, metarule_44, metarule_55, metarule_18, anim
 *   E. New sfall opcodes 0x81AE–0x81B5 checklist entries
 *   F. Checklist integrity — all Phase 50 entries present
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import { SAVE_VERSION, migrateSave } from './saveSchema.js'

// ===========================================================================
// Phase 50-A — Critter status flags serialization (BLK-033)
// ===========================================================================

describe('Phase 50-A — Critter status flags serialization (BLK-033)', () => {
    it('checklist entry critter_status_flags_serialization is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'critter_status_flags_serialization')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('critter_status_flags_serialization description mentions knockedOut', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'critter_status_flags_serialization')
        expect(entry?.description).toContain('knockedOut')
    })

    it('critter_status_flags_serialization description mentions isFleeing', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'critter_status_flags_serialization')
        expect(entry?.description).toContain('isFleeing')
    })

    it('critter_status_flags_serialization description mentions crippled', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'critter_status_flags_serialization')
        expect(entry?.description).toContain('crippled')
    })

    it('critter_status_flags_serialization description mentions blinded', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'critter_status_flags_serialization')
        expect(entry?.description).toContain('blinded')
    })
})

// ===========================================================================
// Phase 50-B — Player.activeHand + active_hand() (BLK-034)
// ===========================================================================

describe('Phase 50-B — active_hand() opcode is implemented (BLK-034)', () => {
    beforeEach(() => {
        drainStubHits()
    })

    it('checklist entry active_hand is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'active_hand')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('active_hand() returns 0 by default (no player state)', () => {
        const script = new (Scripting as any).Script()
        // No globalState.player set → falls back to 0 (primary)
        expect(script.active_hand()).toBe(0)
    })

    it('active_hand() does not throw', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.active_hand()).not.toThrow()
    })

    it('active_hand() does not emit a stub hit', () => {
        const script = new (Scripting as any).Script()
        script.active_hand()
        expect(drainStubHits().length).toBe(0)
    })

    it('checklist entry player_active_hand_save is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'player_active_hand_save')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('player_active_hand_save description mentions save schema v13', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'player_active_hand_save')
        expect(entry?.description).toContain('v13')
    })
})

// ===========================================================================
// Phase 50-C — Save schema v13: playerActiveHand migration
// ===========================================================================

describe('Phase 50-C — save schema v13: playerActiveHand migration', () => {
    it('SAVE_VERSION was 18 (now superseded to 20)', () => {
        expect(SAVE_VERSION).toBe(20)
    })

    it('v12 → v13 (towards current SAVE_VERSION) migration adds playerActiveHand defaulting to 0', () => {
        const raw = {
            version: 12,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            sfallGlobals: {},
            playerPcFlags: 0,
        }
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(SAVE_VERSION)
        expect(migrated.playerActiveHand).toBe(0)
    })

    it('old save (v1) migrates all the way to current save version with playerActiveHand = 0', () => {
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
        expect(migrated.version).toBe(SAVE_VERSION)
        expect(migrated.playerActiveHand).toBe(0)
    })

    it('playerActiveHand = 1 (secondary) is preserved through migration', () => {
        const raw = {
            version: 12,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerPcFlags: 0,
            playerActiveHand: 1,
        }
        const migrated = migrateSave(raw)
        expect(migrated.playerActiveHand).toBe(1)
    })

    it('invalid playerActiveHand (2) is normalized to 0', () => {
        const raw = {
            version: SAVE_VERSION,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerActiveHand: 2, // invalid — must be 0 or 1
        }
        const migrated = migrateSave(raw)
        expect(migrated.playerActiveHand).toBe(0)
    })

    it('string playerActiveHand is normalized to 0', () => {
        const raw = {
            version: SAVE_VERSION,
            name: 'test',
            timestamp: 0,
            currentMap: 'arroyo',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            playerActiveHand: 'secondary' as any, // invalid type
        }
        const migrated = migrateSave(raw)
        expect(migrated.playerActiveHand).toBe(0)
    })
})

// ===========================================================================
// Phase 50-D — Checklist status upgrades
// ===========================================================================

describe('Phase 50-D — Checklist status upgrades', () => {
    it('proto_data is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'proto_data')
        expect(e).toBeDefined()
        expect(e?.status).toBe('implemented')
    })

    it('tile_is_visible is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'tile_is_visible')
        expect(e).toBeDefined()
        expect(e?.status).toBe('implemented')
    })

    it('metarule_46 is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule_46')
        expect(e).toBeDefined()
        expect(e?.status).toBe('implemented')
    })

    it('metarule_21 is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule_21')
        expect(e).toBeDefined()
        expect(e?.status).toBe('implemented')
    })

    it('metarule_35 is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule_35')
        expect(e).toBeDefined()
        expect(e?.status).toBe('implemented')
    })

    it('metarule_44 is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule_44')
        expect(e).toBeDefined()
        expect(e?.status).toBe('implemented')
    })

    it('metarule_55 is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule_55')
        expect(e).toBeDefined()
        expect(e?.status).toBe('implemented')
    })

    it('metarule_18 is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'metarule_18')
        expect(e).toBeDefined()
        expect(e?.status).toBe('implemented')
    })

    it('anim is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'anim')
        expect(e).toBeDefined()
        expect(e?.status).toBe('implemented')
    })

    it('proto_data_flags2 is implemented', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'proto_data_flags2')
        expect(e).toBeDefined()
        expect(e?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 50-E — New sfall opcodes 0x81AE–0x81B5 checklist entries
// ===========================================================================

describe('Phase 50-E — sfall opcodes 0x81AE–0x81B5 checklist entries', () => {
    const OPCODE_IDS = [
        'sfall_get_perk_owed',
        'sfall_set_perk_owed',
        'sfall_get_last_target',
        'sfall_get_last_attacker',
        'sfall_art_cache_flush',
        'sfall_game_loaded',
        'sfall_set_weapon_knockback',
        'sfall_remove_weapon_knockback',
    ]

    for (const id of OPCODE_IDS) {
        it(`checklist entry "${id}" is present and implemented`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.status).toBe('implemented')
            expect(entry?.kind).toBe('opcode')
        })
    }

    it('sfall_get_perk_owed description references 0x81AE', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'sfall_get_perk_owed')
        expect(e?.description).toContain('0x81AE')
    })

    it('sfall_game_loaded description references 0x81B3', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'sfall_game_loaded')
        expect(e?.description).toContain('0x81B3')
    })

    it('sfall_art_cache_flush description references 0x81B2', () => {
        const e = SCRIPTING_STUB_CHECKLIST.find((x) => x.id === 'sfall_art_cache_flush')
        expect(e?.description).toContain('0x81B2')
    })
})

// ===========================================================================
// Phase 50-F — Checklist integrity: all Phase 50 entries present
// ===========================================================================

describe('Phase 50-F — checklist: all Phase 50 entries present', () => {
    const phase50Ids = [
        'critter_status_flags_serialization',
        'player_active_hand_save',
        'sfall_get_perk_owed',
        'sfall_set_perk_owed',
        'sfall_get_last_target',
        'sfall_get_last_attacker',
        'sfall_art_cache_flush',
        'sfall_game_loaded',
        'sfall_set_weapon_knockback',
        'sfall_remove_weapon_knockback',
    ]

    for (const id of phase50Ids) {
        it(`checklist entry '${id}' is present`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
        })
    }
})
