/**
 * Combat resolution against the Fallout 2 engine (fallout2-ce combat.cc):
 * to-hit inputs gathered from real critters, the attack roll and its
 * upgrades, critical tables, damage, AP costs and turn order.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../ui.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../ui.js')>()
    return { ...actual, uiStartCombat: vi.fn(), uiEndCombat: vi.fn(), uiLog: vi.fn(), uiUpdateCombatHUD: vi.fn() }
})

import { ActionPoints, Combat } from '../combat.js'
import { StatSet, SkillSet } from '../char.js'
import { Critter } from '../object.js'
import globalState from '../globalState.js'
import { hexDistance } from '../geometry.js'
import { PerkId } from '../character/perkIds.js'
import { TraitId } from '../character/statModifiers.js'
import { Dam } from './criticalTables.js'
import { Roll } from './fo2Formulas.js'

const DAY = 864000

/** Rng returning queued values; throws when exhausted. */
function seq(...values: number[]) {
    return (min: number, max: number) => {
        if (values.length === 0) {throw new Error('rng exhausted')}
        const v = values.shift()!
        if (v < min || v > max) {throw new Error(`rng ${v} outside [${min}, ${max}]`)}
        return v
    }
}

interface CritterOpts {
    player?: boolean
    stats?: Record<string, number>
    skill?: number
    perks?: Record<number, number>
    traits?: number[]
    weapon?: any
    position?: { x: number; y: number }
    killType?: number
    team?: number
}

function makeCritter(o: CritterOpts = {}): Critter {
    const c = new Critter()
    ;(c as any).isPlayer = o.player ?? false
    c.name = o.player ? 'Player' : 'npc'
    c.stats = new StatSet({
        STR: 5, PER: 5, END: 5, CHA: 5, INT: 5, AGI: 5, LUK: 5,
        HP: 100, 'Max HP': 100, AP: 8, AC: 0, Melee: 1, 'Critical Chance': 0, Sequence: 10, Carry: 999,
        ...o.stats,
    }, false)
    c.skills = new SkillSet({})
    if (o.skill !== undefined) {(c as any).getSkill = () => o.skill}
    c.perkRanks = { ...(o.perks ?? {}) }
    c.charTraits = new Set(o.traits ?? [])
    c.position = o.position ?? { x: 10, y: 10 }
    c.teamNum = o.team ?? (o.player ? 0 : 1)
    c.inventory = []
    c.dead = false
    c.visible = true
    ;(c as any).pro = { extra: { killType: o.killType ?? 0, flags: 0 } }
    if (o.weapon) {c.leftHand = o.weapon}
    ;(c as any).staticAnimation = (_a: string, cb?: () => void) => cb?.()
    ;(c as any).clearAnim = () => {}
    ;(c as any).hasAnimation = () => false
    ;(c as any).move = function (p: any) { this.position = p }
    return c
}

function gun(extra: Record<string, number> = {}): any {
    return {
        type: 'item', subtype: 'weapon', pid: 8,
        pro: { extra: { attackMode: 6 | (7 << 4), maxRange1: 30, maxRange2: 30, APCost1: 5, APCost2: 6, minDmg: 10, maxDmg: 10, dmgType: 0, minST: 0, perk: -1, rounds: 10, critFail: 2, ...extra } },
        weapon: { weaponSkillType: 'Small Guns', name: 'gun' },
        extra: { ammoLoaded: 30 },
    }
}

function club(extra: Record<string, number> = {}): any {
    return {
        type: 'item', subtype: 'weapon', pid: 9,
        pro: { extra: { attackMode: 3, maxRange1: 1, APCost1: 3, minDmg: 10, maxDmg: 10, dmgType: 0, minST: 0, perk: -1, critFail: 1, ...extra } },
        weapon: { weaponSkillType: 'Melee Weapons', name: 'club' },
        extra: {},
    }
}

function makeCombat(...combatants: Critter[]): Combat {
    const combat = Object.create(Combat.prototype) as Combat
    combat.combatants = combatants
    combat.log = () => {}
    const player = combatants.find((c) => c.isPlayer)
    if (player) {combat.player = player as any}
    return combat
}

