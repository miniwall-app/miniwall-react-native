// Expo config plugin for @miniwall/react-native (development builds; Expo Go cannot load native modules).
// Usage in app.json: ["@miniwall/react-native", { "nativeSdkPath": "../checkouts" }]
//   nativeSdkPath: the folder, relative to the app, that holds your checkouts of `miniwall-ios` and `miniwall-android`
//   (plain `ios` and `android` folders work too). Needed only until MiniwallSDK is on CocoaPods / Maven Central;
//   leave it out afterwards.
// It does only what autolinking cannot: iOS 16 deployment target, the local pods, the Android includeBuild.
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withPodfileProperties, withProjectBuildGradle, withSettingsGradle } = require('@expo/config-plugins');

const TAG = '@miniwall/react-native';

/** Where the native SDK of a platform is checked out under `base`: `miniwall-<platform>` if it exists, else `<platform>`. */
function nativeDir(base, platform) {
  const named = path.join(base, `miniwall-${platform}`);
  return fs.existsSync(named) || !fs.existsSync(path.join(base, platform)) ? named : path.join(base, platform);
}

function withIos(config, nativeSdkPath) {
  config = withPodfileProperties(config, (c) => {
    c.modResults['ios.deploymentTarget'] = c.modResults['ios.deploymentTarget'] || '16.0';
    return c;
  });
  if (!nativeSdkPath) return config;
  return withDangerousMod(config, [
    'ios',
    (c) => {
      const podfile = path.join(c.modRequest.platformProjectRoot, 'Podfile');
      let text = fs.readFileSync(podfile, 'utf8');
      if (text.includes(`# ${TAG}`)) return c;
      const sdk = nativeDir(path.resolve(c.modRequest.projectRoot, nativeSdkPath), 'ios');
      const pods = `  # ${TAG}\n  pod 'MiniwallCore', :path => '${sdk}'\n  pod 'MiniwallSDK', :path => '${sdk}'\n`;
      text = text.replace(/(use_native_modules!.*\n)/, `$1${pods}`);
      fs.writeFileSync(podfile, text);
      return c;
    },
  ]);
}

// androidMavenLocal: resolve app.miniwall:sdk from ~/.m2 (`./gradlew publishToMavenLocal` in miniwall-android) instead of building it
// with includeBuild. Use it when the app's Android Gradle plugin is not the native SDK's (Expo SDK 58 / React Native 0.88 use AGP 9;
// Gradle refuses two AGP versions in one build). A published AAR has no such limit.
function withAndroidMavenLocal(config) {
  return withProjectBuildGradle(config, (c) => {
    if (c.modResults.contents.includes(TAG)) return c;
    c.modResults.contents = c.modResults.contents.replace(
      /allprojects\s*\{\s*repositories\s*\{/,
      (m) => `${m}\n    mavenLocal() // ${TAG}`
    );
    return c;
  });
}

// The Miniwall Maven repository (https://maven.miniwall.app) holds app.miniwall:sdk. Added to every Android build.
function addMiniwallMaven(contents) {
  if (contents.includes('maven.miniwall.app')) return contents;
  return contents.replace(
    /allprojects\s*\{\s*repositories\s*\{/,
    (m) => `${m}\n    maven { url 'https://maven.miniwall.app'; content { includeGroup 'app.miniwall' } } // ${TAG}`
  );
}

function withMiniwallMaven(config) {
  return withProjectBuildGradle(config, (c) => {
    c.modResults.contents = addMiniwallMaven(c.modResults.contents);
    return c;
  });
}

function withAndroid(config, nativeSdkPath, mavenLocal) {
  config = withMiniwallMaven(config);
  if (mavenLocal) return withAndroidMavenLocal(config);
  if (!nativeSdkPath) return config;
  return withSettingsGradle(config, (c) => {
    if (c.modResults.contents.includes(TAG)) return c;
    const sdk = nativeDir(path.resolve(c.modRequest.projectRoot, nativeSdkPath), 'android').replace(/\\/g, '/');
    c.modResults.contents +=
      `\n// ${TAG}\nincludeBuild('${sdk}') {\n` +
      `  dependencySubstitution { substitute(module('app.miniwall:sdk')).using(project(':sdk')) }\n}\n`;
    return c;
  });
}

module.exports = function withMiniwall(config, props = {}) {
  const nativeSdkPath = props.nativeSdkPath;
  return withAndroid(withIos(config, nativeSdkPath), nativeSdkPath, props.androidMavenLocal === true);
};
module.exports.nativeDir = nativeDir;
module.exports.addMiniwallMaven = addMiniwallMaven;
