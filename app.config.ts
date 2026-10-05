import type { ExpoConfig } from 'expo/config';

const appId = process.env.APP_ID ?? 'com.example.loverecord';

const config: ExpoConfig = {
  name: '연애기록',
  slug: 'loverecord',
  scheme: 'loverecord',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: appId,
    supportsTablet: false,
  },
  android: {
    package: appId,
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    ['expo-sqlite', { useSQLCipher: true }],
    'expo-secure-store',
    'expo-notifications',
    ['expo-local-authentication', { faceIDPermission: 'Face ID로 앱 잠금을 풉니다.' }],
    'react-native-libsodium',
    './plugins/withNoBackup',
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '16.4' },
        android: { minSdkVersion: 29 },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