let savedPlayer: any
let savedTick: number
let savedDifficulty: number
let savedMap: any

beforeEach(() => {
    savedPlayer = globalState.player
    savedTick = globalState.gameTickTime
    savedDifficulty = globalState.combatDifficulty
    savedMap = globalState.gMap
    globalState.gameTickTime = 10 * DAY
    globalState.combatDifficulty = 1
    globalState.gMap = null as any
})

afterEach(() => {
    globalState.player = savedPlayer
    globalState.gameTickTime = savedTick
    globalState.combatDifficulty = savedDifficulty
    globalState.gMap = savedMap
    vi.restoreAllMocks()
})

describe('to-hit from real critters', () => {
    it('NPC ranged shot: skill − range − AC; point blank is a bonus', () => {
        const shooter = makeCritter({ skill: 60, weapon: gun(), position: { x: 10, y: 10 } })
        const far = makeCritter({ stats: { AC: 10 }, position: { x: 30, y: 10 } })
        const near = makeCritter({ stats: { AC: 10 }, position: { x: 10, y: 11 } })
        const combat = makeCombat(shooter, far, near)
        const dFar = hexDistance(shooter.position!, far.position!)
        const dNear = hexDistance(shooter.position!, near.position!)
        expect(combat.getHitChance(shooter, far, 'torso').hit).toBe(60 - 4 * (dFar - 10) - 10)
        expect(combat.getHitChance(shooter, near, 'torso').hit).toBe(60 - 4 * (dNear - 10) - 10)
        expect(combat.getHitChance(shooter, near, 'torso').hit).toBeGreaterThan(60 - 10)
    })

    it('called shots: full penalty for guns, half for melee; crit chance rises by the full penalty', () => {
        const shooter = makeCritter({ skill: 20, weapon: gun(), stats: { 'Critical Chance': 5 }, position: { x: 10, y: 10 } })
        const brawler = makeCritter({ skill: 80, weapon: club(), stats: { 'Critical Chance': 5 }, position: { x: 10, y: 10 } })
        const target = makeCritter({ position: { x: 11, y: 10 } })
        const combat = makeCombat(shooter, brawler, target)
        const g = (r: string) => combat.getHitChance(shooter, target, r)
        const m = (r: string) => combat.getHitChance(brawler, target, r)
        expect(g('torso').hit - g('eyes').hit).toBe(60)
        expect(m('torso').hit - m('eyes').hit).toBe(30)
        expect(g('eyes').crit).toBe(65)
        expect(m('eyes').crit).toBe(65)
    })

    it('Fast Shot: the player cannot aim, so called shots fall back to the torso', () => {
        const shooter = makeCritter({ player: true, skill: 80, weapon: gun(), traits: [TraitId.FAST_SHOT] })
        const target = makeCritter({ position: { x: 12, y: 10 } })
        const combat = makeCombat(shooter, target)
        expect(combat.getHitChance(shooter, target, 'eyes')).toEqual(combat.getHitChance(shooter, target, 'torso'))
    })

    it('One Hander, min Strength, Accurate and ammo AC modifier', () => {
        const target = makeCritter({ stats: { AC: 20 }, position: { x: 11, y: 10 } })
        const base = makeCritter({ player: true, skill: 50, weapon: club() })
        const combat = makeCombat(base, target)
        const baseHit = combat.getHitChance(base, target, 'torso').hit

        const oneHander = makeCritter({ player: true, skill: 50, weapon: club(), traits: [TraitId.ONE_HANDER] })
        expect(combat.getHitChance(oneHander, target, 'torso').hit).toBe(baseHit + 20)

        const twoHanded = makeCritter({ player: true, skill: 50, weapon: club({ weaponFlags: 0x02 }), traits: [TraitId.ONE_HANDER] })
        expect(combat.getHitChance(twoHanded, target, 'torso').hit).toBe(baseHit - 40)

        const weak = makeCritter({ player: true, skill: 50, weapon: club({ minST: 7 }), stats: { STR: 5 } })
        expect(combat.getHitChance(weak, target, 'torso').hit).toBe(baseHit - 40)

        const accurate = makeCritter({ player: true, skill: 50, weapon: club({ perk: PerkId.WEAPON_ACCURATE }) })
        expect(combat.getHitChance(accurate, target, 'torso').hit).toBe(baseHit + 20)

        const ap = makeCritter({ player: true, skill: 50, weapon: club({ acModifier: -15 }) })
        expect(combat.getHitChance(ap, target, 'torso').hit).toBe(baseHit + 15)
    })

    it('knocked-down targets are 40% easier; multihex 15%', () => {
        const shooter = makeCritter({ skill: 40, weapon: club() })
        const target = makeCritter({ position: { x: 11, y: 10 } })
        const combat = makeCombat(shooter, target)
        const base = combat.getHitChance(shooter, target, 'torso').hit
        ;(target as any).knockedDown = true
        expect(combat.getHitChance(shooter, target, 'torso').hit).toBe(base + 40)
        ;(target as any).knockedDown = false
        ;(target as any).flags = 0x800
        expect(combat.getHitChance(shooter, target, 'torso').hit).toBe(base + 15)
    })

    it('combat difficulty shifts hostile NPCs by ∓20 (not the player)', () => {
        const npc = makeCritter({ skill: 50, weapon: club() })
        const player = makeCritter({ player: true, skill: 50, weapon: club(), position: { x: 11, y: 10 } })
        globalState.player = player as any
        const combat = makeCombat(npc, player)
        globalState.combatDifficulty = 0
        expect(combat.getHitChance(npc, player, 'torso').hit).toBe(30)
        globalState.combatDifficulty = 2
        expect(combat.getHitChance(npc, player, 'torso').hit).toBe(70)
        expect(combat.getHitChance(player, npc, 'torso').hit).toBe(50)
    })

    it('critical chance comes from the stat (Finesse and More Criticals included)', () => {
        const target = makeCritter({ position: { x: 11, y: 10 } })
        const finesse = makeCritter({ player: true, skill: 50, weapon: club(), stats: { 'Critical Chance': 5 }, traits: [TraitId.FINESSE], perks: { [PerkId.MORE_CRITICALS]: 2 } })
        const combat = makeCombat(finesse, target)
        expect(combat.getHitChance(finesse, target, 'torso').crit).toBe(5 + 10 + 10)
    })
})

