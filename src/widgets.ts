import { Point } from './geometry.js'

export interface CSSBoundingBox {
    x: number | string
    y: number | string
    w?: number | string
    h?: number | string
}

export class WindowFrame {
    children: Widget[] = []
    elem: HTMLElement
    showing = false

    constructor(
        public background: string,
        public position: Point,
        public width: number,
        public height: number,
        children?: Widget[]
    ) {
        this.elem = document.createElement('div')

        Object.assign(this.elem.style, {
            position: 'absolute',
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: `${width}px`,
            height: `${height}px`,
            backgroundImage: `url('${background}')`,
        })

        if (children) {
            for (const child of children) {
                this.add(child)
            }
        }
    }

    add(widget: Widget): this {
        this.children.push(widget)
        this.elem.appendChild(widget.elem)
        return this
    }

    show(): this {
        if (this.showing) {
            return this
        }
        this.showing = true
        return this
    }

    close(): void {
        if (!this.showing) {
            return
        }
        this.showing = false
    }

    toggle(): this {
        if (this.showing) {
            this.close()
        } else {
            this.show()
        }
        return this
    }
}

export class Widget {
    elem: HTMLElement
    hoverBackground: string | null = null
    mouseDownBackground: string | null = null

    constructor(public background: string | null, public bbox: CSSBoundingBox) {
        this.elem = document.createElement('div')

        const style: Record<string, string> = {
            position: 'absolute',
            left: `${bbox.x}px`,
            top: `${bbox.y}px`,
        }
        if (bbox.w !== undefined) {style.width = `${bbox.w}px`}
        if (bbox.h !== undefined) {style.height = `${bbox.h}px`}
        if (background) {style.backgroundImage = `url('${background}')`}
        Object.assign(this.elem.style, style)
    }

    onClick(fn: (widget?: Widget) => void): this {
        this.elem.onclick = () => {
            fn(this)
        }
        return this
    }

    hoverBG(background: string): this {
        this.hoverBackground = background

        if (!this.elem.onmouseenter) {
            this.elem.onmouseenter = () => {
                this.elem.style.backgroundImage = `url('${this.hoverBackground}')`
            }
            this.elem.onmouseleave = () => {
                this.elem.style.backgroundImage = `url('${this.background}')`
            }
        }

        return this
    }

    mouseDownBG(background: string): this {
        this.mouseDownBackground = background

        if (!this.elem.onmousedown) {
            this.elem.onmousedown = () => {
                this.elem.style.backgroundImage = `url('${this.mouseDownBackground}')`
            }
            this.elem.onmouseup = () => {
                this.elem.style.backgroundImage = `url('${this.background}')`
            }
        }

        return this
    }

    css(props: object): this {
        Object.assign(this.elem.style, props)
        return this
    }
}

export class SmallButton extends Widget {
    constructor(x: number, y: number) {
        super('art/intrface/lilredup.png', { x, y, w: 15, h: 16 })
        this.mouseDownBG('art/intrface/lilreddn.png')
    }
}

export class Label extends Widget {
    constructor(x: number, y: number, text: string, public textColor: string = 'yellow') {
        super(null, { x, y, w: 'auto', h: 'auto' })
        this.setText(text)
        this.elem.style.color = this.textColor
    }

    setText(text: string): void {
        this.elem.innerHTML = text
    }
}

export interface ListItem {
    id?: any
    uid?: number
    text: string
    onSelected?: () => void
}

export class List extends Widget {
    items: ListItem[] = []
    itemSelected?: (item: ListItem) => void
    currentlySelected: ListItem | null = null
    currentlySelectedElem: HTMLElement | null = null
    _lastUID = 0

    constructor(
        bbox: CSSBoundingBox,
        items?: ListItem[],
        public textColor: string = '#00FF00',
        public selectedTextColor: string = '#FCFC7C'
    ) {
        super(null, bbox)
        this.elem.style.color = this.textColor
        this.elem.classList.add('disable-selection')

        if (items) {
            for (const item of items) {
                this.addItem(item)
            }
        }
    }

    onItemSelected(fn: (item: ListItem) => void): this {
        this.itemSelected = fn
        return this
    }

    getSelection(): ListItem | null {
        return this.currentlySelected
    }

    select(item: ListItem, itemElem?: HTMLElement): boolean {
        if (!itemElem) {
            itemElem = this.elem.querySelector(`[data-uid="${item.uid}"]`) as HTMLElement
        }

        if (!itemElem) {
            console.warn(`Can't find item's element for item UID ${item.uid}`)
            return false
        }

        this.itemSelected && this.itemSelected(item)
        item.onSelected && item.onSelected()

        if (this.currentlySelectedElem) {
            this.currentlySelectedElem.style.color = this.textColor
        }

        itemElem.style.color = this.selectedTextColor

        this.currentlySelected = item
        this.currentlySelectedElem = itemElem

        return true
    }

    selectId(id: any): boolean {
        const item = this.items.filter((item) => item.id === id)[0]
        if (!item) {
            return false
        }
        this.select(item)
        return true
    }

    addItem(item: ListItem): ListItem {
        item.uid = this._lastUID++
        this.items.push(item)

        const itemElem = document.createElement('div')
        itemElem.style.cursor = 'pointer'
        itemElem.textContent = item.text
        itemElem.setAttribute('data-uid', item.uid + '')
        itemElem.onclick = () => {
            this.select(item, itemElem)
        }
        this.elem.appendChild(itemElem)

        if (!this.currentlySelected) {
            this.select(item)
        }

        return item
    }

    clear(): void {
        this.items.length = 0

        const node = this.elem
        while (node.firstChild) {
            node.removeChild(node.firstChild)
        }
    }
}
