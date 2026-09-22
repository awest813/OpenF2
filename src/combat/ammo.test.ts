/**
 * Weapon ammo mechanics tests — consumption, dry clicks, and reload.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
    isRangedWeapon,
    getLoadedAmmo,
    weaponAmmoPid,
    weaponNeedsReload,
    consumeRounds,
    reloadWeapon,
} from './ammo.js'
import globalState from '../globalState.js'

function gun(overrides: Record<string, any> = {}): any {
    return {
        name: '10mm Pistol',
        pro: { extra: { ammoPID: 40, maxAmmo: 12 } },
        extra: { ammoLoaded: 12 },
        ...overrides,
    }
}

function critter(overrides: Record<string, any> = {}): any {
    return {
        name: 'tester',
        inventory: [],
        ...overrides,
    }
}

afterEach(() => {
    globalState.inCombat = false
})

describe('weapon classification', () => {
    it('classifies a ranged weapon by ammo PID + capacity', () => {
        expect(isRangedWeapon(gun())).toBe(true)
    })

    it('melee weapons and bare fists are not ranged', () => {
        expect(isRangedWeapon({ name: 'Knife', pro: { extra: {} } })).toBe(false)
        expect(isRangedWeapon(null)).toBe(false)
        expect(isRangedWeapon(undefined)).toBe(false)
    })

    it('weaponNeedsReload is true only for empty ranged weapons', () => {
        expect(weaponNeedsReload(gun())).toBe(false)
        expect(weaponNeedsReload(gun({ extra: { ammoLoaded: 0 } }))).toBe(true)
        expect(weaponNeedsReload({ name: 'Knife', pro: { extra: {} } })).toBe(false)
    })

    it('getLoadedAmmo treats unset/invalid state as empty', () => {
        expect(getLoadedAmmo(gun())).toBe(12)
        expect(getLoadedAmmo(gun({ extra: {} }))).toBe(0)
        expect(getLoadedAmmo(gun({ extra: { ammoLoaded: -3 } }))).toBe(0)
    })

    it('weaponAmmoPid prefers the loaded ammo type, then the proto requirement', () => {
        expect(weaponAmmoPid(gun())).toBe(40)
        expect(weaponAmmoPid(gun({ extra: { ammoLoaded: 5, ammoType: 41 } }))).toBe(41)
        expect(weaponAmmoPid(gun({ extra: { ammoLoaded: 5, ammoType: -1 } }))).toBe(40)
    })
})

describe('consumeRounds', () => {
    it('decrements the loaded count', () => {
        const w = gun({ extra: { ammoLoaded: 5 } })
        expect(consumeRounds(w, 1)).toBe(true)
        expect(getLoadedAmmo(w)).toBe(4)
    })

    it('refuses when fewer rounds are loaded than requested', () => {
        const w = gun({ extra: { ammoLoaded: 0 } })
        expect(consumeRounds(w, 1)).toBe(false)
        expect(getLoadedAmmo(w)).toBe(0)
    })
})

describe('reloadWeapon', () => {
    it('fills to capacity from a carried ammo stack', () => {
        const c = critter({ inventory: [{ pid: 40, name: '10mm round', amount: 24 }] })
        const w = gun({ extra: { ammoLoaded: 0 } })
        const result = reloadWeapon(c as any, w)
        expect(result.loaded).toBe(12)
        expect(getLoadedAmmo(w)).toBe(12)
        // 12 rounds remain in the stack.
        expect(c.inventory).toHaveLength(1)
        expect(c.inventory[0].amount).toBe(12)
    })

    it('consumes the whole stack when it exactly covers the remainder', () => {
        const c = critter({ inventory: [{ pid: 40, name: '10mm round', amount: 2 }] })
        const w = gun({ extra: { ammoLoaded: 10 } })
        const result = reloadWeapon(c as any, w)
        expect(result.loaded).toBe(2)
        expect(c.inventory).toHaveLength(0)
    })

    it('keeps the remainder in the stack when it exceeds capacity space', () => {
        const c = critter({ inventory: [{ pid: 40, name: '10mm round', amount: 5 }] })
        const w = gun({ extra: { ammoLoaded: 10 } })
        const result = reloadWeapon(c as any, w)
        expect(result.loaded).toBe(2)
        expect(c.inventory).toHaveLength(1)
        expect(c.inventory[0].amount).toBe(3)
    })

    it('stops at weapon capacity and keeps the remainder', () => {
        const c = critter({ inventory: [{ pid: 40, amount: 3 }] })
        const w = gun({ extra: { ammoLoaded: 12 } })
        expect(reloadWeapon(c as any, w).reason).toBe('full')
    })

    it('reports no-ammo when nothing matches the weapon PID', () => {
        const c = critter({ inventory: [{ pid: 41, amount: 30 }] })
        const w = gun({ extra: { ammoLoaded: 0 } })
        expect(reloadWeapon(c as any, w)).toMatchObject({ loaded: 0, reason: 'no-ammo' })
    })

    it('reports full without touching inventory when already loaded', () => {
        const c = critter({ inventory: [{ pid: 40, amount: 24 }] })
        const w = gun({ extra: { ammoLoaded: 12 } })
        expect(reloadWeapon(c as any, w).reason).toBe('full')
        expect(c.inventory[0].amount).toBe(24)
    })

    it('is free out of combat (no AP ledger interaction)', () => {
        globalState.inCombat = false
        const ap = { getAvailableCombatAP: vi.fn(() => 0), subtractCombatAP: vi.fn() }
        const c = critter({ inventory: [{ pid: 40, amount: 24 }], AP: ap })
        const w = gun({ extra: { ammoLoaded: 0 } })
        expect(reloadWeapon(c as any, w).loaded).toBe(12)
        expect(ap.subtractCombatAP).not.toHaveBeenCalled()
    })

    it('charges 2 AP in combat when the AP ledger is available', () => {
        globalState.inCombat = true
        const ap = { getAvailableCombatAP: vi.fn(() => 5), subtractCombatAP: vi.fn() }
        const c = critter({ inventory: [{ pid: 40, amount: 24 }], AP: ap })
        const w = gun({ extra: { ammoLoaded: 0 } })
        expect(reloadWeapon(c as any, w).loaded).toBe(12)
        expect(ap.subtractCombatAP).toHaveBeenCalledWith(2)
    })

    it('refuses in combat when AP is insufficient', () => {
        globalState.inCombat = true
        const ap = { getAvailableCombatAP: vi.fn(() => 1), subtractCombatAP: vi.fn() }
        const c = critter({ inventory: [{ pid: 40, amount: 24 }], AP: ap })
        const w = gun({ extra: { ammoLoaded: 0 } })
        expect(reloadWeapon(c as any, w)).toMatchObject({ loaded: 0, reason: 'no-ap' })
        expect(ap.subtractCombatAP).not.toHaveBeenCalled()
    })
})
