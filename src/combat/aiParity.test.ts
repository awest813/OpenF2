/**
 * Combat AI parity with fallout2-ce combat_ai.cc / combat.cc: AI.TXT packet
 * parsing, who-hit-me bookkeeping, perception, target choice, hit-mode and
 * called-shot choice, fleeing, and the combatant join / end rules.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import globalState from '../globalState.js'
import { Combat } from '../combat.js'
import {
    aiPacketFor,
    canSee,
    checkRetaliation,
    combatRating,
    isWithinPerception,
    Maneuver,
    parseAiPacket,
    parseHurtTooMuch,
    setWhoHitMe,
} from './aiPacket.js'
import { AiTurn, hasWeaponPrefType } from './aiTurn.js'
import { Dam } from './criticalTables.js'

function critter(over: Record<string, any> = {}): any {
    const stats: Record<string, number> = { PER: 5, INT: 5, AP: 8, HP: 30, 'Max HP': 30, AC: 5, 'Melee Damage': 1, STR: 5, ...(over.stats ?? {}) }
    const c: any = {
        type: 'critter',
        name: over.name ?? 'npc',
        teamNum: 1,
        dead: false,
        visible: true,
        orientation: 0,
        position: { x: 10, y: 10 },
        inventory: [],
        ai: { info: { packet_num: 1, max_dist: 10, min_to_hit: 0, min_hp: 0, chance: 0, secondary_freq: 1, called_freq: 1 } },
        getStat: (s: string) => stats[s] ?? 0,
        getSkill: () => 50,
        AP: { combat: 8, move: 0, getAvailableCombatAP() { return this.combat }, getAvailableMoveAP() { return this.combat + this.move } },
        ...over,
    }
    delete c.stats
    return c
}

function combatWith(list: any[], rolls: number[] = []): Combat {
    const combat = Object.create(Combat.prototype) as Combat
    combat.combatants = list
    combat.activeCount = list.length
    combat.player = list.find((c) => c.isPlayer) ?? null as any
    let i = 0
    combat.rng = (min, max) => (i < rolls.length ? rolls[i++] : min)
    return combat
}

let savedPlayer: any
let savedCombat: any
let savedMap: any

beforeEach(() => {
    savedPlayer = globalState.player
    savedCombat = globalState.combat
    savedMap = globalState.gMap
    ;(globalState as any).gMap = null
    ;(globalState as any).gParty = undefined
})

afterEach(() => {
    globalState.player = savedPlayer
    globalState.combat = savedCombat
    ;(globalState as any).gMap = savedMap
})

describe('AI.TXT packets (aiInit)', () => {
    it('stores enumerated keys as engine indices, run_away_mode shifted down by one', () => {
        const p = parseAiPacket({
            run_away_mode: 'none', area_attack_mode: 'be_careful', best_weapon: 'unarmed',
            distance: 'snipe', attack_who: 'weakest', chem_use: 'anytime', disposition: 'berserk',
            hurt_too_much: 'blind,crippled_legs', hit_groin_end: 9,
        })
        expect(p.runAwayMode).toBe(-1)
        expect(parseAiPacket({ run_away_mode: 'coward' }).runAwayMode).toBe(0)
        expect(parseAiPacket({ run_away_mode: 'never' }).runAwayMode).toBe(5)
        expect(p.areaAttackMode).toBe(3)
        expect(p.bestWeapon).toBe(5)
        expect(p.distance).toBe(2)
        expect(p.attackWho).toBe(2)
        expect(p.chemUse).toBe(4)
        expect(p.disposition).toBe(4)
        expect(p.hurtTooMuch).toBe(Dam.BLIND | Dam.CRIP_LEG_LEFT | Dam.CRIP_LEG_RIGHT)
        expect(p.hit[7].end).toBe(10)
    })

    it('absent keys read −1', () => {
        const p = parseAiPacket({})
        expect([p.areaAttackMode, p.runAwayMode, p.bestWeapon, p.distance, p.attackWho, p.chemUse, p.disposition])
            .toEqual([-1, -1, -1, -1, -1, -1, -1])
    })

    it('hurt_too_much "crippled" matches any crippled limb', () => {
        expect(parseHurtTooMuch('crippled')).toBe(Dam.CRIP_LEG_LEFT | Dam.CRIP_LEG_RIGHT | Dam.CRIP_ARM_LEFT | Dam.CRIP_ARM_RIGHT)
    })

    it('a party run-away choice sets min_hp like aiSetRunAwayMode', () => {
        const c = critter({ stats: { 'Max HP': 80 } })
        ;(globalState as any).gParty = { getControl: () => ({ runAwayMode: 'bleeding' }) }
        expect(aiPacketFor(c).minHp).toBe(80 - Math.trunc(80 * 40 / 100))
    })
})

describe('who hit me (_critter_set_who_hit_me / _combatai_check_retaliation)', () => {
    it('always blames an enemy', () => {
        const a = critter({ teamNum: 1 })
        const b = critter({ teamNum: 2 })
        setWhoHitMe(a, b, () => 10)
        expect(a.whoHitMe).toBe(b)
    })

    it('blames a teammate only when the INT roll fails', () => {
        const a = critter({ teamNum: 1 })
        const b = critter({ teamNum: 1 })
        setWhoHitMe(a, b, () => 1) // d10 = 1 ≤ INT − 1: passes, forgives
        expect(a.whoHitMe ?? null).toBeNull()
        setWhoHitMe(a, b, () => 10)
        expect(a.whoHitMe).toBe(b)
    })

    it('switches to a stronger attacker only', () => {
        const victim = critter()
        const weak = critter({ stats: { 'Melee Damage': 1, AC: 0 } })
        const strong = critter({ stats: { 'Melee Damage': 10, AC: 20 } })
        victim.whoHitMe = weak
        checkRetaliation(victim, strong, () => 10)
        expect(victim.whoHitMe).toBe(strong)
        checkRetaliation(victim, weak, () => 10)
        expect(victim.whoHitMe).toBe(strong)
        expect(combatRating(strong)).toBe(30)
    })
})

describe('perception (isWithinPerception)', () => {
    it('sees PER×5 hexes in its forward arc, hears PER×2 in combat', () => {
        const watcher = critter({ position: { x: 10, y: 10 }, orientation: 2 })
        const near = critter({ position: { x: 10, y: 19 } })
        const savedIn = globalState.inCombat
        try {
            globalState.inCombat = true
            const seen = canSee(watcher, near)
            const d = 9
            expect(isWithinPerception(watcher, near, () => 1)).toBe(seen ? d <= 25 : d <= 10)
            const far = critter({ position: { x: 10, y: 60 } })
            expect(isWithinPerception(watcher, far, () => 1)).toBe(false)
        } finally {
            globalState.inCombat = savedIn
        }
    })
})

describe('target choice (_ai_danger_source)', () => {
    it('a critter fights whoever hit it', () => {
        const npc = critter({ teamNum: 1 })
        const player = critter({ isPlayer: true, teamNum: 0 })
        npc.whoHitMe = player
        const combat = combatWith([npc, player])
        expect(new AiTurn(combat, npc).dangerSource()).toBe(player)
    })

    it('joins against whoever hit a teammate, when it can perceive them', () => {
        const npc = critter({ teamNum: 1, position: { x: 10, y: 10 } })
        const buddy = critter({ teamNum: 1, position: { x: 10, y: 12 } })
        const player = critter({ isPlayer: true, teamNum: 0, position: { x: 10, y: 14 } })
        buddy.whoHitMe = player
        globalState.inCombat = true
        const combat = combatWith([npc, buddy, player])
        expect(new AiTurn(combat, npc).dangerSource()).toBe(player)
    })

    it('has no target when nobody has fought', () => {
        const npc = critter({ teamNum: 1 })
        const player = critter({ isPlayer: true, teamNum: 0 })
        const combat = combatWith([npc, player])
        expect(new AiTurn(combat, npc).dangerSource()).toBeNull()
    })
})

describe('weapon preferences (_caiHasWeapPrefType)', () => {
    it('follows the engine ordering table', () => {
        const melee = parseAiPacket({ best_weapon: 'melee' })
        expect(hasWeaponPrefType(melee, 2)).toBe(true)
        expect(hasWeaponPrefType(melee, 4)).toBe(false)
        const none = parseAiPacket({})
        expect([1, 2, 3, 4].every((t) => hasWeaponPrefType(none, t))).toBe(true)
    })
})

describe('called shots (_ai_called_shot)', () => {
    const shooter = () => critter({
        equippedWeapon: { pro: { extra: { attackMode: 6, APCost1: 4, maxRange1: 20 } }, weapon: { weaponSkillType: 'Small Guns' } },
    })

    it('aims 1 time in called_freq, needing INT 5 on normal difficulty', () => {
        const c = shooter()
        c.ai.info.called_freq = 4
        const target = critter({ teamNum: 2 })
        const combat = combatWith([c, target], [2])
        combat.getHitChance = () => ({ hit: 90, crit: 0 }) as any
        expect(new AiTurn(combat, c).calledShot(target, 1)).toBe('torso')
        const combat2 = combatWith([c, target], [1, 0])
        combat2.getHitChance = () => ({ hit: 90, crit: 0 }) as any
        expect(new AiTurn(combat2, c).calledShot(target, 1)).toBe('head')
    })

    it('falls back to the torso when the aimed shot is below min_to_hit', () => {
        const c = shooter()
        c.ai.info.min_to_hit = 50
        const target = critter({ teamNum: 2 })
        const combat = combatWith([c, target], [1, 6])
        combat.getHitChance = () => ({ hit: 20, crit: 0 }) as any
        expect(new AiTurn(combat, c).calledShot(target, 1)).toBe('torso')
    })

    it('a dim critter never aims', () => {
        const c = shooter()
        c.getStat = (s: string) => (s === 'INT' ? 3 : s === 'AP' ? 8 : 5)
        const target = critter({ teamNum: 2 })
        const combat = combatWith([c, target], [1, 0])
        combat.getHitChance = () => ({ hit: 90, crit: 0 }) as any
        expect(new AiTurn(combat, c).calledShot(target, 1)).toBe('torso')
    })
})

describe('the turn (_combat_ai)', () => {
    it('flees once HP drops below min_hp, and disengages when already far away', async () => {
        const c = critter({ stats: { HP: 4 } })
        c.ai.info.min_hp = 5
        c.ai.info.max_dist = 3
        const player = critter({ isPlayer: true, teamNum: 0, position: { x: 10, y: 40 } })
        globalState.player = player
        const combat = combatWith([c, player])
        globalState.combat = combat
        await new AiTurn(combat, c).run(null)
        expect(c.combatManeuver & Maneuver.DISENGAGING).toBeTruthy()
    })

    it('hurt_too_much makes it run even at full health', async () => {
        const c = critter({ blinded: true })
        c.ai.info.hurt_too_much = 'blind'
        c.ai.info.max_dist = 50
        const player = critter({ isPlayer: true, teamNum: 0, position: { x: 10, y: 14 } })
        globalState.player = player
        const combat = combatWith([c, player])
        globalState.combat = combat
        await new AiTurn(combat, c).run(null)
        expect(c.combatManeuver & Maneuver.FLEEING).toBeTruthy()
    })

    it('attacks its target and pays the AP after the swing', async () => {
        const c = critter({ position: { x: 10, y: 10 }, stats: { INT: 3 } })
        const player = critter({ isPlayer: true, teamNum: 0, position: { x: 10, y: 11 } })
        globalState.player = player
        const combat = combatWith([c, player])
        globalState.combat = combat
        const attacks: any[] = []
        combat.performAttack = vi.fn((_o, t, region, mode, cb) => {
            attacks.push({ t, region, mode })
            cb()
        }) as any
        await new AiTurn(combat, c).run(player)
        expect(attacks.length).toBe(2) // 8 AP, 3 per punch
        expect(attacks[0].t).toBe(player)
        expect(attacks[0].mode).toBe(0)
        expect(c.AP.combat).toBe(2)
    })
})

describe('joining and ending (_combatai_want_to_join, _combat_should_end)', () => {
    it('a hurt or engaged critter joins; a fleeing one does not', () => {
        const npc = critter()
        const player = critter({ isPlayer: true, teamNum: 0 })
        const combat = combatWith([player, npc])
        expect(combat.wantsToJoin(npc)).toBe(false)
        npc.damageLastTurn = 3
        expect(combat.wantsToJoin(npc)).toBe(true)
        npc.damageLastTurn = 0
        npc.combatManeuver = Maneuver.FLEEING
        expect(combat.wantsToJoin(npc)).toBe(false)
        npc.combatManeuver = Maneuver.ENGAGING
        expect(combat.wantsToJoin(npc)).toBe(true)
    })

    it('ends when only the player\'s side is left fighting', () => {
        const player = critter({ isPlayer: true, teamNum: 0 })
        const ally = critter({ teamNum: 0 })
        const enemy = critter({ teamNum: 1 })
        const combat = combatWith([player, ally, enemy])
        expect(combat.shouldEnd()).toBe(false)
        combat.activeCount = 2
        expect(combat.shouldEnd()).toBe(true)
        ally.whoHitMe = player
        expect(combat.shouldEnd()).toBe(false)
    })

    it('ends with the player alone', () => {
        const player = critter({ isPlayer: true, teamNum: 0 })
        const combat = combatWith([player])
        expect(combat.shouldEnd()).toBe(true)
    })
})

describe('script attacks (opAttackComplex)', () => {
    it('mid-fight, a script attack only makes the attacker engage its target', async () => {
        const { Scripting } = await import('../scripting.js')
        const script: any = new (Scripting as any).Script()
        const self = critter({ name: 'guard' })
        const player = critter({ isPlayer: true, teamNum: 0 })
        script.self_obj = self
        const savedIn = globalState.inCombat
        const fake = { end: vi.fn() } as any
        globalState.combat = fake
        globalState.inCombat = true
        try {
            script.attack_complex(player, 0, 1, 0, 0, 30000, 0, 0)
            expect(self.combatManeuver & Maneuver.ENGAGING).toBeTruthy()
            expect(self.whoHitMe).toBe(player)
        } finally {
            globalState.inCombat = savedIn
        }
    })

    it('does nothing against a fleeing target', async () => {
        const { Scripting } = await import('../scripting.js')
        const script: any = new (Scripting as any).Script()
        const self = critter({ name: 'guard' })
        const target = critter({ combatManeuver: Maneuver.FLEEING })
        script.self_obj = self
        const savedIn = globalState.inCombat
        globalState.inCombat = true
        globalState.combat = {} as any
        try {
            script.attack_complex(target, 0, 1, 0, 0, 30000, 0, 0)
            expect(self.combatManeuver ?? 0).toBe(0)
        } finally {
            globalState.inCombat = savedIn
        }
    })
})

describe('floor items (_ai_search_environ / _ai_retrieve_object)', () => {
    function mapWith(items: any[]) {
        return {
            getObjects: () => items,
            removeObject: (o: any) => { const i = items.indexOf(o); if (i >= 0) {items.splice(i, 1)} },
            recalcPath: (a: any, b: any) => [[a.x, a.y], [b.x, b.y]],
        }
    }

    it('a hurt critter with no stimpaks walks to one on the floor, picks it up for 3 AP and uses it', async () => {
        const stim = { type: 'item', subtype: 'drug', pid: 40, name: 'Stimpak', position: { x: 10, y: 11 }, amount: 1 }
        const c = critter({ stats: { HP: 5, 'Max HP': 30, INT: 5 }, pro: { extra: { bodyType: 0, killType: 0 } } })
        c.ai.info.chem_use = 'stims_when_hurt_lots'
        c.addInventoryItem = (item: any) => c.inventory.push({ ...item, position: null })
        ;(globalState as any).gMap = mapWith([stim])
        const combat = combatWith([c])
        globalState.combat = combat
        await new AiTurn(combat, c).checkDrugs()
        expect(c.inventory.length).toBe(0) // picked up and taken
        expect(c.AP.combat).toBe(8 - 3 - 2)
    })

    it('ignores floor items beyond PER + 5 hexes', () => {
        const stim = { type: 'item', subtype: 'drug', pid: 40, position: { x: 10, y: 30 } }
        const c = critter({ stats: { HP: 5, 'Max HP': 30, INT: 5, PER: 5 }, pro: { extra: { bodyType: 0, killType: 0 } } })
        c.ai.info.chem_use = 'stims_when_hurt_lots'
        ;(globalState as any).gMap = mapWith([stim])
        const combat = combatWith([c])
        expect(new AiTurn(combat, c).searchEnviron('drug')).toBeNull()
    })

    it('a creature that is not a biped never looks', () => {
        const stim = { type: 'item', subtype: 'drug', pid: 40, position: { x: 10, y: 11 } }
        const c = critter({ stats: { HP: 5, 'Max HP': 30 }, pro: { extra: { bodyType: 1 } } })
        ;(globalState as any).gMap = mapWith([stim])
        expect(new AiTurn(combatWith([c]), c).searchEnviron('drug')).toBeNull()
    })
})