describe('attack roll', () => {
    it('hits when d100 ≤ to-hit, crits on d100 ≤ delta/10 + crit chance', () => {
        const shooter = makeCritter({ skill: 70, weapon: club(), stats: { 'Critical Chance': 5 } })
        const target = makeCritter({ position: { x: 11, y: 10 } })
        const combat = makeCombat(shooter, target)
        combat.rng = seq(70, 100)
        expect(combat.rollHit(shooter, target, 'torso').roll).toBe(Roll.Success)
        combat.rng = seq(71, 100)
        expect(combat.rollHit(shooter, target, 'torso').roll).toBe(Roll.Failure)
        // delta 60 → 6 + 5 = 11; then the critical table roll and massive check
        combat.rng = seq(10, 11, 50, 10)
        const out = combat.rollHit(shooter, target, 'torso')
        expect(out.crit).toBe(true)
        expect(out.hit).toBe(true)
    })

    it('no criticals on the first game day', () => {
        globalState.gameTickTime = 0
        const shooter = makeCritter({ skill: 95, weapon: club(), stats: { 'Critical Chance': 100 } })
        const target = makeCritter({ position: { x: 11, y: 10 } })
        const combat = makeCombat(shooter, target)
        combat.rng = seq(1)
        expect(combat.rollHit(shooter, target, 'torso').roll).toBe(Roll.Success)
    })

    it('Slayer turns every hand-to-hand hit into a critical', () => {
        const slayer = makeCritter({ player: true, skill: 90, weapon: club(), perks: { [PerkId.SLAYER]: 1 } })
        const target = makeCritter({ position: { x: 11, y: 10 } })
        const combat = makeCombat(slayer, target)
        combat.rng = seq(50, 100, 30, 10)
        expect(combat.rollHit(slayer, target, 'torso').crit).toBe(true)
    })

    it('Sniper upgrades a ranged hit when d10 ≤ Luck', () => {
        const sniper = makeCritter({ player: true, skill: 90, weapon: gun(), stats: { LUK: 7 }, perks: { [PerkId.SNIPER]: 1 } })
        const target = makeCritter({ position: { x: 11, y: 10 } })
        const combat = makeCombat(sniper, target)
        combat.rng = seq(50, 100, 7, 30, 10)
        expect(combat.rollHit(sniper, target, 'torso').crit).toBe(true)
        combat.rng = seq(50, 100, 8)
        expect(combat.rollHit(sniper, target, 'torso').crit).toBe(false)
    })

    it('Jinxed (player trait) turns half of all misses into critical failures', () => {
        const player = makeCritter({ player: true, traits: [TraitId.JINXED] })
        globalState.player = player as any
        const npc = makeCritter({ skill: 10, weapon: club() })
        const target = makeCritter({ position: { x: 11, y: 10 } })
        const combat = makeCombat(player, npc, target)
        combat.rng = seq(90, 100, 1)
        expect(combat.rollHit(npc, target, 'torso').roll).toBe(Roll.CriticalFailure)
        combat.rng = seq(90, 100, 0)
        expect(combat.rollHit(npc, target, 'torso').roll).toBe(Roll.Failure)
    })

    it('the Pariah Dog among the combatants jinxes everyone', () => {
        const player = makeCritter({ player: true })
        globalState.player = player as any
        const dog = makeCritter({ position: { x: 30, y: 30 } })
        ;(dog as any).pid = 16777413
        const npc = makeCritter({ skill: 10, weapon: club() })
        const target = makeCritter({ position: { x: 11, y: 10 } })
        const combat = makeCombat(player, dog, npc, target)
        combat.rng = seq(90, 100, 1)
        expect(combat.rollHit(npc, target, 'torso').roll).toBe(Roll.CriticalFailure)
    })

    it('Jinxed on an NPC does nothing', () => {
        const player = makeCritter({ player: true })
        globalState.player = player as any
        const jinxedNpc = makeCritter({ skill: 10, weapon: club(), traits: [TraitId.JINXED] })
        const target = makeCritter({ position: { x: 11, y: 10 } })
        const combat = makeCombat(player, jinxedNpc, target)
        combat.rng = seq(90, 100)
        expect(combat.rollHit(jinxedNpc, target, 'torso').roll).toBe(Roll.Failure)
    })
})

