module.exports = {
    parser: '@typescript-eslint/parser',
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
    ],
    plugins: ['@typescript-eslint'],
    ignorePatterns: ['dist/', 'node_modules/'],
    rules: {
        // Unused function parameters are already enforced for source files by
        // tsc's `noUnusedParameters`; here we only flag unused variables/imports
        // (callback signatures in tests legitimately keep unused positional args).
        '@typescript-eslint/no-unused-vars': ['error', {
            args: 'none',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
        }],
        // Allow the `interface Foo extends Bar {}` re-export pattern
        '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
        // Intentionally-empty catch blocks (swallowed observer/compensation errors)
        'no-empty': ['error', { allowEmptyCatch: true }],
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-non-null-assertion': 'warn',
    },
    env: {
        node: true,
        es2020: true,
    },
};