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

        // Top-left cell => "head" (engine window order)
        panel.onMouseDown(16 + 10, 46 + 10, 'l')

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

    it('applies the range penalty far away and the point-blank bonus up close (engine)', () => {
        const combat = Object.create(Combat.prototype) as Combat
        const weapon: any = {}
        const shooter: any = { getStat: vi.fn().mockReturnValue(8), isPlayer: false, position: { x: 0, y: 0 } }

        const closeTarget: any = { position: { x: 1, y: 0 } }
        const farTarget: any = { position: { x: 20, y: 0 } }

        // PER 8 NPC: 1 hex → (1 − 16)×4 = 60 bonus; 20 hexes → (20 − 16)×4 = 16 penalty
        expect(combat.getHitDistanceModifier(shooter, closeTarget, weapon)).toBe(-60)
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
        const longRangeWeapon: any = { pro: { extra: { perk: 58 } } } // PERK_WEAPON_LONG_RANGE
        const scopeWeapon: any = { pro: { extra: { perk: 64 } } } // PERK_WEAPON_SCOPE_RANGE

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
            charTraits: new Set([7]), // Fast Shot (player trait)
            isPlayer: true,
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

describe('AP spend correctness regression tests', () => {
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
    it('combatEvent joinCheck sends fixed_param = 5 (_combatai_want_to_join)', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = {
            combat_p_proc: vi.fn(),
            scriptName: 'test_combat_start',
            _didOverride: false,
        }
        const obj: any = { _script: script }
        const result = Scripting.combatEvent(obj, 'joinCheck')
        expect(script.combat_p_proc).toHaveBeenCalled()
        expect(script.fixed_param).toBe(5)
        expect(result).toBe(false) // no terminate, no override
    })

    it('combatEvent turnBegin sends fixed_param = 4 (COMBAT_SUBTYPE_TURN)', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = {
            combat_p_proc: vi.fn(),
            scriptName: 'test_combat_over',
            _didOverride: false,
        }
        const obj: any = { _script: script }
        const result = Scripting.combatEvent(obj, 'turnBegin')
        expect(script.combat_p_proc).toHaveBeenCalled()
        expect(script.fixed_param).toBe(4)
        expect(result).toBe(false)
    })

    it('combatEvent sets combat_is_initialized = 1', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = {
            combat_p_proc: vi.fn(),
            scriptName: 'test_init_flag',
            _didOverride: false,
        }
        const obj: any = { _script: script }
        Scripting.combatEvent(obj, 'turnBegin')
        expect(script.combat_is_initialized).toBe(1)
    })

    it('combatEvent hitSucceeded sends fixed_param = 2 with the defender as target_obj', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = {
            combat_p_proc: vi.fn(),
            scriptName: 'test_on_attack',
            _didOverride: false,
        }
        const attacker: any = { _script: script, name: 'Attacker' }
        const target: any = { _script: null, name: 'Target' }
        const result = Scripting.combatEvent(attacker, 'hitSucceeded', target)
        expect(script.combat_p_proc).toHaveBeenCalled()
        expect(script.fixed_param).toBe(2) // COMBAT_SUBTYPE_HIT_SUCCEEDED
        expect(script.target_obj).toBe(target)
        expect(result).toBe(false)
    })

    it('combatEvent sets target_obj on hitSucceeded when provided', async () => {
        const { Scripting } = await import('./scripting.js')
        const script: any = {
            combat_p_proc: vi.fn(),
            scriptName: 'test_target_obj',
            _didOverride: false,
        }
        const attacker: any = { _script: script }
        const target: any = { _script: null, name: 'SomeTarget' }
        Scripting.combatEvent(attacker, 'hitSucceeded', target)
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
        Scripting.combatEvent(obj, 'turnBegin')
        // turnBegin does not pass targetObj, so target_obj should remain unchanged
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

    it('getAttackAPCost returns 3 (punch) for unarmed critters', () => {
        const combat = Object.create(Combat.prototype) as Combat
        const critter: any = { equippedWeapon: null }
        // Private method access for testing
        const cost = (combat as any).getAttackAPCost(critter)
        expect(cost).toBe(3)
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
            isPlayer: true,
            equippedWeapon: {
                pro: { extra: { attackMode: 6, maxRange1: 20 } }, // fire single
                weapon: {
                    getAPCost: vi.fn().mockReturnValue(5),
                    weapon: { pro: { extra: { APCost1: 5 } } },
                },
            },
        }
        const cost = (combat as any).getAttackAPCost(critter)
        expect(cost).toBe(4)
    })

    it('player-started combat runs the player first; later rounds sort by Sequence', () => {
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
        expect(combat.combatants.map((c) => c.name)).toEqual(['player', 'low', 'high'])
        combat.sortBySequence()
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
    
})

describe('Phase 106: Combat Parity Audits, Jinxed / Pariah Dog effects, and Flee Walkability', () => {
    
    
    describe('Combat rounds tracking and logs audit', () => {
        it('tracks and increments rounds upon turn wraparound without non-FO2 monitor lines', async () => {
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

            ;(enemyObj as any).teamNum = 1
            playerObj.getStat = (stat: string) => (stat === 'AGI' ? 6 : stat === 'HP' ? 30 : stat === 'AP' ? 8 : 0)
            // The player attacked the enemy: both fight the first round.
            const combat = new Combat([playerObj, enemyObj], playerObj, enemyObj)
            const savedCombat = gs.combat
            gs.combat = combat
            combat.runAITurn = vi.fn().mockResolvedValue(undefined)
            ;(combat as any).startRound()
            expect(combat.round).toBe(1)
            expect(combat.whoseTurn).toBe(0) // Player
            expect(combat.inPlayerTurn).toBe(true)

            // End the player's turn: the enemy acts, the round closes and the
            // player is up again.
            combat.nextTurn()
            await new Promise((r) => setTimeout(r, 0))
            expect(combat.runAITurn).toHaveBeenCalledWith(enemyObj, null)
            expect(combat.round).toBe(2)
            expect(combat.whoseTurn).toBe(0)
            expect(combat.inPlayerTurn).toBe(true)
            gs.combat = savedCombat

            try {
                // End combat
                combat.end()
                // The engine's display monitor prints no round / start / end lines.
                const lines = logSpy.mock.calls.map((c) => String(c[0]))
                expect(lines.some((l) => /Combat (Round|ended|started)/.test(l))).toBe(false)
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

    it('obj_is_disabled_sfall reads scriptDisabled flag', () => {
        expect(script.obj_is_disabled_sfall({} as any)).toBe(0)
        expect(script.obj_is_disabled_sfall(null as any)).toBe(0)
        const obj = makeObj({ scriptDisabled: true })
        expect(script.obj_is_disabled_sfall(obj)).toBe(1)
        obj.scriptDisabled = false
        expect(script.obj_is_disabled_sfall(obj)).toBe(0)
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

describe('Phase 104: Combat Scripting Hooks and AI Turns', () => {
    it('fires turnBegin on an NPC, skips its AI when the script overrides, and never runs critter_p_proc', async () => {
        const gs = (await import('./globalState.js')).default
        const savedCombat = gs.combat
        const combat = Object.create(Combat.prototype) as Combat
        const player: any = { isPlayer: true, teamNum: 0, dead: false, AP: { combat: 0, move: 0, getAvailableMoveAP: () => 0, getAvailableCombatAP: () => 0, resetAP: vi.fn() } }
        const npc: any = {
            name: 'TestNPC', isPlayer: false, dead: false, teamNum: 2, position: { x: 0, y: 0 },
            AP: { combat: 0, move: 0, getAvailableMoveAP: () => 0, getAvailableCombatAP: () => 0, resetAP: vi.fn() },
            _script: {},
        }
        combat.combatants = [player, npc] as Critter[]
        combat.activeCount = 2
        combat.player = player
        combat.whoseTurn = 0
        combat.turnNum = 1
        gs.combat = combat

        vi.spyOn(Config.engine, 'doLoadScripts', 'get').mockReturnValue(true)
        const { Scripting } = await import('./scripting.js')
        const updateCritterSpy = vi.spyOn(Scripting, 'updateCritter').mockImplementation(() => {})
        let override = true
        const combatEventSpy = vi.spyOn(Scripting, 'combatEvent').mockImplementation(() => override)
        const runSpy = vi.spyOn(combat, 'runAITurn').mockResolvedValue()
        ;(combat as any).endRound = vi.fn().mockResolvedValue(undefined)

        try {
            combat.nextTurn()
            expect(combatEventSpy).toHaveBeenCalledWith(npc, 'turnBegin')
            expect(runSpy).not.toHaveBeenCalled()
            expect(updateCritterSpy).not.toHaveBeenCalled()

            override = false
            combat.whoseTurn = 0
            combat.nextTurn()
            expect(runSpy).toHaveBeenCalledWith(npc, null)
        } finally {
            gs.combat = savedCombat
        }
    })
})
