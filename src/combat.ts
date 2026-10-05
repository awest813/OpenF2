/*
Copyright 2014 darkf, Stratege
Copyright 2015 darkf

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { Config } from './config.js'
import { EventBus, DamageType } from './eventBus.js'
import { CriticalEffects } from './criticalEffects.js'
import { critterDamage, critterKill } from './critter.js'
import { isRangedWeapon, consumeRounds, weaponNeedsReload } from './combat/ammo.js'
import {
    attackCriticalChance,
    computeDamage,
    computeToHit,
    criticalEffectLevel,
    criticalFailureLevel,
    difficultyDamagePercent,
    knockbackDistance,
    randomRoll,
    rangeToHitModifier,
    Roll,
    splitBurstRounds,
    type Rng,
} from './combat/fo2Formulas.js'
import { CRITICAL_FAILURE_TABLE, CRITICAL_HIT_TABLES, Dam, hitLocationIndex, PLAYER_CRITICAL_HIT_TABLE } from './combat/criticalTables.js'
import {
    attackApCostFor,
    canAimAttack,
    getAmmoModifiers,
    getAttackWeaponInfo,
    weaponHasBurst,
    type AttackWeaponInfo,
    type HitMode,
} from './combat/attackInfo.js'
import { PerkId, perkRank } from './character/perkIds.js'
import { describeAttack, type AttackReport } from './combat/combatMessages.js'
import { TraitId } from './character/statModifiers.js'
import { Lightmap } from './lightmap.js'
import { hexDirectionTo, hexDistance, hexInDirectionDistance, hexLine, hexNearestNeighbor, hexNeighbors, Point } from './geometry.js'
import globalState from './globalState.js'
import { Critter, Obj, WeaponObj } from './object.js'
import { Player } from './player.js'
import { Scripting } from './scripting.js'
import { uiEndCombat, uiStartCombat, uiUpdateCombatHUD, uiLog } from './ui.js'
import { getFileText, getMessage, getRandomInt, parseIni, rollSkillCheck } from './util.js'
import {
    fleeHpThreshold,
    normalizeAttackWho,
    parseAiInt,
    shouldAttemptCalledShot,
    chemUseHpRatioThreshold,
    bestWeaponSuppressesBurst,
    shouldAdvanceOnTarget,
    allowAreaAttack,
    type AiAttackWho,
} from './combatAi.js'
import { applyDrugToCritter } from './character/timedEffects.js'

// Turn-based combat system

export class ActionPoints {
    combat = 0 // Combat AP
    move = 0 // Move AP
    attachedCritter: Critter

    constructor(obj: Critter) {
        this.attachedCritter = obj
        this.resetAP()
    }

    resetAP() {
        const AP = this.getMaxAP()
        this.combat = AP.combat
        this.move = AP.move
    }

    getMaxAP(): { combat: number; move: number } {
        // STAT_MAXIMUM_ACTION_POINTS already folds in Action Boy, Bruiser and
        // the overload penalty (Critter.getStat); Bonus Move adds 2 free
        // movement-only AP per rank to the player's turn (combat.cc _combat_turn).
        const critter = this.attachedCritter
        const maxAP = critter.getStat('AP')
        const bonusMove = critter.isPlayer ? perkRank(critter, PerkId.BONUS_MOVE) * 2 : 0
        return {
            combat: Math.max(0, Number.isFinite(maxAP) ? maxAP : 0),
            move: bonusMove,
        }
    }

    getAvailableMoveAP(): number {
        return this.combat + this.move
    }

    getAvailableCombatAP() {
        return this.combat
    }

    subtractMoveAP(value: number): boolean {
        if (value <= 0) {return true}
        if (this.getAvailableMoveAP() < value) {return false}

        this.move -= value
        if (this.move < 0) {
            if (this.subtractCombatAP(-this.move)) {
                this.move = 0
                return true
            }
            return false
        }

        return true
    }

    subtractCombatAP(value: number): boolean {
        if (value <= 0) {return true}
        if (this.combat < value) {return false}

        this.combat -= value
        return true
    }
}

export class AI {
    static aiTxt: any = null // AI.TXT: packet num -> key/value
    combatant: Critter
    info: any

    static init(): void {
        // load and parse AI.TXT
        if (AI.aiTxt !== null)
            // already loaded
            {return}

        AI.aiTxt = {}
        const ini = parseIni(getFileText('data/data/ai.txt'))
        if (ini === null) {
            // AI.TXT unavailable (e.g. asset not yet loaded); leave table empty
            // so that AI critters fall back to a default packet rather than crashing.
            console.warn("combat: couldn't load AI.TXT — AI critters will use default packet")
            return
        }
        for (const key in ini) {
            ini[key].keyName = key
            AI.aiTxt[ini[key].packet_num] = ini[key]
        }
    }

    static getPacketInfo(aiNum: number): any {
        return AI.aiTxt[aiNum] || null
    }

    constructor(combatant: Critter) {
        this.combatant = combatant

        // load if necessary
        if (AI.aiTxt === null) {AI.init()}

        this.info = AI.getPacketInfo(this.combatant.aiNum)
        if (!this.info) {
            // Unknown AI packet — use a safe default so combat doesn't crash.
            console.warn('combat: no AI packet for ' + combatant.toString() + ' (packet ' + this.combatant.aiNum + ') — using defaults')
            this.info = { chance: 50, min_hp: 0, max_dist: 5, run_start: 278, run_end: 289, move_start: 250, move_end: 253 }
        }
    }
}

// A combat encounter

/** Game ticks per day (scripts.h GAME_TIME_TICKS_PER_DAY). */
const TICKS_PER_DAY = 864000

/** Object flag: occupies more than one hex (+15% to be hit). */
const OBJECT_MULTIHEX = 0x800

/** Object flag: projectiles pass through (glass, fences). */
const OBJECT_SHOOT_THRU = 0x80000000

/** _combat_check_bad_shot results. */
export type BadShot = 'ok' | 'dead' | 'bothArmsCrippled' | 'armCrippled' | 'notEnoughAP' | 'outOfRange' | 'noAmmo' | 'aimBlocked'

/** combat.msg text for a refused attack (combat.cc _combat_attack_this). */
export function badShotMessage(bad: BadShot, apCost: number): string | null {
    const msg = (id: number, fallback: string) => {
        try {
            return getMessage('combat', id) || fallback
        } catch {
            return fallback
        }
    }
    switch (bad) {
        case 'notEnoughAP': return msg(100, 'You need %d action points.').replace('%d', String(apCost))
        case 'noAmmo': return msg(101, 'Out of ammo.')
        case 'outOfRange': return msg(102, 'Target out of range.')
        case 'aimBlocked': return msg(104, 'Your aim is blocked.')
        case 'bothArmsCrippled': return msg(105, 'You cannot use weapons with both arms crippled.')
        case 'armCrippled': return msg(106, 'You cannot use two-handed weapons with a crippled arm.')
        default: return null
    }
}

/** Critter proto flags (obj_types.h). */
const CRITTER_NO_DROP = 0x40
const CRITTER_INVULNERABLE = 0x400
const CRITTER_NO_KNOCKBACK = 0x4000

/** Kill types that Living Anatomy's +5 damage does not apply to. */
const KILL_TYPE_ROBOT = 10
const KILL_TYPE_ALIEN = 16

/** Pariah Dog: joining the party gives the player the Jinxed perk. */
const PARIAH_DOG_PID = 16777413

interface CriticalFailureResult {
    /** DAM_CRITICAL was set (an effect applied); otherwise it reads as a plain miss. */
    critical: boolean
    damage: number
    flags: number
    victim: Critter | null
    victimDamage: number
}

/** Result of resolving one attack (combat.cc Attack struct, simplified). */
export interface AttackOutcome {
    hit: boolean
    crit: boolean
    /** Critical damage multiplier (2 = none). */
    DM: number
    /** combat.msg id describing the critical, when there is one. */
    msgID?: number
    /** Dam flags applied to the defender. */
    flags: number
    roll: Roll
}

export class Combat {
    combatants: Critter[]
    playerIdx: number
    player: Player
    turnNum: number
    whoseTurn: number
    inPlayerTurn: boolean
    round: number

    /** Inclusive random source override (tests); defaults to getRandomInt. */
    rng?: Rng

    private get random(): Rng {
        return this.rng ?? ((min, max) => getRandomInt(min, max))
    }

    /** Set when the attack being resolved killed someone (auto-ends combat). */
    private killedThisAttack = false

    constructor(objects: Obj[], attacker?: Critter | null, defender?: Critter | null) {
        // Gather a list of combatants (critters meeting a certain criteria)
        this.combatants = objects.filter((obj) => {
            if (obj instanceof Critter) {
                if (obj.dead || !obj.visible) {return false}

                // AI is initialised lazily here rather than in Critter to avoid
                // pulling the combat module into non-combat callers and to skip
                // the (expensive) AI construction for critters that never fight.
                if (!obj.isPlayer && !obj.ai) {
                    try { obj.ai = new AI(obj) } catch(e) {
                        console.warn('combat: could not create AI for ' + obj.toString() + ': ' + e)
                    }
                }

                if (obj.stats === undefined) {
                    console.warn('combat: critter ' + obj.toString() + ' has no stats — skipping')
                    return false
                }
                obj.dead = false
                obj.AP = new ActionPoints(obj)
                return true
            }

            return false
        }) as Critter[]

        // combat.cc _combat_sequence_init: the first round runs attacker,
        // defender, then the player; everyone else follows in map order.
        // Later rounds are ordered by Sequence (see sortBySequence).
        const front: Critter[] = []
        const place = (c: Critter | null | undefined) => {
            if (c && this.combatants.includes(c) && !front.includes(c)) {front.push(c)}
        }
        place(attacker)
        place(defender)
        place(this.combatants.find((x) => x.isPlayer))
        this.combatants = [...front, ...this.combatants.filter((c) => !front.includes(c))]

        this.playerIdx = this.combatants.findIndex((x) => x.isPlayer)
        if (this.playerIdx === -1) {
            // Player not found among live combatants — bail out gracefully.
            console.warn("combat: couldn't find player among combatants")
            this.player = null as any
            this.turnNum = 1
            this.whoseTurn = 0
            this.inPlayerTurn = false
            this.round = 1
            return
        }

        this.player = this.combatants[this.playerIdx] as Player
        this.turnNum = 1
        this.whoseTurn = -1
        this.inPlayerTurn = false
        this.round = 1

        // Stop the player from walking combat is initiating
        this.player.clearAnim()

        uiStartCombat()
    }

