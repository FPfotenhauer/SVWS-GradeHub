import js from '@eslint/js'
import eslintPluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import vueTsEslintConfig from '@vue/eslint-config-typescript'

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...eslintPluginVue.configs['flat/recommended'],
  ...tseslint.configs.recommended,
  ...vueTsEslintConfig(),
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
]
