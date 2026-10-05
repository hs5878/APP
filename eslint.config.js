const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  prettier,
  {
    ignores: ['dist/*', '.expo/*', 'ios/*', 'android/*', 'node_modules/*'],
  },
  {
    // 순수 함수 폴더 보호: 플랫폼·DB 의존 import 금지
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                'react-native',
                'react-native/*',
                'react-native-*',
                'expo',
                'expo-*',
                'expo/*',
              ],
              message: 'src/domain은 순수 함수 폴더입니다. React·Expo를 import하지 마세요.',
            },
            {
              group: ['@/db', '@/db/*', '@/platform', '@/platform/*'],
              message: 'src/domain은 DB·플랫폼 계층을 import할 수 없습니다.',
            },
          ],
        },
      ],
    },
  },
]);
