export interface ElementOptions {
    id?: string
    src?: string
    classes?: string[]
    click?: (e: MouseEvent) => void
    style?: { [key in keyof CSSStyleDeclaration]?: string }
    children?: HTMLElement[]
    attrs?: { [key: string]: string | number }
}

export function $id(id: string): HTMLElement {
    return document.getElementById(id)!
}

export function $img(id: string): HTMLImageElement {
    return document.getElementById(id) as HTMLImageElement
}

export function $q(selector: string): HTMLElement {
    return document.querySelector(selector) as HTMLElement
}

export function $qa(selector: string): HTMLElement[] {
    return Array.from(document.querySelectorAll(selector))
}

export function clearEl($el: HTMLElement): void {
    $el.innerHTML = ''
}

export function show($el: HTMLElement): void {
    $el.style.display = 'block'
}

export function hide($el: HTMLElement): void {
    $el.style.display = 'none'
}

export function showv($el: HTMLElement): void {
    $el.style.visibility = 'visible'
}

export function hidev($el: HTMLElement): void {
    $el.style.visibility = 'hidden'
}

export function off($el: HTMLElement, events: string): void {
    const eventList = events.split(' ')
    for (const event of eventList) {
        (<any>$el)['on' + event] = null
    }
}

export function appendHTML($el: HTMLElement, html: string): void {
    $el.insertAdjacentHTML('beforeend', html)
}

export function makeEl(tag: string, options: ElementOptions): HTMLElement {
    const $el = document.createElement(tag)

    if (options.id !== undefined) {
        $el.id = options.id
    }
    if (options.src !== undefined) {
        ($el as HTMLImageElement).src = options.src
    }
    if (options.classes !== undefined) {
        $el.className = options.classes.join(' ')
    }
    if (options.click !== undefined) {
        $el.onclick = options.click
    }
    if (options.style !== undefined) {
        Object.assign($el.style, options.style)
    }
    if (options.children !== undefined) {
        for (const child of options.children) {
            $el.appendChild(child)
        }
    }
    if (options.attrs !== undefined) {
        for (const prop in options.attrs) {
            $el.setAttribute(prop, options.attrs[prop] + '')
        }
    }

    return $el
}
