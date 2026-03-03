/**
 * Global test environment shims for modules with browser-only top-level code.
 * This file runs before any test module is imported.
 */

// heart.ts assigns window.onkeydown/onkeyup/onfocus/onblur at module scope.
// Provide a minimal stub so these assignments don't throw in Node.
if (typeof window === 'undefined') {
    ;(global as any).window = {
        onkeydown: null,
        onkeyup: null,
        onfocus: null,
        onblur: null,
    }
}
