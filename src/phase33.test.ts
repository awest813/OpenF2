/**
 * Phase 33 regression tests.
 *
 * Focus: region-by-region certification scaffolding integrity.
 * These tests validate that critical-path certification artifacts remain
 * structurally complete and internally consistent as work progresses.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

function readDoc(path: string): string {
    return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('Phase 33-A — critical-path checklist integrity', () => {
    it('contains all required Fallout 2 critical regions', () => {
        const criticalPathDoc = readDoc('../docs/F2_CRITICAL_PATH.md')
        const requiredRegions = [
            'Arroyo',
            'Klamath',
            'Den',
            'Modoc',
            'Vault City',
            'Gecko',
            'Broken Hills',
            'New Reno',
            'NCR',
            'Redding',
            'San Francisco',
            'Navarro',
            'Enclave / Oil Rig',
        ]
        for (const region of requiredRegions) {
            expect(criticalPathDoc).toContain(`| ${region} |`)
        }
    })

    it('marks early certified route regions as actively tracked', () => {
        const criticalPathDoc = readDoc('../docs/F2_CRITICAL_PATH.md')
        expect(criticalPathDoc).toMatch(/\| Arroyo \|.*\| (IN_PROGRESS|CERTIFIED) \|/)
        expect(criticalPathDoc).toMatch(/\| Klamath \|.*\| (IN_PROGRESS|CERTIFIED) \|/)
        expect(criticalPathDoc).toMatch(/\| Den \|.*\| (IN_PROGRESS|CERTIFIED) \|/)
    })
})

describe('Phase 33-B — blocker and checkpoint gate consistency', () => {
    it('has no OPEN high/critical blockers in the blocker matrix', () => {
        const blockerDoc = readDoc('../docs/F2_BLOCKER_MATRIX.md')
        const openHighOrCritical = blockerDoc.match(/\|\s*BLK-[0-9]+\s*\|\s*(CRITICAL|HIGH)\s*\|[^\n]*\|\s*OPEN\s*\|/g)
        expect(openHighOrCritical).toBeNull()
    })

    it('has no unchecked boxes in Phase 0-8 checkpoint sections', () => {
        const checkpointDoc = readDoc('../docs/F2_PHASE_CHECKPOINTS.md')
        const prePhase9 = checkpointDoc.split('## Phase 9')[0]
        expect(prePhase9).not.toContain('- [ ]')
    })
})
