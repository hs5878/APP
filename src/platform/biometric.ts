import * as LocalAuthentication from 'expo-local-authentication';

/** 생체인증을 쓸 수 있는가(하드웨어가 있고 등록된 생체 정보가 있다). */
export async function isBiometricAvailable(): Promise<boolean> {
  return (
    (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())
  );
}

/** 생체인증 창을 띄운다. 기기 암호로의 대체는 막는다(앱 PIN이 대체 수단). */
export async function authenticateBiometric(promptMessage: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: '취소',
    disableDeviceFallback: true,
  });
  return result.success;
}
