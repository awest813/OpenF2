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
import { CriticalEffects } from './criticalEffects.js'
import { critterDamage, Weapon } from './critter.js'
import { hexDistance, hexNearestNeighbor, hexNeighbors, Point } from './geometry.js'
import globalState from './globalState.js'
import { Critter, Obj, WeaponObj } from './object.js'
import { Player } from './player.js'
import { Scripting } from './scripting.js'
import { uiEndCombat, uiStartCombat } from './ui.js'
import { getFileText, getMessage, getRandomInt, parseIni, rollSkillCheck } from './util.js'

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
        // Get bonus AP from critter's stats (perks/traits)
        const bonusCombatAP = this.attachedCritter.stats.apBonus || 0
        const bonusMoveAP = 0 // Move AP is typically 0 in Fallout

        return { combat: 5 + Math.ceil(this.attachedCritter.getStat('AGI') / 2) + bonusCombatAP, move: bonusMoveAP }
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

/** Upper bound (exclusive) for a d100 roll: getRandomInt(1, D100_MAX) gives 1-100. */
const D100_MAX = 101

/** Jinxed trait (charTraits ID 9): percent chance of forcing a critical miss on any miss. */
const JINXED_CRIT_MISS_CHANCE = 50

export class Combat {
    combatants: Critter[]
    playerIdx: number
    player: Player
    turnNum: number
    whoseTurn: number
    inPlayerTurn: boolean

