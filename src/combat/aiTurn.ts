/**
 * One NPC combat turn, ported from combat_ai.cc _combat_ai and the helpers
 * it drives (_ai_run_away, _ai_check_drugs, _ai_danger_source,
 * _cai_perform_distance_prefs, _ai_try_attack, _ai_pick_hit_mode,
 * _ai_switch_weapons, _ai_called_shot, _ai_move_steps_closer, _ai_move_away).
 *
 * The engine runs each step synchronously and waits for its animation
 * (_combat_turn_run); here every step that animates is awaited instead.
 */

import type { Combat } from '../combat.js'
import { hexDirectionTo, hexDistance, hexInDirectionDistance, hexLine, Point } from '../geometry.js'
import globalState from '../globalState.js'
import { isDrug, takeDrug } from '../character/timedEffects.js'
import { getMessage } from '../util.js'
import { getAttackWeaponInfo, attackApCostFor, canAimAttack, type HitMode } from './attackInfo.js'
import { getLoadedAmmo, isRangedWeapon, reloadWeapon, weaponAmmoPid } from './ammo.js'
import { reloadApCost, type Rng } from './fo2Formulas.js'
import { HIT_LOCATION_ORDER } from './criticalTables.js'
import {
    aiPacketFor,
    AreaAttackMode,
    AttackTypeId,
    attackTypeId,
    AttackWho,
    BestWeapon,
    ChemUse,
    combatRating,
    Distance,
    Disposition,
    isFleeing,
    isPartyMember,
    isWithinPerception,
    Maneuver,
    resultFlags,
    setWhoHitMe,
    statOf,
    skillOf,
    teamOf,
    WEAPON_PREF_ORDERINGS,
    type AiPacket,
} from './aiPacket.js'
import { Dam } from './criticalTables.js'

/** _ai_check_drugs HP ratios and chances. */
const STIMS_WHEN_HURT_LITTLE_RATIO = 60
const STIMS_WHEN_HURT_LOTS_RATIO = 30
const STIMS_RATIO = 50
const SOMETIMES_CHANCE = 25
const ANYTIME_CHANCE = 75
const ALWAYS_CHANCE = 100

/** Healing item pids (item.cc gHealingItemPids). */
const HEALING_PIDS = new Set([40, 144, 273])

/** _combat_ai: how far each party distance setting lets a follower stray. */
const PARTY_MEMBER_DISTANCES = [5, 7, 7, 7, 50000]

export const AI_MESSAGE = { RUN: 0, MOVE: 1, ATTACK: 2, MISS: 3, HIT: 4 } as const

/**
 * _combatai_msg: a floating taunt above the critter, its packet's `chance`
 * percent of the time, and only when no other floating text is showing
 * (_ai_print_msg).
 */
export function combatTaunt(c: AnyCritter, type: number, rng: Rng, hitLocation = 3): void {
    if (!c || c.isPlayer || c.dead || c.knockedOut || !c.ai) {return}
    if ((globalState as any).combatTaunts === false) {return}
    const ai = aiPacketFor(c)
    if (rng(1, 100) > ai.chance) {return}
    const range = type === AI_MESSAGE.RUN ? ai.run
        : type === AI_MESSAGE.MOVE ? ai.move
            : type === AI_MESSAGE.ATTACK ? ai.attack
                : type === AI_MESSAGE.MISS ? ai.miss
                    : ai.hit[hitLocation] ?? ai.hit[3]
    if (!range || range.end < range.start) {return}
    let text: string | null = null
    try {
        text = getMessage('combatai', rng(range.start, range.end))
    } catch {
        text = null
    }
    if (!text || !Array.isArray(globalState.floatMessages) || globalState.floatMessages.length > 0) {return}
    globalState.floatMessages.push({
        msg: text,
        obj: c,
        startTime: typeof performance !== 'undefined' ? performance.now() : 0,
        color: 'white',
    } as any)
}

type AnyCritter = any

/** Attack mode 0 attacks with bare fists (HIT_MODE_PUNCH) whatever is in hand. */
export type AiHitMode = 0 | 1 | 2

/** An animation that never reports back must not stall the fight. */
const ANIMATION_TIMEOUT_MS = 20000

function guardTimeout(fn: () => void): void {
    if (typeof setTimeout !== 'function') {return}
    const t: any = setTimeout(fn, ANIMATION_TIMEOUT_MS)
    t?.unref?.()
}

function dist(a: AnyCritter, b: AnyCritter): number {
    if (!a?.position || !b?.position) {return 0}
    return hexDistance(a.position, b.position)
}

function inventoryWeapons(c: AnyCritter): AnyCritter[] {
    const inv: AnyCritter[] = Array.isArray(c?.inventory) ? c.inventory : []
    return inv.filter((o) => o?.subtype === 'weapon' && o.weapon)
}

function attackTypeFor(c: AnyCritter, weapon: AnyCritter | null, hitMode: AiHitMode): number {
    if (!weapon) {return AttackTypeId.UNARMED}
    return attackTypeId(getAttackWeaponInfo(withWeapon(c, weapon), hitMode === 2 ? 2 : 1).attackType)
}

/** A view of `c` holding `weapon`, for reading weapon numbers before wielding it. */
function withWeapon(c: AnyCritter, weapon: AnyCritter | null): AnyCritter {
    return new Proxy(c, {
        get(target, prop, receiver) {
            if (prop === 'equippedWeapon') {return weapon}
            const v = Reflect.get(target, prop, receiver)
            return typeof v === 'function' ? v.bind(target) : v
        },
    })
}

function secondaryMode(weapon: AnyCritter | null): number {
    const modes = weapon?.pro?.extra?.attackMode
    return typeof modes === 'number' ? (modes >> 4) & 0x0f : 0
}

/** _caiHasWeapPrefType. */
export function hasWeaponPrefType(ai: AiPacket, attackType: number): boolean {
    const row = WEAPON_PREF_ORDERINGS[ai.bestWeapon + 1] ?? WEAPON_PREF_ORDERINGS[0]
    return row.includes(attackType)
}

const ATTACK_ANIM_LETTER: Record<number, string> = { 1: 'q', 2: 'r', 3: 'g', 4: 'f', 5: 's', 6: 'j', 7: 'k', 8: 'l' }

