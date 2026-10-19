// Detox config for the sample app (sdks/react-native/example). Adjust `binaryPath`/`build` to what `expo prebuild` generated
// (the iOS project name comes from app.json "name"). Run from sdks/react-native/e2e. See README.md.
/** @type {import('detox').DetoxConfig} */
module.exports = {
  testRunner: { args: { $0: 'jest', config: 'jest.config.js' }, jest: { setupTimeout: 180000 } },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: '../example/ios/build/Build/Products/Debug-iphonesimulator/Miniwallsample.app',
      build: 'xcodebuild -workspace ../example/ios/Miniwallsample.xcworkspace -scheme Miniwallsample -configuration Debug -sdk iphonesimulator -derivedDataPath ../example/ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: '../example/android/app/build/outputs/apk/debug/app-debug.apk',
      testBinaryPath: '../example/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build: 'cd ../example/android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
    },
  },
  devices: {
    simulator: { type: 'ios.simulator', device: { type: 'iPhone 15' } },
    emulator: { type: 'android.emulator', device: { avdName: 'Pixel_7_API_34' } },
  },
  configurations: {
    'ios.sim.debug': { device: 'simulator', app: 'ios.debug' },
    'android.emu.debug': { device: 'emulator', app: 'android.debug' },
  },
};
