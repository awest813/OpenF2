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

import globalState from './globalState.js'
import { hexDirectionTo } from './geometry.js'
import { Critter, WeaponObj } from './object.js'
import { Scripting } from './scripting.js'

const weaponAnims: { [weapon: string]: { [anim: string]: string } } = {
    punch: { idle: 'aa', attack: 'aq' },
}

class BiDiEnum<T extends string, U extends number> {
    private byName: { [K in T]?: U } = {}
    private byValue: { [K in U]?: T } = {}
    readonly names: T[] = []
    readonly values: U[] = []

    add(name: T, value: U): void {
        this.byName[name] = value
        this.byValue[value] = name
        this.names.push(name)
        this.values.push(value)
    }

    toValue(name: string): U | undefined { return this.byName[name as T] }
    toName(value: number): T | undefined { return this.byValue[value as U] }
    hasName(name: string): boolean { return name in this.byName }
    hasValue(value: number): boolean { return value in this.byValue }
}

const attackMode = new BiDiEnum<string, number>()
attackMode.add('none', 0)
attackMode.add('punch', 1)
attackMode.add('kick', 2)
attackMode.add('swing', 3)
attackMode.add('thrust', 4)
attackMode.add('throw', 5)
attackMode.add('fire single', 6)
attackMode.add('fire burst', 7)
attackMode.add('flame', 8)

const damageType = new BiDiEnum<string, number>()
damageType.add('Normal', 0)
damageType.add('Laser', 1)
damageType.add('Fire', 2)
damageType.add('Plasma', 3)
damageType.add('Electrical', 4)
damageType.add('EMP', 5)
damageType.add('Explosive', 6)

const weaponSkillByAnimCode: { [code: number]: string } = {
    0: 'Unarmed',
    1: 'Melee Weapons',
    2: 'Melee Weapons',
    3: 'Melee Weapons',
    4: 'Melee Weapons',
    5: 'Small Guns',
    6: 'Small Guns',
    7: 'Small Guns',
    8: 'Big Guns',
    9: 'Big Guns',
    10: 'Big Guns',
}

const weaponSkillByNameFallback: { [weapon: string]: string } = {
    uzi: 'Small Guns',
    rifle: 'Small Guns',
    spear: 'Melee Weapons',
    knife: 'Melee Weapons',
    club: 'Melee Weapons',
    sledge: 'Melee Weapons',
    flamethr: 'Big Guns',
    pistol: 'Small Guns',
}

function resolveWeaponSkill(weapon: WeaponObj): string {
    const animCode = weapon.pro?.extra?.animCode
    if (typeof animCode === 'number' && weaponSkillByAnimCode[animCode]) {
        return weaponSkillByAnimCode[animCode]
    }
    const s = weapon.art.split('/')
    const name = s[s.length - 1]
    return weaponSkillByNameFallback[name] ?? 'Small Guns'
}

type WeaponType = 'melee' | 'gun' | 'throwing'

interface WeaponProtoExtra {
    maxRange1: number
    maxRange2: number
    APCost1: number
    APCost2: number
    minDmg: number
    maxDmg: number
    dmgType?: number
    projPID?: number
    animCode?: number
    attackMode?: number
    perk?: number
    twoHanded?: number
    acModifier?: number
    ammoDmgMult?: number
    ammoDmgDiv?: number
    drModifier?: number
    minST?: number
}

interface AttackInfo {
    mode: number
    APCost: number
    maxRange: number
}

