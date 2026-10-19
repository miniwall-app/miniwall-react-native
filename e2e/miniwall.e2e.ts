// Detox scenarios for the React Native sample app (sdks/react-native/example), against the local stub API
// (sdks/testdata/stub-server.js). Detox drives the React Native layer (testIDs of example/App.tsx) and the system
// (Android back button). The screen Miniwall draws is native SwiftUI/Compose, which Detox cannot see: taps INSIDE it
// (choose a plan, Subscribe, Restore, a question, the Back button of a flow) are covered by the Maestro flows in ./maestro.
// Not run at cloud: needs a simulator/emulator.
//
// Needs from the sample app (not there yet, add it before running): a text input `api-url-input` whose value is passed as
// `Miniwall.configure(apiKey, { apiUrl })`, so the app talks to the stub instead of the real API.
import { by, device, element, waitFor } from 'detox';

const STUB_FROM_APP = () => (device.getPlatform() === 'android' ? 'http://10.0.2.2:8799' : 'http://127.0.0.1:8799');
const resultText = () => element(by.id('result-text'));

/** The text of the result line (Detox reads `text` on Android, `text`/`label` on iOS). */
async function currentResult(): Promise<string> {
  const attrs = (await resultText().getAttributes()) as { text?: string; label?: string };
  return attrs.text ?? attrs.label ?? '';
}

/** Polls the result line until it contains `part` (Detox has no "contains" matcher for text). */
async function resultContains(part: string, timeoutMs = 20000) {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < timeoutMs) {
    last = await currentResult();
    if (last.includes(part)) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`result never contained "${part}", last: "${last}"`);
}

async function configure() {
  await element(by.id('api-url-input')).replaceText(STUB_FROM_APP());
  await element(by.id('api-key-input')).replaceText('pk_test_ui');
  await element(by.id('configure-button')).tap();
  await waitFor(resultText()).toHaveText('Configured.').withTimeout(5000);
}

async function present(placement: string) {
  await element(by.id('placement-input')).replaceText(placement);
  await element(by.id('present-button')).tap();
}

/** The stub runs on the host, like the test. */
async function admin(path: string) {
  await fetch(`http://127.0.0.1:8799/__admin/${path}`);
}

describe('Miniwall React Native', () => {
  beforeAll(async () => {
    await admin('offline?on=0');
    await device.launchApp({ newInstance: true, delete: true });
    await configure();
  });

  afterAll(async () => {
    await admin('offline?on=0');
  });

  it('presents a toast placement and reports "closed" when it closes by itself', async () => {
    await present('toast'); // display: toast, 3 s
    await resultContains('"outcome":"closed"');
  });

  it('android: system Back on the first screen closes it ("closed")', async () => {
    if (device.getPlatform() !== 'android') return;
    await present('onboarding');
    await new Promise((resolve) => setTimeout(resolve, 1500)); // let the native screen open
    await device.pressBack();
    await resultContains('"outcome":"closed"');
  });

  it('skips a placement that is capped after the first show (frequency_cap)', async () => {
    await present('capped');
    if (device.getPlatform() === 'android') {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await device.pressBack();
      await resultContains('"outcome":"closed"');
      await present('capped');
      await resultContains('frequency_cap');
    }
    // iOS: the first show of "capped" is a full screen only Maestro can close (maestro/purchase.yaml); the cap itself is
    // covered by the Android run and by the shared core tests (AutoTriggersTest/SessionTest).
  });

  it('skips a placement with a 100% holdout', async () => {
    await present('holdout');
    await resultContains('holdout');
  });

  it('offline: the last copy of a screen still shows (cache); a placement never loaded reports an error', async () => {
    await present('toast');
    await resultContains('"outcome":"closed"');
    await admin('offline?on=1');
    await present('toast'); // from the cache
    await resultContains('"outcome":"closed"');
    await present('never_loaded'); // no cache, no network
    await resultContains('Error');
  });

  it('auto placements start and stop', async () => {
    await element(by.id('auto-start-button')).tap();
    await waitFor(resultText()).toHaveText('Auto placements started.').withTimeout(5000);
    await element(by.id('auto-stop-button')).tap();
    await waitFor(resultText()).toHaveText('Auto placements stopped.').withTimeout(5000);
  });
});
