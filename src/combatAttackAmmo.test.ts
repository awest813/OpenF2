/**
 * Combat integration — empty ranged weapons produce a dry click instead of
 * an attack: no roll, no damage, no ammo consumed, and the turn-flow
 * callback still fires.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Combat } from './combat.js'

vi.mock('./player.js', () => ({ Player: class MockPlayer {} }))
vi.mock('./ui.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./ui.js')>()
    return { ...actual, uiStartCombat: vi.fn(), uiEndCombat: vi.fn(), uiLog: vi.fn() }
})
vi.mock('./critter.js', () => ({
    critterDamage: vi.fn(),
    critterKill: vi.fn(),
    Weapon: class {},
}))

function makeObj(overrides: Record<string, any> = {}): any {
    return {
        type: 'critter',
        name: 'TestNPC',
        position: { x: 5, y: 5 },
        orientation: 0,
        inventory: [],
        dead: false,
        pid: 100,
        hostile: false,
        teamNum: 1,
        charTraits: new Set<number>(),
        perkRanks: {},
        stats: { getBase: () => 5, setBase: () => {}, modifyBase: () => {}, get: () => 5, baseStats: {} },
        skills: { getBase: () => 0, setBase: () => {}, baseSkills: {}, skillPoints: 0 },
        getStat: (s: string) => s === 'HP' ? 30 : 5,
        staticAnimation: vi.fn((_: string, cb?: () => void) => { if (cb) {cb()} }),
        ...overrides,
    }
}

function makeCombat(): Combat {
    const combat = Object.create(Combat.prototype) as Combat
    combat.log = vi.fn()
    combat.nextTurn = vi.fn()
    combat.perish = vi.fn()
    combat.canEndCombat = vi.fn().mockReturnValue(false)
    vi.spyOn(combat, 'rollHit').mockReturnValue({ hit: true, crit: false, DM: 2, msgID: 0 } as any)
    vi.spyOn(combat, 'getDamageDone').mockReturnValue(7)
    vi.spyOn(combat, 'getHitChance').mockReturnValue({ hit: 80, crit: 5 })
    vi.spyOn(combat, 'getCombatMsg').mockReturnValue('')
    return combat
}

describe('Combat — empty ranged weapon dry click', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('attack() with an empty gun clicks: callback fires, no damage, no ammo change', () => {
        const combat = makeCombat()
        const attacker = makeObj({
            isPlayer: true,
            name: 'player',
            equippedWeapon: {
                name: '10mm Pistol',
                pro: { extra: { ammoPID: 40, maxAmmo: 12 } },
                extra: { ammoLoaded: 0 },
            },
        })
        const target = makeObj({ name: 'enemy' })
        const callback = vi.fn()

        combat.attack(attacker, target, 'torso', callback)

        expect(callback).toHaveBeenCalledTimes(1)
        expect(attacker.equippedWeapon.extra.ammoLoaded).toBe(0)
        expect(combat.rollHit).not.toHaveBeenCalled()
        expect(combat.nextTurn).not.toHaveBeenCalled()
    })

    it('attack() with a loaded gun consumes one round per trigger pull', () => {
        const combat = makeCombat()
        const attacker = makeObj({
            isPlayer: true,
            name: 'player',
            equippedWeapon: {
                name: '10mm Pistol',
                pro: { extra: { ammoPID: 40, maxAmmo: 12 } },
                extra: { ammoLoaded: 5 },
            },
        })
        const target = makeObj({ name: 'enemy' })

        combat.attack(attacker, target, 'torso')

        expect(attacker.equippedWeapon.extra.ammoLoaded).toBe(4)
        expect(combat.rollHit).toHaveBeenCalledTimes(1)
    })

    it('melee attacks are unaffected by the ammo check', () => {
        const combat = makeCombat()
        const attacker = makeObj({
            isPlayer: false,
            name: 'raider',
            equippedWeapon: { name: 'Knife', pro: { extra: {} } },
        })
        const target = makeObj({ name: 'enemy' })

        combat.attack(attacker, target, 'torso')

        expect(combat.rollHit).toHaveBeenCalledTimes(1)
        expect(attacker.staticAnimation).toHaveBeenCalled()
    })
})