/** artExists for the critter's attack animation with `weapon` in `hitMode`. */
function weaponArtExists(c: AnyCritter, weapon: AnyCritter, hitMode: AiHitMode): boolean {
    const info = globalState.imageInfo
    if (!info || typeof c?.getBase !== 'function') {return true}
    let base: string
    try {
        base = c.getBase()
    } catch {
        return true
    }
    // Without any indexed art for this critter there is nothing to check against.
    if (info[base + 'aa'] === undefined) {return true}
    const skin = weapon?.weapon?.getSkin?.() ?? 'a'
    const modes = weapon?.pro?.extra?.attackMode ?? 0
    const mode = hitMode === 2 ? (modes >> 4) & 0x0f : modes & 0x0f
    const letter = ATTACK_ANIM_LETTER[mode]
    if (!letter) {return true}
    return info[base + skin + letter] !== undefined
}

export class AiTurn {
    private readonly combat: Combat
    private readonly c: AnyCritter
    private readonly rng: Rng

    constructor(combat: Combat, critter: AnyCritter) {
        this.combat = combat
        this.c = critter
        this.rng = (min, max) => combat.random(min, max)
    }

    private get ai(): AiPacket {
        return aiPacketFor(this.c)
    }

    private get ap(): number {
        const ap = this.c.AP
        return ap ? ap.getAvailableCombatAP() : 0
    }

    private spendAp(n: number): void {
        const ap = this.c.AP
        if (!ap) {return}
        ap.combat = n > ap.combat ? 0 : ap.combat - n
    }

    /** Combat ended (or moved on) under us: stop acting. */
    private get stale(): boolean {
        return globalState.combat !== this.combat || this.c.dead === true
    }

    // ── state ───────────────────────────────────────────────────────────

    private get friendlyDead(): AnyCritter | null {
        return this.c.aiFriendlyDead ?? null
    }

    private set friendlyDead(v: AnyCritter | null) {
        if (v === this.c) {return}
        this.c.aiFriendlyDead = v
    }

    // ── taunts ──────────────────────────────────────────────────────────

    taunt(type: number, hitLocation = 3): void {
        combatTaunt(this.c, type, this.rng, hitLocation)
    }

    // ── movement ────────────────────────────────────────────────────────

    /**
     * Walk (or run) toward `dest`, at most `steps` hexes and as far as the AP
     * allows. With `stopNextTo`, the last hex (the occupant's) is left out.
     */
    private walk(dest: Point, steps: number, run: boolean, stopNextTo = false): Promise<boolean> {
        const c = this.c
        if (!c.position || !dest || steps <= 0) {return Promise.resolve(false)}
        const map: any = globalState.gMap
        let path: number[][] = []
        try {
            path = map?.recalcPath ? map.recalcPath(c.position, dest, stopNextTo ? false : undefined) : []
        } catch {
            path = []
        }
        if (!Array.isArray(path)) {return Promise.resolve(false)}
        if (stopNextTo && path.length > 0) {
            const last = path[path.length - 1]
            if (last[0] === dest.x && last[1] === dest.y) {path = path.slice(0, -1)}
        }
        const perHex = this.combat.moveCostPerHex(c)
        const affordable = Math.floor(this.ap / perHex)
        const n = Math.min(path.length - 1, steps, affordable)
        if (n <= 0) {return Promise.resolve(false)}
        path = path.slice(0, n + 1)
        const end = { x: path[n][0], y: path[n][1] }
        return new Promise((resolve) => {
            let done = false
            const finish = (ok: boolean) => {
                if (done) {return}
                done = true
                resolve(ok)
            }
            const started = typeof c.walkTo === 'function' && c.walkTo(end, run && n >= 1, () => {
                c.clearAnim?.()
                finish(true)
            }, n, path) !== false
            if (!started) {
                finish(false)
                return
            }
            guardTimeout(() => finish(true))
            this.spendAp(n * perHex)
        })
    }

    /** _ai_move_steps_closer: approach `target` by up to `steps` hexes. */
    async moveStepsCloser(target: AnyCritter, steps: number, taunt: boolean): Promise<boolean> {
        if (steps <= 0) {return false}
        const ai = this.ai
        if (ai.distance === Distance.STAY) {return false}
        const player = globalState.player
        if (ai.distance === Distance.STAY_CLOSE && target !== player) {
            const current = dist(this.c, player)
            if (current > 5 && dist(target, player) > 5 && current + steps > 5) {return false}
        }
        if (dist(this.c, target) <= 1 || !target?.position) {return false}
        if (taunt) {this.taunt(AI_MESSAGE.MOVE)}
        const run = steps >= Math.trunc(statOf(this.c, 'AP') / 2) && this.c.canRun?.() !== false
        const tile = this.retargetTile(target, target.position)
        const onTarget = tile.x === target.position.x && tile.y === target.position.y
        return this.walk(tile, steps, run, onTarget)
    }

    /** _ai_move_away: back off from `threat` while within `distance` hexes. */
    async moveAway(threat: AnyCritter, distance: number): Promise<boolean> {
        if (this.ai.distance === Distance.STAY) {return false}
        if (dist(this.c, threat) > distance) {return false}
        const steps = Math.min(this.ap, distance)
        const dest = this.retreatTile(threat, steps)
        if (!dest) {return false}
        return this.walk(dest.tile, dest.steps, false)
    }

    /** First reachable tile straight away from `threat` (or 60° either side), farthest first. */
    private retreatTile(threat: AnyCritter, steps: number): { tile: Point; steps: number } | null {
        const c = this.c
        if (!c.position || !threat?.position) {return null}
        const rotation = hexDirectionTo(threat.position, c.position) ?? 0
        const map: any = globalState.gMap
        for (let n = steps; n > 0; n--) {
            for (const rot of [rotation, (rotation + 1) % 6, (rotation + 5) % 6]) {
                const tile = hexInDirectionDistance(c.position, rot, n)
                if (!tile || tile.x < 0 || tile.y < 0 || tile.x >= 200 || tile.y >= 200) {continue}
                let path: unknown[] = []
                try {
                    path = map?.recalcPath ? map.recalcPath(c.position, tile) : []
                } catch {
                    path = []
                }
                if (Array.isArray(path) && path.length > 0) {return { tile, steps: n }}
            }
        }
        return null
    }

    /** _ai_run_away: flee straight from the threat, or give up the fight when far enough. */
    async runAway(threat: AnyCritter | null): Promise<void> {
        const c = this.c
        const from = threat ?? globalState.player
        if (dist(c, from) < this.ai.maxDist) {
            c.combatManeuver = (c.combatManeuver ?? 0) | Maneuver.FLEEING
            c.isFleeing = true
            const dest = this.retreatTile(from, this.ap)
            if (dest) {
                this.taunt(AI_MESSAGE.RUN)
                await this.walk(dest.tile, this.ap, true)
            }
        } else {
            c.combatManeuver = (c.combatManeuver ?? 0) | Maneuver.DISENGAGING
        }
    }

