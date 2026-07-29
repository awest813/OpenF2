import { describe, expect, it } from 'vitest'
import { skillRequiresTarget, Skills } from './skills.js'

describe('skillRequiresTarget', () => {
    it('returns false for Skills.None and Sneak', () => {
        expect(skillRequiresTarget(Skills.None)).toBe(false)
        expect(skillRequiresTarget(Skills.Sneak)).toBe(false)
    })

    it('returns true for target-based Skilldex skills', () => {
        expect(skillRequiresTarget(Skills.Lockpick)).toBe(true)
        expect(skillRequiresTarget(Skills.Repair)).toBe(true)
        expect(skillRequiresTarget(Skills.Steal)).toBe(true)
        expect(skillRequiresTarget(Skills.Traps)).toBe(true)
        expect(skillRequiresTarget(Skills.FirstAid)).toBe(true)
        expect(skillRequiresTarget(Skills.Doctor)).toBe(true)
        expect(skillRequiresTarget(Skills.Science)).toBe(true)
    })
})
