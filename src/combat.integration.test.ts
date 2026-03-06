import { describe, expect, it, vi, afterEach } from 'vitest'

vi.mock('./player.js', () => ({ Player: class MockPlayer {} }))
vi.mock('./ui.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./ui.js')>()
    return { ...actual, uiStartCombat: vi.fn(), uiEndCombat: vi.fn() }
})

import { ActionPoints, Combat } from './combat.js'
import { Config } from './config.js'
import { CriticalEffects } from './criticalEffects.js'
import { EventBus } from './eventBus.js'
import { CalledShotPanel } from './ui2/calledShotPanel.js'

afterEach(() => {
    vi.restoreAllMocks()
    EventBus.clear('calledShot:regionSelected')
})

describe('combat edge-case hardening', () => {
    it('walkUpTo spends exactly path-length minus one AP (walk-then-attack AP sync)', () => {
        const ap = {
            subtractMoveAP: vi.fn().mockReturnValue(true),
            getAvailableMoveAP: vi.fn().mockReturnValue(3),
        }
        const critter: any = {
            AP: ap,
            path: { path: [0, 1, 2, 3] },
            walkTo: vi.fn().mockReturnValue(true),
        }

        const combat = Object.create(Combat.prototype) as Combat
        const ok = combat.walkUpTo(critter, 0, { x: 10, y: 10 }, 3, () => {})

        expect(ok).toBe(true)
        expect(ap.subtractMoveAP).toHaveBeenCalledWith(3)
    })

    it('AI attack path bails safely when combat AP subtraction fails (desync guard)', () => {
        const AP = {
            getAvailableMoveAP: vi.fn().mockReturnValue(8),
            getAvailableCombatAP: vi.fn().mockReturnValue(4),
            subtractCombatAP: vi.fn().mockReturnValue(false),
        }

        const obj: any = {
            AP,
            ai: { info: { chance: 0, min_hp: -1 } },
            position: { x: 0, y: 0 },
            equippedWeapon: { weapon: { getMaximumRange: () => 10 } },
            getStat: vi.fn().mockReturnValue(100),
            clearAnim: vi.fn(),
            art: 'hmjmps',
        }
        const target: any = { position: { x: 0, y: 1 } }

        const combat = Object.create(Combat.prototype) as Combat
        combat.log = vi.fn()
        combat.findTarget = vi.fn().mockReturnValue(target)
        combat.attack = vi.fn()
        combat.nextTurn = vi.fn()
        combat.maybeTaunt = vi.fn()

        combat.doAITurn(obj, 0, 1)

        expect(AP.subtractCombatAP).toHaveBeenCalledWith(4)
        expect(combat.attack).not.toHaveBeenCalled()
        expect(combat.nextTurn).toHaveBeenCalledTimes(1)
    })

    it('AI recursion depth bailout advances turn instead of getting stuck', () => {
        const combat = Object.create(Combat.prototype) as Combat
        combat.nextTurn = vi.fn()

        const originalDepth = Config.combat.maxAIDepth
        Config.combat.maxAIDepth = 2
        try {
            combat.doAITurn({} as any, 0, 3)
        } finally {
            Config.combat.maxAIDepth = originalDepth
        }

        expect(combat.nextTurn).toHaveBeenCalledTimes(1)
    })
})

describe('called-shot combat + UI integration', () => {
    function makeShooterAndTarget() {
        const shooter: any = {
            equippedWeapon: { weapon: { weaponSkillType: 'Small Guns' } },
            getSkill: vi.fn().mockReturnValue(90),
            getStat: vi.fn((name: string) => {
                if (name === 'PER') return 8
                if (name === 'Critical Chance') return 5
                return 0
            }),
            isPlayer: true,
            position: { x: 0, y: 0 },
        }

        const target: any = {
            getStat: vi.fn((name: string) => {
                if (name === 'AC') return 15
                return 0
            }),
            position: { x: 1, y: 1 },
        }

        return { shooter, target }
    }

    it('selected region from CalledShotPanel yields expected hit/crit modifiers and UI state', () => {
        const panel = new CalledShotPanel(800, 600)
        const { shooter, target } = makeShooterAndTarget()
        const combat = Object.create(Combat.prototype) as Combat

        vi.spyOn(combat, 'getHitDistanceModifier').mockReturnValue(0)

        const torso = combat.getHitChance(shooter, target, 'torso')
        const head = combat.getHitChance(shooter, target, 'head')
        panel.openWith({ torso: torso.hit, head: head.hit })

        const picked: string[] = []
        EventBus.on('calledShot:regionSelected', ({ region }) => picked.push(region))

        // Click row 1 => "head"
        panel.onMouseDown(16 + 10, 46 + 28 + 10, 'l')

        expect(picked).toEqual(['head'])
        expect(panel.visible).toBe(false)
        expect(panel.hitChances.torso).toBe(torso.hit)
        expect(panel.hitChances.head).toBe(head.hit)

        const expectedHitDelta = CriticalEffects.regionHitChanceDecTable.head - CriticalEffects.regionHitChanceDecTable.torso
        expect(torso.hit - head.hit).toBe(expectedHitDelta)

        const expectedCritDelta = CriticalEffects.regionHitChanceDecTable.head - CriticalEffects.regionHitChanceDecTable.torso
        expect(head.crit - torso.crit).toBe(expectedCritDelta)
    })

    it('ActionPoints move spending borrows from combat AP without going negative', () => {
        const critter: any = {
            getStat: vi.fn().mockReturnValue(6),
            stats: {},
        }
        const ap = new ActionPoints(critter)
        ap.combat = 2
        ap.move = 1

        expect(ap.subtractMoveAP(3)).toBe(true)
        expect(ap.move).toBe(0)
        expect(ap.combat).toBe(0)
    })
})
