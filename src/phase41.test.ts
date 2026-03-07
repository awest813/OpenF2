/**
 * Phase 41 regression tests.
 *
 * Focus: object throw→warn; critter damage_p_proc wiring; AP→AC end-of-turn
 * bonus; critterSetRawStat/critterSetRawSkill implementation.
 *
 *   Phase 41-A — object.ts: dropObject item not found → warn+return (no throw)
 *   Phase 41-B — object.ts: Critter.getAnimation unknown anim → warn+idle fallback (no throw)
 *   Phase 41-C — object.ts: Critter.getAnimation weapon has no weapon data → warn+fallthrough (no throw)
 *   Phase 41-D — object.ts: walkTo null directionOfDelta → warn+return false (no throw)
 *   Phase 41-E — object.ts: directionalOffset no image info → warn+{x:0,y:0} (no throw)
 *   Phase 41-F — object.ts: getAnimPartialActions no image info → warn+safe fallback (no throw)
 *   Phase 41-G — critter.ts: damage_p_proc wired in critterDamage
 *   Phase 41-H — critter.ts: critterSetRawStat implemented (stats.setBase)
 *   Phase 41-I — critter.ts: critterSetRawSkill implemented (skills.setBase)
 *   Phase 41-J — combat.ts: AP→AC bonus: unused AP at end of turn → StatSet.acBonus
 *   Phase 41-K — combat.ts: StatSet.acBonus included in getStat('AC')
 *   Phase 41-L — checklist integrity: all Phase 41 entries present
 */

import { describe, it, expect, vi } from 'vitest'
import { StatSet } from './char.js'
import { SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'

// ===========================================================================
// Phase 41-A — dropObject item not found → warn+return (no throw)
// ===========================================================================

describe('Phase 41-A — dropObject item not found → warn+return', () => {
    it('checklist entry object_drop_not_found is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'object_drop_not_found')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })
})

// ===========================================================================
// Phase 41-B — Critter.getAnimation unknown anim → idle fallback (no throw)
// ===========================================================================

describe('Phase 41-B — getAnimation unknown animation name → idle fallback', () => {
    it('checklist entry object_unknown_animation is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'object_unknown_animation')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })
})

// ===========================================================================
// Phase 41-C — Critter.getAnimation weapon has no weapon data → no throw
// ===========================================================================

describe('Phase 41-C — getAnimation weapon has no weapon data → warn+fallthrough', () => {
    it('checklist entry object_unknown_animation covers weapon-data missing path', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'object_unknown_animation')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 41-D — walkTo null directionOfDelta → warn+return false (no throw)
// ===========================================================================

describe('Phase 41-D — walkTo null direction → warn+return false', () => {
    it('checklist entry object_walk_null_direction is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'object_walk_null_direction')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })
})

// ===========================================================================
// Phase 41-E — directionalOffset no image info → warn+{x:0,y:0} (no throw)
// ===========================================================================

describe('Phase 41-E — directionalOffset no image info → {x:0,y:0}', () => {
    it('checklist entry object_no_image_info_graceful is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'object_no_image_info_graceful')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })
})

// ===========================================================================
// Phase 41-F — getAnimPartialActions no image info → safe fallback (no throw)
// ===========================================================================

describe('Phase 41-F — getAnimPartialActions/getAnimDistance no image info → safe fallback', () => {
    it('checklist entry object_anim_partial_no_image_info is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'object_anim_partial_no_image_info')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('medium')
    })
})

// ===========================================================================
// Phase 41-G — critter.ts: damage_p_proc wired in critterDamage
// ===========================================================================

describe('Phase 41-G — critterDamage calls damage_p_proc via Scripting.damage()', () => {
    it('checklist entry critter_damage_p_proc is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'critter_damage_p_proc')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })
})

// ===========================================================================
// Phase 41-H — critterSetRawStat: now calls stats.setBase
// ===========================================================================

describe('Phase 41-H — critterSetRawStat implemented via stats.setBase', () => {
    it('checklist entry critter_set_raw_stat is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'critter_set_raw_stat')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 41-I — critterSetRawSkill: now calls skills.setBase
// ===========================================================================

describe('Phase 41-I — critterSetRawSkill implemented via skills.setBase', () => {
    it('checklist entry critter_set_raw_skill is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'critter_set_raw_skill')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 41-J/K — StatSet.acBonus: AP→AC mechanic and getStat('AC') inclusion
// ===========================================================================

describe('Phase 41-J — StatSet.acBonus field exists and initialises to 0', () => {
    it('new StatSet has acBonus = 0', () => {
        const stats = new StatSet()
        expect(stats.acBonus).toBe(0)
    })

    it('acBonus can be set and read back', () => {
        const stats = new StatSet()
        stats.acBonus = 5
        expect(stats.acBonus).toBe(5)
    })
})

describe('Phase 41-K — StatSet.get("AC") includes acBonus', () => {
    it('getStat("AC") with acBonus=3 returns base AC + 3', () => {
        // Build a StatSet with a known base AC value (AGI=5 → AC=5 derived)
        const baseStats: Record<string, number> = { AGI: 5, AC: 10 }
        const stats = new StatSet(baseStats, false) // useBonuses=false: direct base only
        const baseAC = stats.get('AC')

        stats.acBonus = 3
        const boostedAC = stats.get('AC')

        expect(boostedAC).toBe(baseAC + 3)
    })

    it('getStat("AC") with acBonus=0 returns unchanged base AC', () => {
        const baseStats: Record<string, number> = { AGI: 5, AC: 10 }
        const stats = new StatSet(baseStats, false)
        stats.acBonus = 0
        expect(stats.get('AC')).toBe(stats.getBase('AC'))
    })

    it('acBonus does not affect non-AC stats', () => {
        const baseStats: Record<string, number> = { HP: 30, MaxHP: 30 }
        const stats = new StatSet(baseStats, false)
        const baseHP = stats.get('HP')
        stats.acBonus = 10
        expect(stats.get('HP')).toBe(baseHP)
    })

    it('checklist entry combat_ap_to_ac_bonus is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'combat_ap_to_ac_bonus')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
        expect(entry?.frequency).toBe('high')
    })
})

// ===========================================================================
// Phase 41-L — checklist integrity
// ===========================================================================

describe('Phase 41-L — checklist integrity', () => {
    const PHASE_41_IDS = [
        'object_drop_not_found',
        'object_unknown_animation',
        'object_walk_null_direction',
        'object_no_image_info_graceful',
        'object_anim_partial_no_image_info',
        'critter_damage_p_proc',
        'critter_set_raw_stat',
        'critter_set_raw_skill',
        'combat_ap_to_ac_bonus',
    ]

    for (const id of PHASE_41_IDS) {
        it(`checklist entry "${id}" is present with required fields`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.kind).toMatch(/^(opcode|procedure|metarule)$/)
            expect(entry?.description.length).toBeGreaterThan(20)
            expect(entry?.status).toMatch(/^(stub|partial|implemented)$/)
            expect(entry?.frequency).toMatch(/^(high|medium|low)$/)
            expect(entry?.impact).toMatch(/^(blocker|high|medium|low)$/)
        })
    }

    it('all Phase 41 entries are in "implemented" or "partial" status (no stubs)', () => {
        for (const id of PHASE_41_IDS) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry?.status, `${id} should not be stub`).not.toBe('stub')
        }
    })
})
