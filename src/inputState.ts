/**
 * Keys and mouse buttons held now, for sfall's key_pressed and
 * get_mouse_buttons (InputFuncs.cpp). Keys are DirectInput scan codes
 * (DIK_*); a key with bit 0x80000000 is a Windows virtual-key code.
 */

/** KeyboardEvent.code → DirectInput scan code. */
const DIK: Record<string, number> = {
    Escape: 1, Minus: 12, Equal: 13, Backspace: 14, Tab: 15, BracketLeft: 26, BracketRight: 27, Enter: 28,
    ControlLeft: 29, Semicolon: 39, Quote: 40, Backquote: 41, ShiftLeft: 42, Backslash: 43, Comma: 51, Period: 52,
    Slash: 53, ShiftRight: 54, NumpadMultiply: 55, AltLeft: 56, Space: 57, CapsLock: 58, NumLock: 69, ScrollLock: 70,
    Numpad7: 71, Numpad8: 72, Numpad9: 73, NumpadSubtract: 74, Numpad4: 75, Numpad5: 76, Numpad6: 77, NumpadAdd: 78,
    Numpad1: 79, Numpad2: 80, Numpad3: 81, Numpad0: 82, NumpadDecimal: 83, F11: 87, F12: 88, NumpadEnter: 156,
    ControlRight: 157, NumpadDivide: 181, AltRight: 184, Home: 199, ArrowUp: 200, PageUp: 201, ArrowLeft: 203,
    ArrowRight: 205, End: 207, ArrowDown: 208, PageDown: 209, Insert: 210, Delete: 211,
}
'1234567890'.split('').forEach((d, i) => { DIK['Digit' + d] = 2 + i })
'QWERTYUIOP'.split('').forEach((c, i) => { DIK['Key' + c] = 16 + i })
'ASDFGHJKL'.split('').forEach((c, i) => { DIK['Key' + c] = 30 + i })
'ZXCVBNM'.split('').forEach((c, i) => { DIK['Key' + c] = 44 + i })
for (let i = 1; i <= 10; i++) {DIK['F' + i] = 58 + i}

const keysDown = new Set<number>()
const vkDown = new Set<number>()
let mouseButtons = 0

export function noteKey(code: string, keyCode: number, down: boolean): void {
    const dik = DIK[code]
    if (dik !== undefined) {
        if (down) {keysDown.add(dik)}
        else {keysDown.delete(dik)}
    }
    if (down) {vkDown.add(keyCode)}
    else {vkDown.delete(keyCode)}
}

/** Mouse buttons as the engine counts them: 1 left, 2 right, 4 middle. */
export function noteMouseButton(button: number, down: boolean): void {
    const bit = button === 0 ? 1 : button === 2 ? 2 : button === 1 ? 4 : 0
    mouseButtons = down ? mouseButtons | bit : mouseButtons & ~bit
}

/** KeyDown: a scan code (256–263 the mouse buttons), or a virtual-key code with bit 0x80000000. */
export function keyDown(key: number): number {
    if ((key & 0x80000000) !== 0) {return vkDown.has(key & 0xffff) ? 1 : 0}
    const k = key & 0xffff
    // 256 and up are the mouse buttons: left, right, middle…
    if (k >= 256 && k < 264) {return (mouseButtons & (1 << (k - 256))) !== 0 ? 1 : 0}
    return keysDown.has(k) ? 1 : 0
}

export function mouseButtonsDown(): number {
    return mouseButtons
}

export function clearInputState(): void {
    keysDown.clear()
    vkDown.clear()
    mouseButtons = 0
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', (e) => noteKey(e.code, e.keyCode, true))
    window.addEventListener('keyup', (e) => noteKey(e.code, e.keyCode, false))
    window.addEventListener('mousedown', (e) => noteMouseButton(e.button, true))
    window.addEventListener('mouseup', (e) => noteMouseButton(e.button, false))
    window.addEventListener('blur', clearInputState)
}