    /**
     * combat.cc _compare_faster: descending Sequence, ties by Luck. The sort
     * is stable for equal critters, so the player stays ahead on a full tie.
     */
    sortBySequence(): void {
        const read = (c: Critter, stat: string) => {
            const v = typeof c.getStat === 'function' ? c.getStat(stat) : 0
            return Number.isFinite(v) ? v : 0
        }
        const seq = (c: Critter) => read(c, 'Sequence')
        const luck = (c: Critter) => read(c, 'LUK')
        this.combatants.sort((a, b) => {
            if (seq(b) !== seq(a)) {return seq(b) - seq(a)}
            if (luck(b) !== luck(a)) {return luck(b) - luck(a)}
            if (a.isPlayer && !b.isPlayer) {return -1}
            if (!a.isPlayer && b.isPlayer) {return 1}
            return 0
        })
        this.playerIdx = this.combatants.findIndex((x) => x.isPlayer)
    }

    log(msg: any) {
        // Combat-related debug log
        console.log(msg)
    }

    /**
     * Stable-per-combat identifier for a combatant, used as `entityId` in
     * combat:* EventBus payloads (the HUD log only displays it). Critters
     * have no global numeric id, so the combatant index is the contract.
     */
    private combatantId(c: Critter): number {
        return Array.isArray(this.combatants) ? this.combatants.indexOf(c) : -1
    }

    private normalizeHitRegion(region: string): string {
        if (CriticalEffects.regionHitChanceDecTable[region] !== undefined) {return region}
        return 'torso'
    }

    private normalizeAttackRegionForAttacker(obj: Critter, region: string): string {
        const normalized = this.normalizeHitRegion(region)
        // Attackers that cannot aim (Fast Shot, bursts, explosives) always hit uncalled.
        if (normalized !== 'torso' && !canAimAttack(obj, getAttackWeaponInfo(obj))) {return 'torso'}
        return normalized
    }

    /** Criticals are suppressed until the first full game day has passed (random.cc). */
    private criticalsAllowed(): boolean {
        return Math.floor((globalState.gameTickTime ?? 0) / TICKS_PER_DAY) >= 1
    }

    /** Attacker is not on the player's team (combat difficulty applies). */
    private hostileToPlayer(obj: Critter): boolean {
        const playerTeam = (globalState.player as any)?.teamNum ?? this.player?.teamNum ?? 0
        return !obj.isPlayer && obj.teamNum !== playerTeam
    }

    /** Number of living critters standing between attacker and target. */
    private crittersInLineOfFire(obj: Critter, target: Critter): number {
        if (!obj.position || !target.position) {return 0}
        const path = hexLine(obj.position, target.position)
        if (path.length <= 2) {return 0}
        const between = new Set(path.slice(1, -1).map((p) => `${p.x},${p.y}`))
        const candidates: Critter[] = Array.isArray(this.combatants) ? this.combatants : []
        let blockers = 0
        for (const c of candidates) {
            if (c === obj || c === target || c.dead || !c.position) {continue}
            if (between.has(`${c.position.x},${c.position.y}`)) {blockers++}
        }
        return blockers
    }

    accountForPartialCover(obj: Critter, target: Critter): number {
        // Fallout 2: each intervening critter on the attack line applies -10% hit chance.
        return this.crittersInLineOfFire(obj, target) * 10
    }

    /**
     * Range penalty for a ranged attack (positive = harder, negative = the
     * point-blank bonus), per attackDetermineToHit.
     */
    getHitDistanceModifier(obj: Critter, target: Critter, weapon?: Obj | null): number {
        const info = getAttackWeaponInfo(obj)
        const perk = (weapon as any)?.pro?.extra?.perk ?? info.perk
        // BLK-093: attacker or target may lack a tile (inventory/scripted events).
        const distance = (obj.position && target.position) ? hexDistance(obj.position, target.position) : 0
        return -rangeToHitModifier({
            isPlayer: obj.isPlayer === true,
            weaponPerk: typeof perk === 'number' ? perk : -1,
            perception: obj.getStat('PER'),
            sharpshooterRank: perkRank(obj, PerkId.SHARPSHOOTER),
            distance,
            attackerBlind: (obj as any).blinded === true,
        })
    }

    /** Received light at `target`, 0..65536, with the player's Night Vision. */
    private targetLightIntensity(target: Critter): number {
        let ambient = globalState.ambientLightLevel ?? 65536
        ambient = Math.min(65536, ambient + perkRank(globalState.player as any, PerkId.NIGHT_VISION) * Math.trunc(65536 / 5))
        let tile = 65536
        try {
            tile = Lightmap.getObjectReceivedLight(target)
        } catch {
            tile = 65536
        }
        return Math.max(ambient, Math.min(65536, tile))
    }

    getHitChance(obj: Critter, target: Critter, region: string, hitMode: HitMode = 1) {
        const normalizedRegion = this.normalizeAttackRegionForAttacker(obj, region)
        const info = getAttackWeaponInfo(obj, hitMode)

        let skill = obj.getSkill(info.skill)
        if (typeof skill !== 'number' || !Number.isFinite(skill)) {skill = 0}

        const usesRange = info.weapon !== null && (info.attackType === 'ranged' || info.attackType === 'throw')
        const targetIsCritter = typeof (target as any)?.getStat === 'function'
        const ammo = getAmmoModifiers(info.weapon)
        const knocked = (target as any).knockedDown === true || (target as any).knockedOut === true

        let hitChance = computeToHit({
            isPlayer: obj.isPlayer === true,
            skill,
            hasWeapon: info.weapon !== null,
            attackType: info.attackType,
            weaponPerk: info.perk,
            weaponTwoHanded: info.twoHanded,
            weaponMinStrength: info.minStrength,
            perception: obj.getStat('PER'),
            strength: obj.getStat('STR'),
            sharpshooterRank: perkRank(obj, PerkId.SHARPSHOOTER),
            weaponHandling: perkRank(obj, PerkId.WEAPON_HANDLING) > 0,
            oneHanderTrait: obj.charTraits?.has?.(TraitId.ONE_HANDER) ?? false,
            distance: (obj.position && target.position) ? hexDistance(obj.position, target.position) : 0,
            crittersInLineOfFire: usesRange ? Math.trunc(this.accountForPartialCover(obj, target) / 10) : 0,
            rangeModifierOverride: usesRange ? -this.getHitDistanceModifier(obj, target, info.weapon) : undefined,
            targetAC: targetIsCritter ? target.getStat('AC') : null,
            ammoACModifier: ammo.acModifier,
            region: normalizedRegion,
            targetMultihex: ((target as any).flags & OBJECT_MULTIHEX) !== 0,
            targetLightIntensity: obj.isPlayer ? this.targetLightIntensity(target) : 65536,
            attackerBlind: (obj as any).blinded === true,
            targetKnockedDownOrOut: knocked,
            combatDifficulty: globalState.combatDifficulty ?? 1,
            attackerIsHostileToPlayer: this.hostileToPlayer(obj),
        })

        if (isNaN(hitChance)) {
            console.warn('getHitChance: NaN hit chance — clamping to 0')
            hitChance = 0
        }

        const crit = attackCriticalChance(obj.getStat('Critical Chance'), normalizedRegion)
        return { hit: hitChance, crit }
    }

    /**
     * Roll a single attack (combat.cc attackCompute): to-hit roll, Jinxed,
     * Slayer / Sniper upgrades, then the critical table for a critical hit.
     */
    rollHit(obj: Critter, target: Critter, region: string, hitMode: HitMode = 1): AttackOutcome {
        const normalizedRegion = this.normalizeAttackRegionForAttacker(obj, region)
        const info = getAttackWeaponInfo(obj, hitMode)
        const hitChance = this.getHitChance(obj, target, normalizedRegion, hitMode)
        let roll = randomRoll(hitChance.hit, hitChance.crit, this.random, this.criticalsAllowed()).roll

        if (roll === Roll.Failure && this.jinxActive()) {
            if (this.random(0, 1) === 1) {roll = Roll.CriticalFailure}
        }

        if (roll === Roll.Success && obj.isPlayer) {
            const melee = info.attackType === 'melee' || info.attackType === 'unarmed'
            if (melee && perkRank(obj, PerkId.SLAYER) > 0) {roll = Roll.CriticalSuccess}
            if (info.attackType === 'ranged' && perkRank(obj, PerkId.SNIPER) > 0) {
                if (this.random(1, 10) <= obj.getStat('LUK')) {roll = Roll.CriticalSuccess}
            }
        }

        if (roll === Roll.CriticalSuccess) {
            const crit = this.computeCriticalHit(obj, target, normalizedRegion, info)
            return { hit: true, crit: true, DM: crit.DM, msgID: crit.msgID, flags: crit.flags, roll }
        }
        if (roll === Roll.Success) {
            return { hit: true, crit: false, DM: 2, flags: this.enhancedKnockoutFlags(obj, target, info), roll }
        }
        return { hit: false, crit: roll === Roll.CriticalFailure, DM: 2, flags: 0, roll }
    }

    /** Jinxed: the player has the trait or the perk (Pariah Dog grants it). */
    private jinxActive(): boolean {
        const player: any = globalState.player ?? this.player
        if (player?.charTraits?.has?.(TraitId.JINXED)) {return true}
        if (perkRank(player, PerkId.JINXED) > 0) {return true}
        const dogInParty = globalState.gParty?.getPartyMemberByPID?.(PARIAH_DOG_PID)
        return !!dogInParty || (this.combatants ?? []).some((c) => c.pid === PARIAH_DOG_PID && !c.dead)
    }

