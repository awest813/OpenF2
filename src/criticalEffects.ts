/*
Copyright 2014-2015 darkf, Stratege

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

import { Critter } from './object.js'
import { StatType } from './skills.js'
import { getFileJSON, rollSkillCheck } from './util.js'

// Critical Effects system

export module CriticalEffects {
    interface Dict<T> {
        [key: string]: T
    }

    interface NumDict<T> {
        [key: number]: T
    }

    type EffectsFunction = (target: Critter) => void

    // Attack mode constants (matches critter.ts)
    const ATTACK_MODE_NONE = 0
    const ATTACK_MODE_PUNCH = 1
    const ATTACK_MODE_KICK = 2
    const ATTACK_MODE_SWING = 3
    const ATTACK_MODE_THRUST = 4
    const ATTACK_MODE_THROW = 5
    const ATTACK_MODE_FIRE_SINGLE = 6
    const ATTACK_MODE_FIRE_BURST = 7
    const ATTACK_MODE_FLAME = 8

    /**
     * Maps weapon attack mode to critical failure table type.
     * Based on Fallout 2 weapon classification.
     */
    export function getWeaponCritFailType(critter: Critter): string {
        const weapon = critter.equippedWeapon
        
        // No weapon = unarmed
        if (!weapon || !weapon.weapon || !weapon.pro || !weapon.pro.extra) {
            return 'unarmed'
        }
        
        // Get primary attack mode from weapon
        const attackModes = weapon.pro.extra.attackMode
        const primaryMode = attackModes & 0x0F
        
        // Map attack mode to critical failure table
        switch (primaryMode) {
            case ATTACK_MODE_PUNCH:
            case ATTACK_MODE_KICK:
                return 'unarmed'
            
            case ATTACK_MODE_SWING:
            case ATTACK_MODE_THRUST:
                return 'melee'
            
            case ATTACK_MODE_THROW:
                // Check damage type to distinguish grenades
                const dmgType = weapon.pro.extra.dmgType
                if (dmgType === 6) { // Explosive
                    return 'grenades'
                }
                return 'firearms'
            
            case ATTACK_MODE_FIRE_SINGLE:
            case ATTACK_MODE_FIRE_BURST:
                // Check weapon skill to distinguish energy weapons
                const dmgType2 = weapon.pro.extra.dmgType
                if (dmgType2 === 1 || dmgType2 === 3 || dmgType2 === 4) { // Laser, Plasma, Electrical
                    return 'energy'
                }
                // Check for rocket launcher (Big Guns skill, explosive damage)
                if (dmgType2 === 6) {
                    return 'rocketlauncher'
                }
                return 'firearms'
            
            case ATTACK_MODE_FLAME:
                return 'flamers'
            
            default:
                return 'unarmed'
        }
    }

    const generalRegionName: { [region: number]: string } = {
        0: 'head',
        1: 'leftArm',
        2: 'rightArm',
        3: 'torso',
        4: 'rightLeg',
        5: 'leftLeg',
        6: 'eyes',
        7: 'groin',
        8: 'uncalled',
    }

    // TODO: make this table account for different weapon types. It appears melee weapons use a second one
    // though it appears to only be a /2 for melee
    export const regionHitChanceDecTable: { [region: string]: number } = {
        torso: 0,
        leftLeg: 20,
        rightLeg: 20,
        groin: 30,
        leftArm: 30,
        rightArm: 30,
        head: 40,
        eyes: 60,
    }

    let critterTable: Dict<CritType[]>[]

    const critFailEffects: Dict<EffectsFunction> = {
        damageSelf: function (target: Critter) {
            console.log(target.name + ' has damaged themselves!')
            // Deal damage to self - use weapon's min damage
            const weapon = target.equippedWeapon
            if (weapon && weapon.weapon) {
                const damage = weapon.weapon.minDmg || 1
                import('./critter.js').then((module) => {
                    module.critterDamage(target, damage, target, false, false)
                })
            }
        },

        crippleRandomAppendage: function (target: Critter) {
            console.log(target.name + ' has crippled a random appendage!')
            // Pick a random limb to cripple
            const limbs = [
                () => { target.crippledLeftLeg = true },
                () => { target.crippledRightLeg = true },
                () => { target.crippledLeftArm = true },
                () => { target.crippledRightArm = true },
            ]
            const randomLimb = limbs[Math.floor(Math.random() * limbs.length)]
            randomLimb()
        },

        hitRandomly: function (target: Critter) {
            console.log(target.name + ' hit a random target!')
            // TODO: In full Fallout, this hits a random nearby critter
            // For now, just hit self with reduced damage
            critFailEffects.damageSelf(target)
        },

        hitSelf: function (target: Critter) {
            console.log(target.name + ' hit themselves!')
            // Deal full weapon damage to self
            const weapon = target.equippedWeapon
            if (weapon && weapon.weapon) {
                const damage = Math.floor((weapon.weapon.minDmg + weapon.weapon.maxDmg) / 2)
                import('./critter.js').then((module) => {
                    module.critterDamage(target, damage, target, false, false)
                })
            }
        },

        loseAmmo: function (target: Critter) {
            console.log(target.name + ' has lost their ammo!')
            // TODO: Implement ammo system integration
            // For now, just a visual effect
        },

        destroyWeapon: function (target: Critter) {
            console.log(target.name + ' has had their weapon blow up in their face!')
            // Weapon is destroyed and user takes damage
            const weapon = target.equippedWeapon
            if (weapon && weapon.weapon) {
                const damage = weapon.weapon.maxDmg || 5
                import('./critter.js').then((module) => {
                    module.critterDamage(target, damage, target, false, false)
                })
            }
            // Clear weapon slots
            target.leftHand = undefined
            target.rightHand = undefined
        },
    }

    const critterEffects: Dict<(target: Critter) => void> = {
        knockout: function (target: Critter) {
            console.log(target.name + ' has been knocked out!')
            target.knockedOut = true
            // In Fallout, knockout lasts for a random duration; here we'll set a flag
            // that can be cleared by combat system after a few turns
        },

        knockdown: function (target: Critter) {
            console.log(target.name + ' has been knocked down!')
            target.knockedDown = true
            // Loses current turn; combat system should skip this turn
        },

        crippledLeftLeg: function (target: Critter) {
            console.log(target.name + "'s left leg has been crippled!")
            target.crippledLeftLeg = true
            // Reduces AGI by 2 (handled in getStat)
        },

        crippledRightLeg: function (target: Critter) {
            console.log(target.name + "'s right leg has been crippled!")
            target.crippledRightLeg = true
            // Reduces AGI by 2 (handled in getStat)
        },

        crippledLeftArm: function (target: Critter) {
            console.log(target.name + "'s left arm has been crippled!")
            target.crippledLeftArm = true
            // In Fallout, this reduces weapon accuracy
        },

        crippledRightArm: function (target: Critter) {
            console.log(target.name + "'s right arm has been crippled!")
            target.crippledRightArm = true
            // In Fallout, this reduces weapon accuracy
        },

        blinded: function (target: Critter) {
            console.log(target.name + ' has been blinded!')
            target.blinded = true
            // Reduces PER by 5 (handled in getStat)
        },

        death: function (target: Critter) {
            console.log(target.name + ' dies instantly from a critical hit!')
            // Use critterKill to trigger proper death sequence
            import('./critter.js').then((module) => {
                module.critterKill(target, undefined, true)
            })
        },

        onFire: function (target: Critter) {
            console.log(target.name + ' is on fire!')
            target.onFire = true
            // TODO: Should deal fire damage each turn
        },

        bypassArmor: function (target: Critter) {
            console.log(target.name + ' hit by armor-bypassing attack!')
            // This effect is handled in damage calculation, not here
            // Just a marker effect
        },

        droppedWeapon: function (target: Critter) {
            console.log(target.name + ' dropped their weapon!')
            // TODO: Implement weapon drop to ground
            // For now, just clear weapon slots
            target.leftHand = undefined
            target.rightHand = undefined
        },

        loseNextTurn: function (target: Critter) {
            console.log(target.name + ' loses their next turn!')
            target.stunned = true
            // Combat system should check this flag and skip the turn
        },

        random: function (target: Critter) {
            console.log(target.name + ' is affected by a random critical effect!')
            // Pick a random effect from the available ones
            const effects = [
                critterEffects.knockdown,
                critterEffects.crippledLeftLeg,
                critterEffects.crippledRightLeg,
                critterEffects.crippledLeftArm,
                critterEffects.crippledRightArm,
            ]
            const randomEffect = effects[Math.floor(Math.random() * effects.length)]
            randomEffect(target)
        },
    }

    class Effects {
        effects: EffectsFunction[]

        constructor(effectCallbackList: EffectsFunction[]) {
            this.effects = effectCallbackList
        }

        doEffectsOn(target: any): void {
            for (var i = 0; i < this.effects.length; i++) this.effects[i](target)
        }
    }

    class StatCheck {
        stat: string
        modifier: number
        effects: Effects
        failEffectMessageID: number
        //stat = number, probably

        constructor(stat: string, modifier: number, effects: Effects, failEffectMessageID: number) {
            this.stat = stat
            this.modifier = modifier
            this.effects = effects
            this.failEffectMessageID = failEffectMessageID
        }

        // This should return "Maybe msgID"
        doEffectsOn(target: Critter): any {
            // stat being undefined means there is no stat check to be done
            if (this.stat === undefined) return { success: false }

            var statToRollAgainst = target.getStat(this.stat)
            statToRollAgainst += this.modifier

            // if our target fails their skillcheck, they have to suffer the added effects.
            // We do *10 so we can reuse the skillCheck function which goes from 0 to 100, while stat is 1 to 10
            if (!rollSkillCheck(statToRollAgainst * 10, 0, false)) {
                this.effects.doEffectsOn(target)
                return { success: true, msgID: this.failEffectMessageID }
            }

            return { success: false }
        }
    }

    class CritType {
        DM: number
        effects: Effects
        statCheck: StatCheck
        msgID: number

        constructor(damageMultiplier: number, effects: Effects, statCheck: StatCheck, effectMsg: number) {
            this.DM = damageMultiplier
            this.effects = effects
            this.statCheck = statCheck
            this.msgID = effectMsg
        }

        doEffectsOn(target: Critter) {
            var returnMsgID = this.msgID
            //we need to check for results before we apply the other effects, to ensure the checks in statCheck aren't modified by the effects of the crit.
            var statCheckResults = this.statCheck.doEffectsOn(target)

            this.effects.doEffectsOn(target)

            //did statCheck do its effects as well?
            if (statCheckResults.success === true) returnMsgID = statCheckResults.msgID

            return { DM: this.DM, msgID: returnMsgID }
        }
    }

    interface CritLevelData {
        statCheck: { stat: number; checkModifier: number; failureEffect: string[]; failureMessage: number }
        dmgMultiplier: number
        critEffect: string[]
        msg: number
    }

    function parseCritLevel(critLevel: CritLevelData): CritType {
        var stat = critLevel.statCheck
        var statVal: string | undefined = undefined
        if (stat.stat != -1) statVal = StatType[stat.stat]
        var tempStatCheck = new StatCheck(
            statVal,
            stat.checkModifier,
            parseEffects(stat.failureEffect),
            stat.failureMessage
        )
        var retCritLevel = new CritType(
            critLevel.dmgMultiplier,
            parseEffects(critLevel.critEffect),
            tempStatCheck,
            critLevel.msg
        )
        return retCritLevel
    }

    // takes a List of effect names, gets the appropriate effects from the table and stores it in a Effects object
    function parseEffects(effects: string[]): Effects {
        var tempEffects = []
        for (var i = 0; i < effects.length; i++) tempEffects[i] = critterEffects[effects[i]]
        return new Effects(tempEffects)
    }

    // tries to obtain the CritType object partaining to the critLevel of the region of the critterType in question, returns a default CritType object otherwise
    export function getCritical(critterKillType: number, region: string, critLevel: number): CritType {
        let ret: CritType | undefined = undefined

        try {
            // ensure we aren't exceeding the highest crit level existing for this type of critter and region
            const actualLevel = Math.min(critLevel, critterTable[critterKillType][region].length - 1)
            // get the appropriate CritType from the table
            ret = critterTable[critterKillType][region][actualLevel]
        } catch (e) {}

        if (ret === undefined) {
            console.log('error: could not find critical: ' + critterKillType + '/' + region + '/' + critLevel)
            ret = defaultCritType(critterKillType, region, critLevel)
        }

        return ret
    }

    // constructs a default Crit Type object which doesn't apply any modifications to the shot, only changes the logging.
    function defaultCritType(critterKillType: number, region: string, critLevel: number): CritType {
        return new CritType(2, new Effects([]), new StatCheck(undefined, undefined, undefined, undefined), undefined)
    }

    export function getCriticalFail(weaponType: string, failLevel: number): EffectsFunction[] {
        var ret: EffectsFunction[] | undefined = undefined
        try {
            // get the appropriate Critical Fail from the table
            ret = criticalFailTable[weaponType][failLevel]
        } catch (e) {}

        if (ret === undefined)
            //default crit fail error, which doesn't do anything but print an error message
            ret = [
                (critter) => {
                    console.log('error: could not find critical fail: ' + weaponType + '/' + failLevel)
                },
            ]

        return ret
    }

    export function loadTable() {
        // read in the global table
        var haveTable = true

        //console.log("loading critical table...");
        var table = getFileJSON('lut/criticalTables.json', () => {
            haveTable = false
        })

        if (!haveTable) {
            console.log('lut/criticalTables.json not found, not loading critical hit/miss table')
            return
        }

        critterTable = new Array(table.length)
        for (var i = 0; i < table.length; i++) {
            critterTable[i] = {}

            for (var region in table[i]) {
                critterTable[i][region] = new Array(table[i][region].length)

                for (var critLevel = 0; critLevel < table[i][region].length; critLevel++)
                    critterTable[i][region][critLevel] = parseCritLevel(table[i][region][critLevel])
            }
        }
        //console.log("parsed critical table with " + critterTable.length + " entries")
    }

    export const criticalFailTable: Dict<NumDict<EffectsFunction[]>> = {
        unarmed: {
            1: [],
            2: [critterEffects.loseNextTurn],
            3: [critterEffects.loseNextTurn],
            4: [critFailEffects.damageSelf, critterEffects.knockdown],
            5: [critFailEffects.crippleRandomAppendage],
        },
        melee: {
            1: [],
            2: [critterEffects.loseNextTurn],
            3: [critterEffects.droppedWeapon],
            4: [critFailEffects.hitRandomly],
            5: [critFailEffects.hitSelf],
        },
        firearms: {
            1: [],
            2: [critFailEffects.loseAmmo],
            3: [critterEffects.droppedWeapon],
            4: [critFailEffects.hitRandomly],
            5: [critFailEffects.destroyWeapon],
        },
        energy: {
            1: [critterEffects.loseNextTurn],
            2: [critFailEffects.loseAmmo, critterEffects.loseNextTurn],
            3: [critterEffects.droppedWeapon, critterEffects.loseNextTurn],
            4: [critFailEffects.hitRandomly],
            5: [critFailEffects.destroyWeapon, critterEffects.loseNextTurn],
        },
        grenades: {
            1: [],
            2: [critterEffects.droppedWeapon],
            3: [critFailEffects.damageSelf, critterEffects.droppedWeapon],
            4: [critFailEffects.hitRandomly],
            5: [critFailEffects.destroyWeapon],
        },
        rocketlauncher: {
            1: [critterEffects.loseNextTurn],
            2: [], //yes that appears backwards but seems to be the case in FO
            3: [critFailEffects.destroyWeapon],
            4: [critFailEffects.hitRandomly],
            5: [critFailEffects.destroyWeapon, critterEffects.loseNextTurn, critterEffects.knockdown],
        },
        flamers: {
            1: [],
            2: [critterEffects.loseNextTurn],
            3: [critFailEffects.hitRandomly],
            4: [critFailEffects.destroyWeapon],
            5: [critFailEffects.destroyWeapon, critterEffects.loseNextTurn, critterEffects.onFire],
        },
    }

    export function temporaryDoCritFail(critFail: EffectsFunction[], target: Critter) {
        for (var i = 0; i < critFail.length; i++) {
            critFail[i](target)
        }
    }
}
