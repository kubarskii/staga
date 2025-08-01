module.exports = {
    parser: '@typescript-eslint/parser',
    extends: [
        'eslint:recommended',
        '@typescript-eslint/recommended',
    ],
    plugins: ['@typescript-eslint'],
    ignorePatterns: ['dist/', 'node_modules/'],
    rules: {
        '@typescript-eslint/no-unused-vars': 'error',
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