    /** attackComputeEnhancedKnockout: STR−8 % chance to knock out. */
    private enhancedKnockoutFlags(obj: Critter, target: Critter, info: AttackWeaponInfo): number {
        if (info.perk !== PerkId.WEAPON_ENHANCED_KNOCKOUT) {return 0}
        if (this.random(1, 100) <= obj.getStat('STR') - 8) {return Dam.KNOCKED_OUT}
        return 0
    }

    /** attackComputeCriticalHit: critical table row, massive-critical stat check. */
    private computeCriticalHit(obj: Critter, target: Critter, region: string, info: AttackWeaponInfo): { DM: number; msgID?: number; flags: number } {
        const critterFlags = (target as any)?.pro?.extra?.flags ?? 0
        if (typeof (target as any)?.getStat !== 'function' || (critterFlags & CRITTER_INVULNERABLE) !== 0) {
            return { DM: 2, flags: 0 }
        }

        const effect = criticalEffectLevel(this.random(1, 100), obj.getStat('Better Criticals'))
        const loc = hitLocationIndex(region)
        const row = target.isPlayer
            ? PLAYER_CRITICAL_HIT_TABLE[loc]?.[effect]
            : CRITICAL_HIT_TABLES[(target as any).killType ?? 0]?.[loc]?.[effect]
        if (!row) {return { DM: 2, flags: Dam.CRITICAL }}

        const [multiplier, baseFlags, massiveStat, massiveModifier, massiveFlags, messageId, massiveMessageId] = row
        let flags = baseFlags
        let msgID = messageId
        if (massiveStat !== -1) {
            // statRoll: d10 against stat + modifier; failing adds the massive effects.
            const statName = SPECIAL_NAMES[massiveStat]
            const value = target.getStat(statName) + massiveModifier
            if (this.random(1, 10) > value) {
                flags |= massiveFlags
                msgID = massiveMessageId
            }
        }
        if (flags & Dam.CRIP_RANDOM) {flags = this.randomCripple(flags)}
        if (info.perk === PerkId.WEAPON_ENHANCED_KNOCKOUT) {flags |= Dam.KNOCKED_OUT}
        if (critterFlags & CRITTER_NO_DROP) {flags &= ~Dam.DROP}
        return { DM: multiplier, msgID, flags }
    }

    private randomCripple(flags: number): number {
        flags &= ~Dam.CRIP_RANDOM
        const limbs = [Dam.CRIP_LEG_LEFT, Dam.CRIP_LEG_RIGHT, Dam.CRIP_ARM_LEFT, Dam.CRIP_ARM_RIGHT]
        return flags | limbs[this.random(0, 3)]
    }

    /**
     * Damage for `rounds` rounds hitting `target` (attackComputeDamage).
     * `critMultiplier` is the critical table multiplier (2 for a normal hit).
     */
    getDamageDone(obj: Critter, target: Critter, critMultiplier: number, flags = 0, rounds = 1, hitMode: HitMode = 1) {
        const info = getAttackWeaponInfo(obj, hitMode)
        if (typeof (target as any)?.getStat !== 'function') {return 0}
        const ammo = getAmmoModifiers(info.weapon)
        const melee = info.attackType === 'melee' || info.attackType === 'unarmed'
        const isPlayer = obj.isPlayer === true

        let maxDamage = info.maxDamage
        const minDamage = info.minDamage
        if (melee && typeof obj.getStat === 'function') {
            // weaponGetDamage: Melee Damage widens the top of the range.
            const meleeDamage = obj.getStat('Melee')
            if (Number.isFinite(meleeDamage)) {maxDamage += meleeDamage}
        }

        let flatAfter = 0
        if (isPlayer && perkRank(obj, PerkId.LIVING_ANATOMY) > 0) {
            const kt = (target as any).killType
            if (kt !== KILL_TYPE_ROBOT && kt !== KILL_TYPE_ALIEN) {flatAfter += 5}
        }
        if (isPlayer && perkRank(obj, PerkId.PYROMANIAC) > 0 && info.damageType === 'Fire') {flatAfter += 5}

        if (maxDamage < minDamage) {maxDamage = minDamage}

        return computeDamage({
            minDamage,
            maxDamage,
            rounds,
            damageBonus: isPlayer && info.attackType === 'ranged' ? 2 * perkRank(obj, PerkId.BONUS_RANGED_DAMAGE) : 0,
            damageMultiplier: critMultiplier,
            ammoDamageMultiplier: ammo.damageMultiplier,
            ammoDamageDivisor: ammo.damageDivisor,
            ammoDRModifier: ammo.drModifier,
            damageThreshold: target.getStat('DT ' + info.damageType) || 0,
            damageResistance: target.getStat('DR ' + info.damageType) || 0,
            bypassArmor: (flags & Dam.BYPASS) !== 0,
            isEmp: info.damageType === 'EMP',
            penetrate: info.perk === PerkId.WEAPON_PENETRATE,
            finesse: isPlayer && (obj.charTraits?.has?.(TraitId.FINESSE) ?? false),
            difficultyPercent: difficultyDamagePercent(globalState.combatDifficulty ?? 1, this.hostileToPlayer(obj)),
            flatAfter,
        }, this.random)
    }

    getCombatMsg(id: number): string | null {
        try {
            return getMessage('combat', id)
        } catch {
            return null
        }
    }

    /** AP cost of `obj`'s attack (item.cc weaponGetActionPointCost). */
    getAttackAPCost(obj: Critter, hitMode: HitMode = 1, aiming = false): number {
        return attackApCostFor(obj, getAttackWeaponInfo(obj, hitMode), aiming)
    }

    /** Get burst AP cost (secondary attack mode); 99 when the weapon cannot burst. */
    private getBurstAPCost(obj: Critter): number {
        if (!weaponHasBurst(obj)) {return 99}
        return this.getAttackAPCost(obj, 2)
    }

    /** Check whether the critter's weapon has a burst secondary attack mode. */
    private weaponHasBurstMode(obj: Critter): boolean {
        return weaponHasBurst(obj)
    }

    /**
     * Apply an attack's result flags to the critter that suffered them
     * (combat.cc _set_new_results and the knockback in attackComputeDamage).
     */
    private applyResultFlags(victim: Critter, flags: number, damage: number, attacker: Critter, info: AttackWeaponInfo): void {
        if (victim.dead) {return}
        const v = victim as any
        if (flags & Dam.KNOCKED_OUT) {
            v.knockedOut = true
            v.knockedDown = true
            const end = victim.getStat('END')
            v.knockoutWakeTick = (globalState.gameTickTime ?? 0) + 10 * (35 - 3 * end)
        }
        if (flags & Dam.KNOCKED_DOWN) {v.knockedDown = true}
        if (flags & Dam.CRIP_LEG_LEFT) {v.crippledLeftLeg = true}
        if (flags & Dam.CRIP_LEG_RIGHT) {v.crippledRightLeg = true}
        if (flags & Dam.CRIP_ARM_LEFT) {v.crippledLeftArm = true}
        if (flags & Dam.CRIP_ARM_RIGHT) {v.crippledRightArm = true}
        if (flags & Dam.BLIND) {v.blinded = true}
        if (flags & Dam.LOSE_TURN) {v.loseNextTurn = true}
        if (flags & Dam.ON_FIRE) {v.onFire = true}
        if ((flags & Dam.DROP) && !victim.isPlayer) {CriticalEffects.dropWeapon(victim)}
        if (flags & Dam.DEAD) {
            critterKill(victim, attacker, true)
            return
        }

        // Knockback: melee/unarmed/explosive hits push single-hex critters
        // damage/10 hexes away (Knockback perk /5; Stonewall halves, 50% immune).
        const explosive = info.damageType === 'Explosive'
        const melee = info.attackType === 'melee' || info.attackType === 'unarmed'
        const critterFlags = v.pro?.extra?.flags ?? 0
        if (damage > 0 && (melee || explosive) && (v.flags & OBJECT_MULTIHEX) === 0 && (critterFlags & CRITTER_NO_KNOCKBACK) === 0) {
            let stonewall = false
            if (victim.isPlayer && perkRank(victim, PerkId.STONEWALL) > 0) {
                stonewall = true
                if (this.random(0, 100) < 50) {return}
            }
            const dist = knockbackDistance(damage, info.perk, stonewall)
            if (dist > 0 && attacker.position && victim.position) {
                const dir = hexDirectionTo(attacker.position, victim.position)
                const newPos = hexInDirectionDistance(victim.position, dir, dist)
                if (newPos && newPos.x >= 0 && newPos.x < 200 && newPos.y >= 0 && newPos.y < 200) {
                    victim.move(newPos)
                }
            }
        }
    }

    /** Deal damage and apply result flags to one defender, emitting combat events. */
    private hitCritter(obj: Critter, target: Critter, damage: number, flags: number, info: AttackWeaponInfo): void {
        EventBus.emit('combat:hit', {
            attackerId: this.combatantId(obj),
            targetId: this.combatantId(target),
            damage,
            damageType: normalizeDamageType(info.damageType),
        })
        if (damage > 0) {critterDamage(target, damage, obj)}
        this.applyResultFlags(target, flags, damage, obj, info)
        if (target.dead) {
            this.killedThisAttack = true
            this.perish(target)
        }
    }

    /**
     * A ranged shot that missed keeps flying (attackCompute): the first critter
     * on the line past the target, out to the weapon's range, is hit for
     * normal damage.
     */
    private strayShot(obj: Critter, target: Critter, info: AttackWeaponInfo): Critter | null {
        if (!obj.position || !target.position) {return null}
        const dir = hexDirectionTo(obj.position, target.position)
        if (dir === null || dir === undefined) {return null}
        const line = hexLine(obj.position, target.position)
        let end = target.position
        const beyond = Math.max(0, info.range - hexDistance(obj.position, target.position))
        if (beyond > 0) {
            const far = hexInDirectionDistance(target.position, dir, beyond)
            if (far) {end = far}
        }
        const tail = hexLine(target.position, end).slice(1)
        const seen = new Set(line.map((p) => `${p.x},${p.y}`))
        for (const hex of tail) {
            if (seen.has(`${hex.x},${hex.y}`)) {continue}
            const occupant = globalState.gMap?.critterAtPosition?.(hex) as Critter | undefined
            if (occupant && occupant !== obj && occupant !== target && !occupant.dead) {return occupant}
        }
        return null
    }

