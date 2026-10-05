// OS 기기 백업 제외.
// - Android: AndroidManifest의 allowBackup을 false로 둔다.
// - iOS: 앱 시작 때 Documents·Library/Application Support에 isExcludedFromBackup을 건다.
//   JS에서 이 속성을 거는 API가 없어 AppDelegate(Swift)에 한 줄을 넣는다.
const { withAndroidManifest, withAppDelegate } = require('expo/config-plugins');

const MARKER = 'excludeAppDataFromBackup';
const CALL = `    ${MARKER}()\n`;
const HELPER = `
// withNoBackup 플러그인이 추가: 앱 데이터 폴더를 iCloud·기기 백업에서 제외한다.
private func ${MARKER}() {
  let fm = FileManager.default
  for dir in [FileManager.SearchPathDirectory.documentDirectory, .applicationSupportDirectory] {
    guard var url = fm.urls(for: dir, in: .userDomainMask).first else { continue }
    try? fm.createDirectory(at: url, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try? url.setResourceValues(values)
  }
}
`;

function setAllowBackupFalse(manifest) {
  const app = manifest.manifest.application?.[0];
  if (!app) throw new Error('withNoBackup: AndroidManifest에 <application>이 없습니다.');
  app.$['android:allowBackup'] = 'false';
  return manifest;
}

function addIosExclusion(contents) {
  if (contents.includes(MARKER)) return contents;
  const anchor = /^(\s*)return super\.application\(application, didFinishLaunchingWithOptions/m;
  if (!anchor.test(contents)) {
    throw new Error('withNoBackup: AppDelegate.swift에서 삽입 위치를 찾지 못했습니다.');
  }
  return contents.replace(anchor, (m) => `${CALL}${m}`) + HELPER;
}

const withNoBackup = (config) => {
  config = withAndroidManifest(config, (c) => {
    c.modResults = setAllowBackupFalse(c.modResults);
    return c;
  });
  config = withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') {
      throw new Error('withNoBackup: Swift AppDelegate만 지원합니다.');
    }
    c.modResults.contents = addIosExclusion(c.modResults.contents);
    return c;
  });
  return config;
};

module.exports = withNoBackup;
module.exports.setAllowBackupFalse = setAllowBackupFalse;
module.exports.addIosExclusion = addIosExclusion;
