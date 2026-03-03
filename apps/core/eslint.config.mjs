import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'app',
    typescript: true,
    yaml: false,
    jsonc: false,
    markdown: false,
    formatters: false
  },
  {
    rules: {
      'ts/consistent-type-imports': 'off',

      'style/arrow-parens': ['error', 'as-needed', { requireForBlockBody: true }],
      'style/object-curly-spacing': ['error', 'always'],
      'style/linebreak-style': ['error', 'unix'],
      'style/comma-dangle': ['error', 'never'],
      'style/brace-style': ['error', '1tbs', { allowSingleLine: true }]
    }
  }
)