    /**
     * Critical failure (attackComputeCriticalFailure): effects from the
     * weapon's critical-failure table, scaled by Luck. The player is immune
     * for the first 6 game days.
     */
    private criticalFailure(obj: Critter, target: Critter, info: AttackWeaponInfo): CriticalFailureResult {
        const none: CriticalFailureResult = { critical: false, damage: 0, flags: 0, victim: null, victimDamage: 0 }
        const critterFlags = (obj as any).pro?.extra?.flags ?? 0
        if (critterFlags & CRITTER_INVULNERABLE) {return none}
        if (obj.isPlayer && Math.floor((globalState.gameTickTime ?? 0) / TICKS_PER_DAY) < 6) {return none}

        const level = criticalFailureLevel(this.random(1, 100), obj.getStat('LUK'))
        let flags = CRITICAL_FAILURE_TABLE[info.critFailType]?.[level] ?? 0
        if (flags === 0) {return none}
        if (critterFlags & CRITTER_NO_DROP) {flags &= ~Dam.DROP}
        if (flags & Dam.CRIP_RANDOM) {flags = this.randomCripple(flags)}

        const who = obj.isPlayer ? 'You' : obj.name
        this.log(`${who} critically failed (effect ${level})`)

        let selfDamage = 0
        if (flags & (Dam.HIT_SELF | Dam.EXPLODE)) {
            selfDamage = this.getDamageDone(obj, obj, 2, 0, 1, info.hitMode)
            if (selfDamage > 0) {critterDamage(obj, selfDamage, obj)}
        }
        if (flags & Dam.LOSE_TURN) {
            if (obj.AP) {obj.AP.combat = 0}
        }
        if ((flags & Dam.LOSE_AMMO) && info.attackType === 'ranged' && info.weapon?.extra) {
            info.weapon.extra.ammoLoaded = 0
        }
        if (flags & Dam.DESTROY) {CriticalEffects.destroyWeapon(obj)}
        else if (flags & Dam.DROP) {CriticalEffects.dropWeapon(obj)}
        this.applyResultFlags(obj, flags & (Dam.KNOCKED_DOWN | Dam.CRIP_LEG_LEFT | Dam.CRIP_LEG_RIGHT | Dam.CRIP_ARM_LEFT | Dam.CRIP_ARM_RIGHT), 0, obj, info)

        let victim: Critter | null = null
        let victimDamage = 0
        if (flags & Dam.RANDOM_HIT) {
            victim = this.randomTarget(obj, target)
            if (victim) {
                victimDamage = this.getDamageDone(obj, victim, 2, 0, 1, info.hitMode)
                this.hitCritter(obj, victim, victimDamage, 0, info)
            }
        }
        if (obj.dead) {this.perish(obj)}
        return { critical: true, damage: selfDamage, flags, victim, victimDamage }
    }

    /** Print attack lines to the display monitor. */
    private announce(lines: string[]): void {
        for (const line of lines) {uiLog(line)}
    }

    /** _combat_ai_random_target: another living critter near the attacker. */
    private randomTarget(obj: Critter, target: Critter): Critter | null {
        const pool = (this.combatants ?? []).filter((c) =>
            c !== obj && c !== target && !c.dead && c.position && obj.position && hexDistance(obj.position, c.position) <= 5)
        if (pool.length === 0) {return null}
        return pool[this.random(0, pool.length - 1)]
    }

    /** Non-critter, shot-blocking objects between attacker and target (_combat_is_shot_blocked). */
    isShotBlocked(obj: Critter, target: Critter): boolean {
        if (!obj.position || !target.position || !globalState.gMap) {return false}
        const line = hexLine(obj.position, target.position)
        for (const hex of line.slice(1, -1)) {
            const objs: Obj[] = (globalState.gMap as any).objectsAtPosition?.(hex) ?? []
            for (const o of objs) {
                if (o === target || o.type === 'critter') {continue}
                if (((o as any).flags & OBJECT_SHOOT_THRU) !== 0) {continue}
                if (typeof (o as any).blocks === 'function' && (o as any).blocks()) {return true}
            }
        }
        return false
    }

    /** combat.cc _combat_check_bad_shot. */
    checkBadShot(obj: Critter, target: Critter, hitMode: HitMode, aiming: boolean): BadShot {
        if (target.dead) {return 'dead'}
        const info = getAttackWeaponInfo(obj, hitMode)
        const o = obj as any
        if (info.weapon) {
            if (o.crippledLeftArm && o.crippledRightArm) {return 'bothArmsCrippled'}
            if ((o.crippledLeftArm || o.crippledRightArm) && info.twoHanded) {return 'armCrippled'}
        }
        const available = obj.AP ? obj.AP.getAvailableCombatAP() : 0
        if (attackApCostFor(obj, info, aiming) > available) {return 'notEnoughAP'}
        const distance = (obj.position && target.position) ? hexDistance(obj.position, target.position) : 0
        if (info.range < distance) {return 'outOfRange'}
        const capacity = info.weapon?.pro?.extra?.maxAmmo ?? 0
        if (capacity > 0 && weaponNeedsReload(info.weapon)) {return 'noAmmo'}
        if ((info.attackType === 'ranged' || info.attackType === 'throw' || info.range > 1) && this.isShotBlocked(obj, target)) {
            return 'aimBlocked'
        }
        return 'ok'
    }

    /**
     * The player attacks `target` with the current item action
     * (combat.cc _combat_attack_this). Refusals print the engine's messages.
     * `chooseRegion` is asked for the body part of an aimed attack.
     * Returns true when an attack was started (or the called-shot picker opened).
     */
    playerAttack(target: Critter, chooseRegion?: (pick: (region: string) => void) => void): boolean {
        const player = this.player
        if (!player) {return false}
        const weapon: any = player.equippedWeapon
        const action = weapon?.weapon
        const hitMode: HitMode = action?.hitMode?.() ?? 1
        const aiming = (action?.isCalled?.() ?? false) && canAimAttack(player, getAttackWeaponInfo(player, hitMode))

        const bad = this.checkBadShot(player, target, hitMode, aiming)
        if (bad !== 'ok') {
            const msg = badShotMessage(bad, attackApCostFor(player, getAttackWeaponInfo(player, hitMode), aiming))
            if (msg) {uiLog(msg)}
            if (bad === 'noAmmo') {EventBus.emit('audio:playSound', { soundId: 'out_of_ammo' })}
            return false
        }

        const fire = (region: string) => {
            if (this.checkBadShot(player, target, hitMode, aiming) !== 'ok') {return}
            const cost = attackApCostFor(player, getAttackWeaponInfo(player, hitMode), aiming)
            if (!player.AP!.subtractCombatAP(cost)) {return}
            if (getAttackWeaponInfo(player, hitMode).isBurst) {
                this.burstAttack(player, target)
            } else {
                this.attack(player, target, region, undefined, hitMode)
            }
        }

        if (aiming && chooseRegion) {
            chooseRegion(fire)
        } else {
            fire('torso')
        }
        return true
    }

    attack(obj: Critter, target: Critter, region = 'torso', callback?: () => void, hitMode: HitMode = 1) {
        const info = getAttackWeaponInfo(obj, hitMode)
        // Empty ranged weapon: dry click, no attack roll, no ammo, no
        // animation. The callback still fires so turn flow continues.
        if (weaponNeedsReload(obj.equippedWeapon)) {
            this.log(`${obj.isPlayer ? 'You' : obj.name} pull${obj.isPlayer ? '' : 's'} the trigger — click. Out of ammo.`)
            if (obj.isPlayer) {uiLog(this.getCombatMsg(101) || 'Out of ammo.')}
            EventBus.emit('audio:playSound', { soundId: 'out_of_ammo' })
            if (callback) {callback()}
            return
        }
        // Ranged weapons consume one round per trigger pull (hit or miss).
        if (isRangedWeapon(obj.equippedWeapon)) {
            consumeRounds(obj.equippedWeapon!, 1)
        }

        // turn to face the target
        // BLK-059: Guard against null positions before calling hexNearestNeighbor.
        if (obj.position && target.position) {
            const hex = hexNearestNeighbor(obj.position, target.position)
            if (hex !== null) {obj.orientation = hex.direction}
        }

        // BLK-117: Track last target and last attacker per critter so that
        // get_last_target() / get_last_attacker() sfall opcodes return real values.
        (obj as any).lastCombatTarget = target
        ;(target as any).lastCombatAttacker = obj

        // FO2: fire combat_p_proc(COMBAT_SUBTYPE_ATTACK = 1) on the attacker so
        // scripts can react to attack events (e.g. trigger dialogue, modify damage).
        if (Config.engine.doLoadScripts) {
            Scripting.combatEvent(obj, 'onAttack', target)
        }

        this.killedThisAttack = false
        const who = obj.isPlayer ? 'You' : obj.name
        const targetName = target.isPlayer ? 'you' : target.name
        const normalizedRegion = this.normalizeAttackRegionForAttacker(obj, region)
        const outcome = this.rollHit(obj, target, normalizedRegion, hitMode)

        // BLK-062: Track whether this attack killed the last non-player combatant so
        // combat can be ended automatically after the animation completes.
        let shouldAutoEnd = false

        const report: AttackReport = {
            attacker: obj,
            defender: target,
            hit: outcome.hit,
            critical: outcome.crit,
            region: normalizedRegion,
            defenderDamage: 0,
            defenderFlags: 0,
            defenderDied: false,
            criticalMessageId: outcome.msgID,
            attackerDamage: 0,
            attackerFlags: 0,
            extras: [],
            tooWeak: obj.isPlayer && info.weapon !== null
                && info.minStrength - (perkRank(obj, PerkId.WEAPON_HANDLING) > 0 ? 3 : 0) > obj.getStat('STR'),
        }

        if (outcome.hit) {
            let damageMultiplier = outcome.DM
            // Silent Death: sneaking player, hand-to-hand, from behind, not their attacker.
            if (obj.isPlayer && (info.attackType === 'melee' || info.attackType === 'unarmed')
                && perkRank(obj, PerkId.SILENT_DEATH) > 0 && this.playerIsSneaking()
                && !isHitFromFront(obj, target) && (target as any).lastCombatAttacker !== obj) {
                damageMultiplier *= 2
            }
            const damage = this.getDamageDone(obj, target, damageMultiplier, outcome.flags, 1, hitMode)
            const extraMsg = outcome.crit && outcome.msgID ? this.getCombatMsg(outcome.msgID) || '' : ''
            this.log(who + ' hit ' + targetName + ' for ' + damage + ' damage ' + extraMsg)
            this.hitCritter(obj, target, damage, outcome.flags, info)
            report.defenderDamage = damage
            report.defenderFlags = outcome.flags
            report.defenderDied = target.dead === true
        } else {
            this.log(who + ' missed ' + targetName + (outcome.crit ? ' critically' : ''))
            EventBus.emit('combat:miss', {
                attackerId: this.combatantId(obj),
                targetId: this.combatantId(target),
            })
            if (outcome.roll === Roll.CriticalFailure) {
                const failure = this.criticalFailure(obj, target, info)
                report.critical = failure.critical
                report.attackerDamage = failure.damage
                report.attackerFlags = failure.flags & ~Dam.RANDOM_HIT
                if (failure.victim) {
                    // DAM_RANDOM_HIT: the attack lands on someone else instead.
                    Object.assign(report, {
                        hit: true, critical: false, defender: failure.victim, oops: target, region: 'torso',
                        defenderDamage: failure.victimDamage, defenderFlags: 0, defenderDied: failure.victim.dead === true,
                    })
                }
            } else if (info.attackType === 'ranged' || info.attackType === 'throw') {
                const stray = this.strayShot(obj, target, info)
                if (stray) {
                    const damage = this.getDamageDone(obj, stray, 2, 0, 1, hitMode)
                    this.log(`  the shot hits ${stray.isPlayer ? 'you' : stray.name} for ${damage}`)
                    this.hitCritter(obj, stray, damage, 0, info)
                    Object.assign(report, {
                        hit: true, critical: false, defender: stray, oops: target, region: 'torso',
                        defenderDamage: damage, defenderFlags: 0, defenderDied: stray.dead === true,
                    })
                }
            }
        }

        this.announce(describeAttack(report))

        if (this.killedThisAttack) {
            shouldAutoEnd = this.canEndCombat()
        }

        // BLK-062: When the last enemy dies, wrap the animation callback so that
        // nextTurn() is called automatically after the animation finishes.
        // nextTurn() will detect numActive===0 (all enemies dead) and call end().
        const effectiveCallback: (() => void) | undefined = shouldAutoEnd
            ? () => {
                if (callback) {callback()}
                if (globalState.inCombat && globalState.combat === this) {
                    this.nextTurn()
                }
            }
            : callback

        // attack!
        obj.staticAnimation('attack', effectiveCallback)
    }