function parseAttack(weapon: WeaponObj): { first: AttackInfo; second: AttackInfo } {
    const attackModes = weapon.pro.extra['attackMode']
    const modeOne = attackMode.toValue(attackMode.toName(attackModes & 0xf) ?? 'none') ?? 0
    const modeTwo = attackMode.toValue(attackMode.toName((attackModes >> 4) & 0xf) ?? 'none') ?? 0
    const attackOne: AttackInfo = { mode: modeOne, APCost: 0, maxRange: 0 }
    const attackTwo: AttackInfo = { mode: modeTwo, APCost: 0, maxRange: 0 }

    if (modeOne !== attackMode.toValue('none')) {
        attackOne.APCost = weapon.pro.extra.APCost1
        attackOne.maxRange = weapon.pro.extra.maxRange1
    }

    if (modeTwo !== attackMode.toValue('none')) {
        attackTwo.APCost = weapon.pro.extra.APCost2
        attackTwo.maxRange = weapon.pro.extra.maxRange2
    }

    return { first: attackOne, second: attackTwo }
}

export class Weapon {
    weapon: WeaponObj | { pro: { extra: WeaponProtoExtra } }
    name: string
    modes: string[]
    mode: string
    type: WeaponType
    minDmg: number
    maxDmg: number
    weaponSkillType: string

    attackOne!: AttackInfo
    attackTwo!: AttackInfo

    private get protoExtra(): WeaponProtoExtra {
        return this.weapon.pro.extra
    }

    constructor(weapon: WeaponObj | null, critter?: any) {
        this.weapon = weapon!
        this.modes = ['single', 'called']

        if (weapon === null) {
            this.type = 'melee'
            const unarmedSkill = (typeof critter?.getSkill === 'function') ? critter.getSkill('Unarmed') : 0
            const meleeDmg = (typeof critter?.getStat === 'function') ? Math.max(1, (critter.getStat('STR') ?? 5) - 5) : 0
            this.minDmg = 1 + Math.floor(unarmedSkill / 50)
            this.maxDmg = 2 + meleeDmg + Math.floor(unarmedSkill / 25)
            this.name = 'punch'
            this.weaponSkillType = 'Unarmed'
            this.weapon = {
                pro: {
                    extra: {
                        maxRange1: 1,
                        maxRange2: 1,
                        APCost1: 4,
                        APCost2: 4,
                        minDmg: this.minDmg,
                        maxDmg: this.maxDmg,
                        dmgType: 0,
                        attackMode: 0x11,
                    }
                }
            }
        } else {
            const attackModes = weapon.pro.extra['attackMode'] ?? 0
            const primaryMode = attackModes & 0x0f
            const secondaryMode = (attackModes >> 4) & 0x0f
            if (primaryMode >= 1 && primaryMode <= 4 && secondaryMode < 6) {
                this.type = 'melee'
            } else if (primaryMode === 5 || secondaryMode === 5) {
                this.type = 'throwing'
            } else {
                this.type = 'gun'
            }
            this.minDmg = weapon.pro.extra.minDmg
            this.maxDmg = weapon.pro.extra.maxDmg
            const s = weapon.art.split('/')
            this.name = s[s.length - 1]

            const attacks = parseAttack(weapon)
            this.attackOne = attacks.first
            this.attackTwo = attacks.second

            this.weaponSkillType = resolveWeaponSkill(weapon)
            if (this.weaponSkillType === undefined) {console.log('unknown weapon type for ' + this.name + ' (animCode: ' + weapon.pro?.extra?.animCode + ')')}
        }

        this.mode = this.modes[0]
    }

    cycleMode(): void {
        this.mode = this.modes[(this.modes.indexOf(this.mode) + 1) % this.modes.length]
    }

    isCalled(): boolean {
        return this.mode === 'called'
    }

    getProjectilePID(): number {
        if (this.type === 'melee') {return -1}
        return this.protoExtra.projPID ?? -1
    }

    getMaximumRange(attackType: number): number {
        if (attackType === 1) {return this.protoExtra.maxRange1}
        if (attackType === 2) {return this.protoExtra.maxRange2}
        console.warn('getMaximumRange: unknown attack type ' + attackType + ' — returning 1')
        return 1
    }