describe('critical hits use the engine tables', () => {
    it('man / head / effect 5 is instant death', () => {
        const shooter = makeCritter({ skill: 95, weapon: club(), stats: { 'Better Criticals': 20 } })
        const target = makeCritter({ position: { x: 11, y: 10 }, killType: 0 })
        const combat = makeCombat(shooter, target)
        // to-hit roll 1 (delta ≥ 0), crit check 1, table roll 95 + 20 = 115 → effect 5
        combat.rng = seq(1, 1, 95)
        const out = combat.rollHit(shooter, target, 'head')
        expect(out.flags & Dam.DEAD).toBe(Dam.DEAD)
        expect(out.DM).toBe(6)
        expect(out.msgID).toBe(5007)
    })

    it('failing the massive-critical stat check adds its effects', () => {
        const shooter = makeCritter({ skill: 95, weapon: club() })
        const target = makeCritter({ position: { x: 11, y: 10 }, stats: { END: 5 } })
        const combat = makeCombat(shooter, target)
        // effect 1 head: bypass, END check (mod 0) → knocked out on failure
        combat.rng = seq(1, 1, 30, 6)
        const failed = combat.rollHit(shooter, target, 'head')
        expect(failed.flags & Dam.KNOCKED_OUT).toBe(Dam.KNOCKED_OUT)
        expect(failed.msgID).toBe(5003)
        combat.rng = seq(1, 1, 30, 5)
        const passed = combat.rollHit(shooter, target, 'head')
        expect(passed.flags & Dam.KNOCKED_OUT).toBe(0)
        expect(passed.flags & Dam.BYPASS).toBe(Dam.BYPASS)
    })

    it('Heavy Handed lowers the critical table roll by 30', () => {
        const heavy = makeCritter({ player: true, skill: 95, weapon: club(), traits: [TraitId.HEAVY_HANDED] })
        expect(heavy.getStat('Better Criticals')).toBe(-30)
    })
})