    /** Sneak mode (pc flag 3). */
    private playerIsSneaking(): boolean {
        const p: any = this.player ?? globalState.player
        return typeof p?.pcFlags === 'number' && (p.pcFlags & (1 << 3)) !== 0
    }

    /**
     * Burst fire (combat.cc _compute_spray): one roll decides the burst; the
     * rounds split into left / centre / right thirds, half the centre third is
     * rolled individually against the target, and every other round flies
     * down its line hitting whoever stands in it.
     */
    burstAttack(obj: Critter, target: Critter, callback?: () => void) {
        // Empty ranged weapon: dry click, nothing fired.
        if (weaponNeedsReload(obj.equippedWeapon)) {
            this.log(`${obj.isPlayer ? 'You' : obj.name} pull${obj.isPlayer ? '' : 's'} the trigger — click. Out of ammo.`)
            if (obj.isPlayer) {uiLog(this.getCombatMsg(101) || 'Out of ammo.')}
            EventBus.emit('audio:playSound', { soundId: 'out_of_ammo' })
            if (callback) {callback()}
            return
        }
        // turn to face target
        if (obj.position && target.position) {
            const hex = hexNearestNeighbor(obj.position, target.position)
            if (hex !== null) {obj.orientation = hex.direction}
        }

        const attackerState = obj as any
        attackerState.lastCombatTarget = target
        ;(target as any).lastCombatAttacker = obj

        if (Config.engine.doLoadScripts) {
            Scripting.combatEvent(obj, 'onAttack', target)
        }

        this.killedThisAttack = false
        const info = getAttackWeaponInfo(obj, 2)
        const who = obj.isPlayer ? 'You' : obj.name
        const targetName = target.isPlayer ? 'you' : target.name

        // Rounds fired: the proto burst size, capped by what is loaded.
        const weaponObj = obj.equippedWeapon
        const protoBurst = info.burstRounds > 0 ? info.burstRounds : 10
        const loaded = (weaponObj?.extra?.ammoLoaded as number) ?? protoBurst
        const rounds = Math.max(1, Math.min(protoBurst, loaded))
        if (weaponObj?.extra && typeof weaponObj.extra.ammoLoaded === 'number') {
            weaponObj.extra.ammoLoaded = Math.max(0, weaponObj.extra.ammoLoaded - rounds)
        }
        this.log(`${who} burst-fires ${rounds} rounds at ${targetName}`)

        let accuracy = this.getHitChance(obj, target, 'torso', 2).hit
        const roll = randomRoll(accuracy, obj.getStat('Critical Chance'), this.random, this.criticalsAllowed()).roll
        let shouldAutoEnd = false

        const report: AttackReport = {
            attacker: obj, defender: target, hit: false, critical: false, region: 'torso',
            defenderDamage: 0, defenderFlags: 0, defenderDied: false,
            attackerDamage: 0, attackerFlags: 0, extras: [],
        }

        if (roll === Roll.CriticalFailure || (roll === Roll.Failure && this.jinxActive() && this.random(0, 1) === 1)) {
            EventBus.emit('combat:miss', { attackerId: this.combatantId(obj), targetId: this.combatantId(target) })
            const failure = this.criticalFailure(obj, target, info)
            report.critical = failure.critical
            report.attackerDamage = failure.damage
            report.attackerFlags = failure.flags & ~Dam.RANDOM_HIT
        } else {
            if (roll === Roll.CriticalSuccess) {accuracy += 20}

            const split = splitBurstRounds(rounds)
            let mainHits = 0
            for (let n = 0; n < split.mainTargetRounds; n++) {
                if (randomRoll(accuracy, 0, this.random, false).roll >= Roll.Success) {mainHits++}
            }

            // Every other round flies down its line: centre, then one hex
            // either side of the target (as seen from the shooter).
            const extraHits = new Map<Critter, number>()
            const shootLine = (aimAt: Point | null, count: number) => {
                if (!aimAt || count <= 0 || !obj.position) {return}
                const dir = hexDirectionTo(obj.position, aimAt)
                const beyond = Math.max(0, info.range - hexDistance(obj.position, aimAt))
                const end = beyond > 0 && dir !== null ? (hexInDirectionDistance(aimAt, dir, beyond) ?? aimAt) : aimAt
                let remaining = count
                for (const hex of hexLine(obj.position, end).slice(1)) {
                    if (remaining <= 0) {break}
                    const occupant = (hex.x === target.position?.x && hex.y === target.position?.y)
                        ? target
                        : globalState.gMap?.critterAtPosition?.(hex) as Critter | undefined
                    if (!occupant || occupant === obj || occupant.dead) {continue}
                    const acc = this.getHitChance(obj, occupant, 'torso', 2).hit
                    let hits = 0
                    while (remaining > 0 && this.random(1, 100) <= acc) {
                        remaining--
                        hits++
                    }
                    if (hits === 0) {continue}
                    if (occupant === target) {mainHits += hits}
                    else {extraHits.set(occupant, (extraHits.get(occupant) ?? 0) + hits)}
                }
            }

            shootLine(target.position ?? null, split.centerRounds - mainHits)
            if (obj.position && target.position) {
                const center = hexDistance(obj.position, target.position) <= 3
                    ? (hexInDirectionDistance(obj.position, hexDirectionTo(obj.position, target.position)!, 3) ?? target.position)
                    : target.position
                const rot = hexDirectionTo(center, obj.position)
                if (rot !== null && rot !== undefined) {
                    shootLine(hexInDirectionDistance(center, (rot + 1) % 6, 1), split.leftRounds)
                    shootLine(hexInDirectionDistance(center, (rot + 5) % 6, 1), split.rightRounds)
                }
            }

            if (mainHits > 0) {
                let DM = 2
                let flags = 0
                let msgID: number | undefined
                if (roll === Roll.CriticalSuccess) {
                    const crit = this.computeCriticalHit(obj, target, 'torso', info)
                    DM = crit.DM
                    flags = crit.flags
                    msgID = crit.msgID
                }
                const damage = this.getDamageDone(obj, target, DM, flags, mainHits, 2)
                this.log(`  → ${mainHits} round(s) hit ${targetName} for ${damage}` + (msgID ? ' ' + (this.getCombatMsg(msgID) || '') : ''))
                this.hitCritter(obj, target, damage, flags, info)
                Object.assign(report, {
                    hit: true, critical: roll === Roll.CriticalSuccess, criticalMessageId: msgID,
                    defenderDamage: damage, defenderFlags: flags, defenderDied: target.dead === true,
                })
            } else {
                EventBus.emit('combat:miss', { attackerId: this.combatantId(obj), targetId: this.combatantId(target) })
            }

            for (const [victim, hits] of extraHits) {
                if (victim.dead) {continue}
                const damage = this.getDamageDone(obj, victim, 2, 0, hits, 2)
                this.log(`  → ${hits} round(s) hit ${victim.isPlayer ? 'you' : victim.name} for ${damage}`)
                this.hitCritter(obj, victim, damage, 0, info)
                report.extras.push({ critter: victim, damage, flags: 0, died: victim.dead === true })
            }
        }

        this.announce(describeAttack(report))

        if (this.killedThisAttack) {
            shouldAutoEnd = this.canEndCombat()
        }

        const effectiveCallback: (() => void) | undefined = shouldAutoEnd
            ? () => {
                if (callback) {callback()}
                if (globalState.inCombat && globalState.combat === this) {
                    this.nextTurn()
                }
            }
            : callback

        obj.staticAnimation('attack', effectiveCallback)
    }