    // ── targets ─────────────────────────────────────────────────────────

    private get crowd(): AnyCritter[] {
        return (this.combat.combatants ?? []).slice()
    }

    private sortByDistance(list: (AnyCritter | null)[]): (AnyCritter | null)[] {
        return list.sort((a, b) => {
            if (!a && !b) {return 0}
            if (!a) {return 1}
            if (!b) {return -1}
            return dist(a, this.c) - dist(b, this.c)
        })
    }

    /** _ai_find_nearest_team (flags 1: same team as `teamOf`). */
    private nearestOfTeam(teamCritter: AnyCritter, inCombat: boolean): AnyCritter | null {
        if (!teamCritter) {return null}
        const team = teamOf(teamCritter)
        for (const obj of this.sortByDistance(this.crowd)) {
            if (!obj || obj === this.c || obj.dead || teamOf(obj) !== team) {continue}
            if (inCombat && !obj.whoHitMe) {continue}
            return obj
        }
        return null
    }

    /** aiFindAttackers: who hit me, who hit a friend, whom a friend hit. */
    private findAttackers(): [AnyCritter | null, AnyCritter | null, AnyCritter | null] {
        let whoHitMe: AnyCritter | null = null
        let whoHitFriend: AnyCritter | null = null
        let whoHitByFriend: AnyCritter | null = null
        let found = 0
        const team = teamOf(this.c)
        for (const candidate of this.sortByDistance(this.crowd)) {
            if (found >= 3) {break}
            if (!candidate || candidate === this.c) {continue}
            if (!whoHitMe && !candidate.dead && candidate.whoHitMe === this.c) {
                whoHitMe = candidate
                found++
                continue
            }
            if (!whoHitFriend && teamOf(candidate) === team) {
                const hitter = candidate.whoHitMe
                if (hitter && hitter !== this.c && teamOf(hitter) !== team && !hitter.dead) {
                    whoHitFriend = hitter
                    found++
                    continue
                }
            }
            if (!whoHitByFriend && teamOf(candidate) !== team && !candidate.dead) {
                const hitter = candidate.whoHitMe
                if (hitter && teamOf(hitter) === team) {
                    whoHitByFriend = candidate
                    found++
                    continue
                }
            }
        }
        return [whoHitMe, whoHitFriend, whoHitByFriend]
    }

    private reachable(target: AnyCritter): boolean {
        const map: any = globalState.gMap
        if (!map?.recalcPath || !this.c.position || !target?.position) {return true}
        try {
            const path = map.recalcPath(this.c.position, target.position, false)
            return Array.isArray(path) && path.length > 0
        } catch {
            return true
        }
    }

    /** _ai_danger_source: whom to fight this turn. */
    dangerSource(): AnyCritter | null {
        const c = this.c
        const ai = this.ai
        let ignoreFleeing = false
        let attackWho = -1
        const targets: (AnyCritter | null)[] = [null, null, null, null]

        if (isPartyMember(c) && !c.isPlayer) {
            const disposition = ai.disposition
            ignoreFleeing = disposition === Disposition.CUSTOM || disposition === Disposition.COWARD
                || disposition === Disposition.DEFENSIVE || disposition === Disposition.AGGRESSIVE
            if (ignoreFleeing && ai.distance === Distance.CHARGE) {ignoreFleeing = false}

            attackWho = ai.attackWho
            if (attackWho === AttackWho.WHOMEVER_ATTACKING_ME) {
                const player = globalState.player
                const valid = (x: AnyCritter) => x && !x.dead && !x.knockedOut
                    && teamOf(x) !== teamOf(c) && x.aiLastTarget === player
                let candidate: AnyCritter | null = c.aiLastTarget ?? null
                if (candidate && (!valid(candidate) || (ignoreFleeing && isFleeing(candidate)))) {candidate = null}
                if (!candidate) {
                    for (const x of this.sortByDistance(this.crowd)) {
                        if (!x || x === c || !valid(x)) {continue}
                        if (!this.reachable(x)) {continue}
                        const bad = this.combat.checkBadShot(c, x, 1, false)
                        if (bad !== 'ok' && bad !== 'noAmmo' && bad !== 'outOfRange') {continue}
                        if (ignoreFleeing && isFleeing(x)) {continue}
                        candidate = x
                        break
                    }
                }
                if (candidate) {return candidate}
            } else if (attackWho === AttackWho.STRONGEST || attackWho === AttackWho.WEAKEST || attackWho === AttackWho.CLOSEST) {
                c.whoHitMe = null
            }
        }

        const whoHitMe = c.whoHitMe
        if (whoHitMe && whoHitMe !== c) {
            if (!whoHitMe.dead) {
                if (attackWho === AttackWho.WHOMEVER || attackWho === -1) {return whoHitMe}
            } else if (teamOf(whoHitMe) !== teamOf(c)) {
                targets[0] = this.nearestOfTeam(whoHitMe, false)
            }
        }

        const [a, b, d] = this.findAttackers()
        targets[1] = a
        targets[2] = b
        targets[3] = d

        if (ignoreFleeing) {
            for (let i = 0; i < 4; i++) {
                if (targets[i] && isFleeing(targets[i])) {targets[i] = null}
            }
        }

        if (attackWho === AttackWho.STRONGEST || attackWho === AttackWho.WEAKEST) {
            // _compare_strength sorts ascending and _compare_weakness descending.
            const sign = attackWho === AttackWho.STRONGEST ? 1 : -1
            targets.sort((x, y) => {
                if (!x && !y) {return 0}
                if (!x) {return 1}
                if (!y) {return -1}
                return sign * (combatRating(x) - combatRating(y))
            })
        } else {
            this.sortByDistance(targets)
        }

        for (const candidate of targets) {
            if (!candidate || !isWithinPerception(c, candidate, this.rng)) {continue}
            if (this.reachable(candidate) || this.combat.checkBadShot(c, candidate, 1, false) === 'ok') {
                return candidate
            }
        }
        return null
    }

    // ── weapons ─────────────────────────────────────────────────────────

    private equipped(): AnyCritter | null {
        const w = this.c.equippedWeapon
        if (!w || !w.weapon) {return null}
        if (!w.pro && w.weapon.name === 'punch') {return null}
        return w
    }

    private attackCost(weapon: AnyCritter | null, hitMode: AiHitMode, aiming = false): number {
        const view = withWeapon(this.c, weapon)
        const info = getAttackWeaponInfo(view, hitMode === 0 || !weapon ? 0 as HitMode : hitMode as HitMode)
        return attackApCostFor(this.c, info, aiming)
    }