describe('damage', () => {
    it('Melee Damage widens melee damage; Heavy Handed adds 4 to it', () => {
        const target = makeCritter({ position: { x: 11, y: 10 } })
        const plain = makeCritter({ weapon: club({ minDmg: 1, maxDmg: 1 }), stats: { Melee: 3 } })
        const combat = makeCombat(plain, target)
        combat.rng = (min, max) => max
        expect(combat.getDamageDone(plain, target, 2)).toBe(1 + 3)
        const heavy = makeCritter({ player: true, weapon: club({ minDmg: 1, maxDmg: 1 }), stats: { Melee: 3 }, traits: [TraitId.HEAVY_HANDED] })
        expect(combat.getDamageDone(heavy, target, 2)).toBe(1 + 3 + 4)
        combat.rng = (min) => min
        expect(combat.getDamageDone(heavy, target, 2)).toBe(1)
    })

    it('Bonus Ranged Damage adds 2 per rank per round (player)', () => {
        const target = makeCritter({ position: { x: 11, y: 10 } })
        const shooter = makeCritter({ player: true, weapon: gun(), perks: { [PerkId.BONUS_RANGED_DAMAGE]: 2 } })
        const combat = makeCombat(shooter, target)
        combat.rng = () => 10
        expect(combat.getDamageDone(shooter, target, 2)).toBe(14)
        expect(combat.getDamageDone(shooter, target, 2, 0, 3, 2)).toBe(42)
    })

    it('critical multiplier applies before DT/DR; bypass armor uses 20% of them', () => {
        const target = makeCritter({ position: { x: 11, y: 10 }, stats: { 'DT Normal': 4, 'DR Normal': 25 } })
        const shooter = makeCritter({ weapon: gun() })
        const combat = makeCombat(shooter, target)
        combat.rng = () => 10
        expect(combat.getDamageDone(shooter, target, 2)).toBe(5)
        expect(combat.getDamageDone(shooter, target, 6)).toBe(20)
        // bypass: DT 0, DR 5 → 30 − 1 = 29
        expect(combat.getDamageDone(shooter, target, 6, Dam.BYPASS)).toBe(29)
    })

    it('easy/hard difficulty scales hostile damage 75%/125%', () => {
        const player = makeCritter({ player: true, position: { x: 11, y: 10 } })
        globalState.player = player as any
        const npc = makeCritter({ weapon: gun() })
        const combat = makeCombat(npc, player)
        combat.rng = () => 10
        globalState.combatDifficulty = 0
        expect(combat.getDamageDone(npc, player, 2)).toBe(7)
        globalState.combatDifficulty = 2
        expect(combat.getDamageDone(npc, player, 2)).toBe(12)
    })

    it('Living Anatomy adds 5 against living targets only', () => {
        const doc = makeCritter({ player: true, weapon: gun(), perks: { [PerkId.LIVING_ANATOMY]: 1 } })
        const human = makeCritter({ position: { x: 11, y: 10 }, killType: 0 })
        const robot = makeCritter({ position: { x: 11, y: 10 }, killType: 10 })
        const combat = makeCombat(doc, human, robot)
        combat.rng = () => 10
        expect(combat.getDamageDone(doc, human, 2)).toBe(15)
        expect(combat.getDamageDone(doc, robot, 2)).toBe(10)
    })
})

