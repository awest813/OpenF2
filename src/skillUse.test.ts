import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import globalState from './globalState.js'
import { EventBus } from './eventBus.js'
import {
    canUseSkillOn,
    getSkillUsage,
    resetSkillUsage,
    setSkillUsage,
    skillRoll,
    skillUse,
    useSkillOn,
    SKILL_DOCTOR,
    SKILL_FIRST_AID,
    SKILL_LOCKPICK,
    SKILL_REPAIR,
    SKILL_SCIENCE,
    SKILL_STEAL,
    SKILL_TRAPS,
} from './skillUse.js'
import { TICKS_PER_DAY, TICKS_PER_HOUR } from './gameTime.js'
import { PC_FLAG_SNEAKING, playerInSneakMode, setPlayerSneakMode } from './combat/aiPacket.js'

function critter(opts: { hp?: number; maxHp?: number; skills?: Record<string, number>; bodyType?: number; killType?: number; isPlayer?: boolean } = {}) {
    const stats: Record<string, number> = { HP: opts.hp ?? 10, 'Max HP': opts.maxHp ?? 50, 'Critical Chance': 0 }
    return {
        type: 'critter',
        name: 'Sulik',
        isPlayer: opts.isPlayer ?? false,
        dead: false,
        xp: 0,
        level: 1,
        killType: opts.killType ?? 0,
        pro: { extra: { bodyType: opts.bodyType ?? 0 } },
        combatManeuver: 0x04,
        getStat: (s: string) => stats[s] ?? 0,
        getSkill: (s: string) => opts.skills?.[s] ?? 0,
        stats: { modifyBase: (s: string, n: number) => (stats[s] += n) },
    } as any
}

/** A scripted d100: returns each value in turn (the last one repeats). */
function rolls(...values: number[]): (min: number, max: number) => number {
    let i = 0
    return (min, max) => {
        const v = values[Math.min(i++, values.length - 1)]
        return Math.max(min, Math.min(max, v))
    }
}

