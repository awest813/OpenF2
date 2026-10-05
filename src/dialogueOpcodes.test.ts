import { describe, it, expect, vi, beforeEach } from 'vitest'

const shown: { replies: string[]; options: string[]; ids: number[] } = { replies: [], options: [], ids: [] }

vi.mock('./ui.js', async (orig) => ({
    ...(await orig<typeof import('./ui.js')>()),
    uiAddDialogueOption: (msg: string, id: number) => { shown.options.push(msg); shown.ids.push(id) },
    uiSetDialogueReply: (msg: string) => { shown.replies.push(msg) },
    uiStartDialogue: () => {},
    uiEndDialogue: () => {},
}))

const { Scripting } = await import('./scripting.js')
const { default: globalState } = await import('./globalState.js')

describe('dialogue opcodes (game_dialog.cc)', () => {
    beforeEach(() => {
        shown.replies.length = 0
        shown.options.length = 0
        shown.ids.length = 0
    })

    it('giq_option counts Smooth Talker as extra Intelligence', () => {
        const script: any = new (Scripting as any).Script()
        const saved = globalState.player
        globalState.player = { getStat: (s: string) => (s === 'INT' ? 4 : 0), perkRanks: { 49: 1 } } as any
        script.giq_option(5, 0, 'Clever line', () => {}, 50) // 4 + 1 meets 5
        script.giq_option(6, 0, 'Too clever', () => {}, 50)
        script.giq_option(-4, 0, 'Dumb line', () => {}, 50) // 5 > 4: hidden
        globalState.player = saved
        expect(shown.options).toEqual(['Clever line'])
    })

    it('gsay_message shows the line with a Done option that carries on', () => {
        const script: any = new (Scripting as any).Script()
        script.self_obj = { _type: 'obj', type: 'critter', _script: script }
        script.start_gdialog(0, script.self_obj, 4, -1, -1)
        let resumed = 0
        expect(script.gsay_message(0, 'Go away.', 50, () => { resumed++ })).toBe(true)
        expect(shown.replies).toContain('Go away.')
        expect(shown.options).toHaveLength(1)
        Scripting.dialogueReply(shown.ids[0])
        expect(resumed).toBe(1)
    })
})
