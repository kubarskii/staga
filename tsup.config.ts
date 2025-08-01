import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm', 'iife'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: false,
    target: 'es2020',
    outDir: 'dist',
    globalName: 'Staga', // For IIFE format, makes library available as window.Staga
    platform: 'browser',
});