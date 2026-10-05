import { describe, it, expect, vi } from 'vitest'
import { ageMapOnReentry, BLOOD_PID, critterHealHours, crossedMidnight, isJammed, midnightCheck } from './mapAging.js'
import { TICKS_PER_DAY, TICKS_PER_HOUR } from './gameTime.js'

function critter(opts: { hp?: number; maxHp?: number; dead?: boolean; killType?: number; flags?: number; inv?: any[] } = {}) {
    const stats: Record<string, number> = { HP: opts.hp ?? 10, 'Max HP': opts.maxHp ?? 50 }
    return {
        type: 'critter',
        dead: opts.dead ?? false,
        killType: opts.killType ?? 0,
        pro: { extra: { flags: opts.flags ?? 0 } },
        position: { x: 5, y: 6 },
        inventory: opts.inv ?? [],
        combatManeuver: 0x04 | 0x01,
        getStat: (s: string) => stats[s],
        stats: { modifyBase: (s: string, n: number) => (stats[s] += n) },
    } as any
}

function deps() {
    const added: Array<[any, number]> = []
    const removed: any[] = []
    return {
        added,
        removed,
        createObject: vi.fn((pid: number) => ({ pid, type: 'misc' })),
        addObject: (obj: any, level: number) => added.push([obj, level]),
        removeObject: (obj: any) => removed.push(obj),
        random: () => 1,
    }
}

describe('map re-entry aging (_map_age_dead_critters)', () => {
    it('heals 14 HP per three whole hours away and stops fleeing', () => {
        const c = critter({ hp: 10, maxHp: 50 })
        ageMapOnReentry([[c]], 0, 7 * TICKS_PER_HOUR, true, deps())
        expect(c.getStat('HP')).toBe(10 + 14 * 2)
        expect(c.combatManeuver).toBe(0x01)
    })

    it('never heals past max HP', () => {
        const c = critter({ hp: 45, maxHp: 50 })
        critterHealHours(c, 30)
        expect(c.getStat('HP')).toBe(50)
    })

    it('does not heal robots or NO_HEAL critters, but still clears fleeing', () => {
        const robot = critter({ killType: 10 })
        const noHeal = critter({ flags: 0x200 })
        ageMapOnReentry([[robot, noHeal]], 0, 24 * TICKS_PER_HOUR, true, deps())
        expect(robot.getStat('HP')).toBe(10)
        expect(noHeal.getStat('HP')).toBe(10)
        expect(robot.combatManeuver & 0x04).toBe(0)
    })

    it('skips the player and maps whose dead bodies do not age', () => {
        const player = { ...critter(), isPlayer: true }
        const c = critter()
        ageMapOnReentry([[player, c]], 0, 24 * TICKS_PER_HOUR, false, deps())
        expect(c.getStat('HP')).toBe(10)
        ageMapOnReentry([[player]], 0, 24 * TICKS_PER_HOUR, true, deps())
        expect(player.getStat('HP')).toBe(10)
    })

    it('leaves corpses alone for six days', () => {
        const d = deps()
        ageMapOnReentry([[critter({ dead: true })]], 0, 6 * TICKS_PER_DAY, true, d)
        expect(d.removed).toHaveLength(0)
    })

    it('after six days replaces corpses with blood and drops their belongings', () => {
        const gun = { type: 'item', subtype: 'weapon' }
        const corpse = critter({ dead: true, inv: [gun] })
        corpse.rightHand = gun
        const d = deps()
        ageMapOnReentry([[], [corpse]], 0, 6 * TICKS_PER_DAY + TICKS_PER_HOUR, true, d)
        expect(d.removed).toEqual([corpse])
        expect(d.added[0]).toEqual([gun, 1])
        expect(gun).toMatchObject({ position: { x: 5, y: 6 } })
        const [blood, level] = d.added[1]
        expect(blood.pid).toBe(BLOOD_PID)
        expect(level).toBe(1)
        expect(blood.frame).toBe(1 + 3)
        expect(corpse.rightHand).toBeUndefined()
    })

    it('keeps NO_DROP belongings with the corpse and uses the flat blood frames', () => {
        const corpse = critter({ dead: true, flags: 0x40 | 0x800, inv: [{ type: 'item' }] })
        const d = deps()
        ageMapOnReentry([[corpse]], 0, 10 * TICKS_PER_DAY, true, d)
        expect(d.added).toHaveLength(1)
        expect(d.added[0][0].frame).toBe(1 + 6)
    })

    it('rats and mantids leave the small blood frames', () => {
        const d = deps()
        ageMapOnReentry([[critter({ dead: true, killType: 7 })]], 0, 10 * TICKS_PER_DAY, true, d)
        expect(d.added[0][0].frame).toBe(1)
    })

    it('unjams locks after a day away, even where bodies do not age', () => {
        const door = { type: 'scenery', subtype: 'door', lockJammed: true }
        ageMapOnReentry([[door]], 0, TICKS_PER_DAY - 1, false, deps())
        expect(isJammed(door)).toBe(true)
        ageMapOnReentry([[door]], 0, TICKS_PER_DAY, false, deps())
        expect(isJammed(door)).toBe(false)
    })
})

describe('midnight (gameTimeEventProcess)', () => {
    it('unjams every lock when the clock passes midnight', () => {
        const box = { type: 'item', subtype: 'container', lockJammed: true }
        midnightCheck(TICKS_PER_DAY - 10, TICKS_PER_DAY - 1, [[box]])
        expect(isJammed(box)).toBe(true)
        expect(crossedMidnight(TICKS_PER_DAY - 1, TICKS_PER_DAY)).toBe(true)
        midnightCheck(TICKS_PER_DAY - 1, TICKS_PER_DAY, [[box]])
        expect(isJammed(box)).toBe(false)
    })
})
