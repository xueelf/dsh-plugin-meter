import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const variableStatements = ['const', 'let', 'var'];
const controlStatements = ['if', 'for', 'while', 'do', 'switch', 'try'];

export default defineConfig(
  globalIgnores(['.refs/', 'dist/']),
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      curly: 'error',
      'no-void': 'error',
      'padding-line-between-statements': [
        'error',
        {
          blankLine: 'always',
          prev: '*',
          next: '*',
        },
        { blankLine: 'never', prev: 'import', next: 'import' },
        ...variableStatements.map(statement => ({
          blankLine: 'never',
          prev: statement,
          next: statement,
        })),
        { blankLine: 'never', prev: 'expression', next: 'expression' },
        {
          blankLine: 'never',
          prev: ['block-like', 'class'],
          next: '*',
        },
        {
          blankLine: 'always',
          prev: ['block-like', 'class'],
          next: controlStatements,
        },
        { blankLine: 'always', prev: '*', next: 'function' },
        { blankLine: 'always', prev: 'function', next: '*' },
        { blankLine: 'always', prev: '*', next: 'do' },
        { blankLine: 'always', prev: 'do', next: '*' },
        {
          blankLine: 'always',
          prev: '*',
          next: 'iife',
        },
        {
          blankLine: 'always',
          prev: 'iife',
          next: '*',
        },
        { blankLine: 'always', prev: 'export', next: '*' },
        { blankLine: 'any', prev: 'export', next: 'export' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
);
