/**
 * Using a skill on something (skill.cc skillRoll / skillUse, actions.cc
 * actionUseSkill, proto_instance.cc _obj_use_skill_on): who performs it,
 * the roll, the healing and repair rules, the three-uses-a-day limit, the
 * time it takes, the experience it earns and what the display monitor says.
 */

import { HOOK, hookReturn, runHook } from './hookScripts.js'
import globalState from './globalState.js'
import { EventBus } from './eventBus.js'
import { getMessage, getRandomInt } from './util.js'
import { randomRoll, Roll, type Rng } from './combat/fo2Formulas.js'
import { playerInSneakMode, playerIsSneaking } from './combat/aiPacket.js'
import { PerkId, perkRank } from './character/perkIds.js'
import { awardCritterXp } from './character/xp.js'
import { advanceGameTime } from './character/rest.js'
import { isJammed } from './mapAging.js'
import { TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from './gameTime.js'

export const SKILL_FIRST_AID = 6
export const SKILL_DOCTOR = 7
export const SKILL_SNEAK = 8
export const SKILL_LOCKPICK = 9
export const SKILL_STEAL = 10
export const SKILL_TRAPS = 11
export const SKILL_SCIENCE = 12
export const SKILL_REPAIR = 13

export const SKILL_NAMES = [
    'Small Guns', 'Big Guns', 'Energy Weapons', 'Unarmed', 'Melee Weapons', 'Throwing',
    'First Aid', 'Doctor', 'Sneak', 'Lockpick', 'Steal', 'Traps', 'Science', 'Repair',
    'Speech', 'Barter', 'Gambling', 'Outdoorsman',
]

/** gSkillDescriptions: experience for a successful use, and whether a penalty adds to it. */
const SKILL_EXPERIENCE = [0, 0, 0, 0, 0, 0, 25, 50, 0, 25, 25, 25, 0, 0, 0, 0, 0, 100]
const SKILL_PENALTY_ADDS_XP = new Set([SKILL_LOCKPICK, SKILL_STEAL, SKILL_TRAPS])

const SKILLS_MAX_USES_PER_DAY = 3

const BODY_TYPE_ROBOTIC = 2
const KILL_TYPE_BRAHMIN = 5
const KILL_TYPE_ROBOT = 10
const MANEUVER_FLEEING = 0x04

const FALLBACK: Record<string, Record<number, string>> = {
    skill: {
        500: 'You heal %d hit points.',
        501: 'You look healthy already.',
        502: '%s looks healthy already.',
        503: 'You fail to do any healing.',
        505: 'You earn %d XP for honing your skills.',
        512: "You can't heal the dead.",
        513: 'Let the dead rest in peace.',
        514: "It's dead, get over it.",
        520: 'You heal your %s.',
        521: 'You heal the %s.',
        525: 'You fail to heal your %s.',
        526: 'You fail to heal the %s.',
        530: 'damaged eye',
        531: 'crippled left arm',
        532: 'crippled right arm',
        533: 'crippled right leg',
        534: 'crippled left leg',
        551: 'You fail to find any traps.',
        552: 'You fail to learn anything.',
        553: 'You cannot repair that.',
        590: "You've taxed your ability with that skill. Wait a while.",
        591: "You're too tired.",
        592: 'The strain might kill you.',
        1101: "It's dead.",
    },
    proto: { 902: "You can't do that in combat." },
    misc: { 2001: 'The lock is jammed.' },
}

function msg(file: string, id: number): string {
    let text: string | null = null
    try {
        text = getMessage(file, id)
    } catch {
        text = null
    }
    return text ?? FALLBACK[file]?.[id] ?? ''
}

function show(text: string): void {
    if (text) {EventBus.emit('ui:message', { text })}
}

function fmt(template: string, value: string | number): string {
    return template.replace(/%[sd]/, String(value))
}

const defaultRng: Rng = (min, max) => getRandomInt(min, max)

// ---------------------------------------------------------------------------
// Skill values and the roll
// ---------------------------------------------------------------------------

/** skillGetValue. */
export function skillValue(critter: any, skill: number): number {
    try {
        const v = critter?.getSkill?.(SKILL_NAMES[skill])
        return typeof v === 'number' && Number.isFinite(v) ? v : 0
    } catch {
        return 0
    }
}

function statOf(critter: any, stat: string): number {
    try {
        const v = critter?.getStat?.(stat)
        return typeof v === 'number' && Number.isFinite(v) ? v : 0
    } catch {
        return 0
    }
}

function partyMembersAndPlayer(): any[] {
    try {
        const list = globalState.gParty?.getPartyMembersAndPlayer?.()
        if (Array.isArray(list) && list.length > 0) {return list}
    } catch {
        // no party
    }
    return globalState.player ? [globalState.player] : []
}

/** partyMemberGetBestInSkill: the visible party critter (the player included) best at `skill`. */
export function partyBestInSkill(skill: number): any {
    let best: any = null
    let bestValue = 0
    for (const member of partyMembersAndPlayer()) {
        if (member?.type !== 'critter' || member.visible === false) {continue}
        const value = skillValue(member, skill)
        if (value > bestValue) {
            bestValue = value
            best = member
        }
    }
    return best
}

/** partyMemberGetBestSkill: the skill a critter is best at (Small Guns on a tie at 0). */
export function bestSkillOf(critter: any): number {
    let bestSkill = 0
    let bestValue = 0
    for (let skill = 0; skill < SKILL_NAMES.length; skill++) {
        const value = skillValue(critter, skill)
        if (value > bestValue) {
            bestSkill = skill
            bestValue = value
        }
    }
    return bestSkill
}

/** random.cc: no criticals, either way, on the first day of the game. */
export function criticalsAllowed(): boolean {
    return Math.floor((globalState.gameTickTime ?? 0) / TICKS_PER_DAY) >= 1
}

/**
 * skillRoll: the player's roll is made by the party member best at the
 * skill when it is also that member's own best skill (never for Steal).
 * Stealing while sneaking works adds 30.
 */
export function skillRoll(critter: any, skill: number, modifier: number, rng: Rng = defaultRng): { roll: Roll; delta: number } {
    if (!(skill >= 0 && skill < SKILL_NAMES.length)) {return { roll: Roll.Failure, delta: 0 }}
    const isDude = critter === globalState.player || critter?.isPlayer === true
    if (isDude && skill !== SKILL_STEAL) {
        const member = partyBestInSkill(skill)
        if (member && bestSkillOf(member) === skill) {critter = member}
    }
    let value = skillValue(critter, skill)
    if (isDude && skill === SKILL_STEAL && playerInSneakMode(critter) && playerIsSneaking(rng, critter)) {
        value += 30
    }
    const bonus = statOf(critter, 'Critical Chance')
    const result = randomRoll(value + modifier, bonus, rng, criticalsAllowed())
    // sfall HOOK_ROLLCHECK (3: a skill check; 4 Repair, 5 Doctor, 6 Steal).
    const type = skill === SKILL_REPAIR ? 4 : skill === SKILL_DOCTOR ? 5 : skill === SKILL_STEAL ? 6 : 3
    const hook = runHook(HOOK.ROLLCHECK, [type, result.roll, value + modifier, bonus, result.delta])
    if (hook) {
        const r = hookReturn(hook, 0, result.roll)
        if (r >= 0 && r <= 3) {result.roll = r as Roll}
    }
    return result
}

// ---------------------------------------------------------------------------
// Uses per day
// ---------------------------------------------------------------------------

let timesSkillUsed: number[][] = SKILL_NAMES.map(() => new Array(SKILLS_MAX_USES_PER_DAY).fill(0))

/** skill_use_slot_clear. */
export function resetSkillUsage(): void {
    timesSkillUsed = SKILL_NAMES.map(() => new Array(SKILLS_MAX_USES_PER_DAY).fill(0))
}

/** skillsUsageSave. */
export function getSkillUsage(): number[][] {
    return timesSkillUsed.map((row) => row.slice())
}

/** skillsUsageLoad. */
export function setSkillUsage(usage: unknown): void {
    resetSkillUsage()
    if (!Array.isArray(usage)) {return}
    usage.forEach((row, skill) => {
        if (!Array.isArray(row) || skill >= timesSkillUsed.length) {return}
        for (let i = 0; i < SKILLS_MAX_USES_PER_DAY; i++) {
            const t = row[i]
            timesSkillUsed[skill][i] = typeof t === 'number' && Number.isFinite(t) ? t : 0
        }
    })
}

/** skillGetFreeUsageSlot: a free slot, the oldest once a day has passed since it, or -1. */
function freeUsageSlot(skill: number): number {
    const slots = timesSkillUsed[skill]
    for (let slot = 0; slot < SKILLS_MAX_USES_PER_DAY; slot++) {
        if (slots[slot] === 0) {return slot}
    }
    const now = globalState.gameTickTime ?? 0
    if (Math.trunc((now - slots[0]) / TICKS_PER_HOUR) <= 24) {return -1}
    return SKILLS_MAX_USES_PER_DAY - 1
}

/** skillUpdateLastUse. */
function updateLastUse(skill: number): void {
    const slot = freeUsageSlot(skill)
    if (slot === -1) {return}
    const slots = timesSkillUsed[skill]
    if (slots[slot] !== 0) {
        for (let i = 0; i < slot; i++) {slots[i] = slots[i + 1]}
    }
    slots[slot] = Math.max(1, globalState.gameTickTime ?? 0)
}

// ---------------------------------------------------------------------------
// skillUse
// ---------------------------------------------------------------------------

function isPlayer(obj: any): boolean {
    return obj === globalState.player || obj?.isPlayer === true
}

function bodyType(critter: any): number {
    return critter?.pro?.extra?.bodyType ?? 0
}

function killType(critter: any): number {
    const kt = critter?.killType ?? critter?.pro?.extra?.killType
    return typeof kt === 'number' ? kt : -1
}

/** Blinded and the four crippled limbs, in gHealableDamageFlags order (messages 530–534). */
const INJURIES = ['blinded', 'crippledLeftArm', 'crippledRightArm', 'crippledRightLeg', 'crippledLeftLeg'] as const

function isCrippled(critter: any): boolean {
    return INJURIES.some((key) => critter?.[key] === true)
}

function adjustHitPoints(critter: any, amount: number): void {
    const hp = statOf(critter, 'HP')
    const maxHp = statOf(critter, 'Max HP')
    const heal = Math.min(amount, maxHp - hp)
    if (heal > 0) {critter.stats?.modifyBase?.('HP', heal)}
}

function stopFleeing(critter: any): void {
    if (typeof critter?.combatManeuver === 'number') {critter.combatManeuver &= ~MANEUVER_FLEEING}
}

function passTime(seconds: number): void {
    try {
        advanceGameTime(seconds * TICKS_PER_SECOND, { heal: false, tickEffects: true, requireOutOfCombat: false })
    } catch {
        globalState.gameTickTime = (globalState.gameTickTime ?? 0) + seconds * TICKS_PER_SECOND
    }
}

function runMapUpdate(): void {
    try {
        globalState.gMap?.updateMap?.()
    } catch {
        // no map
    }
}

/** _show_skill_use_messages: the experience for a successful use, and the message for it. */
function awardSkillXp(obj: any, skill: number, successCount: number, criticalChanceModifier: number): void {
    if (!isPlayer(obj) || successCount <= 0) {return}
    let xp = SKILL_EXPERIENCE[skill] ?? 0
    if (xp === 0) {return}
    if (SKILL_PENALTY_ADDS_XP.has(skill) && criticalChanceModifier < 0) {xp += Math.abs(criticalChanceModifier)}
    const before = obj.xp ?? 0
    awardCritterXp(obj, successCount * xp)
    show(fmt(msg('skill', 505), (obj.xp ?? 0) - before))
}

function tooTired(rng: Rng): void {
    show(msg('skill', 590 + rng(0, 2)))
}

function alreadyHealthy(obj: any, target: any): void {
    if (!isPlayer(obj)) {return}
    show(isPlayer(target) ? msg('skill', 501) : fmt(msg('skill', 502), target?.name ?? ''))
}

/**
 * Doctor and Repair: one roll per injury (each takes the time of an extra
 * attempt), then the hit-point roll. Returns the number of attempts.
 */
function treat(
    obj: any,
    target: any,
    skill: number,
    criticalChance: number,
    criticalChanceModifier: number,
    healRange: [number, number],
    injuriesTreatable: boolean,
    rng: Rng
): { attempts: number; giveExp: boolean } {
    let attempts = 1
    let giveExp = true
    let slotAdded = false
    let successCount = 0
    const currentHp = statOf(target, 'HP')
    const maximumHp = statOf(target, 'Max HP')

    if (injuriesTreatable) {
        INJURIES.forEach((key, index) => {
            if (target?.[key] !== true) {return}
            attempts++
            const { roll } = skillRoll(obj, skill, criticalChance, rng)
            const part = msg('skill', 530 + index)
            let prefix: number
            if (roll === Roll.Success || roll === Roll.CriticalSuccess) {
                target[key] = false
                stopFleeing(target)
                prefix = isPlayer(target) ? 520 : 521
                updateLastUse(skill)
                successCount = 1
                slotAdded = true
            } else {
                prefix = isPlayer(target) ? 525 : 526
            }
            show(fmt(msg('skill', prefix), part))
            awardSkillXp(obj, skill, successCount, criticalChanceModifier)
            giveExp = false
        })
    }

    // The hit-point roll uses the user's own skill, with no party stand-in.
    const roll = skill === SKILL_DOCTOR && bodyType(target) === BODY_TYPE_ROBOTIC
        ? Roll.Failure
        : randomRoll(skillValue(obj, skill), criticalChance, rng, criticalsAllowed()).roll
    if (roll === Roll.Success || roll === Roll.CriticalSuccess) {
        let hpToHeal = rng(healRange[0], healRange[1])
        adjustHitPoints(target, hpToHeal)
        if (isPlayer(obj)) {
            hpToHeal = Math.min(hpToHeal, maximumHp - currentHp)
            show(fmt(msg('skill', 500), hpToHeal))
        }
        if (!slotAdded) {updateLastUse(skill)}
        stopFleeing(target)
        awardSkillXp(obj, skill, 1, criticalChanceModifier)
        giveExp = false
    } else {
        show(msg('skill', 503))
    }
    runMapUpdate()
    return { attempts, giveExp }
}

/**
 * skillUse: the engine's built-in effect of a skill used on `target`
 * (called when the target's script does not override it). Returns 0, or
 * -1 when the skill could not be used.
 */
export function skillUse(obj: any, target: any, skill: number, criticalChanceModifier = 0, rng: Rng = defaultRng): number {
    // sfall HOOK_USESKILL: anything but -1 replaces the engine's handling.
    const hook = runHook(HOOK.USESKILL, [obj, target, skill, criticalChanceModifier])
    if (hook && hook.rets.length > 0 && hookReturn(hook, 0, -1) !== -1) {return 0}
    let giveExp = true
    const currentHp = statOf(target, 'HP')
    const maximumHp = statOf(target, 'Max HP')

    let minimumHpToHeal = 0
    let maximumHpToHeal = 0
    if (isPlayer(obj) && (skill === SKILL_FIRST_AID || skill === SKILL_DOCTOR)) {
        const healer = perkRank(obj, PerkId.HEALER)
        minimumHpToHeal = 4 * healer
        maximumHpToHeal = 10 * healer
    }

    const criticalChance = statOf(obj, 'Critical Chance') + criticalChanceModifier
    let successCount = 0

    switch (skill) {
        case SKILL_FIRST_AID: {
            if (freeUsageSlot(SKILL_FIRST_AID) === -1) {
                tooTired(rng)
                return -1
            }
            if (target?.dead) {break} // 512–514 go to the debug log only
            if (currentHp < maximumHp) {
                const roll = bodyType(target) === BODY_TYPE_ROBOTIC
                    ? Roll.Failure
                    : skillRoll(obj, skill, criticalChance, rng).roll
                if (roll === Roll.Success || roll === Roll.CriticalSuccess) {
                    let hpToHeal = rng(minimumHpToHeal + 1, maximumHpToHeal + 5)
                    adjustHitPoints(target, hpToHeal)
                    if (isPlayer(obj)) {
                        hpToHeal = Math.min(hpToHeal, maximumHp - currentHp)
                        show(fmt(msg('skill', 500), hpToHeal))
                    }
                    stopFleeing(target)
                    updateLastUse(SKILL_FIRST_AID)
                    successCount = 1
                } else {
                    show(msg('skill', 503))
                }
                runMapUpdate()
            } else if (isPlayer(obj)) {
                alreadyHealthy(obj, target)
                giveExp = false
            }
            if (isPlayer(obj)) {passTime(1800)}
            break
        }
        case SKILL_DOCTOR: {
            if (freeUsageSlot(SKILL_DOCTOR) === -1) {
                tooTired(rng)
                return -1
            }
            if (target?.dead) {
                show(msg('skill', 512 + rng(0, 2)))
                break
            }
            let attempts = 1
            if (currentHp < maximumHp || isCrippled(target)) {
                const result = treat(
                    obj, target, skill, criticalChance, criticalChanceModifier,
                    [minimumHpToHeal + 4, maximumHpToHeal + 10],
                    bodyType(target) !== BODY_TYPE_ROBOTIC && isCrippled(target),
                    rng
                )
                attempts = result.attempts
                giveExp = result.giveExp
            } else if (isPlayer(obj)) {
                alreadyHealthy(obj, target)
                giveExp = false
            }
            if (isPlayer(obj)) {passTime(3600 * attempts)}
            break
        }
        case SKILL_SNEAK:
        case SKILL_LOCKPICK:
            break
        case SKILL_STEAL:
            requestStealing(obj, target)
            break
        case SKILL_TRAPS:
            show(msg('skill', 551))
            return -1
        case SKILL_SCIENCE:
            show(msg('skill', 552))
            return -1
        case SKILL_REPAIR: {
            if (bodyType(target) !== BODY_TYPE_ROBOTIC) {
                show(msg('skill', 553))
                return -1
            }
            if (freeUsageSlot(SKILL_REPAIR) === -1) {
                tooTired(rng)
                return -1
            }
            if (target?.dead) {
                show(msg('skill', 1101))
                break
            }
            let attempts = 1
            if (currentHp < maximumHp || isCrippled(target)) {
                const result = treat(
                    obj, target, skill, criticalChance, criticalChanceModifier,
                    [minimumHpToHeal + 4, maximumHpToHeal + 10],
                    true,
                    rng
                )
                attempts = result.attempts
                giveExp = result.giveExp
            } else if (isPlayer(obj)) {
                alreadyHealthy(obj, target)
                giveExp = false
            }
            if (isPlayer(obj)) {passTime(1800 * attempts)}
            break
        }
        default:
            return -1
    }

    if (giveExp) {awardSkillXp(obj, skill, successCount, criticalChanceModifier)}
    if (skill === SKILL_FIRST_AID || skill === SKILL_DOCTOR) {runMapUpdate()}
    return 0
}

// ---------------------------------------------------------------------------
// Stealing hook
// ---------------------------------------------------------------------------

type StealHandler = (thief: any, target: any) => void
let stealHandler: StealHandler | null = null

/** Install the steal screen (inventory.cc inventoryOpenStealing). */
export function setStealHandler(handler: StealHandler | null): void {
    stealHandler = handler
}

/** scriptsRequestStealing: open the steal screen once the current action finishes. */
function requestStealing(thief: any, target: any): void {
    stealHandler?.(thief, target)
}

// ---------------------------------------------------------------------------
// actionUseSkill / _obj_use_skill_on
// ---------------------------------------------------------------------------

/**
 * actionUseSkill's checks: none of the Skilldex skills can be used in
 * combat (proto.msg 902), and each only works on its kind of target.
 * Returns true when the skill may be used on `target`.
 */
export function canUseSkillOn(user: any, target: any, skill: number): boolean {
    const inCombat = globalState.inCombat === true
    const combatError = (): boolean => {
        if (isPlayer(user)) {show(msg('proto', 902))}
        return false
    }
    switch (skill) {
        case SKILL_FIRST_AID:
        case SKILL_DOCTOR:
            if (inCombat) {return combatError()}
            return target?.type === 'critter'
        case SKILL_LOCKPICK:
            if (inCombat) {return combatError()}
            return target?.type === 'item' || target?.type === 'scenery'
        case SKILL_STEAL:
            if (inCombat) {return combatError()}
            return (target?.type === 'item' || target?.type === 'critter') && target !== user
        case SKILL_TRAPS:
            if (inCombat) {return combatError()}
            return target?.type !== 'critter'
        case SKILL_SCIENCE:
        case SKILL_REPAIR:
            if (inCombat) {return combatError()}
            if (target?.type !== 'critter') {return true}
            if (killType(target) === KILL_TYPE_ROBOT) {return true}
            if (killType(target) === KILL_TYPE_BRAHMIN && skill === SKILL_SCIENCE) {return true}
            // sfall's Science-on-critters default: the player may treat themself.
            return isPlayer(target)
        default:
            return true
    }
}

/**
 * _obj_use_skill_on: a jammed lock refuses every skill (misc.msg 2001);
 * otherwise the target's use_skill_on_p_proc runs and, unless it
 * overrides, the engine's skillUse.
 */
export function useSkillOn(
    source: any,
    target: any,
    skill: number,
    runScript: (source: any, target: any, skill: number) => boolean
): number {
    if (isJammed(target)) {
        if (isPlayer(source)) {show(msg('misc', 2001))}
        return -1
    }
    const overridden = runScript(source, target, skill)
    if (!overridden) {skillUse(source, target, skill, 0)}
    return 0
}

