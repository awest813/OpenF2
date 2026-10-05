/**
 * sfall sprintf_lite (Utils.cpp), used by sprintf and string_format: C
 * printf conversions over script values. Size prefixes are ignored, %n is
 * refused and %s on a number prints the number as %d would.
 */

const isFloat = (v: unknown): boolean => typeof v === 'number' && !Number.isInteger(v)

function rawInt(v: unknown): number {
    if (typeof v === 'number') {return Math.trunc(v) | 0}
    if (typeof v === 'string') {return 0}
    return 0
}

/** One conversion: flags, width, precision and the type letter. */
function convert(spec: string, type: string, value: unknown): string {
    const m = /^([-+ #0]*)(\d*)(?:\.(\d*))?$/.exec(spec) ?? ['', '', '', undefined]
    const flags = m[1] ?? ''
    const width = m[2] ? parseInt(m[2], 10) : 0
    const precision = m[3] !== undefined ? parseInt(m[3] || '0', 10) : undefined
    const left = flags.includes('-')
    const zero = flags.includes('0') && !left
    let sign = ''
    let body: string

    const numeric = (n: number, digits: string): string => {
        if (precision !== undefined) {return precision === 0 && n === 0 ? '' : digits.padStart(precision, '0')}
        return digits
    }

    switch (type) {
        case 'd': case 'i': {
            const n = isFloat(value) ? Math.trunc(value as number) | 0 : rawInt(value)
            if (n < 0) {sign = '-'}
            else if (flags.includes('+')) {sign = '+'}
            else if (flags.includes(' ')) {sign = ' '}
            body = numeric(n, Math.abs(n).toString())
            break
        }
        case 'u': body = numeric(rawInt(value), (rawInt(value) >>> 0).toString()); break
        case 'x': case 'X': {
            const n = rawInt(value) >>> 0
            body = numeric(n, n.toString(16))
            if (flags.includes('#') && n !== 0) {body = '0x' + body}
            if (type === 'X') {body = body.toUpperCase()}
            break
        }
        case 'o': body = numeric(rawInt(value), (rawInt(value) >>> 0).toString(8)); break
        case 'c': body = String.fromCharCode(rawInt(value) & 0xff); break
        case 's': {
            body = String(value ?? '')
            if (precision !== undefined) {body = body.slice(0, precision)}
            break
        }
        case 'f': case 'F': case 'e': case 'E': case 'g': case 'G': case 'a': case 'A': {
            const n = typeof value === 'number' ? value : 0
            const p = precision ?? 6
            if (n < 0 || Object.is(n, -0)) {sign = '-'}
            else if (flags.includes('+')) {sign = '+'}
            else if (flags.includes(' ')) {sign = ' '}
            const a = Math.abs(n)
            if (type === 'f' || type === 'F') {body = a.toFixed(p)}
            else if (type === 'e' || type === 'E') {body = a.toExponential(p).replace(/e([+-])(\d)$/, 'e$10$2')}
            else {
                const P = p === 0 ? 1 : p
                const exp = a === 0 ? 0 : Math.floor(Math.log10(a))
                body = exp < -4 || exp >= P
                    ? a.toExponential(P - 1).replace(/e([+-])(\d)$/, 'e$10$2')
                    : a.toFixed(Math.max(0, P - 1 - exp))
                if (!flags.includes('#') && body.includes('.')) {body = body.replace(/\.?0+(e|$)/, '$1')}
            }
            if (type === 'E' || type === 'G' || type === 'A') {body = body.toUpperCase()}
            break
        }
        default: body = ''
    }
    const len = sign.length + body.length
    if (len >= width) {return sign + body}
    if (left) {return sign + body + ' '.repeat(width - len)}
    if (zero && type !== 's' && type !== 'c') {return sign + '0'.repeat(width - len) + body}
    return ' '.repeat(width - len) + sign + body
}

/** sprintf_lite(format, args…): a missing argument reuses the last one, as sfall does. */
export function sfallSprintf(format: unknown, args: unknown[]): string {
    const fmt = String(format ?? '')
    if (fmt === '') {return fmt}
    if (fmt.length > 1024) {return 'Error'}
    let out = ''
    let i = 0
    let valIdx = 0
    while (i < fmt.length) {
        const c = fmt[i]
        if (c !== '%') {
            out += c
            i++
            continue
        }
        // Read up to the conversion letter (or %).
        let j = i + 1
        let spec = ''
        while (j < fmt.length) {
            const ch = fmt[j]
            if (/[a-zA-Z%]/.test(ch)) {
                if ('hljztwLI'.includes(ch)) {
                    j++
                    continue
                }
                break
            }
            spec += ch
            j++
        }
        if (j >= fmt.length) {
            out += fmt.slice(i)
            break
        }
        let type = fmt[j]
        if (type === '%') {
            out += '%'
            i = j + 1
            continue
        }
        valIdx++
        const value = args.length === 0 ? 0 : args[Math.min(valIdx, args.length) - 1]
        if (type === 'S' || type === 'Z') {type = 's'}
        if ((type === 's' && typeof value !== 'string') || type === 'n') {type = 'd'}
        out += convert(spec, type, value)
        i = j + 1
    }
    return out
}
