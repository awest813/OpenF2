/**
 * Phase 45 regression tests.
 *
 * Focus: Crash-free hardening — converting runtime throws to warn+return across
 * ui.ts (barter/loot), main.ts (elevator/AP/skill), encounters.ts (parsing),
 * worldmap.ts (encounter-reference parsing), and pro.ts (critter art paths);
 * plus sfall opcodes 0x81A3–0x81A7 (get_ini_string, set_global_script_type,
 * get_year, get_month, get_day) and get_game_mode status upgrade.
 *
 *   Phase 45-A — checklist: ui_barter_loot_no_throw
 *   Phase 45-B — checklist: main_elevator_ap_no_throw
 *   Phase 45-C — checklist: encounters_parse_no_throw
 *   Phase 45-D — checklist: worldmap_encounter_ref_no_throw
 *   Phase 45-E — checklist: pro_critter_art_path_no_throw
 *   Phase 45-F — sfall 0x81A3–0x81A7 opcodes implemented
 *   Phase 45-G — get_game_mode status upgrade to 'implemented'
 *   Phase 45-H — checklist integrity: all Phase 45 entries present
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'

// ===========================================================================
// Phase 45-A — ui.ts barter/loot throws → warn+return
// ===========================================================================

describe('Phase 45-A — checklist: ui_barter_loot_no_throw', () => {
    it('checklist entry ui_barter_loot_no_throw is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'ui_barter_loot_no_throw')
        expect(entry, 'missing checklist entry: ui_barter_loot_no_throw').toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('ui_barter_loot_no_throw description mentions barter/loot and warn', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'ui_barter_loot_no_throw')
        expect(entry?.description).toContain('warn')
        expect(entry?.description.toLowerCase()).toContain('barter')
    })
})

// ===========================================================================
// Phase 45-B — main.ts elevator/AP/skill throws → warn+return
// ===========================================================================

describe('Phase 45-B — checklist: main_elevator_ap_no_throw', () => {
    it('checklist entry main_elevator_ap_no_throw is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'main_elevator_ap_no_throw')
        expect(entry, 'missing checklist entry: main_elevator_ap_no_throw').toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('main_elevator_ap_no_throw description mentions elevator and AP', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'main_elevator_ap_no_throw')
        expect(entry?.description.toLowerCase()).toContain('elevator')
        expect(entry?.description.toUpperCase()).toContain('AP')
    })
})

// ===========================================================================
// Phase 45-C — encounters.ts parsing throws → graceful fallback
// ===========================================================================

describe('Phase 45-C — checklist: encounters_parse_no_throw', () => {
    it('checklist entry encounters_parse_no_throw is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'encounters_parse_no_throw')
        expect(entry, 'missing checklist entry: encounters_parse_no_throw').toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('encounters_parse_no_throw description mentions evalCond and pickEncounter', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'encounters_parse_no_throw')
        expect(entry?.description).toContain('evalCond')
        expect(entry?.description).toContain('pickEncounter')
    })
})

// ===========================================================================
// Phase 45-D — worldmap.ts parseEncounterReference throw → warn+null
// ===========================================================================

describe('Phase 45-D — checklist: worldmap_encounter_ref_no_throw', () => {
    it('checklist entry worldmap_encounter_ref_no_throw is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'worldmap_encounter_ref_no_throw')
        expect(entry, 'missing checklist entry: worldmap_encounter_ref_no_throw').toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('medium')
    })

    it('worldmap_encounter_ref_no_throw description mentions parseEncounterReference', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'worldmap_encounter_ref_no_throw')
        expect(entry?.description).toContain('parseEncounterReference')
    })
})

// ===========================================================================
// Phase 45-E — pro.ts getCritterArtPath throws → warn+fallback
// ===========================================================================

describe('Phase 45-E — checklist: pro_critter_art_path_no_throw', () => {
    it('checklist entry pro_critter_art_path_no_throw is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'pro_critter_art_path_no_throw')
        expect(entry, 'missing checklist entry: pro_critter_art_path_no_throw').toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('pro_critter_art_path_no_throw description mentions getCritterArtPath and fallback', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'pro_critter_art_path_no_throw')
        expect(entry?.description).toContain('getCritterArtPath')
        expect(entry?.description.toLowerCase()).toContain('fallback')
    })
})

// ===========================================================================
// Phase 45-F — sfall 0x81A3–0x81A7 opcode checklist entries
// ===========================================================================

describe('Phase 45-F — sfall 0x81A3–0x81A7 opcode entries', () => {
    const OPCODE_IDS = [
        'get_ini_string_opcode',
        'set_global_script_type_opcode',
        'get_year_sfall_opcode',
        'get_month_opcode',
        'get_day_opcode',
    ]

    for (const id of OPCODE_IDS) {
        it(`checklist entry "${id}" is present and implemented`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.status).toBe('implemented')
            expect(entry?.kind).toBe('opcode')
        })
    }

    it('get_ini_string_opcode description references 0x81A3', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_ini_string_opcode')
        expect(entry?.description).toContain('0x81A3')
    })

    it('set_global_script_type_opcode description references 0x81A4', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'set_global_script_type_opcode')
        expect(entry?.description).toContain('0x81A4')
    })

    it('get_year_sfall_opcode description references 0x81A5 and 2241', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_year_sfall_opcode')
        expect(entry?.description).toContain('0x81A5')
        expect(entry?.description).toContain('2241')
    })

    it('get_month_opcode description references 0x81A6', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_month_opcode')
        expect(entry?.description).toContain('0x81A6')
    })

    it('get_day_opcode description references 0x81A7', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_day_opcode')
        expect(entry?.description).toContain('0x81A7')
    })
})

// ===========================================================================
// Phase 45-G — get_game_mode upgraded to 'implemented'
// ===========================================================================

describe('Phase 45-G — get_game_mode status is implemented', () => {
    it('get_game_mode checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_game_mode')
        expect(entry, 'missing checklist entry: get_game_mode').toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('get_game_mode description references 0x817E and bitmask', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_game_mode')
        expect(entry?.description).toContain('0x817E')
        expect(entry?.description.toLowerCase()).toContain('bitmask')
    })

    it('get_game_mode description references combat=1', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_game_mode')
        expect(entry?.description).toContain('combat=1')
    })
})

// ===========================================================================
// Phase 45-H — checklist integrity: all Phase 45 entries present
// ===========================================================================

describe('Phase 45-H — checklist integrity: all Phase 45 entries present', () => {
    const PHASE_45_IDS = [
        'ui_barter_loot_no_throw',
        'main_elevator_ap_no_throw',
        'encounters_parse_no_throw',
        'worldmap_encounter_ref_no_throw',
        'pro_critter_art_path_no_throw',
        'get_ini_string_opcode',
        'set_global_script_type_opcode',
        'get_year_sfall_opcode',
        'get_month_opcode',
        'get_day_opcode',
    ]

    for (const id of PHASE_45_IDS) {
        it(`checklist entry "${id}" has required fields`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.kind).toMatch(/^(opcode|procedure|metarule)$/)
            expect(entry?.description.length).toBeGreaterThan(20)
            expect(entry?.status).toMatch(/^(stub|partial|implemented)$/)
            expect(entry?.frequency).toMatch(/^(high|medium|low)$/)
            expect(entry?.impact).toMatch(/^(blocker|high|medium|low)$/)
        })
    }

    it('all Phase 45 entries are in "implemented" status', () => {
        for (const id of PHASE_45_IDS) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry?.status, `${id} should be implemented`).toBe('implemented')
        }
    })
})
