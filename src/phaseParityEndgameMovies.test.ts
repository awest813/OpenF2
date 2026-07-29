/**
 * Parity P1-8 / P1-9 — endgame slide selection + movie playback stubs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    parseEndgameTxt,
    selectEndingSlides,
    endingSlidesToCinematic,
    signalEndGame,
    setEndgameTableForTests,
    resetEndgameTable,
    BUILTIN_ENDGAME_ROWS,
    ENDGAME_MOVIE_GVARS,
} from './endgame.js'
import { playMovie, resolveMovie, FO2_MOVIE_CATALOG, getLastMovieId } from './movies.js'
import { EventBus } from './eventBus.js'
import { Scripting } from './scripting.js'
import {
    chemUseHpRatioThreshold,
    bestWeaponSuppressesBurst,
    normalizeChemUse,
} from './combatAi.js'

describe('Parity P1-8 — ENDGAME.TXT selection', () => {
    beforeEach(() => {
        resetEndgameTable()
    })

    afterEach(() => {
        resetEndgameTable()
    })

    it('parses gvar,value,image,narr lines and ignores comments', () => {
        const rows = parseEndgameTxt(`
# comment
408, 1, 10, NAR_AR1
410, 2, 11, NAR_DE1  # den bad
not-a-row
`)
        expect(rows).toHaveLength(2)
        expect(rows[0]).toEqual({ gvar: 408, value: 1, imageIndex: 10, narrId: 'NAR_AR1' })
        expect(rows[1].narrId).toBe('NAR_DE1')
    })

    it('selectEndingSlides keeps file order for matching GVARs', () => {
        setEndgameTableForTests([
            { gvar: 408, value: 1, imageIndex: 1, narrId: 'A' },
            { gvar: 410, value: 1, imageIndex: 2, narrId: 'B' },
            { gvar: 408, value: 2, imageIndex: 3, narrId: 'C' },
        ])
        const slides = selectEndingSlides({ 408: 1, 410: 1 })
        expect(slides.map((s) => s.narrId)).toEqual(['A', 'B'])
    })

    it('builtin table includes Arroyo/Modoc/Den movie GVARs', () => {
        expect(BUILTIN_ENDGAME_ROWS.some((r) => r.gvar === ENDGAME_MOVIE_GVARS.arroyo)).toBe(true)
        expect(BUILTIN_ENDGAME_ROWS.some((r) => r.gvar === ENDGAME_MOVIE_GVARS.den)).toBe(true)
    })

    it('endingSlidesToCinematic appends credits slide', () => {
        const seq = endingSlidesToCinematic([
            { gvar: 408, value: 1, imageIndex: 1, narrId: 'NAR_AR1', matched: true, caption: 'Arroyo' },
        ])
        expect(seq.slides.length).toBe(2)
        expect(seq.slides[1].caption).toMatch(/Credits/i)
    })

    it('signalEndGame emits start/credits/menu events', () => {
        setEndgameTableForTests([
            { gvar: 408, value: 1, imageIndex: 1, narrId: 'NAR_AR1', caption: 'Arroyo ok' },
        ])
        const starts: any[] = []
        const credits: any[] = []
        const menus: any[] = []
        EventBus.on('endgame:start', (p) => starts.push(p))
        EventBus.on('endgame:credits', (p) => credits.push(p))
        EventBus.on('endgame:returnToMenu', (p) => menus.push(p))

        const result = signalEndGame(0, { 408: 1 }, { play: true })
        expect(result.slides).toHaveLength(1)
        expect(starts[0].narrIds).toEqual(['NAR_AR1'])
        expect(credits).toHaveLength(1)
        expect(menus).toHaveLength(1)

        EventBus.offAll('endgame:start')
        EventBus.offAll('endgame:credits')
        EventBus.offAll('endgame:returnToMenu')
    })

    it('metarule(1) triggers endgame selection', () => {
        setEndgameTableForTests([
            { gvar: 410, value: 2, imageIndex: 1, narrId: 'NAR_DE1' },
        ])
        const script = new (Scripting as any).Script()
        Scripting.setGlobalVars({ 410: 2 })
        const spy = vi.fn()
        EventBus.on('endgame:start', spy)
        script.metarule(1, 0)
        expect(spy).toHaveBeenCalled()
        EventBus.offAll('endgame:start')
    })
})

describe('Parity P1-9 — movie playback stub', () => {
    it('resolves known FO2 movie IDs', () => {
        expect(resolveMovie(1).id).toBe('intro')
        expect(FO2_MOVIE_CATALOG[0].title).toMatch(/Interplay/i)
        expect(resolveMovie(99).id).toBe('movie_99')
    })

    it('playMovie emits movie:play and movie:end', () => {
        const plays: any[] = []
        const ends: any[] = []
        EventBus.on('movie:play', (p) => plays.push(p))
        EventBus.on('movie:end', (p) => ends.push(p))
        const result = playMovie(1)
        expect(result.def.id).toBe('intro')
        expect(plays[0].movieId).toBe('intro')
        expect(ends[0].movieId).toBe('intro')
        expect(getLastMovieId()).toBe(1)
        EventBus.offAll('movie:play')
        EventBus.offAll('movie:end')
    })

    it('play_gmovie and metarule(5) invoke playMovie', () => {
        const plays: any[] = []
        EventBus.on('movie:play', (p) => plays.push(p))
        const script = new (Scripting as any).Script()
        script.play_gmovie(2)
        script.metarule(5, 9)
        expect(plays.map((p) => p.movieId)).toEqual(['elder', 'enclave'])
        EventBus.offAll('movie:play')
    })
})

describe('Parity P1-1 — chem_use / best_weapon helpers', () => {
    it('chemUseHpRatioThreshold maps modes', () => {
        expect(chemUseHpRatioThreshold('clean')).toBeNull()
        expect(chemUseHpRatioThreshold('stims_when_hurt_lots')).toBe(0.35)
        expect(normalizeChemUse('ALWAYS')).toBe('always')
    })

    it('bestWeaponSuppressesBurst for melee prefs', () => {
        expect(bestWeaponSuppressesBurst('melee')).toBe(true)
        expect(bestWeaponSuppressesBurst('unarmed')).toBe(true)
        expect(bestWeaponSuppressesBurst('ranged')).toBe(false)
    })
})
