/**
 * The numbers Fallout 2 draws on the mouse cursor (game_mouse.cc):
 * the AP a move costs on the hex cursor, and the chance to hit next to the
 * crosshair.
 */

/** game_mouse.cc colour-table entries, as RGB555 → CSS. */
function rgb555(index: number): string {
    const r = (index >> 10) & 31
    const g = (index >> 5) & 31
    const b = index & 31
    const to8 = (v: number) => Math.round((v * 255) / 31)
    return `rgb(${to8(r)}, ${to8(g)}, ${to8(b)})`
}

export const CURSOR_WHITE = rgb555(32767)
export const CURSOR_RED = rgb555(31744)
const ALLY_OK = rgb555(32495)
const OBJECT_OK = rgb555(17969)
const ALLY_BAD = rgb555(18161)
const OBJECT_BAD = rgb555(32239)

export interface CursorLabel {
    text: string
    color: string
}

/**
 * gameMouseRenderActionPoints: no path is a red X; out of combat a
 * reachable hex shows nothing; in combat the AP the walk costs beyond the
 * free move, or a red X when that is more than is left.
 */
export function moveCostLabel(opts: {
    inCombat: boolean
    pathLength: number
    moveCost: number
    freeMove: number
    actionPoints: number
}): CursorLabel {
    if (opts.pathLength <= 0) {return { text: 'X', color: CURSOR_RED }}
    if (!opts.inCombat) {return { text: '', color: CURSOR_RED }}
    const required = Math.max(0, opts.moveCost - opts.freeMove)
    if (required <= opts.actionPoints) {return { text: String(required), color: CURSOR_WHITE }}
    return { text: 'X', color: CURSOR_RED }
}

/**
 * The crosshair readout: "NN%" when the shot is possible, " X " when not.
 * Critters off the player's team read white / red, teammates in the
 * friendly colours, other objects grey.
 */
export function accuracyLabel(opts: {
    accuracy: number | null
    isCritter: boolean
    team: number
}): CursorLabel {
    const ok = opts.accuracy !== null
    let color: string
    if (opts.isCritter) {
        color = opts.team !== 0 ? (ok ? CURSOR_WHITE : CURSOR_RED) : (ok ? ALLY_OK : ALLY_BAD)
    } else {
        color = ok ? OBJECT_OK : OBJECT_BAD
    }
    return { text: ok ? `${opts.accuracy}%` : ' X ', color }
}
