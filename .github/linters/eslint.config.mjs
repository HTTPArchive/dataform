export default [
  {
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        dataform: 'readonly',
        constants: 'readonly',
        declare: 'readonly',
        assert: 'readonly',
        publish: 'readonly',
        ctx: 'readonly'
      }
    },
    rules: {
      // Add any custom rules here if needed
    }
  }
]
