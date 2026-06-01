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
import { hexDirectionTo, hexDistance, hexInDirectionDistance, hexLine, hexNearestNeighbor, hexNeighbors, Point } from './geometry.js'
import globalState from './globalState.js'
import { Critter, Obj, WeaponObj } from './object.js'
import { Player } from './player.js'
import { Scripting } from './scripting.js'
import { uiEndCombat, uiStartCombat, uiUpdateCombatHUD, uiLog } from './ui.js'
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
        // Action Boy perk (ID 6): +1 combat AP per rank.
        const actionBoyAP = ((this.attachedCritter.perkRanks ?? {})[6] ?? 0) * 1
        // Bruiser trait (ID 1): -2 combat AP penalty.
        const hasBruiser = this.attachedCritter.charTraits?.has(1) ?? false
        const bruiserAPMod = hasBruiser ? -2 : 0
        // Bonus Move perk (ID 1): +2 move-only AP per rank.
        const bonusMoveAP = ((this.attachedCritter.perkRanks ?? {})[BONUS_MOVE_PERK_ID] ?? 0) * 2

        return {
            combat: Math.max(1, 5 + Math.floor(this.attachedCritter.getStat('AGI') / 2) + bonusCombatAP + actionBoyAP + bruiserAPMod),
            move: bonusMoveAP
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

/** Upper bound (exclusive) for a d100 roll: getRandomInt(1, D100_MAX) gives 1-100. */
const D100_MAX = 101

/** Jinxed trait (charTraits ID 9): percent chance of forcing a critical miss on any miss. */
const JINXED_CRIT_MISS_CHANCE = 50

/** Fast Shot trait (charTraits ID 7): no called shots and -1 AP for ranged attacks. */
const FAST_SHOT_TRAIT_ID = 7

/** Bonus Move perk (ID 1): +2 move-only AP per rank. */
const BONUS_MOVE_PERK_ID = 1

/** Weapon perk IDs used by Fallout 2 range penalty logic. */
const WEAPON_PERK_LONG_RANGE = 1
const WEAPON_PERK_SCOPE_RANGE = 5

export class Combat {
    combatants: Critter[]
    playerIdx: number
    player: Player
    turnNum: number
    whoseTurn: number
    inPlayerTurn: boolean
    round: number

    constructor(objects: Obj[]) {
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

        // Fallout 2 initiative order: descending Sequence (2×PER + modifiers).
        // Tie-breaker keeps player ahead of NPCs at identical Sequence.
        this.combatants.sort((a, b) => {
            const rawA = a.getStat('Sequence')
            const rawB = b.getStat('Sequence')
            const aSeq = Number.isFinite(rawA) ? rawA : 0
            const bSeq = Number.isFinite(rawB) ? rawB : 0
            if (bSeq !== aSeq) {return bSeq - aSeq}
            if (a.isPlayer && !b.isPlayer) {return -1}
            if (!a.isPlayer && b.isPlayer) {return 1}
            return 0
        })

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

    log(msg: any) {
        // Combat-related debug log
        console.log(msg)
    }

    private normalizeHitRegion(region: string): string {
        if (CriticalEffects.regionHitChanceDecTable[region] !== undefined) {return region}
        return 'torso'
    }

    private hasFastShotTrait(obj: Critter): boolean {
        return obj.charTraits?.has(FAST_SHOT_TRAIT_ID) ?? false
    }

    private isRangedPrimaryAttack(obj: Critter): boolean {
        const weaponObj = obj.equippedWeapon
        const attackMode = weaponObj?.pro?.extra?.attackMode ?? weaponObj?.weapon?.weapon?.pro?.extra?.attackMode
        if (typeof attackMode !== 'number') {return false}
        const primaryMode = attackMode & 0x0f
        // 6 = fire single, 7 = fire burst, 8 = flame
        return primaryMode === 6 || primaryMode === 7 || primaryMode === 8
    }

    /** Check whether the critter's weapon has a burst secondary attack mode. */
    private weaponHasBurstMode(obj: Critter): boolean {
        const weaponObj = obj.equippedWeapon
        const attackMode = weaponObj?.pro?.extra?.attackMode ?? weaponObj?.weapon?.weapon?.pro?.extra?.attackMode
        if (typeof attackMode !== 'number') {return false}
        const secondaryMode = (attackMode >> 4) & 0x0f
        return secondaryMode === 7 // ATTACK_MODE_FIRE_BURST
    }

    /** Get burst AP cost (secondary attack mode). */
    private getBurstAPCost(obj: Critter): number {
        const weaponObj = obj.equippedWeapon
        if (!weaponObj?.weapon) {return 99}
        const cost = weaponObj.weapon.getAPCost?.(2) ?? weaponObj.weapon.weapon?.pro?.extra?.APCost2
        if (cost !== undefined && cost > 0) {return cost}
        return 99
    }

    private normalizeAttackRegionForAttacker(obj: Critter, region: string): string {
        const normalized = this.normalizeHitRegion(region)
        if (!this.hasFastShotTrait(obj)) {return normalized}
        if (!this.isRangedPrimaryAttack(obj)) {return normalized}
        // Fast Shot disables aimed/called shots for ranged attacks.
        return 'torso'
    }

    private getWeaponRangePerceptionModifier(weapon: Obj): number {
        // Fallout 2 range modifiers:
        // 2 = normal, 4 = long_range weapon perk, 5 = scope_range weapon perk.
        const perk = (weapon as any)?.pro?.extra?.perk ?? (weapon as any)?.weapon?.weapon?.pro?.extra?.perk
        if (perk === WEAPON_PERK_SCOPE_RANGE) {return 5}
        if (perk === WEAPON_PERK_LONG_RANGE) {return 4}
        return 2
    }

    accountForPartialCover(obj: Critter, target: Critter): number {
        // Fallout 2: each intervening critter on the attack line applies -10% hit chance.
        if (!obj.position || !target.position) {return 0}
        if (!Array.isArray(this.combatants) || this.combatants.length === 0) {return 0}

        const path = hexLine(obj.position, target.position)
        if (path.length <= 2) {return 0}
        const between = new Set(path.slice(1, -1).map((p) => `${p.x},${p.y}`))

        let blockers = 0
        for (const c of this.combatants) {
            if (c === obj || c === target || c.dead || !c.position) {continue}
            if (between.has(`${c.position.x},${c.position.y}`)) {blockers++}
        }
        return blockers * 10
    }

    getHitDistanceModifier(obj: Critter, target: Critter, weapon: Obj): number {
        // Fallout 2 range penalty:
        //   distPenalty = max(0, distance - perception * distModifier) * 4
        // distModifier = 2 normally, 4 for long_range perk, 5 for scope_range perk
        // The old darkf code used distModifier=2 and applied a mysterious player PER-2
        // nerf that is NOT in the Fallout 2 binary. We fix both here.

        const distModifier = this.getWeaponRangePerceptionModifier(weapon)
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
        const normalizedRegion = this.normalizeAttackRegionForAttacker(obj, region)
        // Visibility penalty: ranges from 0 to 40% based on target light level
        let lightPenalty = 0
        if (target.lightLevel !== undefined) {
            // Assuming lightLevel is roughly 0-100 for normalization
            const lightLevelPercent = Math.min(100, Math.max(0, target.lightLevel))
            lightPenalty = Math.floor(40 * (1 - lightLevelPercent / 100))
        }

        // Night Vision perk (ID 12) reduces lighting penalty by 20% per rank
        const nightVisionRanks = (obj.perkRanks ?? {})[12] ?? 0
        lightPenalty = Math.max(0, lightPenalty - (nightVisionRanks * 20))

        // BLK-053: Build a resolved weapon and skill, falling back to unarmed when
        // the critter has no equipped weapon or its weapon data is missing.
        // This ensures all unarmed critters can fight rather than auto-missing.
        const unarmedWeapon = new Weapon(null, obj)
        const unarmedWeaponObj: WeaponObj = { type: 'item', subtype: 'weapon', weapon: unarmedWeapon } as WeaponObj

        const rawWeaponObj = obj.equippedWeapon
        let effectiveWeaponObj: WeaponObj
        let effectiveWeapon: Weapon
        let weaponSkill: number

        if (rawWeaponObj != null && rawWeaponObj.weapon) {
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
        const partialCoverModifier = this.accountForPartialCover(obj, target)
        // AC now includes any temporary end-of-turn AP bonus via StatSet.acBonus
        const AC = target.getStat('AC')
        // Ammo AC Mod (subtracted from attacker's hit chance)
        const ammoACMod = (effectiveWeapon as any)?.weapon?.pro?.extra?.acModifier ?? 0
        
        // One Hander trait (ID 3)
        const hasOneHander = obj.charTraits?.has(3) ?? false
        let oneHanderModifier = 0
        if (hasOneHander && effectiveWeaponObj !== unarmedWeaponObj) {
            const isTwoHanded = (effectiveWeapon as any)?.weapon?.pro?.extra?.twoHanded ?? 0
            if (isTwoHanded) {
                oneHanderModifier = -40
            } else {
                oneHanderModifier = 20
            }
        }
        
        // More Criticals perk (ID 7) grants +5% per rank
        const moreCriticalsRank = (obj.perkRanks ?? {})[7] ?? 0
        // Finesse trait (ID 4) grants +10% critical chance
        const hasFinesse = obj.charTraits?.has(4) ?? false
        const bonusCrit = (moreCriticalsRank * 5) + (hasFinesse ? 10 : 0)
        const baseCrit = obj.getStat('Critical Chance') + bonusCrit
        const isMelee = rawWeaponObj != null && rawWeaponObj.weapon && rawWeaponObj.weapon.type === 'melee'
        const regionPenalty = CriticalEffects.getRegionPenalty(normalizedRegion, isMelee)
        let hitChance = weaponSkill - AC - ammoACMod - regionPenalty - hitDistanceModifier - partialCoverModifier - lightPenalty + oneHanderModifier

        // FO2 combat difficulty: adjusts NPC hit chance. Easy: -20%, Rough: +10%, Hard: +20%.
        if (!obj.isPlayer && target.isPlayer) {
            const diff = globalState.combatDifficulty
            if (diff === 0) {hitChance -= 20}
            else if (diff === 2) {hitChance += 10}
            else if (diff >= 3) {hitChance += 20}
        }

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
        const normalizedRegion = this.normalizeAttackRegionForAttacker(obj, region)
        // H4 FIX: Better Criticals modifies the d100 *result*, not the roll range.
        // FO2 formula: roll d100 (0-99), add Better Criticals bonus, clamp 0-100, div/20 = level 0-4.
        const critModifier = obj.getStat('Better Criticals')
        const hitChance = this.getHitChance(obj, target, normalizedRegion)

        // FO2 rolls the dice once and uses the result for both hit and crit checks.
        const roll = getRandomInt(1, D100_MAX)

        if (hitChance.hit - roll > 0) {
            var isCrit = false
            if (rollSkillCheck(Math.floor(hitChance.hit - roll) / 10, hitChance.crit, false) === true) {isCrit = true}

            const sniperRank = (obj.perkRanks ?? {})[9] ?? 0
            const slayerRank = (obj.perkRanks ?? {})[10] ?? 0
            const isMelee = !this.isRangedPrimaryAttack(obj)
            
            if (!isCrit) {
                if (!isMelee && sniperRank > 0) {
                    // Sniper: roll 1d100. If <= LUK * 10, automatic critical
                    if (getRandomInt(1, 100) <= obj.getStat('LUK') * 10) { isCrit = true }
                } else if (isMelee && slayerRank > 0) {
                    // Slayer: roll 1d100. If <= LUK * 10, automatic critical
                    if (getRandomInt(1, 100) <= obj.getStat('LUK') * 10) { isCrit = true }
                }
            }

            if (isCrit === true) {
                // H4 FIX: FO2 crit level = clamp(0, d100 + betterCriticals, 100) / 20
                // Heavy Handed subtracts 30 from the critical table roll (only for melee attacks)
                const hasHeavyHanded = obj.charTraits?.has(6) ?? false
                const heavyHandedModifier = (hasHeavyHanded && isMelee) ? -30 : 0
                
                const rawCritRoll = getRandomInt(0, 100) + critModifier + heavyHandedModifier
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
        // In Fallout 2, if *any* combatant is Jinxed, or if the Pariah Dog is in the party
        // or active combat list, everyone's misses have a 50% chance of being critical misses.
        const anyoneJinxed = (this.combatants ?? []).some(c => c.charTraits?.has(9) ?? false)
        const pariahDogPresent = (globalState.gParty && globalState.gParty.getPartyMemberByPID(16777413) !== null) || (this.combatants ?? []).some(c => c.pid === 16777413)
        if ((anyoneJinxed || pariahDogPresent) && !isCrit) {
            if (getRandomInt(1, D100_MAX) <= JINXED_CRIT_MISS_CHANCE) {isCrit = true}
        }

        return { hit: false, crit: isCrit } // miss
    }

    getDamageDone(obj: Critter, target: Critter, critMultiplier: number) {
        const weaponObj = obj.equippedWeapon
        // BLK-053: No weapon equipped — use a synthetic unarmed weapon (Weapon(null))
        // so that critters can deal damage in melee even without an equipped item.
        // Weapon(null) represents a bare-fist punch: 1–2 Normal damage.
        const wep = weaponObj?.weapon ?? new Weapon(null, obj)
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
        
        // Finesse trait (ID 4) increases target's effective DR by 30%
        const attackerHasFinesse = obj.charTraits?.has(4) ?? false
        const finesseDRMod = attackerHasFinesse ? 30 : 0
        
        const effectiveDR = Math.max(0, Math.min(100, DR + ammoRM + finesseDRMod))
        const afterDR = Math.floor(afterDT * (1 - effectiveDR / 100))
        
        // Add Bonus Ranged/HtH damage and Heavy Handed trait flat damage
        const bonusRangedRank = (obj.perkRanks ?? {})[3] ?? 0 // Bonus Ranged Damage is ID 3
        const bonusHtHRank = (obj.perkRanks ?? {})[4] ?? 0 // Bonus HtH Damage is ID 4
        const hasHeavyHanded = obj.charTraits?.has(6) ?? false
        const isMelee = !this.isRangedPrimaryAttack(obj)
        const flatBonusDamage = isMelee ? (bonusHtHRank * 2) + (hasHeavyHanded ? 4 : 0) : (bonusRangedRank * 2)

        // Apply critical damage multiplier. critMultiplier = 2 for a normal hit (×1 after /2 in attack()).
        // Crits use DM from the critical effects table (typically 2–6 = ×1–3).
        // FO2 formula: final = (afterDR + bonusDamage) × (critMultiplier / 2)
        let finalDamage = Math.max(0, Math.floor((afterDR + flatBonusDamage) * critMultiplier / 2))

        // FO2 combat difficulty: adjusts NPC→player damage. 0=wimpy(×0.5), 1=normal(×1), 2=rough(×1.25), 3=hard(×1.5)
        if (target.isPlayer && !obj.isPlayer) {
            const diff = globalState.combatDifficulty
            if (diff === 0) {finalDamage = Math.floor(finalDamage * 0.5)}
            else if (diff === 2) {finalDamage = Math.floor(finalDamage * 1.25)}
            else if (diff >= 3) {finalDamage = Math.floor(finalDamage * 1.5)}
        }

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
        let attackCost = 4
        if (weaponObj?.weapon) {
            // C2 FIX: read AP cost from weapon proto (APCost1 = primary attack)
            const cost = weaponObj.weapon.getAPCost?.(1) ?? weaponObj.weapon.weapon?.pro?.extra?.APCost1
            if (cost !== undefined && cost > 0) {attackCost = cost}
        }

        // Fast Shot trait: -1 AP for ranged attacks (minimum 1 AP).
        if (this.hasFastShotTrait(obj) && this.isRangedPrimaryAttack(obj)) {
            attackCost = Math.max(1, attackCost - 1)
        }

        return attackCost
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

        // FO2: fire combat_p_proc(COMBAT_SUBTYPE_ATTACK = 1) on the attacker so
        // scripts can react to attack events (e.g. trigger dialogue, modify damage).
        if (Config.engine.doLoadScripts) {
            Scripting.combatEvent(obj, 'onAttack', target)
        }

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

            // FO2 sfall knockback: if the attacker's weapon has knockbackDist/knockbackChance,
            // push the target away from the attacker.
            const wep = obj.equippedWeapon
            if (wep && (wep as any).knockbackDist && obj.position && target.position) {
                const dist = Math.max(0, (wep as any).knockbackDist | 0)
                const chance = Math.min(100, Math.max(0, ((wep as any).knockbackChance ?? 100) | 0))
                if (dist > 0 && getRandomInt(1, 100) <= chance) {
                    const dir = hexDirectionTo(obj.position, target.position)
                    const newPos = hexInDirectionDistance(target.position, dir, dist)
                    if (newPos && newPos.x >= 0 && newPos.x < 200 && newPos.y >= 0 && newPos.y < 200) {
                        target.move(newPos)
                    }
                }
            }

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
                const critFailEffect = CriticalEffects.criticalFailTable[weaponType]?.[critFailLevel]
                if (critFailEffect) {
                    CriticalEffects.temporaryDoCritFail(critFailEffect, obj)
                }
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

    /** Burst-fire attack: fires multiple rounds in a cone at the target.
     *  Center target takes ~half the rounds; adjacent hexes split the rest.
     *  Each round does an independent hit roll and damage roll. */
    burstAttack(obj: Critter, target: Critter, callback?: () => void) {
        // turn to face target
        if (obj.position && target.position) {
            const hex = hexNearestNeighbor(obj.position, target.position)
            if (hex !== null) {obj.orientation = hex.direction}
        }

        ;(obj as any).lastCombatTarget = target
        ;(target as any).lastCombatAttacker = obj

        if (Config.engine.doLoadScripts) {
            Scripting.combatEvent(obj, 'onAttack', target)
        }

        const who = obj.isPlayer ? 'You' : obj.name
        const targetName = target.isPlayer ? 'you' : target.name

        // Determine burst rounds: ammo loaded in weapon, or fallback default.
        const weaponObj = obj.equippedWeapon
        const rounds = (weaponObj?.extra?.ammoLoaded as number)
            ?? (weaponObj?.weapon?.weapon?.pro?.extra?.maxAmmo as number)
            ?? 10
        const effectiveRounds = Math.max(1, Math.min(rounds, 40))

        // Consume ammo
        if (weaponObj?.extra && typeof weaponObj.extra.ammoLoaded === 'number') {
            weaponObj.extra.ammoLoaded = Math.max(0, weaponObj.extra.ammoLoaded - effectiveRounds)
        }

        this.log(`${who} burst-fires ${effectiveRounds} rounds at ${targetName}`)

        // Split rounds: center target gets ~70%, adjacent hexes split ~30%
        const centerRounds = Math.ceil(effectiveRounds * 0.7)
        const adjacentRounds = effectiveRounds - centerRounds

        // Find adjacent hexes in the cone (3 hexes behind the target from attacker's perspective)
        let adjacentTargets: Critter[] = []
        if (obj.position && target.position) {
            const dir = hexDirectionTo(obj.position, target.position)
            const behindDir = (dir + 3) % 6 // opposite direction
            const adjacentHexes = [0, 1, 2, 3, 4, 5]
                .filter(d => d !== dir)
                .map(d => hexInDirectionDistance(target.position, d, 1))
                .filter((p): p is Point => p !== null && p.x >= 0 && p.x < 200 && p.y >= 0 && p.y < 200)

            for (const hex of adjacentHexes) {
                const occupant = globalState.gMap?.critterAtPosition(hex)
                if (occupant && occupant !== target && !occupant.dead && occupant.teamNum !== obj.teamNum) {
                    adjacentTargets.push(occupant)
                }
            }
        }

        let shouldAutoEnd = false

        // Apply center-target rounds
        for (let i = 0; i < centerRounds; i++) {
            const hitRoll = this.rollHit(obj, target, 'torso')
            if (hitRoll.hit === true) {
                const critModifier = hitRoll.crit ? hitRoll.DM : 2
                const damage = this.getDamageDone(obj, target, critModifier)
                if (damage > 0) {critterDamage(target, damage, obj)}
            }
        }
        this.log(`  → ${centerRounds} rounds at center target`)

        if (target.dead) {
            this.perish(target)
            shouldAutoEnd = this.canEndCombat()
        }

        // Distribute adjacent rounds among adjacent targets
        if (adjacentTargets.length > 0 && adjacentRounds > 0) {
            const perTarget = Math.max(1, Math.floor(adjacentRounds / adjacentTargets.length))
            for (const adj of adjacentTargets) {
                for (let i = 0; i < perTarget; i++) {
                    const hitRoll = this.rollHit(obj, adj, 'torso')
                    if (hitRoll.hit === true) {
                        const critModifier = hitRoll.crit ? hitRoll.DM : 2
                        const damage = this.getDamageDone(obj, adj, critModifier)
                        if (damage > 0) {critterDamage(adj, damage, obj)}
                    }
                }
                if (adj.dead) {this.perish(adj)}
            }
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

        // FO2: fire combat_p_proc(COMBAT_SUBTYPE_DEATH = 5) on the dying critter so
        // scripts can run death-quotes, quest triggers, or loot-dropping logic.
        if (Config.engine.doLoadScripts && obj._script) {
            const attacker = (obj as any).lastCombatAttacker as Critter | undefined
            Scripting.combatEvent(obj, 'onDeath', undefined, attacker)
        }
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
        targets.sort((a, b) => {
            let da = a.position ? hexDistance(obj.position!, a.position) : Infinity
            let db = b.position ? hexDistance(obj.position!, b.position) : Infinity
            
            // AI Heuristic: 'finish off weak targets' by discounting effective distance
            if (a.getStat('Max HP') > 0) {
                const aRatio = Math.max(0, a.getStat('HP') / a.getStat('Max HP'))
                if (aRatio < 0.3) da -= 3
            }
            if (b.getStat('Max HP') > 0) {
                const bRatio = Math.max(0, b.getStat('HP') / b.getStat('Max HP'))
                if (bRatio < 0.3) db -= 3
            }

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

    playerWalkTo(target: Point, running: boolean): boolean {
        if (!this.player || !this.player.AP) {return false}
        if (this.player.AP.getAvailableMoveAP() === 0) {return false}

        const maxDist = this.player.AP.getAvailableMoveAP()
        if (!this.player.walkTo(target, running, undefined, maxDist)) {
            return false
        }

        const moveCost = Math.max(0, this.player.path.path.length - 1)
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

        // behaviors

        if (obj.getStat('HP') <= obj.ai.info.min_hp) {
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
            // Decide attack mode: burst if weapon supports it, not disabled, and enough AP.
            // Respect attackModeOverride set by scripts (0=unarmed, 1=melee, 2=ranged).
            const modeOverride = (obj as any).attackModeOverride as number | undefined
            let canBurst = this.weaponHasBurstMode(obj)
                && !(obj as any).burstDisabled
                && this.getBurstAPCost(obj) <= AP.getAvailableCombatAP()
            // If scripts forced a non-ranged mode, suppress burst.
            if (modeOverride !== undefined && modeOverride < 2) {canBurst = false}
            const attackCost = canBurst ? this.getBurstAPCost(obj) : this.getAttackAPCost(obj)

            if (AP.getAvailableCombatAP() >= attackCost) {
            // if we are in range, do we have enough AP to attack?
            this.log(canBurst ? '[BURST ATTACKING]' : '[ATTACKING]')
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

            const attackFn = canBurst
                ? (cb: () => void) => this.burstAttack(obj, target, cb)
                : (cb: () => void) => this.attack(obj, target, 'torso', cb)

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

    static start(forceTurn?: Critter): void {
        // begin combat
        globalState.inCombat = true
        globalState.combat = new Combat(globalState.gMap.getObjects())
        uiLog("Combat started.")

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
            // Clear on-fire status when combat ends
            if ((combatant as any).onFire) {(combatant as any).onFire = false}
        }

        console.log('[end combat]')
        uiLog("Combat ended.")
        globalState.combat = null
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
        }

        if (this.round === 1 && this.whoseTurn === 0 && this.turnNum === 2) {
            uiLog("Combat Round 1")
        } else if (isNewRound) {
            uiLog(`Combat Round ${this.round}`)
        }

        if (this.combatants[this.whoseTurn].isPlayer) {
            // Player's turn starts — clear the player's end-of-turn AC bonus.
            this.player.stats.acBonus = 0
            this.inPlayerTurn = true
            this.player.AP!.resetAP()
            uiUpdateCombatHUD()

            // FO2 fire DoT: if the player is on fire, take 5-15 fire damage per turn.
            if ((this.player as any).onFire) {
                const fireDmg = getRandomInt(5, 15)
                this.log(`You take ${fireDmg} fire damage!`)
                critterDamage(this.player, fireDmg, undefined)
            }

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

            // FO2 fire DoT: if the critter is on fire, take 5-15 fire damage per turn.
            if ((critter as any).onFire && !critter.dead) {
                const fireDmg = getRandomInt(5, 15)
                this.log(`${critter.name} takes ${fireDmg} fire damage!`)
                critterDamage(critter, fireDmg, undefined)
                if (critter.dead) {
                    this.perish(critter)
                    return this.nextTurn(skipDepth + 1)
                }
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

            this.doAITurn(critter, this.whoseTurn, 1)
        }
    }
}
