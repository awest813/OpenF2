import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
        setupFiles: ['src/testSetup.ts'],
    },
    resolve: {
        // Allow TypeScript files to be found when imports use .js extensions
        extensions: ['.ts', '.js'],
    },
})
