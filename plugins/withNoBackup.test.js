const { setAllowBackupFalse, addIosExclusion } = require('./withNoBackup');

const swift = `class AppDelegate {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
}
`;

describe('withNoBackup', () => {
  it('allowBackup을 false로 바꾼다', () => {
    const m = { manifest: { application: [{ $: { 'android:allowBackup': 'true' } }] } };
    expect(setAllowBackupFalse(m).manifest.application[0].$['android:allowBackup']).toBe('false');
  });

  it('AppDelegate에 호출과 함수를 한 번만 넣는다', () => {
    const once = addIosExclusion(swift);
    expect(once).toMatch(/excludeAppDataFromBackup\(\)\n\s*return super/);
    expect(once).toContain('isExcludedFromBackup = true');
    expect(addIosExclusion(once)).toBe(once);
  });

  it('삽입 위치가 없으면 던진다', () => {
    expect(() => addIosExclusion('class A {}')).toThrow();
  });
});