    getAPCost(atkMode: number): number {
        const key = 'APCost' + atkMode as 'APCost1' | 'APCost2'
        const cost = this.protoExtra[key]
        if (cost === undefined) {
            console.warn(`getAPCost: unknown attackMode ${atkMode} — returning 0`)
            return 0
        }
        return cost
    }

    getSkin(): string | null {
        const extra = this.protoExtra
        if (extra === undefined) {return null}
        const animCodeMap: { [animCode: number]: string } = {
            0: 'a',
            1: 'd',
            2: 'e',
            3: 'f',
            4: 'g',
            5: 'h',
            6: 'i',
            7: 'j',
            8: 'k',
            9: 'l',
            10: 'm',
        }
        return animCodeMap[extra.animCode ?? 0]
    }

    getAttackSkin(): string | null {
        const extra = this.protoExtra
        if (extra === undefined) {return null}
        if (this.name === 'punch' && this.type === 'melee' && !(this.weapon instanceof WeaponObj)) {return 'q'}

        const modeSkinMap: { [mode: string]: string } = {
            punch: 'q',
            kick: 'r',
            swing: 'g',
            thrust: 'f',
            throw: 's',
            'fire single': 'j',
            'fire burst': 'k',
            flame: 'l',
        }

        const activeAttack = this.mode === 'called' && this.attackTwo.mode !== attackMode.toValue('none')
            ? this.attackTwo
            : this.attackOne

        if (activeAttack.mode !== attackMode.toValue('none')) {
            const skin = modeSkinMap[activeAttack.mode]
            if (skin) {return skin}
        }

        console.warn('getAttackSkin: no attack mode mapping for weapon — using default skin "a"')
        return 'a'
    }

    getAnim(anim: string): string | null {
        if (weaponAnims[this.name] && weaponAnims[this.name][anim]) {return weaponAnims[this.name][anim]}

        const wep = this.getSkin() || 'a'
        switch (anim) {
            case 'idle':
                return wep + 'a'
            case 'walk':
                return wep + 'b'
            case 'attack':
                var attackSkin = this.getAttackSkin()
                return wep + attackSkin
            default:
                return null
        }
    }

    canEquip(obj: Critter): boolean {
        const attackAnim = this.getAnim('attack')
        if (attackAnim !== null && globalState.imageInfo[obj.getBase() + attackAnim] !== undefined) {
            return true
        }
        if (this.weapon instanceof WeaponObj) {
            const minST = this.protoExtra.minST ?? 0
            return obj.getStat('STR') >= minST
        }
        return false
    }

    getDamageType(): string {
        const rawDmgType = this.protoExtra.dmgType
        return rawDmgType !== undefined ? (damageType.toName(rawDmgType) ?? 'Normal') : 'Normal'
    }

    isMelee(): boolean {
        return this.type === 'melee'
    }
}

