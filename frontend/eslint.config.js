import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    // charts는 Bklit registry에서 동기화하는 vendored source다. 프로젝트 래퍼는
    // src/shared/charts에서 별도로 lint한다.
    ignores: ['dist', 'coverage', 'node_modules', 'src/shared/api/generated', 'src/components/charts'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // 기술 스택 v3 §3.2 의존 방향 — app → pages → features → shared.
      // shared는 상위를 import하지 않고, features끼리 직접 import하지 않는다. 조합은 pages에서.
      // 지갑 SDK는 shared/blockchain/WalletAdapter 뒤에만 둔다.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@/pages/*'],
              message:
                '의존 방향 위반 — shared·features는 app·pages를 import하지 않는다(기술 스택 v3 §3.2).',
            },
            {
              group: ['@web3auth/*', '@kaiachain/*'],
              message:
                '지갑·체인 SDK는 shared/blockchain/WalletAdapter 뒤에서만 부른다(기술 스택 v3 §3.2).',
            },
          ],
        },
      ],
    },
  },
  // pages는 features·shared를 모두 조합할 수 있다.
  {
    files: ['src/pages/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}', 'src/main.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@web3auth/*', '@kaiachain/*'],
              message:
                '지갑·체인 SDK는 shared/blockchain/WalletAdapter 뒤에서만 부른다(기술 스택 v3 §3.2).',
            },
          ],
        },
      ],
    },
  },
  // WalletAdapter 구현체만 SDK를 직접 import한다.
  {
    files: ['src/shared/blockchain/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  prettier,
)
