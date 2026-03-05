/**
 * ScriptDebuggerPanel — in-browser script execution inspector.
 *
 * Shows the names and procedure states of scripts that have recently been
 * active, together with the last few `debug_msg` / `display_msg` lines
 * emitted by the scripting runtime.
 *
 * Toggle with F6.  Panel name: 'scriptDebugger'.
 * Z-order 52.
 *
 * Usage:
 *   const panel = new ScriptDebuggerPanel(screenWidth, screenHeight)
 *   uiManager.register(panel)
 *   // Feed messages from the scripting system:
 *   panel.pushMessage('VAULT.int: map_enter_p_proc')
 *   panel.show()
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_AMBER, FALLOUT_DARK_GRAY, FALLOUT_BLACK, UIColor } from './uiPanel.js'

const PANEL_WIDTH  = 260
const PANEL_HEIGHT = 190
const PAD = 8
const LINE_H = 14
const MAX_LOG_LINES = 8

// ---------------------------------------------------------------------------
// ScriptDebuggerPanel
// ---------------------------------------------------------------------------

export class ScriptDebuggerPanel extends UIPanel {
    private _log: string[] = []
    /** Current VM step count, updated by the engine via setVMInfo(). */
    private _stepCount: number = 0
    /** Name of the procedure the VM is currently executing, or null. */
    private _currentProcedure: string | null = null

    constructor(screenWidth: number, screenHeight: number) {
        super('scriptDebugger', {
            x: screenWidth - PANEL_WIDTH - 4,
            y: 130,
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.zOrder = 52
    }

    /**
     * Update the VM execution state shown in the panel header.
     * Call this from the engine after each scripting tick.
     */
    setVMInfo(stepCount: number, currentProcedure: string | null): void {
        this._stepCount = stepCount
        this._currentProcedure = currentProcedure
    }

    /**
     * Append a message to the rolling debug log.
     * Older entries are dropped once the buffer exceeds MAX_LOG_LINES.
     */
    pushMessage(msg: string): void {
        this._log.push(msg)
        if (this._log.length > MAX_LOG_LINES) {
            this._log = this._log.slice(-MAX_LOG_LINES)
        }
    }

    /** Remove all buffered log messages. */
    clearLog(): void {
        this._log.length = 0
    }

    override render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        ctx.globalAlpha = 0.80
        ctx.fillStyle = cssColor(FALLOUT_BLACK)
        ctx.fillRect(0, 0, width, height)
        ctx.globalAlpha = 1.0

        ctx.strokeStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.lineWidth = 1
        ctx.strokeRect(0.5, 0.5, width - 1, height - 1)

        ctx.font = '9px monospace'

        const header: Array<[string, UIColor]> = [
            ['SCRIPT DEBUGGER', FALLOUT_GREEN],
            [`Steps: ${this._stepCount}`, FALLOUT_AMBER],
            [`Proc: ${this._currentProcedure ?? 'none'}`, FALLOUT_AMBER],
            [`Log (${this._log.length}/${MAX_LOG_LINES}):`, FALLOUT_AMBER],
        ]

        for (let i = 0; i < header.length; i++) {
            const [text, color] = header[i]
            ctx.fillStyle = cssColor(color)
            ctx.fillText(text, PAD, PAD + (i + 1) * LINE_H)
        }

        const logStart = PAD + (header.length + 1) * LINE_H
        if (this._log.length === 0) {
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.fillText('(no messages)', PAD, logStart)
        } else {
            for (let i = 0; i < this._log.length; i++) {
                ctx.fillStyle = cssColor(FALLOUT_GREEN)
                ctx.fillText(this._log[i], PAD, logStart + i * LINE_H)
            }
        }
    }

    override onKeyDown(key: string): boolean {
        if (key === 'F6') {
            this.toggle()
            return true
        }
        return false
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cssColor(c: UIColor): string {
    return `rgba(${c.r},${c.g},${c.b},${c.a / 255})`
}
