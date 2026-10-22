// The Expo config plugin finds the native SDKs in sibling checkouts (miniwall-ios, miniwall-android) or in plain ios/android folders.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { nativeDir, addMiniwallMaven } = require('../app.plugin.js') as {
  nativeDir: (base: string, platform: string) => string;
  addMiniwallMaven: (contents: string) => string;
};

describe('nativeDir', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'miniwall-plugin-'));
  afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

  it('prefers the miniwall-<platform> checkout', () => {
    fs.mkdirSync(path.join(base, 'miniwall-ios'));
    fs.mkdirSync(path.join(base, 'ios'));
    expect(nativeDir(base, 'ios')).toBe(path.join(base, 'miniwall-ios'));
  });

  it('falls back to a plain <platform> folder', () => {
    fs.mkdirSync(path.join(base, 'android'));
    expect(nativeDir(base, 'android')).toBe(path.join(base, 'android'));
  });

  it('names the miniwall-<platform> path when neither exists, so the error points at it', () => {
    expect(nativeDir(base, 'flutter')).toBe(path.join(base, 'miniwall-flutter'));
  });
});

describe('addMiniwallMaven', () => {
  const gradle = "allprojects {\n  repositories {\n    google()\n    mavenCentral()\n  }\n}\n";

  it('adds the Miniwall Maven repository to allprojects, limited to its group', () => {
    const out = addMiniwallMaven(gradle);
    expect(out).toContain("maven { url 'https://maven.miniwall.app'; content { includeGroup 'app.miniwall' } }");
    expect(out.indexOf('maven.miniwall.app')).toBeLessThan(out.indexOf('google()'));
  });

  it('does not add it twice', () => {
    const once = addMiniwallMaven(gradle);
    expect(addMiniwallMaven(once)).toBe(once);
  });

  it('leaves a file without allprojects repositories alone', () => {
    expect(addMiniwallMaven('buildscript {}\n')).toBe('buildscript {}\n');
  });
});
