// The Expo config plugin finds the native SDKs in sibling checkouts (miniwall-ios, miniwall-android) or in plain ios/android folders.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { nativeDir } = require('../app.plugin.js') as { nativeDir: (base: string, platform: string) => string };

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