    private range(weapon: AnyCritter | null, hitMode: AiHitMode): number {
        return getAttackWeaponInfo(withWeapon(this.c, weapon), (weapon ? hitMode : 0) as HitMode).range
    }

    /** _ai_can_use_weapon. */
    private canUseWeapon(weapon: AnyCritter, hitMode: AiHitMode): boolean {
        const c = this.c
        if (c.crippledLeftArm && c.crippledRightArm) {return false}
        const info = getAttackWeaponInfo(withWeapon(c, weapon), (hitMode || 1) as HitMode)
        if ((c.crippledLeftArm || c.crippledRightArm) && info.twoHanded) {return false}
        if (!weaponArtExists(c, weapon, hitMode)) {return false}
        if (skillOf(c, info.skill) < this.ai.minToHit) {return false}
        return hasWeaponPrefType(this.ai, attackTypeFor(c, weapon, 1))
    }

    /** aiHaveAmmo: matching ammo in the inventory. */
    private ammoFor(weapon: AnyCritter): AnyCritter | null {
        if (!weapon || !isRangedWeapon(weapon)) {return null}
        const pid = weaponAmmoPid(weapon)
        const inv: AnyCritter[] = Array.isArray(this.c.inventory) ? this.c.inventory : []
        return inv.find((o) => o?.pid === pid && (typeof o.amount !== 'number' || o.amount > 0)) ?? null
    }

    /** Average damage for _ai_best_weapon, ×(extras+1) for explosives, ×2 with a weapon perk. */
    private weaponScore(weapon: AnyCritter, defender: AnyCritter | null): number {
        const info = getAttackWeaponInfo(withWeapon(this.c, weapon), 1)
        let avg = Math.trunc((info.minDamage + info.maxDamage) / 2)
        const radius = this.damageRadius(weapon, 1)
        if (radius > 0 && defender?.position) {
            const extras = this.crowd.filter((x) => x && x !== defender && !x.dead && x.position
                && hexDistance(x.position, defender.position) <= radius).length
            avg *= extras + 1
        }
        if (info.perk !== -1) {avg *= 2}
        return avg
    }

    /** weaponGetDamageRadius: rockets 3, grenades 2. */
    private damageRadius(weapon: AnyCritter | null, hitMode: AiHitMode): number {
        if (!weapon) {return 0}
        const info = getAttackWeaponInfo(withWeapon(this.c, weapon), (hitMode || 1) as HitMode)
        if (info.attackType === 'ranged' && info.mode === 6 && info.damageType === 'Explosive') {return 3}
        if (info.attackType === 'throw'
            && (info.damageType === 'Explosive' || info.damageType === 'Plasma' || info.damageType === 'EMP')) {return 2}
        return 0
    }

    /** _ai_best_weapon. */
    private bestWeapon(w1: AnyCritter | null, w2: AnyCritter | null, defender: AnyCritter | null): AnyCritter | null {
        const ai = this.ai
        if (ai.bestWeapon === BestWeapon.RANDOM) {return this.rng(1, 100) <= 50 ? w1 : w2}
        const order = WEAPON_PREF_ORDERINGS[ai.bestWeapon + 1] ?? WEAPON_PREF_ORDERINGS[0]
        const rank = (w: AnyCritter | null): { order: number; avg: number } => {
            let type = -1
            let avg = 0
            let ignore = false
            if (w) {
                type = attackTypeFor(this.c, w, 1)
                avg = this.weaponScore(w, defender)
                if (defender && this.unsafe(w, 1, defender).unsafe) {ignore = true}
            } else if (defender && this.range(null, 0) >= dist(this.c, defender)) {
                type = AttackTypeId.UNARMED
            }
            const idx = ignore ? -1 : order.indexOf(type)
            return { order: idx === -1 ? 999 : idx, avg }
        }
        const r1 = rank(w1)
        const r2 = rank(w2)
        if (r1.order === r2.order) {
            if (r1.order === 999) {return null}
            if (Math.abs(r2.avg - r1.avg) <= 5) {
                const cost = (w: AnyCritter | null) => w?.pro?.extra?.cost ?? w?.pro?.cost ?? 0
                return cost(w2) > cost(w1) ? w2 : w1
            }
            return r2.avg > r1.avg ? w2 : w1
        }
        const FLARE = 79
        if (w1?.pid === FLARE && w2) {return w2}
        if (w2?.pid === FLARE && w1) {return w1}
        if ((ai.bestWeapon === -1 || ai.bestWeapon >= BestWeapon.UNARMED_OVER_THROWN) && Math.abs(r2.avg - r1.avg) > 5) {
            return r2.avg > r1.avg ? w2 : w1
        }
        return r1.order > r2.order ? w2 : w1
    }

    /** _ai_search_inven_weap. */
    searchInventoryWeapon(checkAp: boolean, defender: AnyCritter | null): AnyCritter | null {
        let best: AnyCritter | null = null
        const current = this.equipped()
        for (const weapon of inventoryWeapons(this.c)) {
            if (weapon === current) {continue}
            if (checkAp && this.attackCost(weapon, 1) > this.ap) {continue}
            if (!this.canUseWeapon(weapon, 1)) {continue}
            if (attackTypeFor(this.c, weapon, 1) === AttackTypeId.RANGED && getLoadedAmmo(weapon) === 0
                && !this.ammoFor(weapon)) {continue}
            best = this.bestWeapon(best, weapon, defender)
        }
        return best
    }

    /** _inven_wield into the hand the critter attacks with. */
    private wield(weapon: AnyCritter): void {
        const c = this.c
        const hand = (c.activeHand ?? 0) === 1 ? 'rightHand' : 'leftHand'
        c[hand] = weapon
        try {
            c.art = c.getAnimation?.('idle') ?? c.art
        } catch {
            // keep the current art
        }
    }

    /** _inven_unwield: put the weapon away, leaving bare fists. */
    private unwield(): void {
        const c = this.c
        const current = this.equipped()
        if (!current) {return}
        for (const hand of ['leftHand', 'rightHand']) {
            if (c[hand] === current) {
                c[hand] = { type: 'item', subtype: 'weapon', weapon: { name: 'punch', type: 'melee' } }
            }
        }
    }

