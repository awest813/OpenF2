/**
 * Ending-slide selection (parity P1-8).
 *
 * Parses FO2-style ENDGAME.TXT rows (`gvar, value, imageIndex, narrId`) and
 * selects matching slides from script globals. Plays through the existing
 * CinematicPlayer when one is registered; otherwise emits EventBus events so
 * UI / main-menu handoff can listen.
 */

import { EventBus } from './eventBus.js'
import type { CinematicPlayer, CinematicSequence, CinematicSlide } from './cinematic.js'
import { getFileText } from './util.js'

export interface EndgameRow {
    gvar: number
    value: number
    imageIndex: number
    narrId: string
    /** Optional display caption (asset-free paraphrase / placeholder). */
    caption?: string
}

export interface SelectedEndingSlide extends EndgameRow {
    matched: true
}

/** FO2 GVAR_ENDGAME_MOVIE_* indices (VAULT13.GAM). */
export const ENDGAME_MOVIE_GVARS = {
    arroyo: 408,
    modoc: 409,
    den: 410,
    vault_city: 411,
    reno: 412,
    reno_add1: 413,
    reno_add2: 414,
    reno_add3: 415,
    reno_add4: 416,
    gecko: 417,
    redding: 418,
    broken_hills: 419,
    ncr: 420,
    vault_15: 421,
    vault_13: 422,
    san_fran_shi: 423,
    san_fran_elron: 424,
    san_fran_punks: 425,
} as const

/**
 * Built-in ending table used when `data/data/endgame.txt` is absent.
 * Captions are short placeholders (not FO2 narration text).
 * Values match common FO2 ending-state encodings (1 = primary good / default).
 */
export const BUILTIN_ENDGAME_ROWS: EndgameRow[] = [
    { gvar: 408, value: 1, imageIndex: 1, narrId: 'NAR_AR1', caption: 'Arroyo — new village rises after the Enclave.' },
    { gvar: 408, value: 2, imageIndex: 2, narrId: 'NAR_AR2', caption: 'Arroyo — a darker fate for the tribe.' },
    { gvar: 409, value: 1, imageIndex: 3, narrId: 'NAR_MO4', caption: 'Modoc — peace with the Slags.' },
    { gvar: 409, value: 2, imageIndex: 4, narrId: 'NAR_MO2', caption: 'Modoc — war with the Slags.' },
    { gvar: 410, value: 1, imageIndex: 5, narrId: 'NAR_DE2', caption: 'The Den — slavery ends.' },
    { gvar: 410, value: 2, imageIndex: 6, narrId: 'NAR_DE1', caption: 'The Den — collapses without an economy.' },
    { gvar: 411, value: 1, imageIndex: 7, narrId: 'NAR_VC1', caption: 'Vault City — opens to the outside.' },
    { gvar: 417, value: 1, imageIndex: 8, narrId: 'NAR_GE1', caption: 'Gecko — reactor secured.' },
    { gvar: 419, value: 1, imageIndex: 9, narrId: 'NAR_BH1', caption: 'Broken Hills — unity holds.' },
    { gvar: 420, value: 1, imageIndex: 10, narrId: 'NAR_NCR1', caption: 'NCR — the republic expands.' },
    { gvar: 422, value: 1, imageIndex: 11, narrId: 'NAR_V13', caption: 'Vault 13 — survivors find a new home.' },
]

let endgameRows: EndgameRow[] | null = null
let cinematicPlayer: CinematicPlayer | null = null
let lastSequence: CinematicSequence | null = null

/** Register a CinematicPlayer used by signalEndGame (optional). */
export function setEndgameCinematicPlayer(player: CinematicPlayer | null): void {
    cinematicPlayer = player
}

export function getEndgameCinematicPlayer(): CinematicPlayer | null {
    return cinematicPlayer
}

export function resetEndgameTable(): void {
    endgameRows = null
}

/**
 * Parse ENDGAME.TXT contents. Lines: `gvar, value, imageIndex, narrId` with optional `#` comments.
 */