    constructor(objects: Obj[]) {
        // Gather a list of combatants (critters meeting a certain criteria)
        this.combatants = objects.filter((obj) => {
            if (obj instanceof Critter) {
                if (obj.dead || !obj.visible) {return false}

                // TODO: should we initialize AI elsewhere, like in Critter?
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

        this.playerIdx = this.combatants.findIndex((x) => x.isPlayer)
        if (this.playerIdx === -1) {
            // Player not found among live combatants — bail out gracefully.
            console.warn("combat: couldn't find player among combatants")
            this.player = null as any
            this.turnNum = 1
            this.whoseTurn = 0
            this.inPlayerTurn = false
            return
        }

        this.player = this.combatants[this.playerIdx] as Player
        this.turnNum = 1
        this.whoseTurn = this.playerIdx - 1
        this.inPlayerTurn = true

        // Stop the player from walking combat is initiating
        this.player.clearAnim()

        uiStartCombat()
    }

    log(msg: any) {
        // Combat-related debug log
        console.log(msg)
    }

    private normalizeHitRegion(region: string): string {
        if (CriticalEffects.regionHitChanceDecTable[region] !== undefined) {return region}
        return 'torso'
    }

    accountForPartialCover(obj: Critter, target: Critter): number {
        // TODO: get list of intervening critters. Substract 10 for each one in the way
        return 0
    }

    getHitDistanceModifier(obj: Critter, target: Critter, weapon: Obj): number {
        // Fallout 2 range penalty:
        //   distPenalty = max(0, distance - perception * distModifier) * 4
        // distModifier = 2 normally, 4 for long_range perk, 5 for scope_range perk
        // The old darkf code used distModifier=2 and applied a mysterious player PER-2
        // nerf that is NOT in the Fallout 2 binary. We fix both here.

        // 4 if weapon has scope_range perk, 2 otherwise (perception range modifier)
        const distModifier = 2  // TODO: check weapon for Scope Range perk → use 4
        // Each hex unit beyond PER range costs 4% hit chance (not 2%)
        const hitPenaltyPerHex = 4
        const minDistance = 0
        const perception = obj.getStat('PER')
        // BLK-093: Guard against null positions — attacker or target may lack a tile
        // assignment (e.g. objects in inventory during scripted combat events).
        // Return 0 (no distance penalty) instead of crashing on hexDistance.
        let distance = (obj.position && target.position) ? hexDistance(obj.position, target.position) : 0
        if (distance < minDistance)
            {distance += minDistance}
        else {
            // H1 FIX: player and NPCs use the same PER formula (no -2 nerf for player)
            distance -= perception * distModifier
        }

        if (-2 * perception > distance) {distance = -2 * perception}

        // Sharpshooter perk (ID 5): each rank grants +2 effective PER for range penalty.
        // Implemented as reducing the un-multiplied distance by 2*rank before the x4 scale.
        const sharpshooterRank = (obj.perkRanks ?? {})[5] ?? 0
        if (sharpshooterRank > 0) {distance -= 2 * sharpshooterRank}

        // H2 FIX: each hex beyond PER range costs 4% hit chance (was incorrectly 2×2=4...
        // but distModifier was 2 making effective penalty = 2×4 = 8 previously.
        // Now: distance already reduced by PER*2, then ×4 per remaining hex = correct.
        const objHasEyeDamage = false
        if (distance >= 0 && objHasEyeDamage) {distance *= 12}
        else {distance *= hitPenaltyPerHex}

        // and if the result is a positive distance, we return that
        // closeness can not improve hitchance above normal, so we don't return that
        if (distance >= 0) {return distance}
        else {return 0}
    }

    getHitChance(obj: Critter, target: Critter, region: string) {
        const normalizedRegion = this.normalizeHitRegion(region)
        // TODO: visibility (= light conditions) and distance

        // BLK-053: Build a resolved weapon and skill, falling back to unarmed when
        // the critter has no equipped weapon or its weapon data is missing.
        // This ensures all unarmed critters can fight rather than auto-missing.
        const unarmedWeapon = new Weapon(null)
        const unarmedWeaponObj: WeaponObj = { type: 'item', subtype: 'weapon', weapon: unarmedWeapon } as WeaponObj

        const rawWeaponObj = obj.equippedWeapon
        let effectiveWeaponObj: WeaponObj
        let effectiveWeapon: Weapon
        let weaponSkill: number

        if (rawWeaponObj !== null && rawWeaponObj.weapon) {
            effectiveWeaponObj = rawWeaponObj
            effectiveWeapon = rawWeaponObj.weapon
            if (effectiveWeapon.weaponSkillType === undefined) {
                this.log('weaponSkillType is undefined')
                weaponSkill = 0
            } else {
                weaponSkill = obj.getSkill(effectiveWeapon.weaponSkillType)
            }
        } else {
            // No weapon or weapon data missing — use unarmed fallback.
            if (rawWeaponObj !== null) {
                console.warn('getHitChance: weapon object has no weapon data — using unarmed fallback')
            }
            effectiveWeaponObj = unarmedWeaponObj
            effectiveWeapon = unarmedWeapon
            weaponSkill = obj.getSkill('Unarmed')
        }

        const hitDistanceModifier = this.getHitDistanceModifier(obj, target, effectiveWeaponObj)
        // AC now includes any temporary end-of-turn AP bonus via StatSet.acBonus
        const AC = target.getStat('AC')
        const bonusCrit = 0 // TODO: perk bonuses, other crit influencing things
        const baseCrit = obj.getStat('Critical Chance') + bonusCrit
        const regionPenalty = CriticalEffects.regionHitChanceDecTable[normalizedRegion] ?? CriticalEffects.regionHitChanceDecTable['torso'] ?? 0
        let hitChance = weaponSkill - AC - regionPenalty - hitDistanceModifier
        const critChance = baseCrit + regionPenalty

        if (isNaN(hitChance)) {
            console.warn('getHitChance: NaN hit chance — clamping to 0')
            hitChance = 0
        }

        // 1 in 20 chance of failing needs to be preserved
        hitChance = Math.min(95, hitChance)

        return { hit: hitChance, crit: critChance }
    }

    rollHit(obj: Critter, target: Critter, region: string): any {
        const normalizedRegion = this.normalizeHitRegion(region)
        // H4 FIX: Better Criticals modifies the d100 *result*, not the roll range.
        // FO2 formula: roll d100 (0-99), add Better Criticals bonus, clamp 0-100, div/20 = level 0-4.
        const critModifier = obj.getStat('Better Criticals')
        const hitChance = this.getHitChance(obj, target, normalizedRegion)

        // FO2 rolls the dice once and uses the result for both hit and crit checks.
        const roll = getRandomInt(1, D100_MAX)

        if (hitChance.hit - roll > 0) {
            var isCrit = false
            if (rollSkillCheck(Math.floor(hitChance.hit - roll) / 10, hitChance.crit, false) === true) {isCrit = true}

            // Sniper perk (ID 9): make a second d100 roll; use the better outcome
            // for the called-shot location. If the second roll also qualifies as a
            // critical, the attack becomes a critical hit.
            const sniperRank = (obj.perkRanks ?? {})[9] ?? 0
            if (sniperRank > 0 && !isCrit) {
                const secondRoll = getRandomInt(1, D100_MAX)
                if (hitChance.hit - secondRoll > 0) {
                    if (rollSkillCheck(Math.floor(hitChance.hit - secondRoll) / 10, hitChance.crit, false))
                        {isCrit = true}
                }
            }

            if (isCrit === true) {
                // H4 FIX: FO2 crit level = clamp(0, d100 + betterCriticals, 100) / 20
                // BetterCriticals shifts the roll UP (more chance of level 4/5 crits).
                const rawCritRoll = getRandomInt(0, 100) + critModifier
                const critLevel = Math.min(4, Math.floor(Math.max(0, rawCritRoll) / 20))
                this.log('crit level: ' + critLevel)
                const crit = CriticalEffects.getCritical(target.killType, normalizedRegion, critLevel)
                const critStatus = crit.doEffectsOn(target)

                return { hit: true, crit: true, DM: critStatus.DM, msgID: critStatus.msgID } // crit
            }

            return { hit: true, crit: false } // hit
        }

        // in reverse because miss -> roll > hitchance.hit
        var isCrit = false
        if (rollSkillCheck(Math.floor(roll - hitChance.hit) / 10, 0, false)) {isCrit = true}
        // Jinxed trait (ID 9): 50% added chance for a critical miss on any miss.
        // Pariah Dog companion provides the same non-stacking bonus; check both.
        const attackerJinxed = obj.charTraits?.has(9) ?? false
        const playerJinxed = this.player && !obj.isPlayer ? (this.player.charTraits?.has(9) ?? false) : false
        if ((attackerJinxed || playerJinxed) && !isCrit) {
            if (getRandomInt(1, D100_MAX) <= JINXED_CRIT_MISS_CHANCE) {isCrit = true}
        }

        return { hit: false, crit: isCrit } // miss
    }

    getDamageDone(obj: Critter, target: Critter, critMultiplier: number) {
        const weaponObj = obj.equippedWeapon
        // BLK-053: No weapon equipped — use a synthetic unarmed weapon (Weapon(null))
        // so that critters can deal damage in melee even without an equipped item.
        // Weapon(null) represents a bare-fist punch: 1–2 Normal damage.
        const wep = weaponObj?.weapon ?? new Weapon(null)
        if (!wep) {
            console.warn('getDamageDone: weapon has no weapon data — returning 0 damage')
            return 0
        }
        const damageTypeName = wep.getDamageType()

        // C1 FIX: Use the correct Fallout 2 damage pipeline:
        //   1. Roll raw damage (min–max)
        //   2. Apply ammo multiplier / divisor
        //   3. Subtract DT (Damage Threshold)
        //   4. Multiply by (1 − DR%)
        //   5. Apply critical multiplier
        //   6. Clamp to ≥ 0 (non-crits can deal 0; only crits guarantee ≥ 1)
        const rawRoll = getRandomInt(wep.minDmg, wep.maxDmg)

        // Ammo multiplier/divisor — read from weapon proto if available, else default 1/1
        const ammoX = wep.weapon?.pro?.extra?.ammoDmgMult ?? 1
        const ammoY = Math.max(1, wep.weapon?.pro?.extra?.ammoDmgDiv ?? 1)
        const ammoRM = wep.weapon?.pro?.extra?.drModifier ?? 0  // DR modifier from ammo
        const afterAmmo = Math.floor(rawRoll * ammoX / ammoY)

        // DT and DR are stored as 'DR Normal', 'DT Normal', etc. in the stat system
        const DT = target.getStat('DT ' + damageTypeName)
        const DR = target.getStat('DR ' + damageTypeName)

        const afterDT = Math.max(0, afterAmmo - DT)
        const effectiveDR = Math.max(0, Math.min(100, DR + ammoRM))
        const afterDR = Math.floor(afterDT * (1 - effectiveDR / 100))

        // Apply critical damage multiplier. critMultiplier = 2 for a normal hit (×1 after /2 in attack()).
        // Crits use DM from the critical effects table (typically 2–6 = ×1–3).
        // FO2 formula: final = afterDR × (critMultiplier / 2) — multiplier is stored as 2× value.
        const finalDamage = Math.max(0, Math.floor(afterDR * critMultiplier / 2))

        console.log(
            `raw: ${rawRoll} | ammo: ${afterAmmo} | DT: ${DT} DR: ${DR}% | afterDT: ${afterDT} | final: ${finalDamage} | type: ${damageTypeName} critMult: ${critMultiplier}`
        )

        return finalDamage
    }

    getCombatMsg(id: number) {
        return getMessage('combat', id)
    }

    /** Return the AP cost for the given critter's primary attack (weapon-dependent). */
    private getAttackAPCost(obj: Critter): number {
        const weaponObj = obj.equippedWeapon
        if (weaponObj?.weapon) {
            // C2 FIX: read AP cost from weapon proto (APCost1 = primary attack)
            const cost = weaponObj.weapon.getAPCost?.(1) ?? weaponObj.weapon.weapon?.pro?.extra?.APCost1
            if (cost !== undefined && cost > 0) {return cost}
        }
        return 4  // fallback: default unarmed punch AP cost
    }

    attack(obj: Critter, target: Critter, region = 'torso', callback?: () => void) {
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

        // Calculate hit and damage synchronously before starting the animation so
        // that we can wrap the callback if the last enemy was just killed (BLK-062).
        const who = obj.isPlayer ? 'You' : obj.name
        const targetName = target.isPlayer ? 'you' : target.name
        const hitRoll = this.rollHit(obj, target, region)
        this.log('hit% is ' + this.getHitChance(obj, target, region).hit)

        // BLK-062: Track whether this attack killed the last non-player combatant so
        // combat can be ended automatically after the animation completes.
        let shouldAutoEnd = false

        if (hitRoll.hit === true) {
            const critModifier = hitRoll.crit ? hitRoll.DM : 2
            const damage = this.getDamageDone(obj, target, critModifier)
            const extraMsg = hitRoll.crit === true ? this.getCombatMsg(hitRoll.msgID) || '' : ''
            this.log(who + ' hit ' + targetName + ' for ' + damage + ' damage' + extraMsg)

            critterDamage(target, damage, obj)

            if (target.dead) {
                this.perish(target)
                // BLK-062: All non-player combatants dead → auto-end after animation.
                shouldAutoEnd = this.canEndCombat()
            }
        } else {
            this.log(who + ' missed ' + targetName + (hitRoll.crit === true ? ' critically' : ''))
            if (hitRoll.crit === true) {
                const critFailMod = (obj.getStat('LUK') - 5) * -5
                const critFailRoll = Math.floor(getRandomInt(1, 100) - critFailMod)
                let critFailLevel = 1
                if (critFailRoll <= 20) {critFailLevel = 1}
                else if (critFailRoll <= 50) {critFailLevel = 2}
                else if (critFailRoll <= 75) {critFailLevel = 3}
                else if (critFailRoll <= 95) {critFailLevel = 4}
                else {critFailLevel = 5}

                this.log(who + ' failed at fail level ' + critFailLevel)

                // Map weapon type to appropriate crit fail table
                const weaponType = CriticalEffects.getWeaponCritFailType(obj)
                const critFailEffect = CriticalEffects.criticalFailTable[weaponType][critFailLevel]
                CriticalEffects.temporaryDoCritFail(critFailEffect, obj)
            }
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

    perish(obj: Critter) {
        this.log('...And killed them.')
    }

    // BLK-063: Return true when all non-player combatants are dead (i.e. combat
    // can be safely ended).  Used by auto-end-combat (BLK-062) and may be
    // queried by the UI or scripts to determine current combat viability.
    canEndCombat(): boolean {
        for (const c of this.combatants) {
            if (c.isPlayer) {continue}
            if (!c.dead) {return false}
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
        // TODO: find target according to AI rules
        // Find the closest living combatant on a different team

        const targets = this.combatants.filter((x) => !x.dead && x.teamNum !== obj.teamNum)
        if (targets.length === 0) {return null}
        // BLK-059: Guard null positions in the sort comparator to avoid crashes when
        // combatants lack a position (e.g. freshly added or off-map).
        if (!obj.position) {return targets[0] ?? null}
        targets.sort((a, b) => {
            const da = a.position ? hexDistance(obj.position!, a.position) : Infinity
            const db = b.position ? hexDistance(obj.position!, b.position) : Infinity
            return da - db
        })
        return targets[0]
    }

    walkUpTo(obj: Critter, idx: number, target: Point, maxDistance: number, callback: () => void): boolean {
        // Walk up to `maxDistance` hexes, adjusting AP to fit
        if (obj.walkTo(target, false, callback, maxDistance)) {
            const moveCost = Math.max(0, obj.path.path.length - 1)
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

        // behaviors

        if (obj.getStat('HP') <= obj.ai.info.min_hp) {
            // hp <= min fleeing hp, so flee
            this.log('[AI FLEES]')

            // todo: pick the closest edge of the map
            this.maybeTaunt(obj, 'run', messageRoll)
            const targetPos = { x: 128, y: obj.position?.y ?? 0 } // left edge
            const callback = () => {
                obj.clearAnim()
                this.doAITurn(obj, idx, depth + 1) // if we can, do another turn
            }

            if (!this.walkUpTo(obj, idx, targetPos, AP.getAvailableMoveAP(), callback)) {
                return this.nextTurn() // not a valid path, just move on
            }

            return
        }

        const weaponObj = obj.equippedWeapon
        if (!weaponObj) {
            console.warn('doAITurn: AI critter ' + obj.name + ' has no weapon — skipping turn')
            return this.nextTurn()
        }
        const weapon = weaponObj.weapon
        if (!weapon) {
            console.warn('doAITurn: AI critter ' + obj.name + ' weapon has no weapon data — skipping turn')
            return this.nextTurn()
        }
        const fireDistance = weapon.getMaximumRange(1)
        this.log(
            'DEBUG: weapon: ' +
                weapon +
                ' fireDistance: ' +
                fireDistance +
                ' obj: ' +
                obj.art +
                ' distance: ' +
                distance
        )

        // are we in firing distance?
        if (distance > fireDistance) {
            this.log('[AI CREEPS]')
            // BLK-094: Guard against null target.position — target may not yet have a
            // tile assignment during scripted combat.  Skip the creep attempt entirely.
            if (!target.position) {
                console.warn('[combat] doAITurn: target has no position — skipping creep')
                return this.nextTurn()
            }
            const neighbors = hexNeighbors(target.position)
            const maxDistance = Math.min(AP.getAvailableMoveAP(), distance - fireDistance)
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
                    const moveCost = Math.max(0, obj.path.path.length - 1)
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
            // C2 FIX: use weapon-appropriate AP cost
            const attackCost = this.getAttackAPCost(obj)
            if (AP.getAvailableCombatAP() >= attackCost) {
            // if we are in range, do we have enough AP to attack?
            this.log('[ATTACKING]')
            if (AP.subtractCombatAP(attackCost) === false) {
                this.log('[AI ATTACK ABORTED: AP desync]')
                return this.nextTurn()
            }

            if (obj.equippedWeapon === null) {
                console.warn('doAITurn: combatant ' + obj.name + ' has no equipped weapon — skipping attack')
                return this.nextTurn()
            }

            // BLK-040: Guard against attacking a target that died during our move phase.
            if (target.dead) {
                console.warn('doAITurn: target died before attack — re-targeting')
                return this.doAITurn(obj, idx, depth + 1)
            }

            this.attack(obj, target, 'torso', () => {
                obj.clearAnim()
                this.doAITurn(obj, idx, depth + 1) // if we can, do another turn
            })
            } else {
            console.log('[AI IS STUMPED]')
            this.nextTurn()
            }
        }
    }

    static start(forceTurn?: Critter): void {
        // begin combat
        globalState.inCombat = true
        globalState.combat = new Combat(globalState.gMap.getObjects())

        // FO2: fire combat_p_proc(COMBAT_SUBTYPE_INITIATE = 0) on all combatants
        // when combat starts. Scripts use this to set up flee states, switch AI
        // packets, or spawn reinforcements.
        if (Config.engine.doLoadScripts) {
            for (const combatant of globalState.combat.combatants) {
                Scripting.combatEvent(combatant, 'combatStart')
            }
        }

        if (forceTurn) {globalState.combat.forceTurn(forceTurn)}

        globalState.combat.nextTurn()
        globalState.gMap.updateMap()
    }

    end() {
        // BLK-063: canEndCombat() is called by nextTurn() (numActive===0) and by
        // the BLK-062 auto-end callback.  The former TODO is now resolved.

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
        }

        console.log('[end combat]')
        globalState.combat = null // todo: invert control
        globalState.inCombat = false

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
        // Capture unused AP from the critter whose turn is ending and grant it as a
        // temporary AC bonus (Fallout 2 mechanic: each unused AP → +1 AC until next turn).
        const prevTurnCritter = this.combatants[this.whoseTurn]
        if (prevTurnCritter && prevTurnCritter.AP && prevTurnCritter.stats) {
            const unusedAP = prevTurnCritter.AP.getAvailableCombatAP()
            if (unusedAP > 0) {
                prevTurnCritter.stats.acBonus = unusedAP
            }
        }

        // BLK-051: Guard against a null player reference (can occur when combat was
        // started without the player among the combatants — rare but otherwise crashes).
        if (!this.player) {
            console.warn('[combat] nextTurn: no player — ending combat')
            return this.end()
        }

        // update range checks
        let numActive = 0
        for (let i = 0; i < this.combatants.length; i++) {
            const obj = this.combatants[i]
            if (obj.dead || obj.isPlayer) {continue}
            // BLK-051: Guard against null ai (AI failed to init for this critter).
            // Fall back to a safe default max_dist so the loop can still complete.
            const maxDist: number = obj.ai?.info?.max_dist ?? 20
            // BLK-059: Guard null positions to prevent hexDistance crash.
            const inRange = (obj.position && this.player.position)
                ? hexDistance(obj.position, this.player.position) <= maxDist
                : false

            if (inRange || obj.hostile) {
                obj.hostile = true
                // BLK-051: Guard globalState.player null — fall back to team -1 (never
                // matches any NPC team) so the outline defaults to hostile red.
                const playerTeam = globalState.player?.teamNum ?? -1
                obj.outline = obj.teamNum !== playerTeam ? 'red' : 'green'
                numActive++
            }
        }

        if (numActive === 0 && this.turnNum !== 1) {return this.end()}

        this.turnNum++
        this.whoseTurn++

        if (this.whoseTurn >= this.combatants.length) {this.whoseTurn = 0}

        if (this.combatants[this.whoseTurn].isPlayer) {
            // Player's turn starts — clear the player's end-of-turn AC bonus.
            this.player.stats.acBonus = 0
            this.inPlayerTurn = true
            this.player.AP!.resetAP()

            // FO2: fire combat_p_proc(COMBAT_SUBTYPE_TURN = 4) on the player at
            // the start of their turn. Scripts use this for per-turn status effects
            // (poison ticks, radiation damage, drug wears-off, etc.).
            if (Config.engine.doLoadScripts && this.player._script) {
                Scripting.combatEvent(this.player, 'turnBegin')
            }
        } else {
            this.inPlayerTurn = false
            const critter = this.combatants[this.whoseTurn]
            if (critter.dead === true || critter.hostile !== true) {return this.nextTurn(skipDepth + 1)}

            // H6 FIX: Knockdown/stun/knockout from critical effects skips the critter's turn.
            // Clear the flag after skipping so it only lasts one turn.
            if ((critter as any).stunned || (critter as any).knockedOut || (critter as any).knockedDown) {
                console.log('[combat] nextTurn: ' + critter.name + ' is stunned/knocked — skipping turn')
                ;(critter as any).stunned = false
                ;(critter as any).knockedDown = false
                // knockedOut can last multiple turns — don't clear automatically (scripts handle it)
                return this.nextTurn(skipDepth + 1)
            }

            // Guard against critters that were added mid-combat without AP initialised.
            if (!critter.AP) {
                console.warn('[combat] nextTurn: critter has no AP — skipping turn')
                return this.nextTurn(skipDepth + 1)
            }
            // Clear the AC bonus from this critter's previous turn before resetting AP.
            critter.stats.acBonus = 0
            critter.AP.resetAP()

            // FO2: fire critter_p_proc (heartbeat) on each NPC at the start of
            // their combat turn. In the original engine, critter_p_proc runs
            // every game tick including during combat turns, but combat_p_proc
            // is what most scripts check. Fire critter_p_proc first so both
            // procedures see the same game-time state.
            if (Config.engine.doLoadScripts && critter._script) {
                Scripting.updateCritter(critter._script, critter)
            }

            this.doAITurn(critter, this.whoseTurn, 1)
        }
    }
}
