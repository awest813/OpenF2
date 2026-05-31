import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'

vi.mock('./player.js', () => ({ Player: class MockPlayer {} }))
vi.mock('./ui.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./ui.js')>()
    return { ...actual, uiStartCombat: vi.fn(), uiEndCombat: vi.fn(), uiLog: vi.fn() }
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
        expect(max.combat).toBe(5 + Math.floor(6 / 2))
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

    it('combatEvent supports onAttack event with fixed_param = 1', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = {
            combat_p_proc: vi.fn(),
            scriptName: 'test_on_attack',
            _didOverride: false,
        }
        const attacker: any = { _script: script, name: 'Attacker' }
        const target: any = { _script: null, name: 'Target' }
        const result = Scripting.combatEvent(attacker, 'onAttack', target)
        expect(script.combat_p_proc).toHaveBeenCalled()
        expect(script.fixed_param).toBe(1) // COMBAT_SUBTYPE_ATTACK
        expect(script.target_obj).toBe(target)
        expect(result).toBe(false)
    })

    it('combatEvent supports onDeath event with fixed_param = 5', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = {
            combat_p_proc: vi.fn(),
            scriptName: 'test_on_death',
            _didOverride: false,
        }
        const victim: any = { _script: script, name: 'Victim' }
        const killer: any = { _script: null, name: 'Killer' }
        const result = Scripting.combatEvent(victim, 'onDeath', undefined, killer)
        expect(script.combat_p_proc).toHaveBeenCalled()
        expect(script.fixed_param).toBe(5) // COMBAT_SUBTYPE_DEATH
        expect(script.source_obj).toBe(killer)
        expect(result).toBe(false)
    })

    it('combatEvent sets target_obj on onAttack when provided', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = {
            combat_p_proc: vi.fn(),
            scriptName: 'test_target_obj',
            _didOverride: false,
        }
        const attacker: any = { _script: script }
        const target: any = { _script: null, name: 'SomeTarget' }
        Scripting.combatEvent(attacker, 'onAttack', target)
        expect(script.target_obj).toBe(target)
    })

    it('combatEvent does not override target_obj when not provided', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = {
            combat_p_proc: vi.fn(),
            scriptName: 'test_no_target',
            _didOverride: false,
        }
        const obj: any = { _script: script }
        script.target_obj = 'previousValue'
        Scripting.combatEvent(obj, 'combatStart')
        // combatStart does not pass targetObj, so target_obj should remain unchanged
        expect(script.target_obj).toBe('previousValue')
    })

    it('Scripting.damage sets fixed_param to the damage amount', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = {
            damage_p_proc: vi.fn(),
            scriptName: 'test_damage_fp',
        }
        const obj: any = { _script: script }
        const source: any = { _script: null }
        Scripting.damage(obj, obj, source, 42)
        expect(script.fixed_param).toBe(42)
    })

    it('Scripting.damage sets fixed_param to 0 for non-finite damage', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = {
            damage_p_proc: vi.fn(),
            scriptName: 'test_damage_nan',
        }
        const obj: any = { _script: script }
        Scripting.damage(obj, obj, null as any, NaN)
        expect(script.fixed_param).toBe(0)
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

describe('Phase 102: Combat Mechanics Polish', () => {
    it('applies lighting penalty which is mitigated by Night Vision perk', () => {
        const combat = Object.create(Combat.prototype) as Combat
        vi.spyOn(combat, 'getHitDistanceModifier').mockReturnValue(0)
        vi.spyOn(combat, 'accountForPartialCover').mockReturnValue(0)

        const shooterNormal: any = { getSkill: () => 80, getStat: () => 0, perkRanks: {} }
        const shooterNightVision: any = { getSkill: () => 80, getStat: () => 0, perkRanks: { 12: 1 } } // Rank 1
        
        const brightTarget: any = { getStat: () => 0, lightLevel: 100 }
        const darkTarget: any = { getStat: () => 0, lightLevel: 0 }
        
        // Base bright hit chance
        const brightHit = combat.getHitChance(shooterNormal, brightTarget, 'torso').hit
        // Base dark hit chance
        const darkHit = combat.getHitChance(shooterNormal, darkTarget, 'torso').hit
        
        // Night Vision dark hit chance
        const nvHit = combat.getHitChance(shooterNightVision, darkTarget, 'torso').hit

        // Darkness should reduce hit chance (penalty = 40%)
        expect(brightHit - darkHit).toBe(40)
        // Night Vision rank 1 mitigates 20% of the penalty
        expect(nvHit - darkHit).toBe(20)
    })

    it('Finesse trait and More Criticals perk properly increase crit chance', () => {
        const combat = Object.create(Combat.prototype) as Combat
        vi.spyOn(combat, 'getHitDistanceModifier').mockReturnValue(0)
        vi.spyOn(combat, 'accountForPartialCover').mockReturnValue(0)

        const normal: any = { getSkill: () => 80, getStat: (n: string) => n === 'Critical Chance' ? 5 : 0, perkRanks: {}, charTraits: new Set() }
        const finesse: any = { getSkill: () => 80, getStat: (n: string) => n === 'Critical Chance' ? 5 : 0, perkRanks: {}, charTraits: new Set([4]) } // Finesse = ID 4
        const moreCrits: any = { getSkill: () => 80, getStat: (n: string) => n === 'Critical Chance' ? 5 : 0, perkRanks: { 7: 2 }, charTraits: new Set() } // More Crits Rank 2 = +10%

        const target: any = { getStat: () => 0 }

        const normalCrit = combat.getHitChance(normal, target, 'torso').crit
        const finesseCrit = combat.getHitChance(finesse, target, 'torso').crit
        const moreCritsCrit = combat.getHitChance(moreCrits, target, 'torso').crit

        // Normal base = 5%
        expect(normalCrit).toBe(5)
        // Finesse = +10%
        expect(finesseCrit).toBe(15)
        // More Crits Rank 2 = +10%
        expect(moreCritsCrit).toBe(15)
    })

    it('AI Flee logic finds the closest map edge', () => {
        const combat = Object.create(Combat.prototype) as Combat
        combat.log = vi.fn()
        combat.maybeTaunt = vi.fn()
        combat.findTarget = vi.fn().mockReturnValue({ position: { x: 50, y: 50 } })
        combat.walkUpTo = vi.fn().mockImplementation((obj, idx, targetPos) => {
            obj._lastWalkPos = targetPos
            return true
        })

        const makeCritterAt = (x: number, y: number): any => ({
            getStat: (n: string) => n === 'HP' ? 5 : 0,
            ai: { info: { min_hp: 10 } }, // Force flee
            position: { x, y },
            clearAnim: vi.fn(),
            AP: { getAvailableMoveAP: () => 10, subtractMoveAP: vi.fn() }
        })

        const nearLeft = makeCritterAt(10, 100)
        combat.doAITurn(nearLeft, 0, 1)
        expect(nearLeft._lastWalkPos).toEqual({ x: 0, y: 100 })

        const nearRight = makeCritterAt(180, 50)
        combat.doAITurn(nearRight, 0, 1)
        expect(nearRight._lastWalkPos).toEqual({ x: 200, y: 50 })

        const nearTop = makeCritterAt(100, 10)
        combat.doAITurn(nearTop, 0, 1)
        expect(nearTop._lastWalkPos).toEqual({ x: 100, y: 0 })

        const nearBottom = makeCritterAt(50, 180)
        combat.doAITurn(nearBottom, 0, 1)
        expect(nearBottom._lastWalkPos).toEqual({ x: 50, y: 200 })
    })

    it('AI findTarget heuristic targets heavily injured enemies over slightly closer healthy ones', () => {
        const combat = Object.create(Combat.prototype) as Combat
        const obj: any = { position: { x: 0, y: 0 }, teamNum: 1 }

        const healthyNearTarget: any = {
            dead: false, teamNum: 2, position: { x: 5, y: 0 }, // dist = 5
            getStat: (n: string) => n === 'HP' ? 50 : n === 'Max HP' ? 50 : 0
        }

        const dyingFarTarget: any = {
            dead: false, teamNum: 2, position: { x: 7, y: 0 }, // dist = 7
            getStat: (n: string) => n === 'HP' ? 5 : n === 'Max HP' ? 50 : 0 // 10% health -> discount by 3 -> effective dist 4
        }

        combat.combatants = [healthyNearTarget, dyingFarTarget]
        const target = combat.findTarget(obj)
        
        // Dying target's effective distance is 4 (7 - 3), so it is preferred over healthy target (dist 5)
        expect(target).toBe(dyingFarTarget)
    })
})

describe('Phase 103: Combat Parity Completion', () => {
    it('Sniper and Slayer roll Luck * 10 for automatic critical hits', async () => {
        const combat = Object.create(Combat.prototype) as Combat
        vi.spyOn(combat, 'getHitChance').mockReturnValue({ hit: 100, crit: 0 })
        // Force random int to be 85
        vi.spyOn(await import('./util.js'), 'getRandomInt').mockReturnValue(85)
        vi.spyOn(await import('./util.js'), 'rollSkillCheck').mockReturnValue(false)

        const makeShooter = (luk: number, isRanged: boolean, sniper: number, slayer: number): any => ({
            getStat: (n: string) => n === 'LUK' ? luk : 0,
            perkRanks: { 9: sniper, 10: slayer },
            equippedWeapon: {},
            charTraits: new Set(),
            killType: 'human'
        })

        // isRangedPrimaryAttack relies on attackMode
        vi.spyOn(combat as any, 'isRangedPrimaryAttack').mockImplementation((obj: any) => obj._isRanged)
        combat.log = vi.fn()

        const target: any = { killType: 'human', getStat: () => 0 }

        // Luck 9, Ranged, Sniper rank 1: Luck*10 = 90. Roll is 85. 85 <= 90 -> CRIT
        const shooter1 = makeShooter(9, true, 1, 0)
        shooter1._isRanged = true
        expect(combat.rollHit(shooter1, target, 'torso').crit).toBe(true)

        // Luck 8, Ranged, Sniper rank 1: Luck*10 = 80. Roll is 85. 85 > 80 -> NO CRIT
        const shooter2 = makeShooter(8, true, 1, 0)
        shooter2._isRanged = true
        expect(combat.rollHit(shooter2, target, 'torso').crit).toBe(false)

        // Luck 9, Melee, Slayer rank 1: Luck*10 = 90. Roll is 85. 85 <= 90 -> CRIT
        const shooter3 = makeShooter(9, false, 0, 1)
        shooter3._isRanged = false
        expect(combat.rollHit(shooter3, target, 'torso').crit).toBe(true)
    })

    it('Ammo AC modifier affects hit chance and One Hander alters hit chance based on twoHanded flag', () => {
        const combat = Object.create(Combat.prototype) as Combat
        vi.spyOn(combat, 'getHitDistanceModifier').mockReturnValue(0)
        vi.spyOn(combat, 'accountForPartialCover').mockReturnValue(0)

        // Unarmed
        const unarmedShooter: any = { getSkill: () => 80, getStat: () => 0, perkRanks: {}, charTraits: new Set([3]) }
        // One Hander equipped with 1H weapon -> +20
        const oneHWeaponShooter: any = { 
            getSkill: () => 80, getStat: () => 0, perkRanks: {}, charTraits: new Set([3]), 
            equippedWeapon: { weapon: { weaponSkillType: 'Small Guns', weapon: { pro: { extra: { twoHanded: 0, acModifier: 15 } } } } } 
        }
        // One Hander equipped with 2H weapon -> -40
        const twoHWeaponShooter: any = { 
            getSkill: () => 80, getStat: () => 0, perkRanks: {}, charTraits: new Set([3]), 
            equippedWeapon: { weapon: { weaponSkillType: 'Small Guns', weapon: { pro: { extra: { twoHanded: 1 } } } } } 
        }

        const target: any = { getStat: () => 0 } // AC 0

        const unarmedHit = combat.getHitChance(unarmedShooter, target, 'torso').hit
        const oneHHit = combat.getHitChance(oneHWeaponShooter, target, 'torso').hit
        const twoHHit = combat.getHitChance(twoHWeaponShooter, target, 'torso').hit

        // Unarmed: no bonus. 80 base.
        expect(unarmedHit).toBe(80)
        // oneHHit: +20 trait, -15 ammo AC Mod = +5 net. -> 85 base
        expect(oneHHit).toBe(85)
        // twoHHit: -40 trait, 0 ammo AC mod = -40 net. -> 40 base
        expect(twoHHit).toBe(40)
    })

    it('Heavy Handed and Bonus Damage traits apply flat damage appropriately', async () => {
        const combat = Object.create(Combat.prototype) as Combat
        vi.spyOn(await import('./util.js'), 'getRandomInt').mockReturnValue(10) // Raw roll = 10
        vi.spyOn(combat as any, 'isRangedPrimaryAttack').mockImplementation((obj: any) => obj._isRanged)

        const makeAttacker = (isRanged: boolean, bonusRanged: number, bonusHth: number, heavyHanded: boolean): any => ({
            equippedWeapon: { weapon: { getDamageType: () => 'Normal', minDmg: 10, maxDmg: 10 } },
            perkRanks: { 3: bonusRanged, 4: bonusHth },
            charTraits: new Set(heavyHanded ? [6] : []),
            _isRanged: isRanged
        })

        const target: any = { getStat: () => 0 } // 0 DT, 0 DR

        // Normal Melee: raw 10 * 1 = 10 final
        const normalMelee = makeAttacker(false, 0, 0, false)
        expect(combat.getDamageDone(normalMelee, target, 2)).toBe(10)

        // Heavy Handed Melee: raw 10 + 4 = 14 final
        const hhMelee = makeAttacker(false, 0, 0, true)
        expect(combat.getDamageDone(hhMelee, target, 2)).toBe(14)

        // Bonus HtH rank 2: raw 10 + 4 = 14 final
        const bonusHthMelee = makeAttacker(false, 0, 2, false)
        expect(combat.getDamageDone(bonusHthMelee, target, 2)).toBe(14)

        // Bonus Ranged rank 1: raw 10 + 2 = 12 final
        const bonusRanged = makeAttacker(true, 1, 0, false)
        expect(combat.getDamageDone(bonusRanged, target, 2)).toBe(12)
    })
})

describe('Phase 104: Combat Scripting Hooks and AI Turns', () => {
    it('fires turnBegin combatEvent on NPCs and skips turn if script overrides', async () => {
        const combat = Object.create(Combat.prototype) as Combat
        const player = { isPlayer: true, AP: { getAvailableCombatAP: () => 0, resetAP: vi.fn() }, stats: { acBonus: 0 } }
        
        let override = true
        const npc: any = { 
            name: 'TestNPC',
            isPlayer: false, 
            dead: false,
            hostile: true,
            teamNum: 2,
            position: { x: 0, y: 0 },
            AP: { getAvailableCombatAP: () => 0, resetAP: vi.fn() },
            stats: { acBonus: 0 },
            _script: {} 
        }

        combat.combatants = [player, npc] as Critter[]
        combat.playerIdx = 0
        combat.player = player as Critter
        combat.turnNum = 1
        combat.whoseTurn = 0 // Player's turn is over, now it's NPC's turn
        
        vi.spyOn(Config.engine, 'doLoadScripts', 'get').mockReturnValue(true)
        const { Scripting } = await import('./scripting.js')
        const updateCritterSpy = vi.spyOn(Scripting, 'updateCritter').mockImplementation(() => {})
        const combatEventSpy = vi.spyOn(Scripting, 'combatEvent').mockImplementation(() => override)
        combat.doAITurn = vi.fn()
        combat.end = vi.fn() // prevent infinite loop if nextTurn recurses too deep

        // Case 1: Script overrides turn
        combat.nextTurn()
        // It should have fired updateCritter and combatEvent for NPC
        expect(updateCritterSpy).toHaveBeenCalledWith(npc._script, npc)
        expect(combatEventSpy).toHaveBeenCalledWith(npc, 'turnBegin')
        // It should have skipped doAITurn!
        expect(combat.doAITurn).not.toHaveBeenCalled()
        
        // Reset and Case 2: Script does NOT override turn
        override = false
        combat.whoseTurn = 0
        combat.doAITurn = vi.fn()
        updateCritterSpy.mockClear()
        combatEventSpy.mockClear()

        combat.nextTurn()
        expect(updateCritterSpy).toHaveBeenCalledWith(npc._script, npc)
        expect(combatEventSpy).toHaveBeenCalledWith(npc, 'turnBegin')
        // It should NOT have skipped doAITurn!
        expect(combat.doAITurn).toHaveBeenCalledWith(npc, 1, 1)
    })
})

describe('Phase 105: Combat End Conditions and Flee Mechanics', () => {
    it('allows combat to end if only allied NPCs remain', async () => {
        const globalStateMod = await import('./globalState.js')
        const globalState = globalStateMod.default
        const combat = Object.create(Combat.prototype) as Combat
        const player = { isPlayer: true, teamNum: 0 } as unknown as Player
        const ally = { isPlayer: false, teamNum: 0, dead: false } as Critter
        const enemy = { isPlayer: false, teamNum: 1, dead: true } as Critter
        
        // Mock globalState
        globalState.player = player
        
        combat.combatants = [player, ally, enemy]
        combat.player = player
        
        expect(combat.canEndCombat()).toBe(true)
        
        // If enemy is alive, it shouldn't end
        enemy.dead = false
        expect(combat.canEndCombat()).toBe(false)
    })
    
    it('escapes from combat when fleeing AI reaches map edge', () => {
        const combat = Object.create(Combat.prototype) as Combat
        const obj = { 
            name: 'FleeingNPC',
            isPlayer: false, 
            getStat: () => 10, // HP
            ai: { info: { min_hp: 20 } }, // fleeing condition met
            position: { x: 2, y: 100 }, // minEdgeDist = 2 (<= 2)
            dead: false,
            visible: true,
            AP: { getAvailableMoveAP: () => 10 }
        } as unknown as Critter

        const enemy = {
            isPlayer: false,
            teamNum: 1,
            dead: false,
            hostile: true,
            position: { x: 50, y: 50 },
            getStat: () => 10,
        } as unknown as Critter

        combat.combatants = [obj, enemy]
        combat.log = vi.fn()
        combat.maybeTaunt = vi.fn()
        combat.nextTurn = vi.fn()
        
        combat.doAITurn(obj, 0, 1)
        
        expect(combat.log).toHaveBeenCalledWith('[AI ESCAPED] FleeingNPC reached map edge')
        expect(obj.dead).toBe(true)
        expect(obj.visible).toBe(false)
        expect(combat.nextTurn).toHaveBeenCalled()
    })
})

describe('Phase 106: Combat Parity Audits, Jinxed / Pariah Dog effects, and Flee Walkability', () => {
    it('Jinxed trait on any combatant globally upgrades misses', async () => {
        const combat = Object.create(Combat.prototype) as Combat
        combat.player = { isPlayer: true, charTraits: new Set() } as any
        
        const attacker = {
            isPlayer: false,
            charTraits: new Set(), // attacker is NOT jinxed
            getStat: vi.fn().mockReturnValue(0)
        } as any
        
        const jinxedAlly = {
            isPlayer: false,
            charTraits: new Set([9]), // Jinxed!
            getStat: vi.fn().mockReturnValue(0)
        } as any
        
        const target = { killType: 'human', name: 'target' } as any
        
        combat.combatants = [attacker, jinxedAlly]
        
        vi.spyOn(combat, 'getHitChance').mockReturnValue({ hit: 20, crit: 0 })
        vi.spyOn(util, 'getRandomInt').mockReturnValue(95) // Roll 95 > hit 20 => Miss
        vi.spyOn(util, 'rollSkillCheck').mockReturnValue(false) // regular miss
        
        // Mock getRandomInt inside the jinxed 50% check to return 25 (<= 50) => Critical Miss!
        const randomIntSpy = vi.spyOn(util, 'getRandomInt')
            .mockReturnValueOnce(95) // first roll in rollHit (roll = 95)
            .mockReturnValueOnce(25) // second roll in jinxed check (25 <= 50)
            
        const out = combat.rollHit(attacker, target, 'torso')
        expect(out).toEqual({ hit: false, crit: true })
        randomIntSpy.mockRestore()
    })
    
    it('Pariah Dog companion presence globally upgrades misses', async () => {
        const globalStateMod = await import('./globalState.js')
        const globalState = globalStateMod.default
        const combat = Object.create(Combat.prototype) as Combat
        
        const attacker = {
            isPlayer: false,
            charTraits: new Set(),
            getStat: vi.fn().mockReturnValue(0)
        } as any
        
        // Pariah dog as a combatant
        const pariahDog = {
            isPlayer: false,
            pid: 16777413,
            charTraits: new Set(),
            getStat: vi.fn().mockReturnValue(0)
        } as any
        
        const target = { killType: 'human', name: 'target' } as any
        
        combat.combatants = [attacker, pariahDog]
        combat.player = { isPlayer: true, charTraits: new Set() } as any
        
        vi.spyOn(combat, 'getHitChance').mockReturnValue({ hit: 20, crit: 0 })
        vi.spyOn(util, 'getRandomInt').mockReturnValue(95) // Roll 95 => Miss
        vi.spyOn(util, 'rollSkillCheck').mockReturnValue(false)
        
        const randomIntSpy = vi.spyOn(util, 'getRandomInt')
            .mockReturnValueOnce(95) // first roll
            .mockReturnValueOnce(25) // second roll (<= 50)
            
        const out = combat.rollHit(attacker, target, 'torso')
        expect(out).toEqual({ hit: false, crit: true })
        randomIntSpy.mockRestore()
    })
    
    it('fleeing AI scans inward for walkable destination when absolute edge is blocked', async () => {
        const globalStateMod = await import('./globalState.js')
        const globalState = globalStateMod.default
        const combat = Object.create(Combat.prototype) as Combat
        
        // Mock map and pathfinding
        const recalcPathSpy = vi.fn().mockImplementation((start: any, goal: any) => {
            // If absolute edge (x = 0), return empty (blocked)
            if (goal.x === 0) { return [] }
            // If x = 3, return valid path
            if (goal.x === 3) { return [[0,0], [1,0], [2,0], [3,0]] }
            return []
        })
        globalState.gMap = { recalcPath: recalcPathSpy } as any
        
        const obj = { 
            name: 'FleeingNPC',
            isPlayer: false, 
            getStat: () => 10, // HP
            ai: { info: { min_hp: 20 } }, // flee condition
            position: { x: 50, y: 100 },
            dead: false,
            visible: true,
            AP: { getAvailableMoveAP: () => 10, subtractMoveAP: vi.fn() },
            clearAnim: vi.fn(),
            walkTo: vi.fn().mockReturnValue(true),
            path: { path: [0, 1, 2, 3] }
        } as any
        
        const enemy = {
            isPlayer: false,
            teamNum: 1,
            dead: false,
            hostile: true,
            position: { x: 80, y: 100 },
            getStat: () => 10,
        } as any
        
        combat.combatants = [obj, enemy]
        combat.log = vi.fn()
        combat.maybeTaunt = vi.fn()
        combat.nextTurn = vi.fn()
        combat.walkUpTo = vi.fn()
        
        combat.doAITurn(obj, 0, 1)
        
        // Flee target pos was originally {x: 0, y: 100} (minEdgeDist = 50, left edge is closest)
        // With inward scanning, it should scan x=0 (blocked), x=1, x=2, and find x=3 as walkable!
        expect(recalcPathSpy).toHaveBeenCalled()
        // walkableTarget should be passed to walkUpTo as {x: 3, y: 100}
        expect(combat.walkUpTo).toHaveBeenCalledWith(obj, 0, { x: 3, y: 100 }, 10, expect.any(Function))
    })

    it('ActionPoints.getMaxAP calculates Math.floor AGI/2 and includes Bruiser (-2 AP) and Action Boy (+1 AP) effects', () => {
        const makeCritterWith = (agi: number, actionBoyRanks: number, isBruiser: boolean): any => ({
            getStat: (stat: string) => stat === 'AGI' ? agi : 0,
            stats: { apBonus: 0 },
            perkRanks: { 6: actionBoyRanks },
            charTraits: new Set(isBruiser ? [1] : [])
        })

        // Standard character AGI 9: 5 + floor(9/2) = 9 AP
        const standardAp = new ActionPoints(makeCritterWith(9, 0, false))
        expect(standardAp.getMaxAP().combat).toBe(9)

        // Action Boy rank 2, AGI 9: 5 + floor(9/2) + 2 = 11 AP
        const actionBoyAp = new ActionPoints(makeCritterWith(9, 2, false))
        expect(actionBoyAp.getMaxAP().combat).toBe(11)

        // Bruiser, AGI 9: 5 + floor(9/2) - 2 = 7 AP
        const bruiserAp = new ActionPoints(makeCritterWith(9, 0, true))
        expect(bruiserAp.getMaxAP().combat).toBe(7)

        // Stacking both, AGI 9: 5 + floor(9/2) + 2 - 2 = 9 AP
        const stackedAp = new ActionPoints(makeCritterWith(9, 2, true))
        expect(stackedAp.getMaxAP().combat).toBe(9)
    })

    describe('Combat rounds tracking and logs audit', () => {
        it('tracks and increments rounds upon turn wraparound, logging events to uiLog', async () => {
            const { uiLog } = await import('./ui.js')
            const logSpy = vi.mocked(uiLog)
            logSpy.mockClear()

            const gs = (await import('./globalState.js')).default
            const origGMap = gs.gMap
            gs.gMap = { updateMap: vi.fn(), getObjects: () => [] } as any

            const playerObj = Object.create(Critter.prototype) as Critter
            playerObj.isPlayer = true
            playerObj.dead = false
            playerObj.visible = true
            playerObj.art = "dude"
            playerObj.clearAnim = vi.fn()
            playerObj.stats = { apBonus: 0 } as any
            playerObj.getStat = (stat: string) => {
                if (stat === 'AGI') return 6
                if (stat === 'HP') return 30
                return 0
            }
            playerObj.perkRanks = {}
            playerObj.charTraits = new Set()
            playerObj.position = { x: 5, y: 5 }
            playerObj.AP = new ActionPoints(playerObj)

            const enemyObj = Object.create(Critter.prototype) as Critter
            enemyObj.isPlayer = false
            enemyObj.dead = false
            enemyObj.visible = true
            enemyObj.hostile = true
            enemyObj.stats = { apBonus: 0 } as any
            enemyObj.getStat = (stat: string) => {
                if (stat === 'AGI') return 5
                return 0
            }
            enemyObj.perkRanks = {}
            enemyObj.charTraits = new Set()
            enemyObj.position = { x: 6, y: 5 }
            enemyObj.ai = { info: { max_dist: 10 } } as any
            enemyObj.AP = new ActionPoints(enemyObj)

            const combat = new Combat([playerObj, enemyObj])
            // Override player idx
            combat.playerIdx = combat.combatants.indexOf(playerObj)
            combat.player = playerObj as any

            // Initialize combat state manually
            combat.round = 1
            combat.turnNum = 1
            combat.whoseTurn = -1

            // Turn 1 starts (Player's turn)
            combat.nextTurn()
            expect(combat.round).toBe(1)
            expect(combat.whoseTurn).toBe(0) // Player
            expect(logSpy).toHaveBeenCalledWith("Combat Round 1")

            // End player's turn. This starts the Enemy's turn, which automatically
            // runs its AI and advances the turn loop back to the player.
            combat.nextTurn()
            expect(combat.round).toBe(2)
            expect(combat.whoseTurn).toBe(0) // Back to Player
            expect(logSpy).toHaveBeenCalledWith("Combat Round 2")

            try {
                // End combat
                combat.end()
                expect(logSpy).toHaveBeenCalledWith("Combat ended.")
            } finally {
                gs.gMap = origGMap
            }
        })
    })
})

describe('Phase 108: Combat sfall opcode implementations', () => {
    let script: any

    beforeEach(async () => {
        const { Scripting } = await import('./scripting.js')
        Scripting.init('test_map', 0)
        script = new Scripting.Script()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function makeObj(overrides: Record<string, any> = {}): any {
        return { type: 'critter', dead: false, position: { x: 5, y: 5 }, ...overrides }
    }

    it('get_combat_target returns 0 for critter with no target', () => {
        expect(script.get_combat_target(makeObj())).toBe(0)
    })

    it('get_combat_target returns combatTarget when set via set_combat_target', () => {
        const obj = makeObj()
        const target = makeObj({ name: 'target' })
        script.set_combat_target(obj, target)
        expect(script.get_combat_target(obj)).toBe(target)
    })

    it('get_critter_attack_mode_sfall returns 0 for non-critter', () => {
        expect(script.get_critter_attack_mode_sfall(null as any)).toBe(0)
        expect(script.get_critter_attack_mode_sfall({} as any)).toBe(0)
    })

    it('get_critter_attack_mode_sfall returns override when set', () => {
        const critter = makeObj({ attackModeOverride: 2 })
        expect(script.get_critter_attack_mode_sfall(critter)).toBe(2)
    })

    it('get_critter_attack_mode_sfall reads equipped weapon attack mode', () => {
        // Melee weapon (attackMode = 0x34 → lower nibble 4 = thrust → melee)
        const critter = makeObj({ equippedWeapon: { pro: { extra: { attackMode: 0x34 } } } })
        expect(script.get_critter_attack_mode_sfall(critter)).toBe(1) // melee
        // Ranged weapon (attackMode = 0x16 → lower nibble 6 = fire single → ranged)
        critter.equippedWeapon = { pro: { extra: { attackMode: 0x16 } } }
        expect(script.get_critter_attack_mode_sfall(critter)).toBe(2) // ranged
    })

    it('set_critter_attack_mode_sfall stores attackModeOverride', () => {
        const critter = makeObj()
        script.set_critter_attack_mode_sfall(critter, 1)
        expect(critter.attackModeOverride).toBe(1)
        expect(() => script.set_critter_attack_mode_sfall(null as any, 1)).not.toThrow()
        expect(() => script.set_critter_attack_mode_sfall({}, 1)).not.toThrow()
    })

    it('get_attack_type_sfall returns 0 for non-critter', () => {
        expect(script.get_attack_type_sfall(null as any, 0)).toBe(0)
    })

    it('get_attack_type_sfall returns primary attack mode from weapon', () => {
        // attackMode = 0x61 → lower nibble 1 (punch), upper nibble 6 (fire single)
        const critter = makeObj({ equippedWeapon: { pro: { extra: { attackMode: 0x61 } } } })
        expect(script.get_attack_type_sfall(critter, 0)).toBe(1) // primary = punch
        expect(script.get_attack_type_sfall(critter, 1)).toBe(6) // secondary = fire single
    })

    it('get_critter_attack_type_sfall delegates to get_attack_type_sfall', () => {
        const critter = makeObj({ equippedWeapon: { pro: { extra: { attackMode: 0x63 } } } })
        expect(script.get_critter_attack_type_sfall(critter, 0))
            .toBe(script.get_attack_type_sfall(critter, 0))
    })

    it('get_critter_min_str_sfall returns 0 for non-critter', () => {
        expect(script.get_critter_min_str_sfall({} as any)).toBe(0)
    })

    it('get_critter_min_str_sfall reads minST from weapon proto', () => {
        const critter = makeObj({ equippedWeapon: { pro: { extra: { minST: 5 } } } })
        expect(script.get_critter_min_str_sfall(critter)).toBe(5)
    })

    it('get_critter_combat_data_sfall returns 0 for non-critter', () => {
        expect(script.get_critter_combat_data_sfall(null as any)).toBe(0)
    })

    it('get_critter_combat_data_sfall shows inCombat bit when in combat', async () => {
        const gs = (await import('./globalState.js')).default
        const origCombat = gs.combat
        const origInCombat = gs.inCombat
        try {
            gs.inCombat = true
            gs.combat = { combatants: [], whoseTurn: 0 } as any
            const data = script.get_critter_combat_data_sfall(makeObj())
            expect(data & 1).toBe(1)
        } finally {
            gs.combat = origCombat
            gs.inCombat = origInCombat
        }
    })

    it('get_critter_combat_data_sfall shows hostile bit', async () => {
        const gs = (await import('./globalState.js')).default
        const origCombat = gs.combat
        const origInCombat = gs.inCombat
        try {
            gs.inCombat = true
            gs.combat = { combatants: [], whoseTurn: 0 } as any
            const data = script.get_critter_combat_data_sfall(makeObj({ hostile: true }))
            expect(data & 2).toBe(2)
        } finally {
            gs.combat = origCombat
            gs.inCombat = origInCombat
        }
    })

    it('obj_is_disabled_sfall reads scriptDisabled flag', () => {
        expect(script.obj_is_disabled_sfall({} as any)).toBe(0)
        expect(script.obj_is_disabled_sfall(null as any)).toBe(0)
        const obj = makeObj({ scriptDisabled: true })
        expect(script.obj_is_disabled_sfall(obj)).toBe(1)
        obj.scriptDisabled = false
        expect(script.obj_is_disabled_sfall(obj)).toBe(0)
    })

    it('get_combat_free_move_sfall reads from script object', () => {
        expect(script.get_combat_free_move_sfall()).toBe(0)
        ;(script as any).combatFreeMove = 5
        expect(script.get_combat_free_move_sfall()).toBe(5)
    })

    it('set_combat_free_move_sfall stores on critter', () => {
        const critter = makeObj()
        script.set_combat_free_move_sfall(critter, 3)
        expect(critter.combatFreeMove).toBe(3)
        script.set_combat_free_move_sfall(critter, NaN)
        expect(critter.combatFreeMove).toBe(0)
        expect(() => script.set_combat_free_move_sfall(null as any, 5)).not.toThrow()
    })
})
