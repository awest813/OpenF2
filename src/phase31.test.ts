/**
 * Phase 31 regression tests.
 *
 * Focus: quest consequences (reputation/karma/global vars) and persistence of
 * consequence-driven dialogue/quest gates across save/load.
 */

import { describe, it, expect } from 'vitest'
import { Reputation } from './quest/reputation.js'
import { migrateSave, SAVE_VERSION, SaveGame } from './saveSchema.js'

const GVAR_NCR_PERMIT_GRANTED = 7001
const GVAR_GECKO_REACTOR_FIXED = 7002
const GVAR_BROKEN_HILLS_PEACE_PATH = 7003

class ConsequenceHarness {
    readonly reputation = new Reputation()
    scriptGlobalVars: Record<number, number> = {}

    applyGeckoReactorFix(): void {
        this.scriptGlobalVars[GVAR_GECKO_REACTOR_FIXED] = 1
        this.reputation.addKarma(15)
        this.reputation.changeReputation('VaultCity', 2)
    }

    applyNcrPermitGrant(): void {
        this.scriptGlobalVars[GVAR_NCR_PERMIT_GRANTED] = 1
        this.reputation.changeReputation('NCR', 1)
    }

    applyBrokenHillsPeacePath(): void {
        this.scriptGlobalVars[GVAR_BROKEN_HILLS_PEACE_PATH] = 1
        this.reputation.addKarma(10)
        this.reputation.changeReputation('BrokenHills', 2)
    }

    applyMassacreOutcome(): void {
        this.reputation.addKarma(-50)
        this.reputation.changeReputation('NCR', -3)
        this.reputation.changeReputation('VaultCity', -3)
    }

    canUnlockNcrDiplomaticDialogue(): boolean {
        return (this.scriptGlobalVars[GVAR_NCR_PERMIT_GRANTED] ?? 0) === 1
            && this.reputation.getReputation('NCR') > 0
            && this.reputation.getKarma() >= -100
    }

    canUnlockVaultCityTrustBranch(): boolean {
        return (this.scriptGlobalVars[GVAR_GECKO_REACTOR_FIXED] ?? 0) === 1
            && this.reputation.getReputation('VaultCity') >= 2
    }

    canUnlockBrokenHillsPeaceEndingNode(): boolean {
        return (this.scriptGlobalVars[GVAR_BROKEN_HILLS_PEACE_PATH] ?? 0) === 1
            && this.reputation.getReputation('BrokenHills') >= 2
            && this.reputation.getKarma() >= 0
    }

    toSave(name = 'phase31'): SaveGame {
        return {
            version: SAVE_VERSION,
            name,
            timestamp: 123,
            currentMap: 'ncr',
            currentElevation: 0,
            worldPosition: { x: 0, y: 0 },
            scriptGlobalVars: { ...this.scriptGlobalVars },
            gameTickTime: 0,
            critterKillCounts: {},
            mapVars: {},
            mapAreaStates: {},
            playerCharTraits: [],
            playerPerkRanks: {},
            player: {
                position: { x: 0, y: 0 },
                orientation: 0,
                inventory: [],
                xp: 0,
                level: 1,
                karma: this.reputation.getKarma(),
            },
            party: [],
            savedMaps: {},
            questLog: { entries: [] },
            reputation: this.reputation.serialize(),
        }
    }

    static fromSave(raw: Record<string, any>): ConsequenceHarness {
        const save = migrateSave(raw)
        const h = new ConsequenceHarness()
        h.scriptGlobalVars = { ...(save.scriptGlobalVars ?? {}) }
        h.reputation.setKarma(save.reputation?.karma ?? 0)
        for (const [name, value] of Object.entries(save.reputation?.reputations ?? {})) {
            h.reputation.setReputation(name, value)
        }
        return h
    }
}

describe('Phase 31-A — consequence-driven gate evaluation', () => {
    it('starts with all consequence gates closed', () => {
        const h = new ConsequenceHarness()
        expect(h.canUnlockNcrDiplomaticDialogue()).toBe(false)
        expect(h.canUnlockVaultCityTrustBranch()).toBe(false)
        expect(h.canUnlockBrokenHillsPeaceEndingNode()).toBe(false)
    })

    it('Gecko reactor fix opens Vault City trust branch', () => {
        const h = new ConsequenceHarness()
        h.applyGeckoReactorFix()
        expect(h.canUnlockVaultCityTrustBranch()).toBe(true)
    })

    it('NCR permit + positive NCR reputation opens NCR diplomatic dialogue', () => {
        const h = new ConsequenceHarness()
        h.applyNcrPermitGrant()
        expect(h.canUnlockNcrDiplomaticDialogue()).toBe(true)
    })

    it('massacre outcome can revoke previously unlocked NCR dialogue gate', () => {
        const h = new ConsequenceHarness()
        h.applyNcrPermitGrant()
        expect(h.canUnlockNcrDiplomaticDialogue()).toBe(true)

        h.applyMassacreOutcome()
        expect(h.canUnlockNcrDiplomaticDialogue()).toBe(false)
    })

    it('Broken Hills peace gate requires both quest path global and non-negative karma', () => {
        const h = new ConsequenceHarness()
        h.applyBrokenHillsPeacePath()
        expect(h.canUnlockBrokenHillsPeaceEndingNode()).toBe(true)

        h.applyMassacreOutcome()
        expect(h.canUnlockBrokenHillsPeaceEndingNode()).toBe(false)
    })
})

describe('Phase 31-B — save/load persistence of consequence gates', () => {
    it('preserves cross-town consequence gates across save/load', () => {
        const h = new ConsequenceHarness()
        h.applyGeckoReactorFix()
        h.applyNcrPermitGrant()
        h.applyBrokenHillsPeacePath()

        const loaded = ConsequenceHarness.fromSave(JSON.parse(JSON.stringify(h.toSave('consequence-roundtrip'))))

        expect(loaded.canUnlockVaultCityTrustBranch()).toBe(true)
        expect(loaded.canUnlockNcrDiplomaticDialogue()).toBe(true)
        expect(loaded.canUnlockBrokenHillsPeaceEndingNode()).toBe(true)
    })

    it('preserves revoked-gate outcomes across save/load', () => {
        const h = new ConsequenceHarness()
        h.applyGeckoReactorFix()
        h.applyNcrPermitGrant()
        h.applyMassacreOutcome()

        const loaded = ConsequenceHarness.fromSave(JSON.parse(JSON.stringify(h.toSave('consequence-revoked'))))

        expect(loaded.canUnlockVaultCityTrustBranch()).toBe(false)
        expect(loaded.canUnlockNcrDiplomaticDialogue()).toBe(false)
    })
})