    perish(obj: Critter) {
        this.log('...And killed them.')
        const killer = (obj as any).lastCombatAttacker as Critter | undefined
        EventBus.emit('combat:death', {
            entityId: this.combatantId(obj),
            killerId: killer ? this.combatantId(killer) : -1,
        })

        // FO2: fire combat_p_proc(COMBAT_SUBTYPE_DEATH = 5) on the dying critter so
        // scripts can run death-quotes, quest triggers, or loot-dropping logic.
        if (Config.engine.doLoadScripts && obj._script) {
            const attacker = (obj as any).lastCombatAttacker as Critter | undefined
            Scripting.combatEvent(obj, 'onDeath', undefined, attacker)
        }
    }

    /**
     * END COMBAT (combat.cc combatAttemptEnd): refused while any hostile critter
     * still wants to fight — it is conscious, not fleeing, and the player is
     * within 5×PER hexes of it (_combatai_want_to_stop).
     */
    attemptEnd(): boolean {
        const playerTeam = this.player?.teamNum ?? 0
        for (const c of this.combatants) {
            if (c.isPlayer || c.dead || c.teamNum === playerTeam) {continue}
            const x = c as any
            if (x.knockedOut || x.isFleeing) {continue}
            const per = typeof c.getStat === 'function' ? c.getStat('PER') : 5
            const near = c.position && this.player?.position
                ? hexDistance(c.position, this.player.position) <= per * 5
                : true
            if (near) {
                uiLog(this.getCombatMsg(103) || 'Too many enemies nearby to end combat.')
                return false
            }
        }
        this.end()
        return true
    }

    // BLK-063: Return true when all non-player combatants are dead (i.e. combat
    // can be safely ended).  Used by auto-end-combat (BLK-062) and may be
    // queried by the UI or scripts to determine current combat viability.
    canEndCombat(): boolean {
        const playerTeam = globalState.player?.teamNum ?? -1
        for (const c of this.combatants) {
            if (c.isPlayer) {continue}
            if (!c.dead && c.teamNum !== playerTeam) {return false}
        }
        return true
    }

    getCombatAIMessage(id: number) {
        return getMessage('combatai', id)
    }

    maybeTaunt(obj: Critter, type: string, roll: boolean) {
        if (roll === false) {return}
        // BLK-052: Guard against null ai (AI failed to initialize for this critter).
        if (!obj.ai?.info) {return}
        const msgID = getRandomInt(parseInt(obj.ai.info[type + '_start']), parseInt(obj.ai.info[type + '_end']))
        this.log('[TAUNT ' + obj.name + ': ' + this.getCombatAIMessage(msgID) + ']')
    }

    findTarget(obj: Critter): Critter | null {
        // If a script set a preferred target via set_combat_target, use it if still alive.
        const scriptedTarget = (obj as any).combatTarget
        if (scriptedTarget && !scriptedTarget.dead && this.combatants.includes(scriptedTarget) && scriptedTarget.teamNum !== obj.teamNum) {
            return scriptedTarget
        }

        // Find the closest living combatant on a different team, with an AI heuristic
        const targets = this.combatants.filter((x) => !x.dead && x.teamNum !== obj.teamNum)
        if (targets.length === 0) {return null}
        // BLK-059: Guard null positions in the sort comparator to avoid crashes when
        // combatants lack a position (e.g. freshly added or off-map).
        if (!obj.position) {return targets[0] ?? null}

        // Slice G / P1-1: party combat-control disposition biases target choice.
        // P1-1 deepen: party attackWho overrides AI.TXT attack_who when present.
        const partyCtrl = globalState.gParty?.getControl?.(obj)
        const disposition = partyCtrl?.disposition
        const attackWho: AiAttackWho = normalizeAttackWho(
            partyCtrl?.attackWho ?? obj.ai?.info?.attack_who,
            'closest'
        )
        const playerPos = globalState.player?.position

        targets.sort((a, b) => {
            let da = a.position ? hexDistance(obj.position!, a.position) : Infinity
            let db = b.position ? hexDistance(obj.position!, b.position) : Infinity

            const aMax = a.getStat('Max HP') || 0
            const bMax = b.getStat('Max HP') || 0
            const aHp = a.getStat('HP') || 0
            const bHp = b.getStat('HP') || 0
            let aRatio = aMax > 0 ? Math.max(0, aHp / aMax) : 1
            let bRatio = bMax > 0 ? Math.max(0, bHp / bMax) : 1

            // Baseline: finish off very weak targets
            if (aRatio < 0.3) da -= 3
            if (bRatio < 0.3) db -= 3

            switch (attackWho) {
                case 'closest':
                    // Distance already primary; neutralize weak-target bias a bit
                    break
                case 'strongest':
                    da -= aMax / 20
                    db -= bMax / 20
                    da -= aRatio * 2
                    db -= bRatio * 2
                    break
                case 'weakest':
                    da += aRatio * 4
                    db += bRatio * 4
                    da += aHp / 20
                    db += bHp / 20
                    break
                case 'whomever_attacking_me': {
                    const aFocus = (a as any).combatTarget === obj || (a as any)._lastAttacked === obj
                    const bFocus = (b as any).combatTarget === obj || (b as any)._lastAttacked === obj
                    if (aFocus) da -= 8
                    if (bFocus) db -= 8
                    break
                }
                case 'whomever':
                default:
                    break
            }

            if (disposition === 'aggressive' || disposition === 'berserk') {
                if (aRatio < 0.5) da -= 2
                if (bRatio < 0.5) db -= 2
                if (disposition === 'berserk') {
                    da -= 1
                    db -= 1
                }
            } else if (disposition === 'defensive' && playerPos) {
                // Prefer threats near the player
                if (a.position) da += hexDistance(playerPos, a.position) * 0.5
                if (b.position) db += hexDistance(playerPos, b.position) * 0.5
            } else if (disposition === 'coward') {
                // Prefer weaker / less threatening targets
                if (aRatio > 0.6) da += 2
                if (bRatio > 0.6) db += 2
            }

            return da - db
        })
        return targets[0]
    }

    walkUpTo(obj: Critter, idx: number, target: Point, maxDistance: number, callback: () => void): boolean {
        // Walk up to `maxDistance` hexes, adjusting AP to fit
        if (obj.walkTo(target, false, callback, hexesAffordable(obj, maxDistance))) {
            const moveCost = movementApCost(obj, Math.max(0, obj.path.path.length - 1))
            // OK
            if (obj.AP!.subtractMoveAP(moveCost) === false) {
                console.warn(
                    'walkUpTo: AP subtraction desync: has AP: ' +
                    obj.AP!.getAvailableMoveAP() +
                    ' needs AP:' +
                    moveCost +
                    ' maxDist:' +
                    maxDistance +
                    ' — forcing AP to 0'
                )
                obj.AP!.combat = 0
                obj.AP!.move = 0
            }
            return true
        }

        return false
    }

    playerWalkTo(target: Point, running: boolean): boolean {
        if (!this.player || !this.player.AP) {return false}
        if (this.player.AP.getAvailableMoveAP() === 0) {return false}

        const maxDist = hexesAffordable(this.player, this.player.AP.getAvailableMoveAP())
        if (maxDist <= 0) {return false}
        if (!this.player.walkTo(target, running, undefined, maxDist)) {
            return false
        }

        const moveCost = movementApCost(this.player, Math.max(0, this.player.path.path.length - 1))
        if (!this.player.AP.subtractMoveAP(moveCost)) {
            console.warn(
                'playerWalkTo: AP desync — has AP: ' +
                this.player.AP.getAvailableMoveAP() +
                ' needs AP: ' + moveCost +
                ' — forcing AP to 0'
            )
            this.player.AP.combat = 0
            this.player.AP.move = 0
        }
        return true
    }

