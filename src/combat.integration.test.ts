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
import { Critter } from './object.js'
import { CalledShotPanel } from './ui2/calledShotPanel.js'
import * as util from './util.js'

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
                if (name === 'PER') {return 8}
                if (name === 'Critical Chance') {return 5}
                return 0
            }),
            isPlayer: true,
            position: { x: 0, y: 0 },
        }

        const target: any = {
            getStat: vi.fn((name: string) => {
                if (name === 'AC') {return 15}
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

    it('ActionPoints rejects negative spend values as no-ops (no AP gain exploit)', () => {
        const critter: any = {
            getStat: vi.fn().mockReturnValue(6),
            stats: {},
        }
        const ap = new ActionPoints(critter)
        ap.combat = 4
        ap.move = 0

        expect(ap.subtractCombatAP(-2)).toBe(true)
        expect(ap.subtractMoveAP(-3)).toBe(true)
        expect(ap.combat).toBe(4)
        expect(ap.move).toBe(0)
    })

    it('ActionPoints grants Bonus Move AP as move-only budget', () => {
        const critter: any = {
            getStat: vi.fn().mockReturnValue(6),
            stats: {},
            perkRanks: { 1: 2 }, // Bonus Move rank 2 => +4 move AP
        }
        const ap = new ActionPoints(critter)
        const max = ap.getMaxAP()
        expect(max.move).toBe(4)
        expect(max.combat).toBe(5 + Math.ceil(6 / 2))
    })
})

describe('hit-chance fidelity regression tests', () => {
    function makeShooterTarget(overrides?: {
        shooter?: Record<string, unknown>
        target?: Record<string, unknown>
    }) {
        const shooter: any = {
            equippedWeapon: { weapon: { weaponSkillType: 'Small Guns' } },
            getSkill: vi.fn().mockReturnValue(80),
            getStat: vi.fn((name: string) => {
                if (name === 'PER') {return 8}
                if (name === 'Critical Chance') {return 5}
                return 0
            }),
            isPlayer: false,
            position: { x: 0, y: 0 },
            ...overrides?.shooter,
        }
        const target: any = {
            getStat: vi.fn((name: string) => (name === 'AC' ? 10 : 0)),
            position: { x: 10, y: 0 },
            visible: true,
            lightLevel: 100,
            ...overrides?.target,
        }
        return { shooter, target }
    }

    it('applies distance penalty at range and caps close-range penalty at zero', () => {
        const combat = Object.create(Combat.prototype) as Combat
        const weapon: any = {}
        const shooter: any = { getStat: vi.fn().mockReturnValue(8), isPlayer: false, position: { x: 0, y: 0 } }

        const closeTarget: any = { position: { x: 1, y: 0 } }
        const farTarget: any = { position: { x: 20, y: 0 } }

        expect(combat.getHitDistanceModifier(shooter, closeTarget, weapon)).toBe(0)
        expect(combat.getHitDistanceModifier(shooter, farTarget, weapon)).toBe(16)
    })

    it('keeps light/visibility fields from destabilizing hit chance until they are modeled', () => {
        const combat = Object.create(Combat.prototype) as Combat
        vi.spyOn(combat, 'getHitDistanceModifier').mockReturnValue(10)
        const { shooter, target } = makeShooterTarget()

        const baseline = combat.getHitChance(shooter, target, 'torso')
        target.visible = false
        target.lightLevel = 5
        const inDarkness = combat.getHitChance(shooter, target, 'torso')

        expect(inDarkness).toEqual(baseline)
    })

    it('reduces hit chance by target AC exactly', () => {
        const combat = Object.create(Combat.prototype) as Combat
        vi.spyOn(combat, 'getHitDistanceModifier').mockReturnValue(0)

        const lowAc = makeShooterTarget({ target: { getStat: vi.fn((name: string) => (name === 'AC' ? 5 : 0)) } })
        const highAc = makeShooterTarget({ target: { getStat: vi.fn((name: string) => (name === 'AC' ? 25 : 0)) } })

        const lowAcHit = combat.getHitChance(lowAc.shooter, lowAc.target, 'torso')
        const highAcHit = combat.getHitChance(highAc.shooter, highAc.target, 'torso')

        expect(lowAcHit.hit - highAcHit.hit).toBe(20)
    })

    it('called-shot region modifiers alter hit and crit in opposite directions', () => {
        const combat = Object.create(Combat.prototype) as Combat
        vi.spyOn(combat, 'getHitDistanceModifier').mockReturnValue(0)
        const { shooter, target } = makeShooterTarget()

        const torso = combat.getHitChance(shooter, target, 'torso')
        const eyes = combat.getHitChance(shooter, target, 'eyes')

        const regionPenaltyDelta =
            CriticalEffects.regionHitChanceDecTable.eyes - CriticalEffects.regionHitChanceDecTable.torso
        expect(torso.hit - eyes.hit).toBe(regionPenaltyDelta)
        expect(eyes.crit - torso.crit).toBe(regionPenaltyDelta)
    })

    it('returns unarmed fallback hit data when no weapon is equipped (BLK-053)', () => {
        const combat = Object.create(Combat.prototype) as Combat
        const { shooter, target } = makeShooterTarget({ shooter: { equippedWeapon: null } })
        // BLK-053: getHitChance now falls back to Unarmed skill instead of returning
        // {hit:-1, crit:-1}, so unarmed critters can actually fight.
        const result = combat.getHitChance(shooter, target, 'torso')
        expect(result.hit).not.toBe(-1)
        expect(typeof result.hit).toBe('number')
        expect(result.crit).not.toBe(-1)
    })

    it('clamps NaN hit chance to 0 (no throw — guard path hardened)', () => {
        const combat = Object.create(Combat.prototype) as Combat
        vi.spyOn(combat, 'getHitDistanceModifier').mockReturnValue(0)
        const { shooter, target } = makeShooterTarget({
            target: { getStat: vi.fn((name: string) => (name === 'AC' ? Number.NaN : 0)) },
        })

        // Previously threw; now warns and clamps hitChance to 0 so combat can continue.
        expect(() => combat.getHitChance(shooter, target, 'torso')).not.toThrow()
        const result = combat.getHitChance(shooter, target, 'torso')
        expect(result.hit).toBe(0)
    })

    it('applies -10 hit chance per intervening critter as partial cover', () => {
        const combat = Object.create(Combat.prototype) as Combat
        vi.spyOn(combat, 'getHitDistanceModifier').mockReturnValue(0)

        const shooter: any = {
            equippedWeapon: { weapon: { weaponSkillType: 'Small Guns' } },
            getSkill: vi.fn().mockReturnValue(80),
            getStat: vi.fn((name: string) => (name === 'Critical Chance' ? 5 : name === 'PER' ? 8 : 0)),
            position: { x: 0, y: 0 },
        }
        const target: any = {
            getStat: vi.fn((name: string) => (name === 'AC' ? 10 : 0)),
            position: { x: 2, y: 0 },
        }
        const blocker: any = { dead: false, position: { x: 1, y: 0 } }

        ;(combat as any).combatants = [shooter, target]
        const clearShot = combat.getHitChance(shooter, target, 'torso')

        ;(combat as any).combatants = [shooter, blocker, target]
        const blockedShot = combat.getHitChance(shooter, target, 'torso')

        expect(clearShot.hit - blockedShot.hit).toBe(10)
    })

    it('weapon range perks adjust distance penalty (normal/long/scope)', () => {
        const combat = Object.create(Combat.prototype) as Combat
        const shooter: any = { getStat: vi.fn().mockReturnValue(5), position: { x: 0, y: 0 }, perkRanks: {} }
        const farTarget: any = { position: { x: 30, y: 0 } }

        const normalWeapon: any = {}
        const longRangeWeapon: any = { pro: { extra: { perk: 1 } } } // long_range
        const scopeWeapon: any = { pro: { extra: { perk: 5 } } } // scope_range

        expect(combat.getHitDistanceModifier(shooter, farTarget, normalWeapon)).toBe(80)
        expect(combat.getHitDistanceModifier(shooter, farTarget, longRangeWeapon)).toBe(40)
        expect(combat.getHitDistanceModifier(shooter, farTarget, scopeWeapon)).toBe(20)
    })

    it('Fast Shot trait disables called-shot region penalties for ranged attacks', () => {
        const combat = Object.create(Combat.prototype) as Combat
        vi.spyOn(combat, 'getHitDistanceModifier').mockReturnValue(0)

        const shooter: any = {
            equippedWeapon: {
                pro: { extra: { attackMode: 6 } }, // fire single
                weapon: { weaponSkillType: 'Small Guns' },
            },
            charTraits: new Set([7]), // Fast Shot
            getSkill: vi.fn().mockReturnValue(90),
            getStat: vi.fn((name: string) => {
                if (name === 'PER') {return 8}
                if (name === 'Critical Chance') {return 5}
                return 0
            }),
            position: { x: 0, y: 0 },
        }
        const target: any = {
            getStat: vi.fn((name: string) => (name === 'AC' ? 10 : 0)),
            position: { x: 5, y: 0 },
        }

        const torso = combat.getHitChance(shooter, target, 'torso')
        const eyes = combat.getHitChance(shooter, target, 'eyes')
        expect(eyes).toEqual(torso)
    })
})

describe('critical and critical-miss parity regression tests', () => {
    it('does not roll a second crit chance yet (Sniper/Slayer TODO remains isolated)', () => {
        const combat = Object.create(Combat.prototype) as Combat
        const shooter: any = { getStat: vi.fn((n: string) => (n === 'Better Criticals' ? 0 : 0)) }
        const target: any = { killType: 'human', name: 'target' }

        vi.spyOn(combat, 'getHitChance').mockReturnValue({ hit: 80, crit: 30 })
        vi.spyOn(util, 'getRandomInt').mockReturnValue(10)
        const skillCheckSpy = vi
            .spyOn(util, 'rollSkillCheck')
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(true)

        const out = combat.rollHit(shooter, target, 'torso')
        expect(out).toEqual({ hit: true, crit: false })
        expect(skillCheckSpy).toHaveBeenCalledTimes(1)
    })

    it('critical miss check uses miss-margin rollSkillCheck path (jinxed/pariah follow-up not applied yet)', () => {
        const combat = Object.create(Combat.prototype) as Combat
        const shooter: any = { getStat: vi.fn().mockReturnValue(0) }
        const target: any = { killType: 'human', name: 'target' }

        vi.spyOn(combat, 'getHitChance').mockReturnValue({ hit: 20, crit: 0 })
        vi.spyOn(util, 'getRandomInt').mockReturnValue(95)
        const skillCheckSpy = vi.spyOn(util, 'rollSkillCheck').mockReturnValue(true)

        const out = combat.rollHit(shooter, target, 'torso')
        expect(out).toEqual({ hit: false, crit: true })
        expect(skillCheckSpy).toHaveBeenCalledWith(7.5, 0, false)
    })
})

describe('AP spend correctness regression tests', () => {
    it('AI turn spends AP for movement when out of range, then combat AP once in range', () => {
        const AP = {
            getAvailableMoveAP: vi.fn().mockReturnValue(10),
            getAvailableCombatAP: vi.fn().mockReturnValue(10),
            subtractMoveAP: vi.fn().mockReturnValue(true),
            subtractCombatAP: vi.fn().mockReturnValue(true),
        }

        const obj: any = {
            AP,
            ai: { info: { chance: 0, min_hp: -1 } },
            position: { x: 0, y: 0 },
            equippedWeapon: { weapon: { getMaximumRange: () => 1 } },
            getStat: vi.fn().mockReturnValue(100),
            clearAnim: vi.fn(),
            walkTo: vi.fn().mockImplementation((_to: any, _a: boolean, _cb: () => void) => true),
            path: { path: [0, 1, 2] },
            art: 'hmjmps',
        }

        const target: any = { position: { x: 0, y: 3 } }
        const combat = Object.create(Combat.prototype) as Combat
        combat.log = vi.fn()
        combat.findTarget = vi.fn().mockReturnValue(target)
        combat.attack = vi.fn()
        combat.nextTurn = vi.fn()
        combat.maybeTaunt = vi.fn()

        // Out of range: creep movement should consume move AP.
        combat.doAITurn(obj, 0, 1)
        expect(AP.subtractMoveAP).toHaveBeenCalledWith(2)

        // In range: attack should consume combat AP.
        obj.position = { x: 0, y: 2 }
        combat.doAITurn(obj, 0, 1)
        expect(AP.subtractCombatAP).toHaveBeenCalledWith(4)
    })

    it('advances turn when AI cannot find a movement path (invalid action cancellation)', () => {
        const AP = {
            getAvailableMoveAP: vi.fn().mockReturnValue(6),
            getAvailableCombatAP: vi.fn().mockReturnValue(6),
        }

        const obj: any = {
            AP,
            ai: { info: { chance: 0, min_hp: -1 } },
            position: { x: 0, y: 0 },
            equippedWeapon: { weapon: { getMaximumRange: () => 1 } },
            getStat: vi.fn().mockReturnValue(100),
            clearAnim: vi.fn(),
            walkTo: vi.fn().mockReturnValue(false),
            art: 'hmjmps',
        }

        const combat = Object.create(Combat.prototype) as Combat
        combat.log = vi.fn()
        combat.findTarget = vi.fn().mockReturnValue({ position: { x: 0, y: 3 } })
        combat.attack = vi.fn()
        combat.nextTurn = vi.fn()
        combat.maybeTaunt = vi.fn()

        const originalDepth = Config.combat.maxAIDepth
        Config.combat.maxAIDepth = 1
        try {
            combat.doAITurn(obj, 0, 1)
        } finally {
            Config.combat.maxAIDepth = originalDepth
        }

        expect(combat.attack).not.toHaveBeenCalled()
        expect(combat.nextTurn).toHaveBeenCalledTimes(1)
    })

    it('end-of-turn unused AP grants AC bonus that reduces attacker hit chance (FO2 parity)', () => {
        // H5 FIX: In Fallout 2, each unused AP at end of turn grants +1 AC.
        // StatSet.get('AC') returns baseAC + acBonus; getHitChance reads getStat('AC'),
        // so unused AP correctly makes the target harder to hit.
        const combat = Object.create(Combat.prototype) as Combat
        vi.spyOn(combat, 'getHitDistanceModifier').mockReturnValue(0)
        const shooter: any = {
            equippedWeapon: { weapon: { weaponSkillType: 'Small Guns' } },
            getSkill: vi.fn().mockReturnValue(70),
            getStat: vi.fn((name: string) => {
                if (name === 'Critical Chance') {return 5}
                return 0
            }),
            position: { x: 0, y: 0 },
        }
        // Simulate a target with 8 unused AP (adds 8 to AC via acBonus → getStat returns 20 vs 12)
        const makeTarget = (effectiveAC: number) => ({
            getStat: vi.fn((name: string) => (name === 'AC' ? effectiveAC : 0)),
            position: { x: 2, y: 0 },
        })

        const withBonus    = combat.getHitChance(shooter, makeTarget(20) as any, 'torso') // AC=12+8
        const withoutBonus = combat.getHitChance(shooter, makeTarget(12) as any, 'torso') // AC=12
        // Each extra AC point = 1% less hit chance
        expect(withoutBonus.hit - withBonus.hit).toBe(8)
    })
})

describe('combat turn scripting hooks (FO2 parity)', () => {
    it('combatEvent supports combatStart event with fixed_param = 0', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = {
            combat_p_proc: vi.fn(),
            scriptName: 'test_combat_start',
            _didOverride: false,
        }
        const obj: any = { _script: script }
        const result = Scripting.combatEvent(obj, 'combatStart')
        expect(script.combat_p_proc).toHaveBeenCalled()
        expect(script.fixed_param).toBe(0) // COMBAT_SUBTYPE_INITIATE
        expect(result).toBe(false) // no terminate, no override
    })

    it('combatEvent supports combatOver event with fixed_param = 3', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = {
            combat_p_proc: vi.fn(),
            scriptName: 'test_combat_over',
            _didOverride: false,
        }
        const obj: any = { _script: script }
        const result = Scripting.combatEvent(obj, 'combatOver')
        expect(script.combat_p_proc).toHaveBeenCalled()
        expect(script.fixed_param).toBe(3) // COMBAT_SUBTYPE_ENDCOMBAT
        expect(result).toBe(false)
    })

    it('combatEvent sets combat_is_initialized = 1 on combatStart', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = {
            combat_p_proc: vi.fn(),
            scriptName: 'test_init_flag',
            _didOverride: false,
        }
        const obj: any = { _script: script }
        Scripting.combatEvent(obj, 'combatStart')
        expect(script.combat_is_initialized).toBe(1)
    })

    it('getAttackAPCost returns 4 (default) for unarmed critters', () => {
        const combat = Object.create(Combat.prototype) as Combat
        const critter: any = { equippedWeapon: null }
        // Private method access for testing
        const cost = (combat as any).getAttackAPCost(critter)
        expect(cost).toBe(4)
    })

    it('getAttackAPCost reads weapon APCost1 when available', () => {
        const combat = Object.create(Combat.prototype) as Combat
        const critter: any = {
            equippedWeapon: {
                weapon: {
                    getAPCost: vi.fn().mockReturnValue(6), // minigun costs 6
                    weapon: { pro: { extra: { APCost1: 6 } } }
                }
            }
        }
        const cost = (combat as any).getAttackAPCost(critter)
        expect(cost).toBe(6)
    })

    it('getAttackAPCost applies Fast Shot -1 AP for ranged attacks', () => {
        const combat = Object.create(Combat.prototype) as Combat
        const critter: any = {
            charTraits: new Set([7]), // Fast Shot
            equippedWeapon: {
                pro: { extra: { attackMode: 6 } }, // fire single
                weapon: {
                    getAPCost: vi.fn().mockReturnValue(5),
                    weapon: { pro: { extra: { APCost1: 5 } } },
                },
            },
        }
        const cost = (combat as any).getAttackAPCost(critter)
        expect(cost).toBe(4)
    })

    it('constructor sorts combatants by Sequence for initiative order', () => {
        const makeCritter = (name: string, sequence: number, isPlayer = false): Critter => {
            const c = Object.create(Critter.prototype) as Critter
            ;(c as any).name = name
            ;(c as any).isPlayer = isPlayer
            ;(c as any).dead = false
            ;(c as any).visible = true
            ;(c as any).ai = isPlayer ? null : { info: { max_dist: 20 } }
            ;(c as any).stats = { apBonus: 0 }
            ;(c as any).position = { x: 0, y: 0 }
            ;(c as any).perkRanks = {}
            ;(c as any).charTraits = new Set()
            ;(c as any).getStat = vi.fn((stat: string) => (stat === 'Sequence' ? sequence : stat === 'AGI' ? 6 : 0))
            ;(c as any).clearAnim = vi.fn()
            return c
        }

        const low = makeCritter('low', 4, false)
        const player = makeCritter('player', 8, true)
        const high = makeCritter('high', 10, false)

        const combat = new Combat([low, player, high] as any)
        expect(combat.combatants.map((c) => c.name)).toEqual(['high', 'player', 'low'])
    })

    it('nextTurn skips stunned critters and clears flag (H6 knockdown turn-skip)', () => {
        const combat = Object.create(Combat.prototype) as Combat
        const player: any = {
            isPlayer: true, stats: { acBonus: 0 }, dead: false,
            AP: { resetAP: vi.fn(), getAvailableCombatAP: vi.fn().mockReturnValue(7) },
            position: { x: 0, y: 0 }, _script: undefined,
        }
        const stunnedNPC: any = {
            isPlayer: false, hostile: true, dead: false, stunned: true,
            stats: { acBonus: 0 }, teamNum: 1,
            AP: { resetAP: vi.fn(), getAvailableCombatAP: vi.fn().mockReturnValue(0) },
            ai: { info: { max_dist: 20 } },
            position: { x: 3, y: 0 }, _script: undefined,
        }
        combat.combatants = [player, stunnedNPC]
        combat.player = player
        combat.playerIdx = 0
        combat.whoseTurn = 0 // player's turn → nextTurn advances to NPC
        combat.turnNum = 1
        combat.inPlayerTurn = true

        combat.nextTurn()

        // The stunned NPC should have been skipped and flag cleared
        expect(stunnedNPC.stunned).toBe(false)
        // After the stunned NPC is skipped, it should wrap back to the player
        expect(combat.inPlayerTurn).toBe(true)
    })
})
