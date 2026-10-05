import { describe, expect, it } from 'vitest'
import { describeAttack, damageFlagsText, type AttackReport } from './combatMessages.js'
import { Dam } from './criticalTables.js'

const you = { isPlayer: true, gender: 'male' }
const raider = { isPlayer: false, name: 'Raider', getStat: () => 0 }

function report(o: Partial<AttackReport>): AttackReport {
    return {
        attacker: you, defender: raider, hit: true, critical: false, region: 'torso',
        defenderDamage: 0, defenderFlags: 0, defenderDied: false,
        attackerDamage: 0, attackerFlags: 0, extras: [], ...o,
    }
}

describe('combat display messages (combat.cc _combat_display)', () => {
    it('plain hits use the damage-amount lines', () => {
        expect(describeAttack(report({ defenderDamage: 12 }))).toEqual(['Raider was hit for 12 hit points.'])
        expect(describeAttack(report({ defenderDamage: 1 }))).toEqual(['Raider was hit for 1 hit point.'])
        expect(describeAttack(report({ defenderDamage: 0 }))).toEqual(['Raider was hit for no damage.'])
        expect(describeAttack(report({ attacker: raider, defender: you, defenderDamage: 7 }))).toEqual(['You were hit for 7 hit points.'])
    })

    it('aimed hits name the body part; criticals say so', () => {
        expect(describeAttack(report({ region: 'eyes', defenderDamage: 9 }))).toEqual(['Raider was hit in the eyes for 9 hit points.'])
        expect(describeAttack(report({ region: 'head', critical: true, defenderDamage: 20 }))).toEqual(['Raider was critically hit in the head for 20 hit points.'])
    })

    it('kills and result flags are appended', () => {
        expect(describeAttack(report({ defenderDamage: 30, defenderDied: true }))).toEqual(['Raider was hit for 30 hit points and was killed.'])
        expect(damageFlagsText(raider, Dam.KNOCKED_DOWN | Dam.CRIP_LEG_LEFT)).toBe(', was knocked down and crippled the left leg')
    })

    it('misses, critical misses and stray hits', () => {
        expect(describeAttack(report({ hit: false }))).toEqual(['You missed.'])
        expect(describeAttack(report({ hit: false, attacker: raider }))).toEqual(['Raider missed.'])
        expect(describeAttack(report({ hit: false, critical: true, attackerFlags: Dam.LOSE_TURN }))).toEqual(['You critically missed and lost your next turn.'])
        const bystander = { isPlayer: false, name: 'Brahmin', getStat: () => 0 }
        expect(describeAttack(report({ defender: bystander, oops: raider, defenderDamage: 5 }))).toEqual([
            'Oops! Brahmin was hit instead of Raider.',
            'Brahmin was hit for 5 hit points.',
        ])
    })
})