describe('action points', () => {
    it('max AP comes from the AP stat (Action Boy, Bruiser); Bonus Move is move-only for the player', () => {
        const p = makeCritter({ player: true, perks: { [PerkId.ACTION_BOY]: 1, [PerkId.BONUS_MOVE]: 2 }, traits: [TraitId.BRUISER], stats: { AP: 8 } })
        const ap = new ActionPoints(p)
        expect(ap.getMaxAP()).toEqual({ combat: 8 + 1 - 2, move: 4 })
        const npc = makeCritter({ perks: { [PerkId.BONUS_MOVE]: 2 }, stats: { AP: 9 } })
        expect(new ActionPoints(npc).getMaxAP()).toEqual({ combat: 9, move: 0 })
    })

    it('attack cost: proto AP, punch 3, aimed +1, Fast Shot / Bonus Rate of Fire / Bonus HtH Attacks −1', () => {
        const combat = makeCombat()
        expect(combat.getAttackAPCost(makeCritter())).toBe(3)
        expect(combat.getAttackAPCost(makeCritter({ weapon: gun() }))).toBe(5)
        expect(combat.getAttackAPCost(makeCritter({ weapon: gun() }), 1, true)).toBe(6)
        expect(combat.getAttackAPCost(makeCritter({ weapon: gun() }), 2)).toBe(6)
        expect(combat.getAttackAPCost(makeCritter({ player: true, weapon: gun(), traits: [TraitId.FAST_SHOT] }))).toBe(4)
        expect(combat.getAttackAPCost(makeCritter({ player: true, weapon: gun(), perks: { [PerkId.BONUS_RATE_OF_FIRE]: 1 } }))).toBe(4)
        expect(combat.getAttackAPCost(makeCritter({ player: true, weapon: club(), perks: { [PerkId.BONUS_HTH_ATTACKS]: 1 } }))).toBe(2)
    })

    it('unspent AP counts as AC while it is not the critter\'s turn', () => {
        const player = makeCritter({ player: true })
        const npc = makeCritter({ stats: { AC: 5 }, position: { x: 11, y: 10 } })
        const combat = makeCombat(player, npc)
        npc.AP = new ActionPoints(npc)
        npc.AP.combat = 3
        combat.whoseTurn = 0
        globalState.inCombat = true
        globalState.combat = combat
        try {
            expect(npc.getStat('AC')).toBe(5 + 3)
            combat.whoseTurn = 1
            expect(npc.getStat('AC')).toBe(5)
        } finally {
            globalState.inCombat = false
            globalState.combat = null
        }
    })
})

describe('turn order', () => {
    it('round 1: attacker, defender, then the player; later rounds by Sequence then Luck', () => {
        const player = makeCritter({ player: true, stats: { Sequence: 8 } })
        const a = makeCritter({ stats: { Sequence: 2 } }); a.name = 'a'
        const b = makeCritter({ stats: { Sequence: 12, LUK: 3 } }); b.name = 'b'
        const c = makeCritter({ stats: { Sequence: 12, LUK: 7 } }); c.name = 'c'
        const combat = new Combat([player, b, a, c] as any, a, c)
        expect(combat.combatants.map((x) => x.name)).toEqual(['a', 'c', 'Player', 'b'])
        combat.sortBySequence()
        expect(combat.combatants.map((x) => x.name)).toEqual(['c', 'b', 'Player', 'a'])
    })

    it('player-started combat puts the player first', () => {
        const player = makeCritter({ player: true, stats: { Sequence: 1 } })
        const npc = makeCritter({ stats: { Sequence: 20 } })
        const combat = new Combat([npc, player] as any)
        expect(combat.combatants[0]).toBe(player)
    })
})

