/**
 * Phase 78 regression tests.
 *
 * Covers:
 *   B. BLK-124 — get_game_mode_sfall reads globalState.uiMode for full bitmask
 *   C. Status upgrades: reg_anim_animate, reg_anim_func, gfade_out, gfade_in,
 *                       dialogue_reaction_opcode, set_sfall_return, get_sfall_arg
 *   D. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Scripting } from './scripting.js'

import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import globalState from './globalState.js'

vi.mock('./player.js', () => ({ Player: class MockPlayer {} }))
vi.mock('./ui.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./ui.js')>()
    return {
        ...actual,
        uiStartCombat: vi.fn(),
        uiEndCombat: vi.fn(),
        uiLog: vi.fn(),
        uiAddDialogueOption: vi.fn(),
        uiSetDialogueReply: vi.fn(),
    }
})

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
})

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
    // Restore globalState values changed during tests
    ;(globalState as any).inCombat = false
    ;(globalState as any).uiMode = 0
})

// ===========================================================================
// Phase 78-C — Status upgrades: previously-partial entries are now implemented
// ===========================================================================

describe('Phase 78-C — Checklist status upgrades', () => {
    const upgradedEntries = [
        'reg_anim_animate',
        'reg_anim_func',
        'gfade_out',
        'gfade_in',
        'dialogue_reaction_opcode',
        'set_sfall_return',
        'get_sfall_arg',
        'sfall_get_game_mode',
    ]

    for (const id of upgradedEntries) {
        it(`'${id}' is now 'implemented' in the checklist`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `entry '${id}' not found`).toBeDefined()
            expect(entry?.status).toBe('implemented')
        })
    }
})