export function parseEndgameTxt(text: string): EndgameRow[] {
    const rows: EndgameRow[] = []
    if (!text || typeof text !== 'string') return rows
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.replace(/#.*$/, '').trim()
        if (!line) continue
        const parts = line.split(',').map((p) => p.trim())
        if (parts.length < 4) continue
        const gvar = parseInt(parts[0], 10)
        const value = parseInt(parts[1], 10)
        const imageIndex = parseInt(parts[2], 10)
        const narrId = parts[3]
        if (![gvar, value, imageIndex].every((n) => Number.isFinite(n)) || !narrId) continue
        rows.push({ gvar, value, imageIndex, narrId })
    }
    return rows
}

/** Load endgame table from assets, falling back to built-in rows. */
export function loadEndgameTable(): EndgameRow[] {
    if (endgameRows) return endgameRows
    try {
        const text = getFileText('data/data/endgame.txt')
        if (text) {
            const parsed = parseEndgameTxt(text)
            if (parsed.length > 0) {
                endgameRows = parsed
                return endgameRows
            }
        }
    } catch {
        // asset missing — use builtin
    }
    endgameRows = BUILTIN_ENDGAME_ROWS.map((r) => ({ ...r }))
    return endgameRows
}

export function setEndgameTableForTests(rows: EndgameRow[]): void {
    endgameRows = rows.map((r) => ({ ...r }))
}

/**
 * Select ending slides whose (gvar, value) match the current global-var table.
 * Preserves ENDGAME.TXT order (FO2 behaviour).
 */
export function selectEndingSlides(
    gvars: Record<number, unknown> | null | undefined,
    rows: EndgameRow[] = loadEndgameTable()
): SelectedEndingSlide[] {
    const selected: SelectedEndingSlide[] = []
    if (!rows.length) return selected
    for (const row of rows) {
        const raw = gvars?.[row.gvar]
        const current = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 0
        if (current === row.value) {
            selected.push({ ...row, matched: true })
        }
    }
    return selected
}

export function endingSlidesToCinematic(
    slides: SelectedEndingSlide[],
    opts: { id?: string; durationMs?: number; onComplete?: () => void } = {}
): CinematicSequence {
    const duration = opts.durationMs ?? 3500
    const cinematicSlides: CinematicSlide[] = slides.map((s) => ({
        imagePath: null,
        backgroundColor: '#0a0a08',
        caption: s.caption ?? `[${s.narrId}]`,
        duration,
    }))
    // Always append a credits beat so handoff has a terminal slide.
    cinematicSlides.push({
        imagePath: null,
        backgroundColor: '#000000',
        caption: 'Credits — thank you for playing.',
        duration: opts.durationMs ?? 4000,
    })
    return {
        id: opts.id ?? 'endgame',
        slides: cinematicSlides,
        onComplete: () => {
            EventBus.emit('endgame:credits', { slideCount: slides.length })
            EventBus.emit('endgame:returnToMenu', {})
            opts.onComplete?.()
        },
    }
}

export interface EndGameResult {
    reason: number
    slides: SelectedEndingSlide[]
    sequence: CinematicSequence
    played: boolean
}

/**
 * METARULE_SIGNAL_END_GAME / endgame slideshow entry point.
 * `reason` is forwarded for logging (FO2 uses it for death vs victory paths).
 */
export function signalEndGame(
    reason: number,
    gvars: Record<number, unknown>,
    opts: { play?: boolean } = {}
): EndGameResult {
    const slides = selectEndingSlides(gvars)
    const sequence = endingSlidesToCinematic(slides, {
        id: reason === 0 ? 'endgame_victory' : `endgame_${reason}`,
    })
    lastSequence = sequence
    EventBus.emit('endgame:start', {
        reason,
        slideCount: slides.length,
        narrIds: slides.map((s) => s.narrId),
    })

    const shouldPlay = opts.play !== false
    let played = false
    if (shouldPlay && cinematicPlayer && sequence.slides.length > 0) {
        cinematicPlayer.play(sequence)
        played = true
    } else if (shouldPlay) {
        // No player registered — still fire credits/menu handoff for listeners.
        EventBus.emit('endgame:credits', { slideCount: slides.length })
        EventBus.emit('endgame:returnToMenu', {})
    }

    return { reason, slides, sequence, played }
}

export function getLastEndgameSequence(): CinematicSequence | null {
    return lastSequence
}