export function critterKill(
    obj: Critter,
    source?: Critter,
    useScript?: boolean,
    animName?: string,
    callback?: () => void
) {
    obj.dead = true
    obj.outline = null

    // Increment kill-type counter so get_critter_kills() returns accurate counts.
    // killType is stored on the critter's proto (CRITTER_DATA_KILL_TYPE).
    // Only count non-player critters; player deaths are not tracked as kills.
    if (!obj.isPlayer) {
        const kt = obj.killType
        if (kt !== null && kt !== undefined) {
            if (!globalState.critterKillCounts) {
                globalState.critterKillCounts = {}
            }
            globalState.critterKillCounts[kt] = (globalState.critterKillCounts[kt] ?? 0) + 1
        }

        // BLK-041: Auto-award XP to the player killer.
        // In Fallout 2, the engine automatically grants the base XP reward stored
        // in the critter proto (CRITTER_DATA_EXPERIENCE / data_member 48) when a
        // critter is killed.  Without this, the player never gains XP from combat,
        // making level-up and skill development impossible.
        if (source && source.isPlayer === true) {
            const xpValue: number = (obj as any).pro?.extra?.XPValue ?? 0
            if (xpValue > 0) {
                const player = source as any
                player.xp = (player.xp ?? 0) + xpValue
                // Level-up check: level N is reached at N*(N+1)/2 * 1000 total XP.
                const oldLevel: number = player.level ?? 1
                while (player.xp >= ((player.level ?? 1) * ((player.level ?? 1) + 1) / 2) * 1000) {
                    player.level = (player.level ?? 1) + 1
                    // BLK-049: Award skill points on level-up using the full Fallout 2
                    // formula: base 10 + floor(INT/2) + 2 per rank of Educated perk.
                    // This mirrors the formula in give_exp_points().
                    const intScore: number = typeof player.getStat === 'function'
                        ? (player.getStat('INT') ?? 5) : 5
                    /** Perk ID 47 = Educated: +2 skill points per level per rank. */
                    const PERK_ID_EDUCATED = 47
                    const educatedBonus = ((player.perkRanks as Record<number, number>)?.[PERK_ID_EDUCATED] ?? 0) * 2
                    const points = Math.max(1, 10 + Math.floor(intScore / 2) + educatedBonus)
                    if (player.skills && typeof player.skills.skillPoints === 'number') {
                        player.skills.skillPoints += points
                    }
                    // BLK-049: Award a perk credit every 3 levels (levels 3, 6, 9, …),
                    // matching Fallout 2 behaviour.  Uses globalState so that the
                    // counter is shared with give_exp_points() and is persisted.
                    if (player.level % 3 === 0) {
                        globalState.playerPerksOwed = (globalState.playerPerksOwed ?? 0) + 1
                    }
                }
                if ((player.level ?? 1) > oldLevel) {
                    console.log('[XP] You reached level ' + player.level + '!')
                }
            }
        }
    }

    if (useScript === undefined || useScript === true) {
        Scripting.destroy(obj, source)
    }

    if (!animName || !obj.hasAnimation(animName)) {animName = 'death'}

    obj.staticAnimation(
        animName,
        function () {
            obj.frame-- // go to last frame; body remains as static lootable object
            obj.anim = undefined
            if (callback) {callback()}
        },
        true
    )
}

export function critterDamage(
    obj: Critter,
    damage: number,
    source: Critter,
    useScript = true,
    useAnim = true,
    damageType?: string,
    callback?: () => void
) {
    obj.stats.modifyBase('HP', -damage)
    if (obj.getStat('HP') <= 0) {return critterKill(obj, source, useScript)}

    if (useScript) {
        // Trigger damage_p_proc on the damaged critter's script so scripted effects
        // (e.g. special damage responses, quest triggers) can fire.
        Scripting.damage(obj as any, obj as any, source as any, damage)
    }

    if (useAnim) {
        let hitAnim: string | null = null
        if (source && source.position && obj.position) {
            const dir = hexDirectionTo(source.position, obj.position)
            if (dir !== null) {
                const dirAnims = ['hitFront', 'hitFront', 'hitRight', 'hitBack', 'hitBack', 'hitLeft']
                hitAnim = dirAnims[dir] ?? null
            }
        }
        if (!hitAnim || !obj.hasAnimation(hitAnim)) {
            hitAnim = obj.hasAnimation('hitFront') ? 'hitFront' : null
        }
        if (hitAnim) {
            obj.staticAnimation(hitAnim, () => {
                obj.clearAnim()
                if (callback) {callback()}
            })
        }
    }
}

function critterGetRawStat(obj: Critter, stat: string) {
    return obj.stats.getBase(stat)
}

function critterSetRawStat(obj: Critter, stat: string, amount: number) {
    obj.stats.setBase(stat, amount)
}

function critterGetRawSkill(obj: Critter, skill: string) {
    return obj.skills.getBase(skill)
}

function critterSetRawSkill(obj: Critter, skill: string, amount: number) {
    obj.skills.setBase(skill, amount)
}
