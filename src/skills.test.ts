import { describe, expect, it } from 'vitest'
import { skillRequiresTarget, Skills } from './skills.js'

describe('skillRequiresTarget', () => {
    it('returns false for Skills.None', () => {
        expect(skillRequiresTarget(Skills.None)).toBe(false)
    })

    it('returns true for target-based skills', () => {
        expect(skillRequiresTarget(Skills.Lockpick)).toBe(true)
        expect(skillRequiresTarget(Skills.Repair)).toBe(true)
    })
})
