import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    base: '/staga/',
    root: '.',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2020',
    },
    resolve: {
        alias: {
            '@staga/core': resolve(__dirname, '../src/index.ts'),
        },
    },
    server: {
        port: 3000,
        open: true,
    },
});
