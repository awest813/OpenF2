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
import { isRangedWeapon, consumeRounds, reloadWeapon, weaponNeedsReload } from './combat/ammo.js'
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
import { cloneItem, Critter, Obj, WeaponObj } from './object.js'
import { Player } from './player.js'
import { Scripting } from './scripting.js'
import { uiEndCombat, uiStartCombat, uiUpdateCombatHUD, uiLog } from './ui.js'
import { getFileText, getMessage, getRandomInt, parseIni, rollSkillCheck } from './util.js'
import { AI_MESSAGE, AiTurn, combatTaunt } from './combat/aiTurn.js'
import { knockBack, liveMap } from './explosion.js'
import {
    checkRetaliation,
    isFleeing,
    isWithinPerception,
    Maneuver,
    playerInSneakMode,
    setWhoHitMe,
    teamOf,
} from './combat/aiPacket.js'
import { awardCritterXp } from './character/xp.js'

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

/** CombatStartData: how a script-started fight's first turn is skewed (attack_complex). */
export interface CombatStartData {
    accuracyBonus: number
    damageBonus: number
    minDamage: number
    maxDamage: number
    overrideAttackResults: boolean
    attackerResults: number
    targetResults: number
}

export class Combat {
    /** The script's CombatStartData while it applies (the first combatant's turn). */
    startData: CombatStartData | null = null

    combatants: Critter[]
    playerIdx: number
    player: Player
    turnNum: number
    whoseTurn: number
    inPlayerTurn: boolean
    round: number

    /** Inclusive random source override (tests); defaults to getRandomInt. */
    rng?: Rng

    get random(): Rng {
        return this.rng ?? ((min, max) => getRandomInt(min, max))
    }

    /**
     * combatants[0 .. activeCount) are fighting this round (_list_com); the
     * rest are on the map but not (yet) in the fight (_list_noncom).
     */
    activeCount = 0

    /** activeCount, tolerating a Combat built without its constructor. */
    private get numActive(): number {
        return typeof this.activeCount === 'number' ? this.activeCount : (this.combatants ?? []).length
    }

    /** Rounds in a row in which nobody could act. */
    private idleRounds = 0

    /** Completed rounds (_combatNumTurns). */
    combatNumTurns = 0

    /** The defender of the attack that started combat, for the first AI turn (_gcsd). */
    private startDefender: Critter | null = null

    /** XP from kills by the player's side, awarded when combat ends. */
    pendingExperience = 0

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

        // combat.cc _combat_begin: everyone starts with a clean slate.
        for (const c of this.combatants) {
            const x = c as any
            x.combatManeuver = (x.combatManeuver ?? 0) & Maneuver.ENGAGING
            x.damageLastTurn = 0
            x.whoHitMe = null
            x.aiLastTarget = null
            x.aiFriendlyDead = null
            x.isFleeing = false
        }

        // combat.cc _combat_sequence_init: the attacker, its target and the
        // player fight the first round, in that order; everyone else waits
        // to join at the end of the round (_combat_add_noncoms).
        const front: Critter[] = []
        const place = (c: Critter | null | undefined) => {
            if (c && this.combatants.includes(c) && !front.includes(c)) {front.push(c)}
        }
        place(attacker)
        place(defender)
        place(this.combatants.find((x) => x.isPlayer))
        this.combatants = [...front, ...this.combatants.filter((c) => !front.includes(c))]
        this.activeCount = front.length
        if (attacker) {setWhoHitMe(attacker, defender ?? null, this.random)}
        if (defender) {setWhoHitMe(defender, attacker ?? null, this.random)}
        this.startDefender = defender ?? null

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

