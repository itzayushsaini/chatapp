import js from '@eslint/js'
import globals from 'globals'

// ESLint 9 "flat config": an array of config objects, applied in order.
export default [
  { ignores: ['node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // A leading underscore marks an argument we are required to declare but
      // do not use - for example the 4th argument of an Express error handler.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
]
