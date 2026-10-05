/**
 * Player derived stats, skills and level-up against the Fallout 2 engine
 * (stat.cc critterUpdateDerivedStats, skill.cc, character_editor.cc).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { applyCharacterCreation, defaultCharacterCreation } from '../character/chargen.js'
import { awardCritterXp } from '../character/xp.js'
import { PerkId } from '../character/perkIds.js'
import { Player } from '../player.js'
import globalState from '../globalState.js'
import { SkillSet } from '../char.js'

function makeHero(special: Partial<Record<'STR' | 'PER' | 'END' | 'CHA' | 'INT' | 'AGI' | 'LUK', number>> = {}, traits: number[] = []): Player {
    const p = new (Player as any)() as Player
    const data = defaultCharacterCreation()
    data.special = { STR: 6, PER: 6, END: 6, CHA: 6, INT: 6, AGI: 5, LUK: 5, ...special }
    data.taggedSkills = ['Small Guns', 'Speech', 'Lockpick'] as any
    data.traitIds = traits
    const r = applyCharacterCreation(data, p)
    expect(r.ok).toBe(true)
    return p
}

describe('derived stats after character creation', () => {
    beforeEach(() => {
        globalState.playerPerksOwed = 0
    })

    it('Max HP = 15 + STR + 2×END, and HP starts full', () => {
        const p = makeHero()
        expect(p.getStat('Max HP')).toBe(15 + 6 + 12)
        expect(p.getStat('HP')).toBe(33)
    })

    it('AP = 5 + AGI/2, AC = AGI, Melee = max(STR−5, 1), Carry = 25 + 25×STR', () => {
        const p = makeHero({ AGI: 7, STR: 8, CHA: 3, INT: 5 })
        expect(p.getStat('AP')).toBe(8)
        expect(p.getStat('AC')).toBe(7)
        expect(p.getStat('Melee')).toBe(3)
        expect(p.getStat('Carry')).toBe(225)
        expect(p.getStat('Sequence')).toBe(12)
        expect(p.getStat('Critical Chance')).toBe(5)
    })

    it('skills use the engine defaults (Gambling = 5×LUK, tagged +20)', () => {
        const p = makeHero({ LUK: 7, CHA: 4 })
        expect(p.getSkill('Gambling')).toBe(35)
        expect(p.getSkill('Small Guns')).toBe(5 + 4 * 5 + 20)
        expect(p.getSkill('Speech')).toBe(5 * 4 + 20)
    })

    it('trait stat modifiers apply on read (trait.cc)', () => {
        const bruiser = makeHero({}, [1 /* Bruiser */])
        expect(bruiser.getStat('STR')).toBe(8)
        expect(bruiser.getStat('AP')).toBe(5 + 2 - 2)

        const kamikaze = makeHero({}, [5 /* Kamikaze */])
        expect(kamikaze.getStat('AC')).toBe(0)
        expect(kamikaze.getStat('Sequence')).toBe(12 + 5)

        const heavy = makeHero({}, [6 /* Heavy Handed */])
        expect(heavy.getStat('Melee')).toBe(1 + 4)
        expect(heavy.getStat('Better Criticals')).toBe(-30)

        const small = makeHero({}, [2 /* Small Frame */])
        expect(small.getStat('Carry')).toBe(25 + 25 * 6 - 10 * 6)

        const finesse = makeHero({}, [4 /* Finesse */])
        expect(finesse.getStat('Critical Chance')).toBe(5 + 10)

        const fm = makeHero({}, [0 /* Fast Metabolism */])
        expect(fm.getStat('Healing Rate')).toBe(2 + 2)
        expect(fm.getStat('DR Radiation')).toBe(0)
        expect(fm.getStat('DR Poison')).toBe(0)
    })

    it('perk stat bonuses apply per rank', () => {
        const p = makeHero()
        p.perkRanks[PerkId.ACTION_BOY] = 2
        p.perkRanks[PerkId.TOUGHNESS] = 3
        p.perkRanks[PerkId.MORE_CRITICALS] = 1
        p.perkRanks[PerkId.STRONG_BACK] = 1
        p.perkRanks[PerkId.DODGER] = 1
        p.perkRanks[PerkId.GAIN_AGILITY] = 1
        expect(p.getStat('AGI')).toBe(6)
        expect(p.getStat('AP')).toBe(5 + 3 + 2)
        expect(p.getStat('DR Normal')).toBe(30)
        expect(p.getStat('Critical Chance')).toBe(10)
        expect(p.getStat('Carry')).toBe(175 + 50)
        expect(p.getStat('AC')).toBe(6 + 5)
    })

    it('perk skill bonuses apply to the player', () => {
        const p = makeHero()
        const before = p.getSkill('Repair')
        p.perkRanks[PerkId.MR_FIXIT] = 1
        expect(p.getSkill('Repair')).toBe(before + 10)
    })

    it('overloading costs AP', () => {
        const p = makeHero({ STR: 4, CHA: 7, INT: 7 })
        p.inventory = [{ type: 'item', weight: 140, amount: 1 } as any]
        // limit 125, carrying 140 → −(15/40 + 1) = −1
        expect(p.getStat('AP')).toBe(7 - 1)
    })
})

describe('NPC skills from protos', () => {
    it('proto skill points add to the default and stat bonus', () => {
        const skills = SkillSet.fromPro({ 'Small Guns': 40, Melee: 10 })
        expect(skills.getBase('Small Guns')).toBe(45)
        expect(skills.getBase('Melee Weapons')).toBe(30)
    })
})

describe('level-up (character_editor.cc / stat.cc)', () => {
    beforeEach(() => {
        globalState.playerPerksOwed = 0
    })

    it('awards 5 + 2×INT skill points and END/2 + 2 Max HP', () => {
        const p = makeHero({ INT: 6, END: 6 })
        p.skills.skillPoints = 0
        globalState.player = p
        awardCritterXp(p as any, 1000, { syncEcs: false, applyPartyTiers: false })
        expect(p.level).toBe(2)
        expect(p.skills.skillPoints).toBe(5 + 12)
        expect(p.getStat('Max HP')).toBe(33 + 5)
        expect(p.getStat('HP')).toBe(33 + 5)
    })

    it('Skilled adds 5 points and delays perks to every 4th level', () => {
        const p = makeHero({ INT: 6 }, [14 /* Skilled */])
        p.skills.skillPoints = 0
        globalState.player = p
        awardCritterXp(p as any, 3000, { syncEcs: false, applyPartyTiers: false })
        expect(p.level).toBe(3)
        expect(p.skills.skillPoints).toBe(2 * (5 + 12 + 5))
        expect(globalState.playerPerksOwed).toBe(0)
        awardCritterXp(p as any, 3000, { syncEcs: false, applyPartyTiers: false })
        expect(p.level).toBe(4)
        expect(globalState.playerPerksOwed).toBe(1)
    })

    it('Swift Learner adds 5% XP per rank', () => {
        const p = makeHero()
        globalState.player = p
        p.perkRanks[PerkId.SWIFT_LEARNER] = 2
        awardCritterXp(p as any, 100, { syncEcs: false, applyPartyTiers: false })
        expect(p.xp).toBe(110)
    })
})