describe('skillUse (skill.cc)', () => {
    let messages: string[]
    let off: () => void
    let saved: any

    beforeEach(() => {
        saved = { player: globalState.player, time: globalState.gameTickTime, combat: globalState.inCombat, party: globalState.gParty }
        globalState.player = critter({ isPlayer: true, skills: { 'First Aid': 60, Doctor: 60, Repair: 60 } })
        globalState.gParty = null as any
        globalState.gameTickTime = 2 * TICKS_PER_DAY
        globalState.inCombat = false
        resetSkillUsage()
        messages = []
        const handler = ({ text }: { text: string }) => messages.push(text)
        EventBus.on('ui:message', handler)
        off = () => EventBus.off('ui:message', handler)
    })

    afterEach(() => {
        off()
        globalState.player = saved.player
        globalState.gameTickTime = saved.time
        globalState.inCombat = saved.combat
        globalState.gParty = saved.party
    })

    it('First Aid heals 1–5 HP, stops fleeing, takes 30 minutes and earns 25 XP', () => {
        const target = critter({ hp: 10, maxHp: 50 })
        const before = globalState.gameTickTime
        // d100 = 1 → success; crit check 100 → no crit; heal roll → 5
        expect(skillUse(globalState.player, target, SKILL_FIRST_AID, 0, rolls(1, 100, 5))).toBe(0)
        expect(target.getStat('HP')).toBe(15)
        expect(target.combatManeuver & 0x04).toBe(0)
        expect(globalState.gameTickTime - before).toBe(18000)
        expect(globalState.player.xp).toBe(25)
        expect(messages).toEqual(['You heal 5 hit points.', 'You earn 25 XP for honing your skills.'])
    })

    it('First Aid on a healthy target says so and earns nothing', () => {
        const target = critter({ hp: 50, maxHp: 50 })
        skillUse(globalState.player, target, SKILL_FIRST_AID, 0, rolls(1))
        expect(messages).toEqual(['Sulik looks healthy already.'])
        expect(globalState.player.xp).toBe(0)
    })

    it('a failed First Aid heals nothing', () => {
        const target = critter({ hp: 10 })
        skillUse(globalState.player, target, SKILL_FIRST_AID, 0, rolls(100, 100))
        expect(target.getStat('HP')).toBe(10)
        expect(messages).toEqual(['You fail to do any healing.'])
    })

    it('allows three successful uses a day', () => {
        const target = critter({ hp: 1, maxHp: 999 })
        for (let i = 0; i < 3; i++) {
            expect(skillUse(globalState.player, target, SKILL_FIRST_AID, 0, rolls(1, 100, 1))).toBe(0)
        }
        messages = []
        expect(skillUse(globalState.player, target, SKILL_FIRST_AID, 0, rolls(0))).toBe(-1)
        expect(messages).toEqual(["You've taxed your ability with that skill. Wait a while."])
        // More than a day after the oldest use, a slot frees up.
        globalState.gameTickTime = getSkillUsage()[SKILL_FIRST_AID][0] + 25 * TICKS_PER_HOUR
        expect(skillUse(globalState.player, target, SKILL_FIRST_AID, 0, rolls(1, 100, 1))).toBe(0)
    })

    it('Doctor treats each injury with its own roll and hour, then heals 4–10 HP', () => {
        const target = critter({ hp: 10, maxHp: 50 })
        target.crippledLeftLeg = true
        target.blinded = true
        const before = globalState.gameTickTime
        // blinded: success (1, no crit 100); left leg: fail (100, no crit-fail 100); HP: success (1, 100), heal 10
        skillUse(globalState.player, target, SKILL_DOCTOR, 0, rolls(1, 100, 100, 100, 1, 100, 10))
        expect(target.blinded).toBe(false)
        expect(target.crippledLeftLeg).toBe(true)
        expect(target.getStat('HP')).toBe(20)
        expect(globalState.gameTickTime - before).toBe(3 * 3600 * 10)
        expect(messages).toEqual([
            'You heal the damaged eye.',
            'You earn 50 XP for honing your skills.',
            'You fail to heal the crippled left leg.',
            'You earn 50 XP for honing your skills.',
            'You heal 10 hit points.',
            'You earn 50 XP for honing your skills.',
        ])
    })

    it('Repair only works on robots', () => {
        expect(skillUse(globalState.player, critter(), SKILL_REPAIR, 0, rolls(1))).toBe(-1)
        expect(messages).toEqual(['You cannot repair that.'])
        const robot = critter({ hp: 10, bodyType: 2 })
        skillUse(globalState.player, robot, SKILL_REPAIR, 0, rolls(1, 100, 4))
        expect(robot.getStat('HP')).toBe(14)
    })

    it('Traps and Science fail with their messages', () => {
        expect(skillUse(globalState.player, {}, SKILL_TRAPS)).toBe(-1)
        expect(skillUse(globalState.player, {}, SKILL_SCIENCE)).toBe(-1)
        expect(messages).toEqual(['You fail to find any traps.', 'You fail to learn anything.'])
    })

    it('Lockpick does nothing by itself (the lock\'s script decides)', () => {
        expect(skillUse(globalState.player, { type: 'scenery' }, SKILL_LOCKPICK)).toBe(0)
        expect(messages).toEqual([])
    })

    it('saves and restores the usage slots', () => {
        skillUse(globalState.player, critter({ hp: 1 }), SKILL_FIRST_AID, 0, rolls(1, 100, 1))
        const usage = getSkillUsage()
        resetSkillUsage()
        expect(getSkillUsage()[SKILL_FIRST_AID][0]).toBe(0)
        setSkillUsage(usage)
        expect(getSkillUsage()[SKILL_FIRST_AID][0]).toBe(globalState.gameTickTime - 18000)
    })
})

