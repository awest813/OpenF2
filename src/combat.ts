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
    combat: number = 0 // Combat AP
    move: number = 0 // Move AP
    attachedCritter: Critter

    constructor(obj: Critter) {
        this.attachedCritter = obj
        this.resetAP()
    }

    resetAP() {
        var AP = this.getMaxAP()
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
        if (value <= 0) return true
        if (this.getAvailableMoveAP() < value) return false

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
        if (value <= 0) return true
        if (this.combat < value) return false

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
            return

        AI.aiTxt = {}
        var ini = parseIni(getFileText('data/data/ai.txt'))
        if (ini === null) {
            // AI.TXT unavailable (e.g. asset not yet loaded); leave table empty
            // so that AI critters fall back to a default packet rather than crashing.
            console.warn("combat: couldn't load AI.TXT — AI critters will use default packet")
            return
        }
        for (var key in ini) {
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
        if (AI.aiTxt === null) AI.init()

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
                if (obj.dead || !obj.visible) return false

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
        if (CriticalEffects.regionHitChanceDecTable[region] !== undefined) return region
        return 'torso'
    }

    accountForPartialCover(obj: Critter, target: Critter): number {
        // TODO: get list of intervening critters. Substract 10 for each one in the way
        return 0
    }

    getHitDistanceModifier(obj: Critter, target: Critter, weapon: Obj): number {
        // we calculate the distance between source and target
        // we then substract the source's per modified by the weapon from it (except for scoped weapons)

        // NOTE: this function is supposed to have weird behaviour for multihex sources and targets. Let's ignore that.

        // 4 if weapon has long_range perk
        // 5 if weapon has scope_range perk
        var distModifier = 2
        // 8 if weapon has scope_range perk
        var minDistance = 0
        var perception = obj.getStat('PER')
        var distance = hexDistance(obj.position, target.position)
        if (distance < minDistance)
            distance += minDistance // yes supposedly += not =, this means 7 grid distance is the worst
        else {
            var tempPER = perception
            if (obj.isPlayer === true) tempPER -= 2 // supposedly player gets nerfed like this. WTF?
            distance -= tempPER * distModifier
        }

        // this appears not to have any effect but was found so elsewhere
        // If anyone can tell me why it exists or what it's for I'd be grateful.
        if (-2 * perception > distance) distance = -2 * perception

        // Sharpshooter perk (ID 5): each rank grants +2 effective PER for range penalty.
        // Implemented as reducing the un-multiplied distance by 2*rank before the x4 scale.
        const sharpshooterRank = (obj.perkRanks ?? {})[5] ?? 0
        if (sharpshooterRank > 0) distance -= 2 * sharpshooterRank

        // then we multiply a magic number on top. More if there is eye damage involved by the attacker
        // this means for each field distance after PER modification we lose 4 points of hitchance
        // 12 if we have eyedamage
        var objHasEyeDamage = false
        if (distance >= 0 && objHasEyeDamage) distance *= 12
        else distance *= 4

        // and if the result is a positive distance, we return that
        // closeness can not improve hitchance above normal, so we don't return that
        if (distance >= 0) return distance
        else return 0
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

        var hitDistanceModifier = this.getHitDistanceModifier(obj, target, effectiveWeaponObj)
        // AC now includes any temporary end-of-turn AP bonus via StatSet.acBonus
        var AC = target.getStat('AC')
        var bonusCrit = 0 // TODO: perk bonuses, other crit influencing things
        var baseCrit = obj.getStat('Critical Chance') + bonusCrit
        const regionPenalty = CriticalEffects.regionHitChanceDecTable[normalizedRegion] ?? CriticalEffects.regionHitChanceDecTable['torso'] ?? 0
        var hitChance = weaponSkill - AC - regionPenalty - hitDistanceModifier
        var critChance = baseCrit + regionPenalty

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
        var critModifer = obj.getStat('Better Criticals')
        var hitChance = this.getHitChance(obj, target, normalizedRegion)

        // hey kids! Did you know FO only rolls the dice once here and uses the results two times?
        var roll = getRandomInt(1, D100_MAX)

        if (hitChance.hit - roll > 0) {
            var isCrit = false
            if (rollSkillCheck(Math.floor(hitChance.hit - roll) / 10, hitChance.crit, false) === true) isCrit = true

            // Sniper perk (ID 9): make a second d100 roll; use the better outcome
            // for the called-shot location. If the second roll also qualifies as a
            // critical, the attack becomes a critical hit.
            const sniperRank = (obj.perkRanks ?? {})[9] ?? 0
            if (sniperRank > 0 && !isCrit) {
                const secondRoll = getRandomInt(1, D100_MAX)
                if (hitChance.hit - secondRoll > 0) {
                    if (rollSkillCheck(Math.floor(hitChance.hit - secondRoll) / 10, hitChance.crit, false))
                        isCrit = true
                }
            }

            if (isCrit === true) {
                var critLevel = Math.floor(Math.max(0, getRandomInt(critModifer, 100 + critModifer)) / 20)
                this.log('crit level: ' + critLevel)
                var crit = CriticalEffects.getCritical(target.killType, normalizedRegion, critLevel)
                var critStatus = crit.doEffectsOn(target)

                return { hit: true, crit: true, DM: critStatus.DM, msgID: critStatus.msgID } // crit
            }

            return { hit: true, crit: false } // hit
        }

        // in reverse because miss -> roll > hitchance.hit
        var isCrit = false
        if (rollSkillCheck(Math.floor(roll - hitChance.hit) / 10, 0, false)) isCrit = true
        // Jinxed trait (ID 9): 50% added chance for a critical miss on any miss.
        // Pariah Dog companion provides the same non-stacking bonus; check both.
        const attackerJinxed = obj.charTraits?.has(9) ?? false
        const playerJinxed = this.player && !obj.isPlayer ? (this.player.charTraits?.has(9) ?? false) : false
        if ((attackerJinxed || playerJinxed) && !isCrit) {
            if (getRandomInt(1, D100_MAX) <= JINXED_CRIT_MISS_CHANCE) isCrit = true
        }

        return { hit: false, crit: isCrit } // miss
    }

    getDamageDone(obj: Critter, target: Critter, critModifer: number) {
        var weapon = obj.equippedWeapon
        // BLK-053: No weapon equipped — use a synthetic unarmed weapon (Weapon(null))
        // so that critters can deal damage in melee even without an equipped item.
        // Weapon(null) represents a bare-fist punch: 1–2 Normal damage.
        var wep = weapon?.weapon ?? new Weapon(null)
        if (!wep) {
            console.warn('getDamageDone: weapon has no weapon data — returning 0 damage')
            return 0
        }
        var damageType = wep.getDamageType()

        var RD = getRandomInt(wep.minDmg, wep.maxDmg) // rand damage min..max
        var RB = 0 // ranged bonus (via perk)
        var CM = critModifer // critical hit damage multiplier
        var ADR = target.getStat('DR ' + damageType) // damage resistance (includes equipped armor)
        var ADT = target.getStat('DT ' + damageType) // damage threshold (includes equipped armor)
        var X = 2 // ammo dividend
        var Y = 1 // ammo divisor
        var RM = 0 // ammo resistance modifier
        var CD = 100 // combat difficulty modifier (easy = 75%, normal = 100%, hard = 125%)

        var ammoDamageMult = X / Y

        var baseDamage = (CM / 2) * ammoDamageMult * (RD + RB) * (CD / 100)
        var adjustedDamage = Math.max(0, baseDamage - ADT)
        console.log(
            `RD: ${RD} | CM: ${CM} | ADR: ${ADR} | ADT: ${ADT} | Base Dmg: ${baseDamage} Adj Dmg: ${adjustedDamage} | Type: ${damageType}`
        )

        return Math.ceil(adjustedDamage * (1 - (ADR + RM) / 100))
    }

    getCombatMsg(id: number) {
        return getMessage('combat', id)
    }

    attack(obj: Critter, target: Critter, region = 'torso', callback?: () => void) {
        // turn to face the target
        // BLK-059: Guard against null positions before calling hexNearestNeighbor.
        if (obj.position && target.position) {
            var hex = hexNearestNeighbor(obj.position, target.position)
            if (hex !== null) obj.orientation = hex.direction
        }

        // Calculate hit and damage synchronously before starting the animation so
        // that we can wrap the callback if the last enemy was just killed (BLK-062).
        var who = obj.isPlayer ? 'You' : obj.name
        var targetName = target.isPlayer ? 'you' : target.name
        var hitRoll = this.rollHit(obj, target, region)
        this.log('hit% is ' + this.getHitChance(obj, target, region).hit)

        // BLK-062: Track whether this attack killed the last non-player combatant so
        // combat can be ended automatically after the animation completes.
        let shouldAutoEnd = false

        if (hitRoll.hit === true) {
            var critModifier = hitRoll.crit ? hitRoll.DM : 2
            var damage = this.getDamageDone(obj, target, critModifier)
            var extraMsg = hitRoll.crit === true ? this.getCombatMsg(hitRoll.msgID) || '' : ''
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
                var critFailMod = (obj.getStat('LUK') - 5) * -5
                var critFailRoll = Math.floor(getRandomInt(1, 100) - critFailMod)
                var critFailLevel = 1
                if (critFailRoll <= 20) critFailLevel = 1
                else if (critFailRoll <= 50) critFailLevel = 2
                else if (critFailRoll <= 75) critFailLevel = 3
                else if (critFailRoll <= 95) critFailLevel = 4
                else critFailLevel = 5

                this.log(who + ' failed at fail level ' + critFailLevel)

                // Map weapon type to appropriate crit fail table
                var weaponType = CriticalEffects.getWeaponCritFailType(obj)
                var critFailEffect = CriticalEffects.criticalFailTable[weaponType][critFailLevel]
                CriticalEffects.temporaryDoCritFail(critFailEffect, obj)
            }
        }

        // BLK-062: When the last enemy dies, wrap the animation callback so that
        // nextTurn() is called automatically after the animation finishes.
        // nextTurn() will detect numActive===0 (all enemies dead) and call end().
        const effectiveCallback: (() => void) | undefined = shouldAutoEnd
            ? () => {
                if (callback) callback()
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
            if (c.isPlayer) continue
            if (!c.dead) return false
        }
        return true
    }

    getCombatAIMessage(id: number) {
        return getMessage('combatai', id)
    }

    maybeTaunt(obj: Critter, type: string, roll: boolean) {
        if (roll === false) return
        // BLK-052: Guard against null ai (AI failed to initialize for this critter).
        if (!obj.ai?.info) return
        var msgID = getRandomInt(parseInt(obj.ai.info[type + '_start']), parseInt(obj.ai.info[type + '_end']))
        this.log('[TAUNT ' + obj.name + ': ' + this.getCombatAIMessage(msgID) + ']')
    }

    findTarget(obj: Critter): Critter | null {
        // TODO: find target according to AI rules
        // Find the closest living combatant on a different team

        const targets = this.combatants.filter((x) => !x.dead && x.teamNum !== obj.teamNum)
        if (targets.length === 0) return null
        // BLK-059: Guard null positions in the sort comparator to avoid crashes when
        // combatants lack a position (e.g. freshly added or off-map).
        if (!obj.position) return targets[0] ?? null
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

        var that = this
        var target = this.findTarget(obj)
        if (!target) {
            console.log('[AI has no target]')
            return this.nextTurn()
        }
        var distance = obj.position && target.position ? hexDistance(obj.position, target.position) : 0
        var AP = obj.AP!
        var messageRoll = rollSkillCheck(obj.ai.info.chance, 0, false)

        if (Config.engine.doLoadScripts === true && obj._script !== undefined) {
            // notify the critter script of a combat event
            if (Scripting.combatEvent(obj, 'turnBegin') === true) return // end of combat (script override)
        }

        if (AP.getAvailableMoveAP() <= 0)
            // out of AP
            return this.nextTurn()

        // behaviors

        if (obj.getStat('HP') <= obj.ai.info.min_hp) {
            // hp <= min fleeing hp, so flee
            this.log('[AI FLEES]')

            // todo: pick the closest edge of the map
            this.maybeTaunt(obj, 'run', messageRoll)
            const targetPos = { x: 128, y: obj.position?.y ?? 0 } // left edge
            const callback = () => {
                obj.clearAnim()
                that.doAITurn(obj, idx, depth + 1) // if we can, do another turn
            }

            if (!this.walkUpTo(obj, idx, targetPos, AP.getAvailableMoveAP(), callback)) {
                return this.nextTurn() // not a valid path, just move on
            }

            return
        }

        var weaponObj = obj.equippedWeapon
        if (!weaponObj) {
            console.warn('doAITurn: AI critter ' + obj.name + ' has no weapon — skipping turn')
            return this.nextTurn()
        }
        var weapon = weaponObj.weapon
        if (!weapon) {
            console.warn('doAITurn: AI critter ' + obj.name + ' weapon has no weapon data — skipping turn')
            return this.nextTurn()
        }
        var fireDistance = weapon.getMaximumRange(1)
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
            var neighbors = hexNeighbors(target.position)
            var maxDistance = Math.min(AP.getAvailableMoveAP(), distance - fireDistance)
            this.maybeTaunt(obj, 'move', messageRoll)

            // Prefer neighbors nearest to our current position so movement is less erratic.
            neighbors.sort((a, b) => hexDistance(obj.position, a) - hexDistance(obj.position, b))

            var didCreep = false
            for (var i = 0; i < neighbors.length; i++) {
                if (
                    obj.walkTo(
                        neighbors[i],
                        false,
                        function () {
                            obj.clearAnim()
                            that.doAITurn(obj, idx, depth + 1) // if we can, do another turn
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
                that.doAITurn(obj, idx, depth + 1) // if we can, do another turn
            }
        } else if (AP.getAvailableCombatAP() >= 4) {
            // if we are in range, do we have enough AP to attack?
            this.log('[ATTACKING]')
            if (AP.subtractCombatAP(4) === false) {
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

            this.attack(obj, target, 'torso', function () {
                obj.clearAnim()
                that.doAITurn(obj, idx, depth + 1) // if we can, do another turn
            })
        } else {
            console.log('[AI IS STUMPED]')
            this.nextTurn()
        }
    }

    static start(forceTurn?: Critter): void {
        // begin combat
        globalState.inCombat = true
        globalState.combat = new Combat(globalState.gMap.getObjects())

        if (forceTurn) globalState.combat.forceTurn(forceTurn)

        globalState.combat.nextTurn()
        globalState.gMap.updateMap()
    }

    end() {
        // BLK-063: canEndCombat() is called by nextTurn() (numActive===0) and by
        // the BLK-062 auto-end callback.  The former TODO is now resolved.

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
        if (obj.isPlayer) this.whoseTurn = this.playerIdx - 1
        else {
            var idx = this.combatants.indexOf(obj)
            if (idx === -1) {
                console.warn("forceTurn: no combatant '" + obj.name + "' in combatant list — ignoring")
                return
            }

            this.whoseTurn = idx - 1
        }
    }

    nextTurn(skipDepth: number = 0): void {
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
        var numActive = 0
        for (var i = 0; i < this.combatants.length; i++) {
            var obj = this.combatants[i]
            if (obj.dead || obj.isPlayer) continue
            // BLK-051: Guard against null ai (AI failed to init for this critter).
            // Fall back to a safe default max_dist so the loop can still complete.
            const maxDist: number = obj.ai?.info?.max_dist ?? 20
            // BLK-059: Guard null positions to prevent hexDistance crash.
            var inRange = (obj.position && this.player.position)
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

        if (numActive === 0 && this.turnNum !== 1) return this.end()

        this.turnNum++
        this.whoseTurn++

        if (this.whoseTurn >= this.combatants.length) this.whoseTurn = 0

        if (this.combatants[this.whoseTurn].isPlayer) {
            // Player's turn starts — clear the player's end-of-turn AC bonus.
            this.player.stats.acBonus = 0
            this.inPlayerTurn = true
            this.player.AP!.resetAP()
        } else {
            this.inPlayerTurn = false
            var critter = this.combatants[this.whoseTurn]
            if (critter.dead === true || critter.hostile !== true) return this.nextTurn(skipDepth + 1)

            // Guard against critters that were added mid-combat without AP initialised.
            if (!critter.AP) {
                console.warn('[combat] nextTurn: critter has no AP — skipping turn')
                return this.nextTurn(skipDepth + 1)
            }
            // Clear the AC bonus from this critter's previous turn before resetting AP.
            critter.stats.acBonus = 0
            critter.AP.resetAP()
            this.doAITurn(critter, this.whoseTurn, 1)
        }
    }
}