describe('player attack checks (combat.cc _combat_check_bad_shot)', () => {
    it('refuses out of range, without AP, with no ammo, and with crippled arms', () => {
        const player = makeCritter({ player: true, weapon: club() })
        player.AP = new ActionPoints(player)
        const far = makeCritter({ position: { x: 14, y: 10 } })
        const near = makeCritter({ position: { x: 11, y: 10 } })
        const combat = makeCombat(player, far, near)
        expect(combat.checkBadShot(player, far, 1, false)).toBe('outOfRange')
        expect(combat.checkBadShot(player, near, 1, false)).toBe('ok')
        player.AP.combat = 3
        expect(combat.checkBadShot(player, near, 1, true)).toBe('notEnoughAP')
        ;(player as any).crippledLeftArm = true
        ;(player as any).crippledRightArm = true
        expect(combat.checkBadShot(player, near, 1, false)).toBe('bothArmsCrippled')

        const shooter = makeCritter({ player: true, weapon: gun({ maxAmmo: 12, ammoPID: 40 }) })
        shooter.AP = new ActionPoints(shooter)
        ;(shooter as any).leftHand.extra.ammoLoaded = 0
        expect(combat.checkBadShot(shooter, near, 1, false)).toBe('noAmmo')
        near.dead = true
        expect(combat.checkBadShot(shooter, near, 1, false)).toBe('dead')
    })

    it('playerAttack spends the aimed AP cost and refuses with the engine message', () => {
        const player = makeCritter({ player: true, skill: 95, weapon: club() })
        player.AP = new ActionPoints(player)
        const target = makeCritter({ position: { x: 11, y: 10 } })
        const combat = makeCombat(player, target)
        combat.rng = () => 50
        ;(player.leftHand as any).weapon = { weaponSkillType: 'Melee Weapons', name: 'club', hitMode: () => 1, isCalled: () => true }
        let picked = false
        const started = combat.playerAttack(target, (fire) => { picked = true; fire('head') })
        expect(started).toBe(true)
        expect(picked).toBe(true)
        expect(player.AP.combat).toBe(8 - 4)
        const far = makeCritter({ position: { x: 20, y: 10 } })
        expect(combat.playerAttack(far)).toBe(false)
    })
})

describe('weapon item actions (interface.cc interfaceCycleItemAction)', () => {
    it('cycles primary → aimed → secondary → aimed secondary → reload', async () => {
        const { Weapon } = await import('../critter.js')
        const { WeaponObj } = await import('../object.js')
        const proto = Object.create(WeaponObj.prototype)
        proto.pro = { extra: { attackMode: 6 | (7 << 4), maxAmmo: 30, dmgType: 0 } }
        proto.art = 'art/items/smg'
        proto.extra = { ammoLoaded: 10 }
        const w = new Weapon(proto)
        expect(w.availableModes()).toEqual(['primary', 'primary-aimed', 'secondary', 'reload'])
        const seen = [w.mode]
        for (let i = 0; i < 4; i++) { w.cycleMode(); seen.push(w.mode) }
        expect(seen).toEqual(['primary', 'primary-aimed', 'secondary', 'reload', 'primary'])
        expect(w.availableModes({ isPlayer: true, charTraits: new Set([TraitId.FAST_SHOT]) })).toEqual(['primary', 'secondary', 'reload'])
    })
})

describe('movement and full attacks', () => {
    it('crippled legs cost 4 AP per hex (8 with both)', async () => {
        const { movementApCost } = await import('../combat.js')
        const c = makeCritter()
        expect(movementApCost(c, 3)).toBe(3)
        ;(c as any).crippledLeftLeg = true
        expect(movementApCost(c, 3)).toBe(12)
        ;(c as any).crippledRightLeg = true
        expect(movementApCost(c, 3)).toBe(24)
    })

    it('a critical "instant death" kills the target through attack()', () => {
        const shooter = makeCritter({ skill: 95, weapon: club(), stats: { 'Better Criticals': 20 } })
        const target = makeCritter({ position: { x: 11, y: 10 }, stats: { HP: 500, 'Max HP': 500 } })
        const combat = makeCombat(shooter, target)
        // hit, crit, table 115 → effect 5 (dead), then damage roll
        combat.rng = seq(1, 1, 95, 10)
        combat.attack(shooter, target, 'head')
        expect(target.dead).toBe(true)
    })

    it('a knockdown critical makes the target lose 3 AP standing up next turn', () => {
        const shooter = makeCritter({ skill: 95, weapon: club() })
        const target = makeCritter({ position: { x: 11, y: 10 }, stats: { HP: 500, 'Max HP': 500 } })
        const combat = makeCombat(shooter, target)
        // man / torso effect 3: knocked down (no stat check)
        combat.rng = seq(1, 1, 80, 10)
        combat.attack(shooter, target, 'torso')
        expect((target as any).knockedDown).toBe(true)
        target.AP = new ActionPoints(target)
        ;(combat as any).standUpIfProne(target)
        expect(target.AP.combat).toBe(8 - 3)
        expect((target as any).knockedDown).toBe(false)
    })
})