    /**
     * _combat_safety_invalidate_weapon: would this attack hurt a teammate?
     * Explosives also report how far to back off from the blast.
     */
    unsafe(weapon: AnyCritter | null, hitMode: AiHitMode, defender: AnyCritter): { unsafe: boolean; safeDistance: number } {
        const c = this.c
        if (!weapon || !defender?.position) {return { unsafe: false, safeDistance: 0 }}
        const team = teamOf(c)
        const info = getAttackWeaponInfo(withWeapon(c, weapon), (hitMode || 1) as HitMode)
        const hurts = (x: AnyCritter) => {
            const dt = statOf(x, 'DT ' + info.damageType)
            const dr = statOf(x, 'DR ' + info.damageType)
            return Math.trunc(dr * (info.maxDamage - dt) / 100) > 0
        }
        let radius = this.damageRadius(weapon, hitMode)
        if (radius > 0) {
            const int = statOf(c, 'INT')
            if (int < 5) {radius = Math.max(0, radius - (5 - int))}
            for (const x of this.crowd) {
                if (!x || x === c || x === defender || x.dead || teamOf(x) !== team || !x.position) {continue}
                if (hexDistance(defender.position, x.position) < radius && x !== x.whoHitMe && hurts(x)) {
                    return { unsafe: true, safeDistance: 0 }
                }
            }
            const d = dist(defender, c)
            if (d <= radius) {return { unsafe: false, safeDistance: radius - d + 1 }}
            return { unsafe: false, safeDistance: 0 }
        }
        if (!info.isBurst && info.mode !== 8) {return { unsafe: false, safeDistance: 0 }}
        for (const x of this.combat.sprayVictims(c, defender, info)) {
            if (x !== c && x !== defender && !x.dead && teamOf(x) === team && x !== x.whoHitMe && hurts(x)) {
                return { unsafe: true, safeDistance: 0 }
            }
        }
        return { unsafe: false, safeDistance: 0 }
    }

    /** _ai_pick_hit_mode. */
    pickHitMode(weapon: AnyCritter | null, defender: AnyCritter): AiHitMode {
        if (!weapon) {return 0}
        if (secondaryMode(weapon) === 0 || !this.canUseWeapon(weapon, 2)) {return 1}
        const ai = this.ai
        const toHit = () => this.combat.getHitChance(withWeapon(this.c, weapon), defender, 'torso', 2).hit
        let secondary = false
        switch (ai.areaAttackMode) {
            case AreaAttackMode.ALWAYS:
                secondary = true
                break
            case AreaAttackMode.SOMETIMES:
                secondary = this.rng(1, Math.max(1, ai.secondaryFreq)) === 1
                break
            case AreaAttackMode.BE_SURE:
                secondary = toHit() >= 85 && !this.unsafe(weapon, 2, defender).unsafe
                break
            case AreaAttackMode.BE_CAREFUL:
                secondary = toHit() >= 50 && !this.unsafe(weapon, 2, defender).unsafe
                break
            case AreaAttackMode.BE_ABSOLUTELY_SURE:
                secondary = toHit() >= 95 && !this.unsafe(weapon, 2, defender).unsafe
                break
            default:
                if (statOf(this.c, 'INT') < 6 || dist(this.c, defender) < 10) {
                    secondary = this.rng(1, Math.max(1, ai.secondaryFreq)) === 1
                }
        }
        const secondaryType = attackTypeFor(this.c, weapon, 2)
        if (secondary && !hasWeaponPrefType(ai, secondaryType)) {secondary = false}
        if (secondary && dist(this.c, defender) > this.range(weapon, 2)) {secondary = false}
        if (secondary && this.ap < this.attackCost(weapon, 2)) {secondary = false}
        if (secondary) {
            if (secondaryType !== AttackTypeId.THROW
                || this.searchInventoryWeapon(false, defender) !== null
                || this.rng(1, 10) > statOf(this.c, 'INT')) {
                return 2
            }
        }
        return 1
    }

    /** _ai_switch_weapons: arm the best usable weapon, or fists. */
    private async switchWeapons(state: { weapon: AnyCritter | null; hitMode: AiHitMode }, defender: AnyCritter): Promise<boolean> {
        state.weapon = null
        state.hitMode = 0
        let best = this.searchInventoryWeapon(true, defender)
        if (!best) {
            const nearby = this.searchEnviron('weapon')
            if (!nearby) {return this.attackCost(null, 0) <= this.ap}
            best = await this.retrieve(nearby)
            if (!best) {return false}
        }
        state.weapon = best
        state.hitMode = this.pickHitMode(best, defender)
        this.wield(best)
        return this.attackCost(best, state.hitMode) <= this.ap
    }

    // ── things on the floor ─────────────────────────────────────────────

    /** Proto body type: 0 biped, 1 quadruped, 2 robotic. */
    private get bodyType(): number {
        const c = this.c
        const t = c.pro?.extra?.bodyType ?? c.bodyType
        return typeof t === 'number' ? t : 0
    }

    /** aiCanUseItem: wanted chems, or a healing item when hurt enough to want one. */
    private canUseItem(item: AnyCritter): boolean {
        const c = this.c
        const ai = this.ai
        if (ai.chemPrimaryDesire.includes(item?.pid)) {return true}
        if (this.bodyType !== 0) {return false}
        const killType = c.pro?.extra?.killType ?? 0
        // man, woman, child, super mutant, ghoul
        if (![0, 1, 2, 3, 4].includes(killType)) {return false}
        if (statOf(c, 'INT') < 3) {return false}
        if (!HEALING_PIDS.has(item?.pid)) {return false}
        let hpRatio = STIMS_RATIO
        if (ai.chemUse === ChemUse.CLEAN) {hpRatio = 0}
        else if (ai.chemUse === ChemUse.STIMS_WHEN_HURT_LITTLE) {hpRatio = STIMS_WHEN_HURT_LITTLE_RATIO}
        else if (ai.chemUse === ChemUse.STIMS_WHEN_HURT_LOTS) {hpRatio = STIMS_WHEN_HURT_LOTS_RATIO}
        return statOf(c, 'HP') <= Math.trunc(statOf(c, 'Max HP') * hpRatio / 100)
    }

