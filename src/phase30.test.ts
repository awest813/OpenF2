/**
 * Phase 30 regression tests.
 *
 * Focus: combat edge-case fidelity around AP bonus integration and robust
 * called-shot region handling.
 */

import { describe, it, expect, vi } from 'vitest'
import { ActionPoints, Combat } from './combat.js'

describe('Phase 30-A — AP bonus integration', () => {
    it('ActionPoints.getMaxAP includes critter stat apBonus', () => {
        const critter: any = {
            getStat: vi.fn((name: string) => (name === 'AGI' ? 8 : 0)),
            stats: { apBonus: 2 },
        }
        const ap = new ActionPoints(critter)
        const max = ap.getMaxAP()
        // Base formula: 5 + ceil(AGI/2) + bonus
        expect(max.combat).toBe(5 + Math.ceil(8 / 2) + 2)
        expect(max.move).toBe(0)
    })
})

describe('Phase 30-B — unknown called-shot region safety', () => {
    function makeShooterAndTarget() {
        const shooter: any = {
            equippedWeapon: { weapon: { weaponSkillType: 'Small Guns' } },
            getSkill: vi.fn().mockReturnValue(80),
            getStat: vi.fn((name: string) => {
                if (name === 'PER') return 8
                if (name === 'Critical Chance') return 5
                return 0
            }),
            isPlayer: false,
            position: { x: 0, y: 0 },
        }
        const target: any = {
            getStat: vi.fn((name: string) => (name === 'AC' ? 10 : 0)),
            position: { x: 4, y: 0 },
        }
        return { shooter, target }
    }

    it('getHitChance falls back to torso modifiers for unknown regions', () => {
        const combat = Object.create(Combat.prototype) as Combat
        vi.spyOn(combat, 'getHitDistanceModifier').mockReturnValue(0)
        const { shooter, target } = makeShooterAndTarget()

        const torso = combat.getHitChance(shooter, target, 'torso')
        const unknown = combat.getHitChance(shooter, target, 'eye_socket_noncanonical')

        expect(unknown).toEqual(torso)
    })

    it('rollHit with unknown region does not throw', () => {
        const combat = Object.create(Combat.prototype) as Combat
        vi.spyOn(combat, 'getHitDistanceModifier').mockReturnValue(0)
        const { shooter, target } = makeShooterAndTarget()

        expect(() => combat.rollHit(shooter, target, 'eye_socket_noncanonical')).not.toThrow()
    })
})