describe('skillRoll', () => {
    let saved: any
    beforeEach(() => {
        saved = { player: globalState.player, party: globalState.gParty, time: globalState.gameTickTime }
        globalState.gameTickTime = 2 * TICKS_PER_DAY
    })
    afterEach(() => {
        globalState.player = saved.player
        globalState.gParty = saved.party
        globalState.gameTickTime = saved.time
    })

    it('lets the party member best at the skill roll when it is their own best skill', () => {
        const player = critter({ isPlayer: true, skills: { Doctor: 20 } })
        const vic = critter({ skills: { Doctor: 80, Repair: 10 } })
        globalState.player = player
        globalState.gParty = { getPartyMembersAndPlayer: () => [player, vic] } as any
        expect(skillRoll(player, SKILL_DOCTOR, 0, rolls(50, 100)).delta).toBe(30)
        // Not their best skill → the player rolls.
        const sulik = critter({ skills: { Doctor: 80, Unarmed: 120 } })
        globalState.gParty = { getPartyMembersAndPlayer: () => [player, sulik] } as any
        expect(skillRoll(player, SKILL_DOCTOR, 0, rolls(50, 100)).delta).toBe(-30)
    })

    it('adds 30 to Steal while sneaking works', () => {
        const player = critter({ isPlayer: true, skills: { Steal: 40, Sneak: 100 } })
        globalState.player = player
        setPlayerSneakMode(player, true, rolls(1))
        expect(skillRoll(player, SKILL_STEAL, 0, rolls(50, 100)).delta).toBe(20)
    })

    it('never rolls criticals on the first day', () => {
        globalState.gameTickTime = 0
        const player = critter({ isPlayer: true, skills: { Doctor: 100 } })
        globalState.player = player
        expect(skillRoll(player, SKILL_DOCTOR, 0, rolls(1, 1)).roll).toBe(2)
    })
})

describe('actionUseSkill / _obj_use_skill_on', () => {
    let messages: string[]
    let off: () => void
    let saved: any
    beforeEach(() => {
        saved = { player: globalState.player, combat: globalState.inCombat }
        globalState.player = critter({ isPlayer: true })
        messages = []
        const handler = ({ text }: { text: string }) => messages.push(text)
        EventBus.on('ui:message', handler)
        off = () => EventBus.off('ui:message', handler)
    })
    afterEach(() => {
        off()
        globalState.player = saved.player
        globalState.inCombat = saved.combat
    })

    it('refuses Skilldex skills in combat', () => {
        globalState.inCombat = true
        expect(canUseSkillOn(globalState.player, critter(), SKILL_FIRST_AID)).toBe(false)
        expect(messages).toEqual(["You can't do that in combat."])
    })

    it('checks the target type per skill', () => {
        globalState.inCombat = false
        const p = globalState.player
        expect(canUseSkillOn(p, { type: 'item' }, SKILL_FIRST_AID)).toBe(false)
        expect(canUseSkillOn(p, critter(), SKILL_LOCKPICK)).toBe(false)
        expect(canUseSkillOn(p, p, SKILL_STEAL)).toBe(false)
        expect(canUseSkillOn(p, critter(), SKILL_TRAPS)).toBe(false)
        expect(canUseSkillOn(p, critter(), SKILL_SCIENCE)).toBe(false)
        expect(canUseSkillOn(p, critter({ killType: 10 }), SKILL_REPAIR)).toBe(true)
        expect(canUseSkillOn(p, critter({ killType: 5 }), SKILL_SCIENCE)).toBe(true)
        expect(canUseSkillOn(p, p, SKILL_SCIENCE)).toBe(true)
    })

    it('a jammed lock refuses every skill before its script runs', () => {
        const script = vi.fn(() => false)
        const door = { type: 'scenery', subtype: 'door', lockJammed: true }
        expect(useSkillOn(globalState.player, door, SKILL_LOCKPICK, script)).toBe(-1)
        expect(script).not.toHaveBeenCalled()
        expect(messages).toEqual(['The lock is jammed.'])
    })

    it('runs the engine effect only when the script does not override', () => {
        const target = { type: 'item' }
        useSkillOn(globalState.player, target, SKILL_TRAPS, () => true)
        expect(messages).toEqual([])
        useSkillOn(globalState.player, target, SKILL_TRAPS, () => false)
        expect(messages).toEqual(['You fail to find any traps.'])
    })
})

describe('sneak state', () => {
    it('is dude state bit 0', () => {
        const p: any = { pcFlags: 0 }
        setPlayerSneakMode(p, true, rolls(1))
        expect(p.pcFlags).toBe(PC_FLAG_SNEAKING)
        expect(PC_FLAG_SNEAKING).toBe(1)
        expect(playerInSneakMode(p)).toBe(true)
        setPlayerSneakMode(p, false)
        expect(playerInSneakMode(p)).toBe(false)
    })
})