    /** _ai_search_environ: the nearest usable item of a kind within PER + 5 hexes. */
    searchEnviron(kind: 'weapon' | 'ammo' | 'drug' | 'misc'): AnyCritter | null {
        const c = this.c
        if (this.bodyType !== 0 || !c.position) {return null}
        const map: any = globalState.gMap
        let objects: AnyCritter[] = []
        try {
            objects = typeof map?.getObjects === 'function' ? map.getObjects() : []
        } catch {
            objects = []
        }
        const items = objects
            .filter((o) => o?.type === 'item' && o.position)
            .sort((a, b) => dist(a, c) - dist(b, c))
        const reach = statOf(c, 'PER') + 5
        const held = this.equipped()
        for (const item of items) {
            if (dist(c, item) > reach) {break}
            if (item.subtype !== kind) {continue}
            if (kind === 'weapon' && item.weapon && this.canUseWeapon(item, 1)) {return item}
            if (kind === 'ammo' && held && isRangedWeapon(held) && item.pid === weaponAmmoPid(held)) {return item}
            if ((kind === 'drug' || kind === 'misc') && this.canUseItem(item)) {return item}
        }
        return null
    }

    /**
     * _ai_retrieve_object: walk to the item and pick it up (3 AP in combat,
     * _check_scenery_ap_cost). Short of AP, remember it for next turn.
     */
    async retrieve(item: AnyCritter): Promise<AnyCritter | null> {
        const c = this.c
        if (item?.position && dist(c, item) > 1) {
            await this.walk(item.position, this.ap, false, true)
        }
        if (this.stale || !item?.position || dist(c, item) > 1 || this.ap < 3) {
            c.aiLastItem = item
            return null
        }
        this.spendAp(3)
        try {
            ;(globalState.gMap as any)?.removeObject?.(item)
        } catch {
            // already gone
        }
        const before = Array.isArray(c.inventory) ? c.inventory.length : 0
        if (typeof c.addInventoryItem === 'function') {
            c.addInventoryItem(item, typeof item.amount === 'number' && item.amount > 0 ? item.amount : 1)
        } else if (Array.isArray(c.inventory)) {
            c.inventory.push(item)
        }
        c.aiLastItem = null
        const inv: AnyCritter[] = Array.isArray(c.inventory) ? c.inventory : []
        return inv.length > before ? inv[inv.length - 1] : inv.find((o) => o?.pid === item.pid) ?? null
    }

    // ── attacking ───────────────────────────────────────────────────────

    /** _ai_called_shot: 1 in called_freq, with enough Intelligence for the difficulty. */
    calledShot(defender: AnyCritter, hitMode: AiHitMode): string {
        const weapon = this.equipped()
        const view = hitMode === 0 ? withWeapon(this.c, null) : this.c
        if (this.attackCost(hitMode === 0 ? null : weapon, hitMode, true) > this.ap) {return 'torso'}
        if (!canAimAttack(this.c, getAttackWeaponInfo(view, hitMode as HitMode))) {return 'torso'}
        const ai = this.ai
        if (this.rng(1, Math.max(1, ai.calledFreq)) !== 1) {return 'torso'}
        const difficulty = globalState.combatDifficulty ?? 1
        const required = difficulty === 0 ? 7 : difficulty === 2 ? 3 : 5
        if (statOf(this.c, 'INT') < required) {return 'torso'}
        const region = HIT_LOCATION_ORDER[this.rng(0, 8)]
        if (this.combat.getHitChance(view, defender, region, hitMode as HitMode).hit < ai.minToHit) {return 'torso'}
        return region
    }

    /** _ai_attack: turn, maybe aim, attack; the AP is charged after the swing. */
    private async attack(defender: AnyCritter, hitMode: AiHitMode): Promise<boolean> {
        const c = this.c
        if (isFleeing(c)) {return false}
        const region = this.calledShot(defender, hitMode)
        const aiming = region !== 'torso' && region !== 'uncalled'
        const cost = this.attackCost(hitMode === 0 ? null : this.equipped(), hitMode, aiming)
        c.aiLastTarget = defender
        await new Promise<void>((resolve) => {
            let done = false
            const finish = () => {
                if (done) {return}
                done = true
                resolve()
            }
            guardTimeout(finish)
            this.combat.performAttack(c, defender, region, hitMode as HitMode, () => {
                c.clearAnim?.()
                finish()
            })
        })
        this.spendAp(cost)
        return !this.stale
    }

    /** _determine_to_hit_no_range / _determine_to_hit_from_tile. */
    private toHit(defender: AnyCritter, hitMode: AiHitMode, opts?: { from?: Point; useDistance?: boolean }): number {
        const view = hitMode === 0 ? withWeapon(this.c, null) : this.c
        return this.combat.getHitChance(view, defender, 'uncalled', hitMode as HitMode, opts).hit
    }

    /** _ai_try_attack. Returns when the critter can do no more against `defender`. */
    async tryAttack(defender: AnyCritter): Promise<void> {
        const c = this.c
        setWhoHitMe(c, defender, this.rng)
        let taunt = true
        const state = { weapon: this.equipped(), hitMode: 1 as AiHitMode }
        state.hitMode = this.pickHitMode(state.weapon, defender)
        const minToHit = this.ai.minToHit
        let actionPoints = this.ap
        let safeDistance = 0

        if (state.weapon || !defender.equippedWeapon) {
            const check = this.unsafe(state.weapon, state.hitMode, defender)
            safeDistance = check.safeDistance
            if (check.unsafe) {await this.switchWeapons(state, defender)}
        } else {
            await this.switchWeapons(state, defender)
        }

        for (let attempt = 0; attempt < 10; attempt++) {
            if (this.stale) {return}
            if (resultFlags(c) & (Dam.KNOCKED_OUT | Dam.DEAD | Dam.LOSE_TURN)) {return}
            const view = state.hitMode === 0 ? withWeapon(c, null) : c
            const reason = this.combat.checkBadShot(view, defender, (state.hitMode || 1) as HitMode, false)
            if (reason === 'dead') {return}

            if (reason === 'noAmmo') {
                const weapon = state.weapon
                if (weapon && this.ammoFor(weapon)) {
                    const loaded = reloadWeapon(c, weapon, { apCost: 0 }).loaded
                    if (loaded > 0) {
                        const perk = typeof weapon.pro?.extra?.perk === 'number' ? weapon.pro.extra.perk : -1
                        this.spendAp(reloadApCost(perk))
                    }
                } else {
                    const nearby = weapon ? this.searchEnviron('ammo') : null
                    const ammo = nearby ? await this.retrieve(nearby) : null
                    if (weapon && ammo) {
                        if (reloadWeapon(c, weapon, { apCost: 0 }).loaded > 0) {
                            const perk = typeof weapon.pro?.extra?.perk === 'number' ? weapon.pro.extra.perk : -1
                            this.spendAp(reloadApCost(perk))
                        }
                    } else if (!nearby) {
                        this.unwield()
                        if (!await this.switchWeapons(state, defender)) {return}
                    }
                }
            } else if (reason === 'notEnoughAP' || reason === 'armCrippled' || reason === 'bothArmsCrippled') {
                if (!await this.switchWeapons(state, defender)) {return}
            } else if (reason === 'outOfRange') {
                if (this.toHit(defender, state.hitMode, { useDistance: false }) < minToHit) {
                    await this.runAway(defender)
                    return
                }
                if (state.weapon) {
                    if (!await this.moveStepsCloser(defender, actionPoints, taunt)) {return}
                } else if (!await this.switchWeapons(state, defender) || !state.weapon) {
                    if (!await this.moveStepsCloser(defender, this.ap, taunt)) {return}
                }
                taunt = false
            } else if (reason === 'aimBlocked') {
                if (!await this.moveStepsCloser(defender, this.ap, taunt)) {return}
                taunt = false
            } else {
                const accuracy = this.toHit(defender, state.hitMode)
                if (safeDistance !== 0) {
                    await this.moveAway(defender, safeDistance)
                }
                if (accuracy < minToHit) {
                    if (this.toHit(defender, state.hitMode, { useDistance: false }) < minToHit) {
                        await this.runAway(defender)
                        return
                    }
                    let toUse = 0
                    if (actionPoints > 0) {
                        const path = this.pathTo(defender)
                        if (path.length === 0) {
                            toUse = actionPoints
                        } else {
                            if (path.length < actionPoints) {actionPoints = path.length}
                            let i = 0
                            for (; i < actionPoints; i++) {
                                toUse++
                                if (this.toHit(defender, state.hitMode, { from: path[i] }) >= minToHit) {break}
                            }
                            if (i === actionPoints) {toUse = actionPoints}
                        }
                    }
                    if (!await this.moveStepsCloser(defender, toUse, taunt)) {
                        await this.runAway(defender)
                        return
                    }
                    taunt = false
                }
                if (!await this.attack(defender, state.hitMode)) {return}
                if (this.attackCost(state.hitMode === 0 ? null : state.weapon, state.hitMode) > this.ap) {return}
            }
        }
    }

