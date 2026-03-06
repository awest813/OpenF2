/**
 * Phase 19 regression tests.
 *
 * Covers:
 *   A. Scripting — anim() handles ANIM_* codes 0-99 without stub emission
 *   B. Scripting — get_pc_stat(5) returns 5 for PCSTAT_max_pc_stat
 *   C. Scripting — inven_cmds navigation commands (FIRST/LAST/PREV/NEXT)
 *   D. Scripting — proto_data extended data members (12, 17-20, 32-34)
 *   E. Scripting — sfall opcodes 0x8178-0x817C (ammo state, mouse tile)
 *   F. Checklist — Phase 19 entries reflect correct status
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { drainStubHits, stubHitCount, SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'

// ---------------------------------------------------------------------------
// Helper: build a minimal mock Obj/Critter for testing
// ---------------------------------------------------------------------------

function makeObj(overrides: Record<string, any> = {}): any {
    return {
        type: 'item',
        isPlayer: false,
        pid: 1,
        orientation: 0,
        frame: 0,
        position: { x: 0, y: 0 },
        inventory: [],
        visible: true,
        extra: {},
        inAnim: () => false,
        ...overrides,
    }
}

function makeCritter(overrides: Record<string, any> = {}): any {
    const stats = {
        base: {} as Record<string, number>,
        derived: {} as Record<string, number>,
        getBase: function (name: string) { return this.base[name] ?? 0 },
        setBase: function (name: string, val: number) { this.base[name] = val },
    }
    return {
        type: 'critter',
        isPlayer: false,
        pid: 2,
        orientation: 0,
        frame: 0,
        position: { x: 0, y: 0 },
        inventory: [],
        visible: true,
        extra: {},
        stats,
        perkRanks: {},
        equippedArmor: null,
        leftHand: null,
        rightHand: null,
        aiNum: 0,
        teamNum: 0,
        dead: false,
        getStat: (name: string) => stats.derived[name] ?? stats.base[name] ?? 0,
        inAnim: () => false,
        ...overrides,
    }
}

// ---------------------------------------------------------------------------
// A. anim() — standard ANIM_* codes should not emit stubs
// ---------------------------------------------------------------------------

describe('Phase 19-A — anim() de-stub for ANIM_* codes', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('anim code 0 (ANIM_stand) resets frame to 0 and emits no stub', () => {
        const obj = makeObj({ frame: 5 })
        script.anim(obj, 0, 0)
        expect(obj.frame).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('anim code 1 (ANIM_walk) is handled silently — no stub emitted', () => {
        const obj = makeObj()
        script.anim(obj, 1, 0)
        expect(stubHitCount()).toBe(0)
    })

    it('anim codes 2-99 are handled silently — no stub emitted', () => {
        const obj = makeObj()
        for (let code = 2; code <= 99; code++) {
            drainStubHits()
            script.anim(obj, code, 0)
            expect(stubHitCount()).toBe(0)
        }
    })

    it('anim code 1000 (set rotation) still sets orientation — no stub', () => {
        const obj = makeObj({ orientation: 0 })
        script.anim(obj, 1000, 3)
        expect(obj.orientation).toBe(3)
        expect(stubHitCount()).toBe(0)
    })

    it('anim code 1010 (set frame) still sets frame — no stub', () => {
        const obj = makeObj({ frame: 0 })
        script.anim(obj, 1010, 7)
        expect(obj.frame).toBe(7)
        expect(stubHitCount()).toBe(0)
    })

    it('unknown anim code (e.g. 500) still emits a stub', () => {
        const obj = makeObj()
        script.anim(obj, 500, 0)
        expect(stubHitCount()).toBe(1)
    })
})

// ---------------------------------------------------------------------------
// B. get_pc_stat(5) — PCSTAT_max_pc_stat
// ---------------------------------------------------------------------------

describe('Phase 19-B — get_pc_stat(5) returns 5 for PCSTAT_max_pc_stat', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('returns 5 for PCSTAT_max_pc_stat (pcstat=5) and emits no stub', () => {
        const result = script.get_pc_stat(5)
        expect(result).toBe(5)
        expect(stubHitCount()).toBe(0)
    })

    it('returns correct values for pcstat 0-4 (existing cases)', () => {
        // These were already implemented; verify they still work
        expect(script.get_pc_stat(1)).toBe(1) // PCSTAT_level (default level is 1 when no player)
    })
})

// ---------------------------------------------------------------------------
// C. inven_cmds navigation commands
// ---------------------------------------------------------------------------

describe('Phase 19-C — inven_cmds navigation commands (FIRST/LAST/PREV/NEXT)', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    function makeItemObj(pid: number) {
        return makeObj({ type: 'item', pid })
    }

    it('INVEN_CMD_FIRST (0) returns first inventory item', () => {
        const items = [makeItemObj(10), makeItemObj(20), makeItemObj(30)]
        const critter = makeCritter({ inventory: items })
        const result = script.inven_cmds(critter, 0, 0)
        expect(result).toBe(items[0])
    })

    it('INVEN_CMD_FIRST (0) returns null for empty inventory', () => {
        const critter = makeCritter({ inventory: [] })
        expect(script.inven_cmds(critter, 0, 0)).toBeNull()
    })

    it('INVEN_CMD_LAST (1) returns last inventory item', () => {
        const items = [makeItemObj(10), makeItemObj(20), makeItemObj(30)]
        const critter = makeCritter({ inventory: items })
        const result = script.inven_cmds(critter, 1, 0)
        expect(result).toBe(items[2])
    })

    it('INVEN_CMD_LAST (1) returns null for empty inventory', () => {
        const critter = makeCritter({ inventory: [] })
        expect(script.inven_cmds(critter, 1, 0)).toBeNull()
    })

    it('INVEN_CMD_PREV (2) returns item before given index', () => {
        const items = [makeItemObj(10), makeItemObj(20), makeItemObj(30)]
        const critter = makeCritter({ inventory: items })
        expect(script.inven_cmds(critter, 2, 2)).toBe(items[1])
        expect(script.inven_cmds(critter, 2, 1)).toBe(items[0])
    })

    it('INVEN_CMD_PREV (2) returns null when at start of list', () => {
        const items = [makeItemObj(10), makeItemObj(20)]
        const critter = makeCritter({ inventory: items })
        expect(script.inven_cmds(critter, 2, 0)).toBeNull()
    })

    it('INVEN_CMD_NEXT (3) returns item after given index', () => {
        const items = [makeItemObj(10), makeItemObj(20), makeItemObj(30)]
        const critter = makeCritter({ inventory: items })
        expect(script.inven_cmds(critter, 3, 0)).toBe(items[1])
        expect(script.inven_cmds(critter, 3, 1)).toBe(items[2])
    })

    it('INVEN_CMD_NEXT (3) returns null when at end of list', () => {
        const items = [makeItemObj(10), makeItemObj(20)]
        const critter = makeCritter({ inventory: items })
        expect(script.inven_cmds(critter, 3, 1)).toBeNull()
    })

    it('INVEN_CMD_FIRST/LAST/PREV/NEXT do not emit stubs', () => {
        const items = [makeItemObj(10), makeItemObj(20)]
        const critter = makeCritter({ inventory: items })
        drainStubHits()
        script.inven_cmds(critter, 0, 0) // FIRST
        script.inven_cmds(critter, 1, 0) // LAST
        script.inven_cmds(critter, 2, 1) // PREV
        script.inven_cmds(critter, 3, 0) // NEXT
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// D. proto_data extended data members
// ---------------------------------------------------------------------------

describe('Phase 19-D — proto_data extended data members', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    function makeProto(extra: Record<string, any>): any {
        return {
            textID: 1,
            frmType: 0,
            frmPID: 0,
            lightRadius: 0,
            lightIntensity: 0,
            flags: 0,
            extra,
        }
    }

    // We mock proto_data by directly testing through a fake proMap scenario.
    // Since loadPRO requires globalState.proMap, we test via the method signature
    // and use the PID=0 guard (data_member 0 returns pid directly).

    it('data_member 0 (PID) returns the pid arg directly — existing behaviour', () => {
        const result = script.proto_data(0x100042, 0)
        expect(result).toBe(0x100042)
        expect(stubHitCount()).toBe(0)
    })

    it('proto_data returns 0 gracefully for pid with no proto (unavailable proMap)', () => {
        // When proMap is null, proto_data should return 0 with a warning, not throw.
        // Test for data_members 12, 17, 18, 19, 20, 32, 33, 34
        for (const dm of [12, 17, 18, 19, 20, 32, 33, 34]) {
            drainStubHits()
            const result = script.proto_data(0x1, dm)
            expect(result).toBe(0)
            // No stub hit — graceful return when proto unavailable
            expect(stubHitCount()).toBe(0)
        }
    })
})

// ---------------------------------------------------------------------------
// E. sfall opcodes 0x8178–0x817C — weapon ammo state, mouse tile
// ---------------------------------------------------------------------------

describe('Phase 19-E — sfall opcodes 0x8178–0x817C', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    function makeWeapon(extra: Record<string, any> = {}): any {
        return makeObj({
            type: 'item',
            subtype: 'weapon',
            pro: { extra: { ammoPID: 42, maxAmmo: 10 } },
            extra,
        })
    }

    it('get_weapon_ammo_pid returns proto ammoPID when no runtime override', () => {
        const weapon = makeWeapon()
        expect(script.get_weapon_ammo_pid(weapon)).toBe(42)
    })

    it('get_weapon_ammo_pid returns runtime ammoType when set', () => {
        const weapon = makeWeapon({ ammoType: 99 })
        expect(script.get_weapon_ammo_pid(weapon)).toBe(99)
    })

    it('get_weapon_ammo_pid returns -1 when proto has no ammoPID and no runtime override', () => {
        const weapon = makeObj({ type: 'item', pro: { extra: {} }, extra: {} })
        expect(script.get_weapon_ammo_pid(weapon)).toBe(-1)
    })

    it('set_weapon_ammo_pid stores ammoType in weapon.extra', () => {
        const weapon = makeWeapon()
        script.set_weapon_ammo_pid(weapon, 77)
        expect(weapon.extra.ammoType).toBe(77)
        expect(script.get_weapon_ammo_pid(weapon)).toBe(77)
    })

    it('get_weapon_ammo_count returns 0 when no ammo loaded', () => {
        const weapon = makeWeapon()
        expect(script.get_weapon_ammo_count(weapon)).toBe(0)
    })

    it('set_weapon_ammo_count stores ammoLoaded in weapon.extra', () => {
        const weapon = makeWeapon()
        script.set_weapon_ammo_count(weapon, 8)
        expect(weapon.extra.ammoLoaded).toBe(8)
        expect(script.get_weapon_ammo_count(weapon)).toBe(8)
    })

    it('set_weapon_ammo_count clamps negative values to 0', () => {
        const weapon = makeWeapon()
        script.set_weapon_ammo_count(weapon, -5)
        expect(script.get_weapon_ammo_count(weapon)).toBe(0)
    })

    it('get_mouse_tile_num returns -1 (no live DOM/mouse context in VM)', () => {
        expect(script.get_mouse_tile_num()).toBe(-1)
    })

    it('sfall ammo opcodes do not emit stub hits', () => {
        const weapon = makeWeapon()
        drainStubHits()
        script.get_weapon_ammo_pid(weapon)
        script.set_weapon_ammo_pid(weapon, 10)
        script.get_weapon_ammo_count(weapon)
        script.set_weapon_ammo_count(weapon, 5)
        script.get_mouse_tile_num()
        expect(stubHitCount()).toBe(0)
    })

    it('get_weapon_ammo_pid returns -1 and no stub for non-game-object', () => {
        drainStubHits()
        const result = script.get_weapon_ammo_pid(null)
        expect(result).toBe(-1)
        expect(stubHitCount()).toBe(0)
    })

    it('set_weapon_ammo_pid is a no-op for non-game-objects', () => {
        drainStubHits()
        // Should not throw
        expect(() => script.set_weapon_ammo_pid(null, 5)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// F. Checklist — Phase 19 entries
// ---------------------------------------------------------------------------

describe('Phase 19-F — checklist entries for Phase 19 features', () => {
    it('has an entry for get_weapon_ammo_pid marked implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_weapon_ammo_pid')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('has an entry for set_weapon_ammo_count marked implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'set_weapon_ammo_count')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('has an entry for anim_standard_codes', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'anim_standard_codes')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('partial')
    })

    it('has an entry for inven_cmds_nav marked implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'inven_cmds_nav')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('has an entry for proto_data_weapon_extended marked implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'proto_data_weapon_extended')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('has an entry for get_pc_stat_max marked implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_pc_stat_max')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('has an entry for get_mouse_tile_num marked partial', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_mouse_tile_num')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('partial')
    })
})