describe('kill experience (combat.cc _combat_give_exps)', () => {
    it('pools XP for kills by the player\'s side and awards it when combat ends', async () => {
        const { critterKill } = await import('../critter.js')
        const player = makeCritter({ player: true }) as any
        player.xp = 0
        player.level = 1
        globalState.player = player
        const ally = makeCritter({ team: 0 })
        const victim = makeCritter({ position: { x: 11, y: 10 } }) as any
        victim.pro.extra.XPValue = 60
        const victim2 = makeCritter({ position: { x: 12, y: 10 } }) as any
        victim2.pro.extra.XPValue = 40
        const combat = makeCombat(player, ally, victim, victim2)
        globalState.inCombat = true
        globalState.combat = combat
        ;(globalState as any).gMap = { updateMap: () => {} }
        try {
            critterKill(victim, player, false)
            critterKill(victim2, ally, false)
            expect(player.xp).toBe(0)
            expect(combat.pendingExperience).toBe(100)
            combat.rng = () => 0
            combat.end()
            expect(player.xp).toBe(100)
        } finally {
            globalState.inCombat = false
            globalState.combat = null
        }
    })
})

describe('explosives and flamers', () => {
    function grenade(): any {
        return {
            type: 'item', subtype: 'weapon', pid: 26, amount: 2,
            pro: { extra: { attackMode: 5, maxRange1: 15, APCost1: 4, minDmg: 20, maxDmg: 20, dmgType: 6, minST: 0, perk: -1, critFail: 4 } },
            weapon: { weaponSkillType: 'Throwing', name: 'grenade' },
            extra: {},
        }
    }

    it('a grenade hit damages everyone within 2 hexes and uses up one grenade', () => {
        const thrower = makeCritter({ skill: 95, weapon: grenade(), position: { x: 10, y: 10 } })
        const target = makeCritter({ position: { x: 10, y: 14 }, stats: { HP: 500, 'Max HP': 500 } })
        const near = makeCritter({ position: { x: 10, y: 15 }, stats: { HP: 500, 'Max HP': 500 } })
        const far = makeCritter({ position: { x: 10, y: 20 }, stats: { HP: 500, 'Max HP': 500 } })
        const combat = makeCombat(thrower, target, near, far)
        combat.rng = (min, max) => (max === 100 ? 1 : max >= 20 ? 20 : min)
        combat.attack(thrower, target, 'torso')
        expect(target.getStat('HP')).toBeLessThan(500)
        expect(near.getStat('HP')).toBe(500 - 20)
        expect(far.getStat('HP')).toBe(500)
        expect((thrower.leftHand as any).amount).toBe(1)
    })

    it('a flamer sprays one round at the target and at everyone in its lines', () => {
        const flamer: any = {
            type: 'item', subtype: 'weapon', pid: 11,
            pro: { extra: { attackMode: 8, maxRange1: 5, APCost1: 6, minDmg: 10, maxDmg: 10, dmgType: 2, rounds: 5, maxAmmo: 10, critFail: 6, perk: -1 } },
            weapon: { weaponSkillType: 'Big Guns', name: 'flamer' },
            extra: { ammoLoaded: 10 },
        }
        const shooter = makeCritter({ skill: 95, weapon: flamer, position: { x: 10, y: 10 } })
        const target = makeCritter({ position: { x: 10, y: 12 }, stats: { HP: 500, 'Max HP': 500 } })
        const combat = makeCombat(shooter, target)
        globalState.gameTickTime = 0 // no criticals on day one
        combat.rng = (min) => min
        combat.burstAttack(shooter, target, undefined, 1)
        expect(target.getStat('HP')).toBe(500 - 10)
        expect(flamer.extra.ammoLoaded).toBe(5)
    })
})