    /** Tiles on the way to `defender`, excluding the start and its own hex. */
    private pathTo(defender: AnyCritter): Point[] {
        const map: any = globalState.gMap
        if (!map?.recalcPath || !this.c.position || !defender?.position) {return []}
        let path: number[][] = []
        try {
            path = map.recalcPath(this.c.position, defender.position, false)
        } catch {
            path = []
        }
        if (!Array.isArray(path) || path.length < 2) {return []}
        return path.slice(1).map(([x, y]) => ({ x, y }))
    }

    // ── distance preferences ────────────────────────────────────────────

    /** _cai_perform_distance_prefs. */
    async distancePrefs(target: AnyCritter | null): Promise<void> {
        if (this.ap <= 0) {return}
        const c = this.c
        const ai = this.ai
        const player = globalState.player
        switch (ai.distance) {
            case Distance.STAY_CLOSE:
                if (c.whoHitMe !== player) {
                    const d = dist(c, player)
                    if (d > 5) {await this.moveStepsCloser(player, d - 5, false)}
                }
                break
            case Distance.CHARGE:
                if (target) {await this.moveStepsCloser(target, this.ap, true)}
                break
            case Distance.SNIPE:
                if (target) {
                    const d = dist(c, target)
                    if (d < 10) {
                        const movement = this.ap - this.attackCost(this.equipped(), 1)
                        if (movement > 0) {
                            if (movement + d - 1 < 5 && combatRating(c) < combatRating(target)) {
                                await this.moveAway(target, 10)
                            }
                        } else {
                            await this.moveAway(target, 10)
                        }
                    }
                }
                break
        }

        // Step out of a stronger teammate's line of fire.
        if (!c.position || this.stale) {return}
        const tile = this.retargetTile(target, c.position)
        if (tile.x !== c.position.x || tile.y !== c.position.y) {
            await this.walk(tile, this.ap, false)
        }
    }

    /**
     * _cai_retargetTileFromFriendlyFire: if the nearest teammate (at least as
     * strong, shooting at the same target) would hit this critter, return
     * the free hex one step to either side of `tile` across that teammate's
     * facing; otherwise `tile` itself.
     */
    retargetTile(target: AnyCritter | null, tile: Point): Point {
        const c = this.c
        if (!target || !tile || statOf(c, 'INT') <= 0) {return tile}
        const myRating = combatRating(c)
        const friends = this.crowd
            .filter((x) => x && x !== c && !x.dead && teamOf(x) === teamOf(c)
                && x.aiLastTarget === target && combatRating(x) >= myRating)
            .sort((a, b) => dist(a, c) - dist(b, c))
        const map: any = globalState.gMap
        const blocked = (p: Point) => {
            try {
                const objs: AnyCritter[] = map?.objectsAtPosition?.(p) ?? []
                return objs.some((o) => typeof o.blocks === 'function' && o.blocks())
            } catch {
                return false
            }
        }
        for (const friend of friends) {
            if (!this.wouldBeHitBy(friend, target)) {continue}
            const options = [(friend.orientation ?? 0) + 1, (friend.orientation ?? 0) + 5]
                .map((rot) => hexInDirectionDistance(tile, rot % 6, 1))
                .filter((p): p is Point => !!p && !blocked(p))
                .sort((a, b) => hexDistance(tile, a) - hexDistance(tile, b))
            return options[0] ?? tile
        }
        return tile
    }

    /** _cai_attackWouldIntersect: is this critter first in `friend`'s line of fire, or in its blast or spray? */
    private wouldBeHitBy(friend: AnyCritter, target: AnyCritter): boolean {
        const c = this.c
        const weapon = friend.equippedWeapon
        if (!weapon?.pro || !friend.position || !target?.position || !c.position) {return false}
        const info = getAttackWeaponInfo(friend, 1)
        if (info.range < 1) {return false}
        for (const hex of hexLine(friend.position, target.position).slice(1)) {
            if (hex.x === target.position.x && hex.y === target.position.y) {break}
            const occupant = this.crowd.find((x) => x && !x.dead && x.position && x.position.x === hex.x && x.position.y === hex.y)
            if (occupant) {
                if (occupant === c) {return true}
                break
            }
        }
        // _combatTestIncidentalHit: in the blast radius or the spray.
        const radius = this.damageRadius(weapon, 1)
        if (radius > 0) {return dist(target, c) < radius}
        if (info.isBurst || info.mode === 8) {return this.combat.sprayVictims(friend, target, info).includes(c)}
        return false
    }

    // ── drugs ───────────────────────────────────────────────────────────