    /** Standing critters between attacker and target (_combat_is_shot_blocked's count). */
    private crittersInLineOfFire(obj: Critter, target: Critter): number {
        if (!obj.position || !target.position) {return 0}
        const path = hexLine(obj.position, target.position)
        if (path.length <= 2) {return 0}
        const between = new Set(path.slice(1, -1).map((p) => `${p.x},${p.y}`))
        const candidates: Critter[] = Array.isArray(this.combatants) ? this.combatants : []
        let blockers = 0
        for (const c of candidates) {
            if (c === obj || c === target || c.dead || !c.position) {continue}
            // _combat_is_shot_blocked: the fallen don't count, big critters count twice.
            if ((c as any).knockedDown || (c as any).knockedOut) {continue}
            if (between.has(`${c.position.x},${c.position.y}`)) {
                blockers += ((c as any).flags & OBJECT_MULTIHEX) !== 0 ? 2 : 1
            }
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

    /**
     * attackDetermineToHit. `from` evaluates the shot from another tile
     * (_determine_to_hit_from_tile); `useDistance: false` leaves range and
     * cover out (_determine_to_hit_no_range).
     */
    getHitChance(obj: Critter, target: Critter, region: string, hitMode: HitMode = 1, opts: { from?: Point; useDistance?: boolean } = {}) {
        const normalizedRegion = this.normalizeAttackRegionForAttacker(obj, region)
        const info = getAttackWeaponInfo(obj, hitMode)
        const useDistance = opts.useDistance !== false
        const from = opts.from ?? obj.position

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
            distance: !useDistance ? null : (from && target.position) ? hexDistance(from, target.position) : 0,
            crittersInLineOfFire: usesRange && useDistance && !opts.from ? Math.trunc(this.accountForPartialCover(obj, target) / 10) : 0,
            rangeModifierOverride: usesRange && useDistance && !opts.from ? -this.getHitDistanceModifier(obj, target, info.weapon) : undefined,
            targetAC: targetIsCritter ? target.getStat('AC') : null,
            ammoACModifier: ammo.acModifier,
            region: normalizedRegion,
            targetMultihex: ((target as any).flags & OBJECT_MULTIHEX) !== 0,
            targetLightIntensity: obj.isPlayer ? this.targetLightIntensity(target) : 65536,
            attackerBlind: (obj as any).blinded === true,
            targetKnockedDownOrOut: knocked,
            combatDifficulty: globalState.combatDifficulty ?? 1,
            attackerIsHostileToPlayer: this.hostileToPlayer(obj),
            scriptAccuracyBonus: this.startData?.accuracyBonus ?? 0,
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
            if (dist > 0 && attacker.position) {knockBack(liveMap(), victim, attacker.position, dist)}
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
        if (damage > 0) {
            ;(target as any).damageLastTurn = ((target as any).damageLastTurn ?? 0) + damage
            critterDamage(target, damage, obj)
        }
        this.applyResultFlags(target, flags, damage, obj, info)
        if (target.dead) {
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
        if ((flags & Dam.EXPLODE) && obj.position) {
            // The weapon blows up in the attacker's hands, catching anyone nearby.
            this.explodeAt(obj, obj.position, isGrenadeAttack(info) ? 2 : 3, obj, info)
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

    /** Where a thrown grenade that missed comes down: 1..distance/2 hexes off the target. */
    private grenadeLanding(obj: Critter, target: Critter): Point | null {
        if (!obj.position || !target.position) {return target.position ?? null}
        const distance = hexDistance(obj.position, target.position)
        const offset = Math.max(1, this.random(1, Math.max(1, Math.trunc(distance / 2))))
        return hexInDirectionDistance(target.position, this.random(0, 5), offset) ?? target.position
    }

    /** _tile_num_beyond: the hex a missed shot flies to, out to the weapon's range. */
    private flightEnd(obj: Critter, target: Critter, range: number): Point | null {
        if (!obj.position || !target.position) {return target.position ?? null}
        const dir = hexDirectionTo(obj.position, target.position)
        const beyond = Math.max(0, range - hexDistance(obj.position, target.position))
        if (dir === null || dir === undefined || beyond === 0) {return target.position}
        return hexInDirectionDistance(target.position, dir, beyond) ?? target.position
    }

    /**
     * Explosion damage around `center`: up to 6 living critters within
     * `radius` hexes with a clear line from the blast take one round of
     * normal damage; the attacker caught in it takes the backwash.
     */
    private explodeAt(obj: Critter, center: Point, radius: number, exclude: Critter | null, info: AttackWeaponInfo) {
        const out: Array<{ critter: Critter; damage: number; flags: number; died: boolean }> = []
        const pool: Critter[] = []
        const mapCritters: Critter[] = (globalState.gMap?.getObjects?.() ?? []).filter((o: Obj) => o instanceof Critter) as Critter[]
        for (const c of [...(this.combatants ?? []), ...mapCritters]) {
            if (!pool.includes(c)) {pool.push(c)}
        }
        const victims = pool
            .filter((c) => c !== exclude && !c.dead && c.position && hexDistance(center, c.position) <= radius)
            .filter((c) => !this.lineBlocked(center, c.position!))
            .sort((a, b) => hexDistance(center, a.position!) - hexDistance(center, b.position!))
        let extras = 0
        for (const victim of victims) {
            if (victim === obj) {
                const damage = this.getDamageDone(obj, obj, 2, 0, 1, info.hitMode)
                if (damage > 0) {critterDamage(obj, damage, obj)}
                if (obj.dead) {this.perish(obj)}
                out.push({ critter: obj, damage, flags: 0, died: obj.dead === true })
                continue
            }
            if (extras >= 6) {continue}
            extras++
            const damage = this.getDamageDone(obj, victim, 2, 0, 1, info.hitMode)
            this.hitCritter(obj, victim, damage, 0, info)
            out.push({ critter: victim, damage, flags: 0, died: victim.dead === true })
        }
        return out
    }

    /** A wall or other shot-blocking object between two hexes. */
    private lineBlocked(from: Point, to: Point): boolean {
        if (!globalState.gMap) {return false}
        for (const hex of hexLine(from, to).slice(1, -1)) {
            const objs: Obj[] = (globalState.gMap as any).objectsAtPosition?.(hex) ?? []
            for (const o of objs) {
                if (o.type === 'critter' || ((o as any).flags & OBJECT_SHOOT_THRU) !== 0) {continue}
                if (typeof (o as any).blocks === 'function' && (o as any).blocks()) {return true}
            }
        }
        return false
    }

    /**
     * Thrown weapons leave the thrower's hand: grenades are used up, anything
     * else lands on the target's hex.
     */
    private consumeThrownWeapon(obj: Critter, landing: Point | null, destroy: boolean): void {
        const weapon: any = obj.equippedWeapon
        if (!weapon?.pro) {return}
        if (typeof weapon.amount === 'number' && weapon.amount > 1) {
            weapon.amount -= 1
            if (!destroy && landing && globalState.gMap) {
                const dropped: any = cloneItem(weapon)
                dropped.amount = 1
                dropped.position = { x: landing.x, y: landing.y }
                globalState.gMap.addObject(dropped)
            }
            return
        }
        if (obj.leftHand === weapon) {obj.leftHand = undefined}
        if (obj.rightHand === weapon) {obj.rightHand = undefined}
        const idx = Array.isArray(obj.inventory) ? obj.inventory.indexOf(weapon) : -1
        if (idx >= 0) {obj.inventory.splice(idx, 1)}
        if (!destroy && landing && globalState.gMap) {
            weapon.position = { x: landing.x, y: landing.y }
            globalState.gMap.addObject(weapon)
        }
    }

    /** combat.cc _combat_attack: the player remembers whom they attacked; everyone records a last target. */
    private noteAttack(obj: Critter, target: Critter): void {
        if (obj.isPlayer) {setWhoHitMe(obj, target, this.random)}
        ;(obj as any).aiLastTarget = target
    }

    /** _combat_apply_attack: whoever the attack landed on (or was aimed at) answers it. */
    private recordAttack(obj: Critter, target: Critter, report: AttackReport): void {
        const defender = (report.hit && report.defender ? report.defender : target) as Critter
        if (defender && defender !== obj) {this.recordHit(obj, defender, target)}
        for (const extra of report.extras) {
            const c = extra.critter as Critter
            if (c && c !== obj) {this.recordHit(obj, c, null)}
        }
        // combat_p_proc(COMBAT_SUBTYPE_HIT_SUCCEEDED) on the attacker, target_obj = whom it hit.
        if (report.hit && report.defender && Config.engine.doLoadScripts && obj._script) {
            Scripting.combatEvent(obj, 'hitSucceeded', report.defender as Critter)
        }
    }

    /**
     * actions.cc taunts: the attacker on attacking; then, hand to hand, the
     * attacker on its hit or miss, otherwise the defender reacting to it.
     */
    private attackTaunts(obj: Critter, target: Critter, report: AttackReport, info: AttackWeaponInfo): void {
        const rng = this.random
        combatTaunt(obj, AI_MESSAGE.ATTACK, rng)
        const location = hitLocationIndex(report.region === 'uncalled' ? 'torso' : report.region)
        const defender = (report.hit && report.defender ? report.defender : target) as Critter
        const speaker = info.attackType === 'melee' || info.attackType === 'unarmed' ? obj : defender
        if (!report.hit) {combatTaunt(speaker, AI_MESSAGE.MISS, rng)}
        else if (!defender.dead) {combatTaunt(speaker, AI_MESSAGE.HIT, rng, location)}
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
            this.performAttack(player, target, region, hitMode, () => {
                player.clearAnim?.()
                this.afterPlayerAction()
            })
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
        this.noteAttack(obj, target)
        // Empty ranged weapon: dry click, no attack roll, no ammo, no
        // animation. The callback still fires so turn flow continues.
        // A punch (mode 0) leaves whatever is in hand alone.
        const firing = hitMode === 0 ? null : obj.equippedWeapon
        if (weaponNeedsReload(firing)) {
            this.log(`${obj.isPlayer ? 'You' : obj.name} pull${obj.isPlayer ? '' : 's'} the trigger — click. Out of ammo.`)
            if (obj.isPlayer) {uiLog(this.getCombatMsg(101) || 'Out of ammo.')}
            EventBus.emit('audio:playSound', { soundId: 'out_of_ammo' })
            if (callback) {callback()}
            return
        }
        // Ranged weapons consume one round per trigger pull (hit or miss).
        if (firing && isRangedWeapon(firing)) {
            consumeRounds(firing, 1)
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

        const who = obj.isPlayer ? 'You' : obj.name
        const targetName = target.isPlayer ? 'you' : target.name
        const normalizedRegion = this.normalizeAttackRegionForAttacker(obj, region)
        const outcome = this.rollHit(obj, target, normalizedRegion, hitMode)

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
            let damage = this.getDamageDone(obj, target, damageMultiplier, outcome.flags, 1, hitMode)
            // A script-started fight's first turn: its damage bonus and range,
            // and its forced result flags (the engine copies targetResults).
            const csd = this.startData
            if (csd) {
                damage = Math.min(csd.maxDamage, Math.max(csd.minDamage, damage + csd.damageBonus))
                if (csd.overrideAttackResults) {outcome.flags = csd.targetResults}
            }
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
            } else if ((info.attackType === 'ranged' || info.attackType === 'throw') && !isGrenadeAttack(info)) {
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

        // Explosives burst on whoever was hit, or where the shot/throw landed
        // (combat.cc _compute_explosion_on_extras).
        const grenade = isGrenadeAttack(info)
        const failedCritically = outcome.roll === Roll.CriticalFailure && report.critical && !report.hit
        if ((info.damageType === 'Explosive' || grenade) && !failedCritically) {
            const hitCritterPos = report.hit && report.defender ? (report.defender as Critter).position : null
            const center = hitCritterPos ?? (grenade ? this.grenadeLanding(obj, target) : this.flightEnd(obj, target, info.range))
            if (center) {
                const exclude = report.hit ? report.defender as Critter : null
                for (const extra of this.explodeAt(obj, center, grenade ? 2 : 3, exclude, info)) {
                    report.extras.push(extra)
                }
            }
        }

        if (info.attackType === 'throw') {this.consumeThrownWeapon(obj, report.hit && report.defender ? (report.defender as Critter).position : target.position, grenade)}

        this.announce(describeAttack(report))
        this.recordAttack(obj, target, report)
        this.attackTaunts(obj, target, report, info)

        // attack!
        obj.staticAnimation('attack', callback)
    }

    /**
     * The three lines a burst or flamer sprays down (combat.cc
     * _compute_spray): through the target, and one hex to either side of it
     * (of a point three hexes out when the target is closer), each running
     * out to the weapon's range.
     */
    private sprayLines(obj: Critter, target: Critter, info: AttackWeaponInfo): { center: Point[]; left: Point[]; right: Point[] } {
        const empty = { center: [] as Point[], left: [] as Point[], right: [] as Point[] }
        if (!obj.position || !target.position) {return empty}
        const lineThrough = (aimAt: Point | null): Point[] => {
            if (!aimAt || !obj.position) {return []}
            const dir = hexDirectionTo(obj.position, aimAt)
            const beyond = Math.max(0, info.range - hexDistance(obj.position, aimAt))
            const end = beyond > 0 && dir !== null ? (hexInDirectionDistance(aimAt, dir, beyond) ?? aimAt) : aimAt
            return hexLine(obj.position, end).slice(1)
        }
        const center = hexDistance(obj.position, target.position) <= 3
            ? (hexInDirectionDistance(obj.position, hexDirectionTo(obj.position, target.position)!, 3) ?? target.position)
            : target.position
        const rot = hexDirectionTo(center, obj.position)
        return {
            center: lineThrough(target.position),
            left: rot === null || rot === undefined ? [] : lineThrough(hexInDirectionDistance(center, (rot + 1) % 6, 1)),
            right: rot === null || rot === undefined ? [] : lineThrough(hexInDirectionDistance(center, (rot + 5) % 6, 1)),
        }
    }

    /** Critters standing in a spray's lines of fire (for the AI's friendly-fire check). */
    sprayVictims(obj: Critter, target: Critter, info: AttackWeaponInfo): Critter[] {
        const lines = this.sprayLines(obj, target, info)
        const seen = new Set<Critter>()
        for (const hex of [...lines.center, ...lines.left, ...lines.right]) {
            const occupant = (this.combatants ?? []).find((c) => c.position && c.position.x === hex.x && c.position.y === hex.y)
            if (occupant) {seen.add(occupant)}
        }
        return [...seen]
    }

    /**
     * An NPC attack (combat.cc _combat_attack): hand-to-hand in mode 0,
     * otherwise the weapon's primary or secondary mode.
     */
    performAttack(obj: Critter, target: Critter, region: string, hitMode: HitMode, callback: () => void): void {
        const info = getAttackWeaponInfo(obj, hitMode)
        if (info.isBurst || info.mode === 8) {
            this.burstAttack(obj, target, callback, hitMode)
            return
        }
        if (info.weapon === null) {
            // combat.cc _combat_attack: an NPC's punch is a kick one time in
            // four when it has kick art (same damage and AP).
            let blow: 'q' | 'r' = 'q'
            if (!obj.isPlayer && this.random(1, 4) === 1 && this.hasKickArt(obj)) {blow = 'r'}
            const c = obj as any
            c.unarmedAttackAnim = blow
            this.attack(obj, target, region, () => {
                c.unarmedAttackAnim = undefined
                callback()
            }, hitMode)
            return
        }
        this.attack(obj, target, region, callback, hitMode)
    }

    /** artExists(ANIM_KICK_LEG) for the critter's current weapon art. */
    private hasKickArt(obj: Critter): boolean {
        const info = globalState.imageInfo
        if (!info || typeof obj.getBase !== 'function') {return false}
        try {
            const skin = obj.equippedWeapon?.weapon?.getSkin?.() ?? 'a'
            return info[obj.getBase() + skin + 'r'] !== undefined
        } catch {
            return false
        }
    }

    /** dudeHasState(DUDE_STATE_SNEAKING). */
    private playerIsSneaking(): boolean {
        return playerInSneakMode(this.player ?? globalState.player)
    }

    /**
     * Burst fire (combat.cc _compute_spray): one roll decides the burst; the
     * rounds split into left / centre / right thirds, half the centre third is
     * rolled individually against the target, and every other round flies
     * down its line hitting whoever stands in it.
     */
    burstAttack(obj: Critter, target: Critter, callback?: () => void, hitMode: HitMode = 2) {
        this.noteAttack(obj, target)
        // Empty ranged weapon: dry click, nothing fired.
        if (weaponNeedsReload(hitMode === 0 ? null : obj.equippedWeapon)) {
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

        const info = getAttackWeaponInfo(obj, hitMode)
        // Flamers spray continuously: one round per line, every critter in a
        // line gets its own chance to be hit (ANIM_FIRE_CONTINUOUS).
        const continuous = info.mode === 8
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

        let accuracy = this.getHitChance(obj, target, 'torso', hitMode).hit
        const roll = randomRoll(accuracy, obj.getStat('Critical Chance'), this.random, this.criticalsAllowed()).roll

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

            const split = continuous
                ? { mainTargetRounds: 1, centerRounds: 1, leftRounds: 1, rightRounds: 1 }
                : splitBurstRounds(rounds)
            let mainHits = 0
            for (let n = 0; n < split.mainTargetRounds; n++) {
                if (randomRoll(accuracy, 0, this.random, false).roll >= Roll.Success) {mainHits++}
            }

            // Every other round flies down its line: centre, then one hex
            // either side of the target (as seen from the shooter).
            const extraHits = new Map<Critter, number>()
            const lines = this.sprayLines(obj, target, info)
            const shootLine = (line: Point[], count: number) => {
                let remaining = count
                for (const hex of line) {
                    if (remaining <= 0) {break}
                    const occupant = (hex.x === target.position?.x && hex.y === target.position?.y)
                        ? target
                        : globalState.gMap?.critterAtPosition?.(hex) as Critter | undefined
                    if (!occupant || occupant === obj || occupant.dead) {continue}
                    const acc = this.getHitChance(obj, occupant, 'torso', hitMode).hit
                    if (continuous) {remaining = 1}
                    let hits = 0
                    while (remaining > 0 && this.random(1, 100) <= acc) {
                        remaining--
                        hits++
                    }
                    if (hits === 0) {continue}
                    if (occupant === target) {
                        // A continuous spray never adds to the main target's rounds.
                        if (!continuous) {mainHits += hits}
                    } else {
                        extraHits.set(occupant, (extraHits.get(occupant) ?? 0) + hits)
                    }
                }
            }

            shootLine(lines.center, continuous ? split.centerRounds : split.centerRounds - mainHits)
            shootLine(lines.left, split.leftRounds)
            shootLine(lines.right, split.rightRounds)

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
                const damage = this.getDamageDone(obj, target, DM, flags, mainHits, hitMode)
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
                const damage = this.getDamageDone(obj, victim, 2, 0, hits, hitMode)
                this.log(`  → ${hits} round(s) hit ${victim.isPlayer ? 'you' : victim.name} for ${damage}`)
                this.hitCritter(obj, victim, damage, 0, info)
                report.extras.push({ critter: victim, damage, flags: 0, died: victim.dead === true })
            }
        }

        this.announce(describeAttack(report))
        this.recordAttack(obj, target, report)
        this.attackTaunts(obj, target, report, info)

        obj.staticAnimation('attack', callback)
    }

    perish(obj: Critter) {
        this.log('...And killed them.')
        const killer = (obj as any).lastCombatAttacker as Critter | undefined
        EventBus.emit('combat:death', {
            entityId: this.combatantId(obj),
            killerId: killer ? this.combatantId(killer) : -1,
        })
    }

    /**
     * END COMBAT (combat.cc combatAttemptEnd): refused while anyone hostile
     * still wants to fight (_combatai_want_to_stop) or wants to join in
     * (_combatai_want_to_join).
     */
    attemptEnd(): boolean {
        const playerTeam = teamOf(this.player)
        const hostile = (c: Critter) => {
            const whoHitMe = (c as any).whoHitMe
            return teamOf(c) !== playerTeam || (whoHitMe && teamOf(whoHitMe) === teamOf(c))
        }
        for (let i = 0; i < this.combatants.length; i++) {
            const c = this.combatants[i]
            if (c.isPlayer || !hostile(c)) {continue}
            const refuses = i < this.numActive ? !this.wantsToStop(c) : this.wantsToJoin(c)
            if (refuses) {
                uiLog(this.getCombatMsg(103) || 'Too many enemies nearby to end combat.')
                return false
            }
        }
        this.end()
        return true
    }

    /** True when no one is left fighting the player's side (_combat_should_end). */
    canEndCombat(): boolean {
        return this.shouldEnd()
    }

    /** combat.cc _combat_should_end. */
    shouldEnd(): boolean {
        // The dead have always left the active list by the time the engine asks.
        const active = this.combatants.slice(0, this.numActive).filter((c) => !c.dead)
        if (active.length <= 1) {return true}
        const player = active.find((c) => c.isPlayer)
        if (!player) {return true}
        const team = teamOf(player)
        for (const c of active) {
            if (teamOf(c) !== team) {return false}
            const whoHitMe = (c as any).whoHitMe
            if (whoHitMe && teamOf(whoHitMe) === team) {return false}
        }
        return true
    }

    /** _combatai_want_to_stop. */
    wantsToStop(c: Critter): boolean {
        const x = c as any
        if (((x.combatManeuver ?? 0) & Maneuver.DISENGAGING) !== 0) {return true}
        if (c.dead || x.knockedOut) {return true}
        if (isFleeing(c)) {return true}
        const enemy = new AiTurn(this, c).dangerSource()
        return !enemy || !isWithinPerception(c, enemy, this.random)
    }

    /** _combatai_want_to_join. */
    wantsToJoin(c: Critter): boolean {
        const x = c as any
        if (c.visible === false) {return false}
        if (c.dead || x.knockedOut) {return false}
        if ((x.damageLastTurn ?? 0) > 0) {return true}
        if (Config.engine.doLoadScripts && x._script) {Scripting.combatEvent(c, 'joinCheck')}
        const maneuver = x.combatManeuver ?? 0
        if (maneuver & Maneuver.ENGAGING) {return true}
        if (maneuver & Maneuver.DISENGAGING) {return false}
        if (maneuver & Maneuver.FLEEING) {return false}
        return new AiTurn(this, c).dangerSource() !== null
    }

    /** _combatai_notify_friends: the player's teammates who can see the player get involved. */
    private notifyFriends(who: Critter): void {
        const team = teamOf(who)
        for (const c of this.combatants) {
            const x = c as any
            if (((x.combatManeuver ?? 0) & Maneuver.ENGAGING) === 0 && teamOf(c) === team && isWithinPerception(c, who, this.random)) {
                x.combatManeuver = (x.combatManeuver ?? 0) | Maneuver.ENGAGING
            }
        }
    }

    /**
     * _combatai_notify_onlookers: anyone who sees `victim` get hurt joins in;
     * a body with no visible killer makes them want to get away from it.
     */
    private notifyOnlookers(victim: Critter): void {
        for (const c of this.combatants ?? []) {
            const x = c as any
            if (((x.combatManeuver ?? 0) & Maneuver.ENGAGING) !== 0) {continue}
            if (!isWithinPerception(c, victim, this.random)) {continue}
            x.combatManeuver = (x.combatManeuver ?? 0) | Maneuver.ENGAGING
            if (victim.dead && !isWithinPerception(c, (victim as any).whoHitMe, this.random) && c !== victim) {
                x.aiFriendlyDead = victim
            }
        }
    }

    /**
     * Who-hit-me bookkeeping after an attack lands on `victim`
     * (combat.cc _combat_apply_attack / _combatai_check_retaliation).
     */
    private recordHit(attacker: Critter, victim: Critter, intended: Critter | null): void {
        if (typeof (victim as any)?.getStat !== 'function') {return}
        if (victim.dead || (victim as any).knockedOut) {
            setWhoHitMe(victim, attacker, this.random)
        } else if (victim === intended || teamOf(victim) !== teamOf(attacker)) {
            checkRetaliation(victim, attacker, this.random)
        }
        this.notifyOnlookers(victim)
    }

    /** AP to walk one hex (crippled legs cost more). */
    moveCostPerHex(critter: Critter): number {
        return movementApCost(critter, 1)
    }

    /** Ends the player's turn once their AP is spent (combat.cc _combat_input). */
    afterPlayerAction(): void {
        if (globalState.combat !== this || !this.inPlayerTurn || !this.player?.AP) {return}
        if (this.player.AP.getAvailableMoveAP() <= 0) {this.nextTurn()}
    }

    playerWalkTo(target: Point, running: boolean): boolean {
        if (!this.player || !this.player.AP) {return false}
        if (this.player.AP.getAvailableMoveAP() === 0) {return false}

        const maxDist = hexesAffordable(this.player, this.player.AP.getAvailableMoveAP())
        if (maxDist <= 0) {return false}
        const player = this.player
        if (!player.walkTo(target, running, () => {
            player.clearAnim()
            this.afterPlayerAction()
        }, maxDist)) {
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

    /**
     * One NPC turn (combat_ai.cc _combat_ai). Resolves when the critter has
     * nothing more to do; never throws.
     */
    async runAITurn(obj: Critter, defender: Critter | null = null): Promise<void> {
        if (!obj.ai) {
            console.warn('[combat] critter ' + obj.name + ' has no AI — skipping turn')
            return
        }
        try {
            await new AiTurn(this, obj).run(defender)
        } catch (e) {
            console.warn('[combat] AI turn failed for ' + obj.name + ': ' + e)
        }
    }

    /**
     * combat.cc _combat_attack_this outside combat: the bad-shot checks run
     * first (with a full AP bar), and a refused attack prints its message
     * without starting a fight.
     */
    static playerCanStartAttack(player: Critter, target: Critter): boolean {
        if (!player.AP) {player.AP = new ActionPoints(player)}
        else {player.AP.resetAP()}
        const { bad, apCost } = Combat.probePlayerShot(player, target)
        if (bad === 'ok') {return true}
        const msg = badShotMessage(bad, apCost)
        if (msg) {uiLog(msg)}
        if (bad === 'noAmmo') {EventBus.emit('audio:playSound', { soundId: 'out_of_ammo' })}
        return false
    }

    /**
     * combat.cc _combat_to_hit: the crosshair's chance to hit `target` with
     * the current item action, or null when the shot is refused.
     */
    static playerToHit(player: Critter, target: Critter): number | null {
        if (!player?.AP || !target) {return null}
        const { bad, probe, hitMode } = Combat.probePlayerShot(player, target)
        if (bad !== 'ok') {return null}
        return probe.getHitChance(player, target, 'uncalled', hitMode).hit
    }

    private static probePlayerShot(player: Critter, target: Critter): { bad: BadShot; apCost: number; probe: Combat; hitMode: HitMode } {
        const live = globalState.combat
        const probe = live ?? (() => {
            const p = Object.create(Combat.prototype) as Combat
            p.combatants = []
            return p
        })()
        const weapon: any = player.equippedWeapon
        const hitMode: HitMode = weapon?.weapon?.hitMode?.() ?? 1
        const info = getAttackWeaponInfo(player, hitMode)
        const aiming = (weapon?.weapon?.isCalled?.() ?? false) && canAimAttack(player, info)
        return { bad: probe.checkBadShot(player, target, hitMode, aiming), apCost: attackApCostFor(player, info, aiming), probe, hitMode }
    }

    /**
     * Begin combat. `attacker` acts first against `defender`; with
     * `teamCombat` every critter on the two teams is drawn in against the
     * nearest member of the other (combat_ai.cc _caiSetupTeamCombat, used by
     * random-encounter ambushes).
     */
    static start(attacker?: Critter, defender?: Critter, opts: { teamCombat?: boolean; startData?: CombatStartData } = {}): void {
        const objects = globalState.gMap.getObjects()
        if (opts.teamCombat) {
            for (const o of objects) {
                if (o instanceof Critter && !o.isPlayer) {
                    ;(o as any).combatManeuver = ((o as any).combatManeuver ?? 0) | Maneuver.ENGAGING
                }
            }
        }
        globalState.inCombat = true
        const combat = new Combat(objects, attacker ?? null, defender ?? null)
        combat.startData = opts.startData ?? null
        globalState.combat = combat
        if (opts.teamCombat && attacker && defender) {combat.initTeamCombat(attacker, defender)}
        EventBus.emit('combat:start', { combatants: combat.combatants.map((_, i) => i) })

        combat.refreshOutlines()
        combat.startRound()
        globalState.gMap.updateMap()
    }

    /** _caiTeamCombatInit: each side's critters target the nearest of the other side. */
    private initTeamCombat(attackerTeamObj: Critter, defenderTeamObj: Critter): void {
        const attackerTeam = teamOf(attackerTeamObj)
        const defenderTeam = teamOf(defenderTeamObj)
        const nearestOf = (from: Critter, team: number) => {
            let best: Critter | null = null
            let bestDist = Infinity
            for (const c of this.combatants) {
                if (c === from || c.dead || teamOf(c) !== team || !c.position || !from.position) {continue}
                const d = hexDistance(from.position, c.position)
                if (d < bestDist) {
                    best = c
                    bestDist = d
                }
            }
            return best
        }
        for (const c of this.combatants) {
            if (teamOf(c) === attackerTeam) {(c as any).whoHitMe = nearestOf(c, defenderTeam)}
            else if (teamOf(c) === defenderTeam) {(c as any).whoHitMe = nearestOf(c, attackerTeam)}
        }
    }

    end() {
        if (globalState.combat !== this && globalState.combat !== null && globalState.combat !== undefined) {return}

        // combat.cc _combat_over: NPCs top up their guns from their packs.
        for (const c of this.combatants.slice(0, this.numActive)) {
            if (c.isPlayer || c.dead) {continue}
            const weapon = c.equippedWeapon
            if (weapon && isRangedWeapon(weapon)) {
                try {
                    reloadWeapon(c, weapon, { apCost: 0 })
                } catch {
                    // nothing to load
                }
            }
        }

        for (const combatant of this.combatants) {
            const x = combatant as any
            combatant.hostile = false
            combatant.outline = null
            x.damageLastTurn = 0
            x.combatManeuver = Maneuver.NONE
            x.isFleeing = false
            x.whoHitMe = null
            x.aiLastTarget = null
            x.aiFriendlyDead = null
            if (combatant.AP) {
                combatant.AP.combat = 0
                combatant.AP.move = 0
            }
            // DAM_ON_FIRE only selects the burning death animation.
            if (x.onFire) {x.onFire = false}
        }

        // _combat_over: the player gets a full AP bar back, and a knocked-out
        // or knocked-down (but living) player comes to at once.
        const player = this.player as any
        if (player && !player.dead) {
            if (player.AP?.resetAP) {
                player.AP.resetAP()
                player.AP.move = 0
            }
            if (player.knockedOut || player.knockedDown) {
                player.knockedOut = false
                player.knockedDown = false
                player.knockoutWakeTick = undefined
            }
        }

        console.log('[end combat]')
        // Kill experience is granted once combat is over (combat.cc _combat_give_exps).
        this.giveExperience()
        this.inPlayerTurn = false
        globalState.combat = null
        globalState.inCombat = false
        // _combat_over: gameMouseSetMode(GAME_MOUSE_MODE_MOVE).
        globalState.mouseMode = 'move'
        EventBus.emit('combat:end')

        globalState.gMap.updateMap()
        uiEndCombat()
    }

    /**
     * _combat_give_exps: "<prefix> you earn N exp. points." — the prefix is
     * one of proto.msg 622–625, or 626 when unscratched (35% of the time).
     */
    private giveExperience(): void {
        const xp = this.pendingExperience ?? 0
        this.pendingExperience = 0
        const player: any = this.player ?? globalState.player
        if (xp <= 0 || !player || player.dead) {return}
        const before = player.xp ?? 0
        awardCritterXp(player, xp)
        const gained = (player.xp ?? 0) - before
        const proto = (id: number, fallback: string) => {
            try {
                return getMessage('proto', id) || fallback
            } catch {
                return fallback
            }
        }
        let prefixId = 622 + this.random(0, 3)
        const hp = player.getStat?.('HP') ?? 0
        const maxHp = player.getStat?.('Max HP') ?? 0
        if (hp === maxHp && this.random(0, 100) > 65) {prefixId = 626}
        const prefix = proto(prefixId, 'For defeating your enemies,')
        uiLog(proto(621, '%s you earn %d exp. points.').replace('%s', prefix).replace('%d', String(gained)))
    }

    forceTurn(obj: Critter) {
        const idx = this.combatants.indexOf(obj)
        if (idx === -1 || idx >= this.numActive) {
            console.warn("forceTurn: no active combatant '" + obj.name + "' — ignoring")
            return
        }
        this.whoseTurn = idx - 1
    }

    /** Outline the fighting: red for the player's enemies, green for friends. */
    private refreshOutlines(): void {
        const team = teamOf(this.player)
        this.combatants.forEach((c, i) => {
            if (c.isPlayer) {return}
            const active = i < this.numActive && !c.dead
            c.hostile = active && teamOf(c) !== team
            c.outline = !active ? null : teamOf(c) === team ? 'green' : 'red'
        })
    }

    /** _combat_set_move_all, then the first turn of the round. */
    private startRound(): void {
        for (const c of this.combatants.slice(0, this.numActive)) {
            if (c.AP) {c.AP.resetAP()}
        }
        this.whoseTurn = -1
        this.advance()
    }

    /**
     * End the current turn and move on (the END TURN button, an AI turn
     * finishing, or a skipped turn).
     */
    nextTurn(): void {
        if (globalState.combat !== this && globalState.combat !== undefined && globalState.combat !== null) {return}
        // CombatStartData lasts for the first combatant's turn only.
        if (this.whoseTurn >= 0) {this.startData = null}
        if (!this.player) {
            console.warn('[combat] nextTurn: no player — ending combat')
            return this.end()
        }
        const prev = this.combatants[this.whoseTurn]
        if (this.whoseTurn >= 0 && prev) {
            EventBus.emit('combat:turnEnd', { entityId: this.whoseTurn })
            if (prev.isPlayer) {
                this.inPlayerTurn = false
                // The display's free-move counter only lasts the turn.
                if (prev.AP) {prev.AP.move = 0}
            }
        }
        this.turnNum++
        this.advance()
    }

    /** Hand the turn to the next combatant who can act, or close the round. */
    private advance(): void {
        for (;;) {
            if (globalState.combat && globalState.combat !== this) {return}
            this.whoseTurn++
            if (this.whoseTurn >= this.numActive) {
                this.endRound().catch((e) => {
                    console.warn('[combat] end of round failed: ' + e)
                    if (globalState.combat === this) {this.end()}
                })
                return
            }
            const critter = this.combatants[this.whoseTurn]
            // The attack that started combat (_gcsd) only steers the very first turn.
            const defender = this.startDefender
            this.startDefender = null
            EventBus.emit('combat:turnStart', { entityId: this.whoseTurn, isPlayer: critter?.isPlayer ?? false })
            if (!critter || this.turnPrologue(critter) === 'skip') {continue}
            this.idleRounds = 0
            if (critter.isPlayer) {
                this.inPlayerTurn = true
                uiUpdateCombatHUD()
                return
            }
            this.inPlayerTurn = false
            void this.runAITurn(critter, defender).then(() => {
                if (globalState.combat === this && this.combatants[this.whoseTurn] === critter) {this.nextTurn()}
            }).catch((e) => console.warn('[combat] turn hand-off failed: ' + e))
            return
        }
    }

    /**
     * combat.cc _combat_turn up to the action: knocked-out, dead and
     * lose-a-turn critters skip, the combat script runs (and may override
     * the turn), then a prone critter stands up.
     */
    private turnPrologue(critter: Critter): 'skip' | 'act' {
        const c = critter as any
        if (critter.dead || c.knockedOut || c.loseNextTurn || c.stunned) {
            c.loseNextTurn = false
            c.stunned = false
            return 'skip'
        }
        let overrides = false
        if (Config.engine.doLoadScripts && c._script) {
            overrides = Scripting.combatEvent(critter, 'turnBegin') === true
        }
        if (globalState.combat && globalState.combat !== this) {return 'skip'}
        if (overrides) {return 'skip'}
        this.standUpIfProne(critter)
        if (critter.isPlayer) {
            const ap: any = critter.AP
            const left = ap?.getAvailableMoveAP?.() ?? ap?.getAvailableCombatAP?.() ?? 0
            if (left <= 0) {return 'skip'}
        } else if (!critter.AP) {
            return 'skip'
        }
        return 'act'
    }

    /**
     * combat.cc _combat_sequence, then the loop's _combat_should_end test:
     * critters who now want to fight join (and act at once), the dead,
     * knocked out and disengaged drop out, the rest re-sort by Sequence,
     * and five seconds pass.
     */
    private async endRound(): Promise<void> {
        this.inPlayerTurn = false
        // Nobody able to act for this long (everyone knocked out): stop.
        this.idleRounds = (this.idleRounds ?? 0) + 1
        if (this.idleRounds > 100) {
            this.end()
            return
        }
        this.wakeKnockedOut()
        this.notifyFriends(this.player)

        this.activeCount = this.numActive
        for (let index = this.activeCount; index < this.combatants.length; index++) {
            const c = this.combatants[index]
            if (c.isPlayer || !this.wantsToJoin(c)) {continue}
            ;(c as any).combatManeuver = Maneuver.NONE
            this.combatants[index] = this.combatants[this.activeCount]
            this.combatants[this.activeCount] = c
            this.activeCount++
            if (c.AP) {c.AP.resetAP()}
            this.refreshOutlines()
            this.whoseTurn = this.activeCount - 1
            EventBus.emit('combat:turnStart', { entityId: this.whoseTurn, isPlayer: false })
            if (this.turnPrologue(c) === 'act') {
                this.idleRounds = 0
                await this.runAITurn(c, null)
            }
            if (globalState.combat !== this) {return}
        }

        // Drop the dead, then the knocked out and disengaged, to the non-combatants.
        const active = this.combatants.slice(0, this.activeCount)
        const rest = this.combatants.slice(this.activeCount)
        const keep: Critter[] = []
        const out: Critter[] = []
        const dead: Critter[] = []
        for (const c of active) {
            const x = c as any
            if (c.dead) {dead.push(c)}
            else if (!c.isPlayer && (x.knockedOut || (x.combatManeuver ?? 0) === Maneuver.DISENGAGING)) {
                x.combatManeuver = (x.combatManeuver ?? 0) & ~Maneuver.ENGAGING
                out.push(c)
            } else {keep.push(c)}
        }
        this.combatants = [...keep, ...out, ...rest, ...dead]
        this.activeCount = keep.length
        this.sortBySequence()
        this.playerIdx = this.combatants.findIndex((x) => x.isPlayer)
        globalState.gameTickTime = (globalState.gameTickTime ?? 0) + 50
        this.combatNumTurns++
        this.refreshOutlines()

        if (this.shouldEnd()) {
            this.end()
            return
        }
        this.round++
        console.log(`[combat] round ${this.round}`)
        this.startRound()
    }

    /** Knockouts wear off 10×(35 − 3×END) ticks after the blow (critter.cc knockout event). */
    private wakeKnockedOut(): void {
        const now = globalState.gameTickTime ?? 0
        for (const c of this.combatants) {
            const x = c as any
            if (x.knockedOut && typeof x.knockoutWakeTick === 'number' && now >= x.knockoutWakeTick) {
                x.knockedOut = false
                x.knockoutWakeTick = undefined
            }
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

/** combat.cc isGrenade: a thrown explosive, plasma or EMP weapon. */
function isGrenadeAttack(info: AttackWeaponInfo): boolean {
    return info.attackType === 'throw'
        && (info.damageType === 'Explosive' || info.damageType === 'Plasma' || info.damageType === 'EMP')
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
