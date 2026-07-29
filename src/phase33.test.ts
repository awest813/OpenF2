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

    it('keeps all critical regions NOT_STARTED until real-asset re-certification', () => {
        // Prior CERTIFIED marks were scaffold-only (see F2_PARITY_ISSUES.md P0-5 /
        // F2_FULL_PARITY_PLAN.md). Regions must stay NOT_STARTED until re-earned
        // under the real-asset certification rule.
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
            expect(criticalPathDoc).toMatch(
                new RegExp(`\\| ${region.replace('/', '\\/')} \\|.*\\| NOT_STARTED \\|`)
            )
        }
        expect(criticalPathDoc).toContain('Real-asset rule')
    })
})

describe('Phase 33-B — blocker and checkpoint gate consistency', () => {
    it('has no OPEN high/critical blockers in the blocker matrix', () => {
        const blockerDoc = readDoc('../docs/F2_BLOCKER_MATRIX.md')
        const openHighOrCritical = blockerDoc.match(/\|\s*BLK-[0-9]+\s*\|\s*(CRITICAL|HIGH)\s*\|[^\n]*\|\s*OPEN\s*\|/g)
        expect(openHighOrCritical).toBeNull()
    })

    it('keeps foundation phase checkpoints 0–8 fully checked', () => {
        // Phases 9–10 were reset pending real-asset certification; allow unchecked
        // boxes only after the Phase 9 heading.
        const checkpointDoc = readDoc('../docs/F2_PHASE_CHECKPOINTS.md')
        const phase9Idx = checkpointDoc.indexOf('## Phase 9 —')
        expect(phase9Idx).toBeGreaterThan(0)
        const foundation = checkpointDoc.slice(0, phase9Idx)
        expect(foundation).not.toContain('- [ ]')
        expect(checkpointDoc).toContain('## Phase 9 —')
        expect(checkpointDoc).toContain('## Phase 10 —')
    })

    it('references the full parity plan as the plan of record', () => {
        const criticalPathDoc = readDoc('../docs/F2_CRITICAL_PATH.md')
        const gateDoc = readDoc('../docs/F2_RELEASE_GATE.md')
        expect(criticalPathDoc).toContain('F2_FULL_PARITY_PLAN.md')
        expect(gateDoc).toContain('F2_FULL_PARITY_PLAN.md')
        expect(gateDoc).toContain('**Status:** `NOT_READY`')
    })
})
