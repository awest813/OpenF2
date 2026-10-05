import { describe, it, expect, vi } from 'vitest'

const protos: Record<number, any> = {
    0x00000009: {
        textID: 900, frmType: 0, frmPID: 0x12, lightRadius: 2, lightIntensity: 3, flags: 0x10,
        extra: { itemFlags: 1, actionFlags: 2, weaponFlags: 3, attackMode: 0x21, scriptID: -1, subType: 3,
            materialID: 1, size: 4, weight: 7, cost: 250, invFRM: 77, maxRange1: 30 },
    },
    0x01000010: { textID: 100, frmType: 1, frmPID: 5, flags: 0, extra: { actionFlags: 0x40, scriptID: 12, headFID: 99, bodyType: 1 } },
}

vi.mock('./pro.js', async (orig) => ({
    ...(await orig<typeof import('./pro.js')>()),
    loadPRO: (pid: number) => protos[pid] ?? null,
}))

const { Scripting } = await import('./scripting.js')

/** protoGetDataMember: members are numbered per proto type. */
describe('proto_data (proto.cc protoGetDataMember)', () => {
    const script: any = new (Scripting as any).Script()

    it('item members', () => {
        const pid = 0x00000009
        expect(script.proto_data(pid, 0)).toBe(pid)
        expect(script.proto_data(pid, 3)).toBe(0x12)
        expect(script.proto_data(pid, 4)).toBe(2)
        expect(script.proto_data(pid, 6)).toBe(0x10)
        expect(script.proto_data(pid, 7)).toBe(0x01020321)
        expect(script.proto_data(pid, 9)).toBe(3)
        expect(script.proto_data(pid, 11)).toBe(1)
        expect(script.proto_data(pid, 12)).toBe(4)
        expect(script.proto_data(pid, 13)).toBe(7)
        expect(script.proto_data(pid, 14)).toBe(250)
        expect(script.proto_data(pid, 15)).toBe(77)
        expect(script.proto_data(pid, 555)).toBe(30)
        expect(script.proto_data(pid, 10)).toBe(0)
        expect(script.proto_data(pid, 40)).toBe(0)
    })

    it('critter members', () => {
        const pid = 0x01000010
        expect(script.proto_data(pid, 3)).toBe(0x01000005)
        expect(script.proto_data(pid, 7)).toBe(0x40)
        expect(script.proto_data(pid, 8)).toBe(12)
        expect(script.proto_data(pid, 9)).toBe(0)
        expect(script.proto_data(pid, 10)).toBe(99)
        expect(script.proto_data(pid, 11)).toBe(1)
    })

    it('an unknown proto gives 0', () => {
        expect(script.proto_data(0x00000123, 0)).toBe(0)
    })
})
