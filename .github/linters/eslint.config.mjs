import js from '@eslint/js'
import globals from 'globals'

export default [
  {
    ignores: ['node_modules/**', 'package-lock.json', '*.log', 'dist/**', 'build/**']
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,

        // Dataform-specific globals
        dataform: 'readonly',
        declare: 'readonly',
        assert: 'readonly',
        publish: 'readonly',
        operate: 'readonly',
        ctx: 'readonly',
        constants: 'readonly',
        reports: 'readonly',
        reservations: 'readonly'
      }
    },
    rules: {
      // Basic formatting rules
      'indent': ['error', 2],
      'quotes': ['error', 'single'],
      'semi': ['error', 'never']
    }
  }
]