    doAITurn(obj: Critter, idx: number, depth: number): void {
        if (depth > Config.combat.maxAIDepth) {
            console.warn(`Bailing out of ${depth}-deep AI turn recursion`)
            return this.nextTurn()
        }

        // BLK-052: Guard against null ai (AI failed to initialize for this critter on
        // the previous combat constructor run, e.g. after save/load).  Skip the turn
        // gracefully so the game does not crash.
        if (!obj.ai) {
            console.warn('[combat] doAITurn: critter ' + obj.name + ' has no AI — skipping turn')
            return this.nextTurn()
        }

        const target = this.findTarget(obj)
        if (!target) {
            console.log('[AI has no target]')
            return this.nextTurn()
        }
        const distance = obj.position && target.position ? hexDistance(obj.position, target.position) : 0
        const AP = obj.AP!
        const messageRoll = rollSkillCheck(obj.ai.info.chance, 0, false)

        if (Config.engine.doLoadScripts === true && obj._script !== undefined) {
            // notify the critter script of a combat event
            if (Scripting.combatEvent(obj, 'turnBegin') === true) {return} // end of combat (script override)
        }

        if (AP.getAvailableMoveAP() <= 0)
            // out of AP
            {return this.nextTurn()}

        // P1-1: chem_use — spend a stimpak when hurt enough (party control or AI.TXT).
        const partyCtrlEarly = globalState.gParty?.getControl?.(obj)
        const chemUse = partyCtrlEarly?.chemUse ?? obj.ai.info.chem_use
        const chemThreshold = chemUseHpRatioThreshold(chemUse)
        if (chemThreshold !== null) {
            const maxHpChem = obj.getStat('Max HP') || 0
            const hpChem = obj.getStat('HP') || 0
            const ratio = maxHpChem > 0 ? hpChem / maxHpChem : 1
            if (ratio <= chemThreshold && Array.isArray(obj.inventory)) {
                const stimIdx = obj.inventory.findIndex((it: any) => {
                    const n = String(it?.name ?? it?.pro?.name ?? '').toLowerCase()
                    return n.includes('stimpak') || n.includes('stim pack') || it?.pid === 40
                })
                if (stimIdx >= 0 && AP.getAvailableCombatAP() >= 1) {
                    const stim = obj.inventory[stimIdx]
                    applyDrugToCritter(obj, stim, { skipHeal: false })
                    obj.inventory.splice(stimIdx, 1)
                    AP.subtractCombatAP(1)
                    this.log('[AI USED STIMPAK]')
                }
            }
        }

        // behaviors

        // Party coward disposition flees earlier than AI.TXT min_hp alone.
        // P1-1: also honour run_away_mode HP%-of-max thresholds.
        const partyCtrl = partyCtrlEarly ?? globalState.gParty?.getControl?.(obj)
        const partyDisposition = partyCtrl?.disposition
        const maxHp = obj.getStat('Max HP') || 0
        const runAwayMode = partyCtrl?.runAwayMode ?? obj.ai.info.run_away_mode
        let fleeHp = fleeHpThreshold(maxHp, parseAiInt(obj.ai.info.min_hp, 0), runAwayMode)
        if (partyDisposition === 'coward') {
            fleeHp = Math.max(fleeHp, Math.floor(maxHp * 0.5))
        }

        if (obj.getStat('HP') <= fleeHp) {
            // hp <= min fleeing hp, so flee
            this.log('[AI FLEES]')

            this.maybeTaunt(obj, 'run', messageRoll)
            // Calculate nearest map edge instead of hardcoding left edge
            const curX = obj.position?.x ?? 100
            const curY = obj.position?.y ?? 100
            let targetPos = { x: 0, y: curY } // Left edge
            let minEdgeDist = curX
            let edgeType = 'left'
            if (200 - curX < minEdgeDist) { minEdgeDist = 200 - curX; targetPos = { x: 200, y: curY }; edgeType = 'right' } // Right edge
            if (curY < minEdgeDist) { minEdgeDist = curY; targetPos = { x: curX, y: 0 }; edgeType = 'top' } // Top edge
            if (200 - curY < minEdgeDist) { targetPos = { x: curX, y: 200 }; edgeType = 'bottom' } // Bottom edge

            // Check if critter reached the edge (escaped)
            if (minEdgeDist <= 2) {
                this.log(`[AI ESCAPED] ${obj.name} reached map edge`)
                obj.dead = true // Treat as dead for combat purposes
                obj.visible = false // Hide from map
                return this.nextTurn()
            }

            // Find a walkable destination near the selected edge (up to 10 tiles inward)
            let walkableTarget = targetPos
            for (let distOffset = 0; distOffset <= 10; distOffset++) {
                let testPos = { ...targetPos }
                if (edgeType === 'left') { testPos.x = distOffset }
                else if (edgeType === 'right') { testPos.x = 200 - distOffset }
                else if (edgeType === 'top') { testPos.y = distOffset }
                else if (edgeType === 'bottom') { testPos.y = 200 - distOffset }

                const path = globalState.gMap ? globalState.gMap.recalcPath(obj.position!, testPos) : []
                if (path && path.length > 0) {
                    walkableTarget = testPos
                    break
                }
            }

            const callback = () => {
                obj.clearAnim()
                this.doAITurn(obj, idx, depth + 1) // if we can, do another turn
            }

            if (!this.walkUpTo(obj, idx, walkableTarget, AP.getAvailableMoveAP(), callback)) {
                return this.nextTurn() // not a valid path, just move on
            }

            return
        }

        // Critters with empty hands fight unarmed (HIT_MODE_PUNCH).
        const fireDistance = getAttackWeaponInfo(obj, 1).range
        this.log('DEBUG: fireDistance: ' + fireDistance + ' obj: ' + obj.art + ' distance: ' + distance)

        // are we in firing distance?
        if (distance > fireDistance) {
            // P1-1: honour distance preference (stay / snipe may refuse to close).
            const distanceMode = partyCtrl?.distance ?? obj.ai.info.distance
            if (!shouldAdvanceOnTarget(distanceMode, distance, fireDistance)) {
                this.log('[AI HOLDS DISTANCE]')
                return this.nextTurn()
            }
            this.log('[AI CREEPS]')
            // BLK-094: Guard against null target.position — target may not yet have a
            // tile assignment during scripted combat.  Skip the creep attempt entirely.
            if (!target.position) {
                console.warn('[combat] doAITurn: target has no position — skipping creep')
                return this.nextTurn()
            }
            const neighbors = hexNeighbors(target.position)
            const maxDistance = Math.min(hexesAffordable(obj, AP.getAvailableMoveAP()), distance - fireDistance)
            this.maybeTaunt(obj, 'move', messageRoll)

            // Prefer neighbors nearest to our current position so movement is less erratic.
            // BLK-095: Guard against null obj.position in sort comparator.
            neighbors.sort((a, b) => {
                if (!obj.position) {return 0}
                return hexDistance(obj.position, a) - hexDistance(obj.position, b)
            })

            let didCreep = false
            for (let i = 0; i < neighbors.length; i++) {
                if (
                    obj.walkTo(
                        neighbors[i],
                        false,
                        () => {
                            obj.clearAnim()
                            this.doAITurn(obj, idx, depth + 1) // if we can, do another turn
                        },
                        maxDistance
                    ) !== false
                ) {
                    // OK
                    didCreep = true
                    const moveCost = movementApCost(obj, Math.max(0, obj.path.path.length - 1))
                    if (AP.subtractMoveAP(moveCost) === false) {
                        console.warn(
                            'doAITurn: AP subtraction desync: has AP: ' +
                            AP.getAvailableMoveAP() +
                            ' needs AP:' +
                            moveCost +
                            ' maxDist:' +
                            maxDistance +
                            ' — forcing AP to 0'
                        )
                        AP.combat = 0
                        AP.move = 0
                    }
                    break
                }
            }

            if (!didCreep) {
                // no path
                this.log('[NO PATH]')
                this.doAITurn(obj, idx, depth + 1) // if we can, do another turn
            }
        } else {
            // Decide attack mode: burst if weapon supports it, not disabled, and enough AP.
            // Respect attackModeOverride set by scripts (0=unarmed, 1=melee, 2=ranged).
            const modeOverride = (obj as any).attackModeOverride as number | undefined
            let canBurst = this.weaponHasBurstMode(obj)
                && !(obj as any).burstDisabled
                && this.getBurstAPCost(obj) <= AP.getAvailableCombatAP()
            // If scripts forced a non-ranged mode, suppress burst.
            if (modeOverride !== undefined && modeOverride < 2) {canBurst = false}
            // P1-1: best_weapon melee/unarmed prefs suppress burst.
            const bestWeapon = partyCtrl?.bestWeapon ?? obj.ai.info.best_weapon
            if (bestWeaponSuppressesBurst(bestWeapon)) {canBurst = false}
            // P1-1: area_attack_mode gates burst by hit% / chance.
            if (canBurst) {
                const areaMode = partyCtrl?.areaAttackMode ?? obj.ai.info.area_attack_mode
                const hitForBurst = typeof (target as any).getStat === 'function'
                    ? this.getHitChance(obj, target, 'torso').hit
                    : 50
                if (!allowAreaAttack(areaMode, hitForBurst)) {
                    canBurst = false
                }
            }
            // P1-1: AI.TXT called_freq — aimed shots cost 1 extra AP (item.cc).
            const called = !canBurst && shouldAttemptCalledShot(obj.ai.info.called_freq)
                && canAimAttack(obj, getAttackWeaponInfo(obj, 1))
            const region = called ? 'eyes' : 'torso'
            const attackCost = canBurst ? this.getBurstAPCost(obj) : this.getAttackAPCost(obj, 1, called)

            if (AP.getAvailableCombatAP() >= attackCost) {
            // if we are in range, do we have enough AP to attack?
            // P1-1: honour AI.TXT min_to_hit — skip shot if hit% is too low.
            const minToHit = parseAiInt(obj.ai.info.min_to_hit, 0)
            if (minToHit > 0 && typeof (target as any).getStat === 'function') {
                const hitPct = this.getHitChance(obj, target, region).hit
                if (hitPct < minToHit) {
                    this.log(`[AI HOLD FIRE] hit% ${hitPct} < min_to_hit ${minToHit}`)
                    // Try creeping closer when out of preferred accuracy; otherwise end turn.
                    if (target.position && distance > 1 && AP.getAvailableMoveAP() > 0) {
                        const neighbors = hexNeighbors(target.position)
                        neighbors.sort((a, b) => {
                            if (!obj.position) return 0
                            return hexDistance(obj.position, a) - hexDistance(obj.position, b)
                        })
                        for (const n of neighbors) {
                            if (
                                obj.walkTo(
                                    n,
                                    false,
                                    () => {
                                        obj.clearAnim()
                                        this.doAITurn(obj, idx, depth + 1)
                                    },
                                    Math.min(hexesAffordable(obj, AP.getAvailableMoveAP()), 3)
                                ) !== false
                            ) {
                                const moveCost = movementApCost(obj, Math.max(0, obj.path.path.length - 1))
                                if (AP.subtractMoveAP(moveCost) === false) {
                                    AP.combat = 0
                                    AP.move = 0
                                }
                                return
                            }
                        }
                    }
                    return this.nextTurn()
                }
            }

            this.log(canBurst ? '[BURST ATTACKING]' : called ? '[CALLED SHOT]' : '[ATTACKING]')
            if (AP.subtractCombatAP(attackCost) === false) {
                this.log('[AI ATTACK ABORTED: AP desync]')
                return this.nextTurn()
            }

            // BLK-040: Guard against attacking a target that died during our move phase.
            if (target.dead) {
                console.warn('doAITurn: target died before attack — re-targeting')
                return this.doAITurn(obj, idx, depth + 1)
            }

            const attackFn = canBurst
                ? (cb: () => void) => this.burstAttack(obj, target, cb)
                : (cb: () => void) => this.attack(obj, target, region, cb)

            attackFn(() => {
                obj.clearAnim()
                this.doAITurn(obj, idx, depth + 1) // if we can, do another turn
            })
            } else {
            console.log('[AI IS STUMPED]')
            this.nextTurn()
            }
        }
    }