    private takeDrug(drug: AnyCritter): boolean {
        const inv: AnyCritter[] = this.c.inventory
        const idx = inv.indexOf(drug)
        if (idx < 0) {return false}
        if (typeof drug.amount === 'number' && drug.amount > 1) {drug.amount--}
        else {inv.splice(idx, 1)}
        try {
            takeDrug(this.c, drug)
        } catch {
            // the drug is spent either way
        }
        this.spendAp(2)
        return true
    }

    /** _ai_check_drugs: stimpaks when hurt, other chems by chem_use. */
    async checkDrugs(): Promise<void> {
        const c = this.c
        if (c.isPlayer || !Array.isArray(c.inventory)) {return}
        if (this.bodyType !== 0) {return}
        const ai = this.ai
        let lastItem: AnyCritter | null = c.aiLastItem ?? null
        let used = false
        let searchCompleted = false

        if (!lastItem) {
            let hpRatio = STIMS_RATIO
            let chance = 0
            const turns = this.combat.combatNumTurns ?? 0
            switch (ai.chemUse) {
                case ChemUse.CLEAN:
                    return
                case ChemUse.STIMS_WHEN_HURT_LITTLE:
                    hpRatio = STIMS_WHEN_HURT_LITTLE_RATIO
                    break
                case ChemUse.STIMS_WHEN_HURT_LOTS:
                    hpRatio = STIMS_WHEN_HURT_LOTS_RATIO
                    break
                case ChemUse.SOMETIMES:
                    if (turns % 3 === 0) {chance = SOMETIMES_CHANCE}
                    break
                case ChemUse.ANYTIME:
                    if (turns % 3 === 0) {chance = ANYTIME_CHANCE}
                    break
                case ChemUse.ALWAYS:
                    chance = ALWAYS_CHANCE
                    break
            }

            const drugs = () => (c.inventory as AnyCritter[]).filter((o) => isDrug(o))
            const minHp = Math.trunc(statOf(c, 'Max HP') * hpRatio / 100)
            while (statOf(c, 'HP') < minHp && this.ap >= 2) {
                const heal = drugs().find((d) => HEALING_PIDS.has(d.pid))
                if (!heal) {
                    searchCompleted = true
                    break
                }
                if (this.takeDrug(heal)) {used = true}
            }

            if (!used && chance > 0 && this.rng(0, 100) < chance) {
                searchCompleted = true
                const primary: AnyCritter[] = []
                const secondary: AnyCritter[] = []
                for (const d of drugs()) {
                    if (HEALING_PIDS.has(d.pid)) {continue}
                    const bucket = ai.chemPrimaryDesire.includes(d.pid) ? primary : secondary
                    if (bucket.length < 3) {bucket.push(d)}
                }
                let count = 0
                while (this.ap >= 2) {
                    const bucket = primary.length > 0 ? primary : secondary.length > 0 ? secondary : null
                    if (!bucket) {break}
                    const i = this.rng(0, bucket.length - 1)
                    const drug = bucket[i]
                    bucket[i] = bucket[bucket.length - 1]
                    bucket.pop()
                    if (this.takeDrug(drug)) {
                        used = true
                        count++
                    }
                    if (ai.chemUse === ChemUse.SOMETIMES || (ai.chemUse === ChemUse.ANYTIME && count >= 2)) {break}
                }
            }
        }

        // Nothing usable carried: fetch one off the floor (or the one aimed for last turn).
        if (lastItem || (!used && searchCompleted)) {
            do {
                if (!lastItem) {
                    lastItem = this.searchEnviron('drug') ?? this.searchEnviron('misc')
                    if (!lastItem) {break}
                }
                const carried = await this.retrieve(lastItem)
                if (!carried) {break}
                lastItem = this.takeDrug(carried) ? null : carried
            } while (lastItem && this.ap >= 2 && !this.stale)
        }
    }

    // ── the turn ────────────────────────────────────────────────────────

    /** _combat_ai. */
    async run(defenderHint: AnyCritter | null = null): Promise<void> {
        const c = this.c
        const ai = this.ai
        if (isFleeing(c) || (resultFlags(c) & ai.hurtTooMuch) !== 0 || statOf(c, 'HP') < ai.minHp) {
            await this.runAway(defenderHint)
            return
        }

        await this.checkDrugs()
        if (this.stale) {return}
        const target: AnyCritter | null = defenderHint && !defenderHint.dead ? defenderHint : this.dangerSource()

        await this.distancePrefs(target)
        if (this.stale) {return}
        if (target) {await this.tryAttack(target)}
        if (this.stale) {return}

        if (target && !target.dead && this.ap !== 0 && dist(c, target) > ai.maxDist) {
            const fd = this.friendlyDead
            if (fd) {
                await this.moveAway(fd, 10)
                this.friendlyDead = null
            } else if (!this.findFriend(statOf(c, 'PER') * 2)) {
                c.combatManeuver = (c.combatManeuver ?? 0) | Maneuver.DISENGAGING
            }
        }

        if (!target && !isPartyMember(c)) {
            const whoHitMe = c.whoHitMe
            if (whoHitMe && !whoHitMe.dead && (c.damageLastTurn ?? 0) > 0) {
                const fd = this.friendlyDead
                if (fd) {
                    await this.moveAway(fd, 10)
                    this.friendlyDead = null
                } else {
                    await this.runAway(null)
                }
            }
        }
        if (this.stale) {return}

        const fd = this.friendlyDead
        if (fd) {
            await this.moveAway(fd, 10)
            if (dist(c, fd) >= 10) {this.friendlyDead = null}
        }

        let teammate: AnyCritter | null
        let maxTeammateDistance = 5
        if (teamOf(c) !== 0) {
            teammate = this.nearestOfTeam(c, true)
        } else {
            teammate = globalState.player ?? null
            if (isPartyMember(c) && ai.distance !== -1) {
                maxTeammateDistance = PARTY_MEMBER_DISTANCES[ai.distance] ?? 5
            }
        }

        if (!target && teammate && dist(c, teammate) > maxTeammateDistance) {
            await this.moveStepsCloser(teammate, dist(c, teammate) - maxTeammateDistance, false)
        } else if (this.ap > 0) {
            await this.distancePrefs(target)
        }
    }

    /** _ai_find_friend: is a teammate within `maxDistance`? */
    private findFriend(maxDistance: number): boolean {
        const friend = this.nearestOfTeam(this.c, false)
        if (!friend) {return false}
        // The engine then "moves closer" by a negative step count, which never moves.
        return dist(this.c, friend) <= maxDistance
    }
}
