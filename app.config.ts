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
    [
      'expo-media-library',
      {
        photosPermission:
          '같은 날 찍은 사진을 데이트 기록 후보로 묶으려고 사진의 촬영 시각과 위치를 읽습니다.',
        savePhotosPermission: false,
        isAccessMediaLocationEnabled: true,
        granularPermissions: ['photo'],
      },
    ],
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