    static start(forceTurn?: Critter, defender?: Critter): void {
        // begin combat: the critter that started it acts first, then its
        // target, then the player (combat.cc _combat_sequence_init).
        globalState.inCombat = true
        globalState.combat = new Combat(globalState.gMap.getObjects(), forceTurn ?? null, defender ?? null)
        uiLog("Combat started.")
        EventBus.emit('combat:start', { combatants: globalState.combat.combatants.map((_, i) => i) })

        // FO2: fire combat_p_proc(COMBAT_SUBTYPE_INITIATE = 0) on all combatants
        // when combat starts. Scripts use this to set up flee states, switch AI
        // packets, or spawn reinforcements.
        if (Config.engine.doLoadScripts) {
            for (const combatant of globalState.combat.combatants) {
                Scripting.combatEvent(combatant, 'combatStart')
            }
        }

        globalState.combat.nextTurn()
        globalState.gMap.updateMap()
    }

    end() {
        // BLK-063: canEndCombat() is called by nextTurn() (numActive===0) and by
        // the BLK-062 auto-end callback.

        // FO2: fire combat_p_proc(COMBAT_SUBTYPE_ENDCOMBAT = 3) on all combatants
        // so scripts can run post-combat cleanup (drop weapons, switch to
        // non-combat AI, award quest progress, etc.).
        if (Config.engine.doLoadScripts) {
            for (const combatant of this.combatants) {
                if (!combatant.dead) {
                    Scripting.combatEvent(combatant, 'combatOver')
                }
            }
        }

        // Set all combatants to non-hostile and remove their outline
        for (const combatant of this.combatants) {
            combatant.hostile = false
            combatant.outline = null
            // DAM_ON_FIRE only selects the burning death animation.
            if ((combatant as any).onFire) {(combatant as any).onFire = false}
        }

        console.log('[end combat]')
        uiLog("Combat ended.")
        globalState.combat = null
        globalState.inCombat = false
        EventBus.emit('combat:end')

        globalState.gMap.updateMap()
        uiEndCombat()
    }

    forceTurn(obj: Critter) {
        if (obj.isPlayer) {this.whoseTurn = this.playerIdx - 1}
        else {
            const idx = this.combatants.indexOf(obj)
            if (idx === -1) {
                console.warn("forceTurn: no combatant '" + obj.name + "' in combatant list — ignoring")
                return
            }

            this.whoseTurn = idx - 1
        }
    }

    nextTurn(skipDepth = 0): void {
        // Guard against infinite skip-recursion when all remaining combatants in a
        // round are dead/non-hostile.  One full rotation of the combatant list is
        // the maximum useful skip depth; beyond that we force-end combat.
        if (skipDepth > this.combatants.length + 2) {
            console.warn('[combat] nextTurn: skip depth exceeded combatant count — forcing combat end')
            return this.end()
        }
        // -1 on the very first turn (whoseTurn starts at -1).
        const prevTurnCritter = this.combatants[this.whoseTurn]
        if (this.whoseTurn >= 0 && prevTurnCritter) {
            EventBus.emit('combat:turnEnd', { entityId: this.whoseTurn })
        }

        // BLK-051: Guard against a null player reference (can occur when combat was
        // started without the player among the combatants — rare but otherwise crashes).
        if (!this.player) {
            console.warn('[combat] nextTurn: no player — ending combat')
            return this.end()
        }

        // update range checks
        let numActive = 0
        const playerTeam = globalState.player?.teamNum ?? -1
        for (let i = 0; i < this.combatants.length; i++) {
            const obj = this.combatants[i]
            if (obj.dead || obj.isPlayer) {continue}

            // Allies shouldn't keep combat active by themselves
            if (obj.teamNum === playerTeam) {
                obj.outline = 'green'
                continue
            }

            // BLK-051: Guard against null ai (AI failed to init for this critter).
            // Fall back to a safe default max_dist so the loop can still complete.
            const maxDist: number = obj.ai?.info?.max_dist ?? 20
            // BLK-059: Guard null positions to prevent hexDistance crash.
            const inRange = (obj.position && this.player.position)
                ? hexDistance(obj.position, this.player.position) <= maxDist
                : false

            if (inRange || obj.hostile) {
                obj.hostile = true
                obj.outline = 'red'
                numActive++
            }
        }

        if (numActive === 0 && this.turnNum !== 1) {return this.end()}

        this.turnNum++
        this.whoseTurn++

        let isNewRound = false
        if (this.whoseTurn >= this.combatants.length) {
            this.whoseTurn = 0
            this.round++
            isNewRound = true
            // combat.cc _combat_sequence: re-sort by Sequence and advance the
            // clock 5 seconds; _combat_set_move_all refills everyone's AP.
            this.sortBySequence()
            globalState.gameTickTime = (globalState.gameTickTime ?? 0) + 50
            for (const c of this.combatants) {
                if (!c.dead && c.AP) {c.AP.resetAP()}
            }
        }

        if (this.round === 1 && this.whoseTurn === 0 && this.turnNum === 2) {
            uiLog("Combat Round 1")
        } else if (isNewRound) {
            uiLog(`Combat Round ${this.round}`)
        }

        const currentCombatant = this.combatants[this.whoseTurn]
        EventBus.emit('combat:turnStart', {
            entityId: this.whoseTurn,
            isPlayer: currentCombatant?.isPlayer ?? false,
        })

        const critter = currentCombatant as any
        if (!critter || critter.dead) {return this.nextTurn(skipDepth + 1)}

        // Knocked-out critters wake 10×(35 − 3×END) ticks after the blow and
        // must then stand up; until then their turns are skipped.
        if (critter.knockedOut) {
            if (typeof critter.knockoutWakeTick === 'number' && (globalState.gameTickTime ?? 0) >= critter.knockoutWakeTick) {
                critter.knockedOut = false
                critter.knockoutWakeTick = undefined
            } else {
                console.log('[combat] nextTurn: ' + critter.name + ' is unconscious — skipping turn')
                if (critter.isPlayer) {this.inPlayerTurn = false}
                return this.nextTurn(skipDepth + 1)
            }
        }

        // DAM_LOSE_TURN: skip this turn once (combat.cc _combat_turn).
        if (critter.loseNextTurn || critter.stunned) {
            critter.loseNextTurn = false
            critter.stunned = false
            console.log('[combat] nextTurn: ' + critter.name + ' loses this turn')
            if (critter.isPlayer) {this.inPlayerTurn = false}
            return this.nextTurn(skipDepth + 1)
        }

        if (critter.isPlayer) {
            this.inPlayerTurn = true
            this.standUpIfProne(critter)
            uiUpdateCombatHUD()

            // FO2: fire combat_p_proc(COMBAT_SUBTYPE_TURN = 4) on the player at
            // the start of their turn. Scripts use this for per-turn status effects
            // (poison ticks, radiation damage, drug wears-off, etc.).
            if (Config.engine.doLoadScripts && this.player._script) {
                const override = Scripting.combatEvent(this.player, 'turnBegin')
                if (override) {
                    console.log('[combat] Player script overrode turn')
                    return this.nextTurn(skipDepth + 1)
                }
            }
        } else {
            this.inPlayerTurn = false
            if (critter.hostile !== true) {return this.nextTurn(skipDepth + 1)}

            // Guard against critters that were added mid-combat without AP initialised.
            if (!critter.AP) {
                console.warn('[combat] nextTurn: critter has no AP — skipping turn')
                return this.nextTurn(skipDepth + 1)
            }

            // FO2: fire critter_p_proc (heartbeat) on each NPC at the start of
            // their combat turn. In the original engine, critter_p_proc runs
            // every game tick including during combat turns, but combat_p_proc
            // is what most scripts check. Fire critter_p_proc first so both
            // procedures see the same game-time state.
            if (Config.engine.doLoadScripts && critter._script) {
                Scripting.updateCritter(critter._script, critter)
                const override = Scripting.combatEvent(critter, 'turnBegin')
                if (override) {
                    console.log(`[combat] ${critter.name} script overrode turn`)
                    return this.nextTurn(skipDepth + 1)
                }
            }

            this.standUpIfProne(critter)
            this.doAITurn(critter, this.whoseTurn, 1)
        }
    }

    /** combat.cc _combat_standup: getting up costs 3 AP (1 with Quick Recovery). */
    private standUpIfProne(critter: Critter): void {
        const c = critter as any
        if (!c.knockedDown || c.knockedOut) {return}
        c.knockedDown = false
        const cost = critter.isPlayer && perkRank(critter, PerkId.QUICK_RECOVERY) > 0 ? 1 : 3
        if (critter.AP) {critter.AP.combat = Math.max(0, critter.AP.combat - cost)}
    }
}

/**
 * Map a damage-type name (e.g. 'Normal', 'Electrical' — the proto
 * spellings) to the DamageType union used by the combat:* EventBus events.
 */
function normalizeDamageType(damageType: string | null | undefined): DamageType {
    const raw = (damageType ?? 'normal').toLowerCase()
    switch (raw) {
        case 'fire': return 'fire'
        case 'plasma': return 'plasma'
        case 'laser': return 'laser'
        case 'explosion':
        case 'explosive': return 'explosive'
        case 'electrical': return 'electrical'
        case 'emp': return 'emp'
        default: return 'normal'
    }
}

/** SPECIAL stat names by engine index (STAT_STRENGTH … STAT_LUCK). */
const SPECIAL_NAMES = ['STR', 'PER', 'END', 'CHA', 'INT', 'AGI', 'LUK']

/**
 * actions.cc _is_hit_from_front: the attack lands from the front unless the
 * attacker faces the same way as the defender (or one step off).
 */
function isHitFromFront(attacker: Critter, defender: Critter): boolean {
    const diff = Math.abs((attacker.orientation ?? 0) - (defender.orientation ?? 0))
    return diff !== 0 && diff !== 1 && diff !== 5
}

/**
 * AP to walk `hexes` hexes: each hex costs 4 AP with one crippled leg and 8
 * with both (critter.cc critterGetMovementPointCostAdjustedForCrippledLegs).
 */
export function movementApCost(critter: Critter, hexes: number): number {
    const c = critter as any
    if (c?.crippledLeftLeg && c?.crippledRightLeg) {return hexes * 8}
    if (c?.crippledLeftLeg || c?.crippledRightLeg) {return hexes * 4}
    return hexes
}

/** How many hexes `ap` action points can walk. */
function hexesAffordable(critter: Critter, ap: number): number {
    return Math.floor(ap / movementApCost(critter, 1))
}
