const fs = require('fs');
const path = require('path');

// Simple post-build script to ensure proper exports
console.log('📦 Building Staga library...');

const distPath = path.join(__dirname, '..', 'dist');
const srcPath = path.join(__dirname, '..', 'src');

// Copy package.json metadata for proper module resolution
const packageJson = require('../package.json');
const distPackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    type: 'module',
    main: './index.js',
    types: './index.d.ts'
};

// Ensure dist directory exists
if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
}

// Write package.json to dist
fs.writeFileSync(
    path.join(distPath, 'package.json'),
    JSON.stringify(distPackageJson, null, 2)
);

console.log('✅ Build completed successfully!');
console.log('📁 Output directory: dist/');
console.log('📄 Generated files:');
console.log('   - index.js (ES modules)');
console.log('   - index.d.ts (TypeScript declarations)');
console.log('   - Source maps');