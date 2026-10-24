# @miniwall/react-native

Miniwall for React Native: screens built in the Miniwall dashboard, rendered natively by the iOS
and Android SDKs. React Native 0.74+ (tested on 0.88 / Expo SDK 58; Expo SDK 58 itself needs iOS 16.4+), iOS 16+, Android minSdk 24. React Native 0.74 does not start on the iOS 27 SDK (no scene lifecycle): use a current release there (0.88 is tested). Status: `0.1.0`. Tested with Expo SDK 58 / React Native 0.88 on an Android 15 emulator and an iOS 27 simulator: Jest 26/26, the sample app (configure, present, purchase), and the 77-template sweep on both (light mode; dark and largest text were swept before the last two rounds of changes).

## Install

1. `npm install @miniwall/react-native` (Expo: `npx expo install @miniwall/react-native`).
2. iOS: `cd ios && pod install`. The wrapper pod pulls `MiniwallSDK` from CocoaPods.
3. Android: `app.miniwall:sdk` is served from `https://maven.miniwall.app`. The Expo config plugin adds that repository to the app; in a bare React Native app add `maven { url "https://maven.miniwall.app"; content { includeGroup "app.miniwall" } }` to `allprojects { repositories { ... } }` in `android/build.gradle`.
4. Expo: use a development build (Expo Go cannot load native modules).

## Use

```ts
import { Miniwall } from '@miniwall/react-native';

Miniwall.configure('pk_...');

const result = await Miniwall.presentPlacement('upgrade', {
  products: { monthly: { price: 9.99, currency: 'USD', period: 'month' } },
  onPurchase: async ({ packageId }) => buyWithYourBillingLibrary(packageId), // true = bought
  onRestore: async () => restore(),
});
if (result.outcome === 'purchased') unlock();
```

`present({ placement } | { paywallId } | { json }, options)`, `preload`, `setAttributes`,
`reportPurchase`, `reset`: same meaning as the native SDKs.

## Placements that show by themselves

```ts
Miniwall.startAutoPlacements({
  products: { monthly: { price: 9.99, currency: 'USD', period: 'month' } },
  onPurchase: async ({ packageId }) => buyWithYourBillingLibrary(packageId),
  onResult: (placement, result) => console.log(placement, result.outcome),
});
Miniwall.track('level_completed'); // events that placements listen for
Miniwall.stopAutoPlacements();     // e.g. on sign-out; call startAutoPlacements again to resume
```

`startAutoPlacements` accepts every `present` option (`style` and `screens` included) plus `onResult`.
`Miniwall.dispose()` removes the JavaScript listener and stops the auto placements (tests, embedded React Native views);
the next `configure`, `present` or `startAutoPlacements` sets the listener up again. Reloading the app (including Fast Refresh)
is handled: the old listener is removed and the native side frees every screen waiting on JavaScript.

## Handlers

- `onPurchase({ packageId, product, answers })`: `Promise<boolean> | boolean`. `true` = bought, `false` = cancelled. Throwing shows no
  success and calls `onError`.
- `onRestore()`: `Promise<boolean> | boolean`; without it the Restore button is hidden.
- `onAction({ actionId, answers })`: `Promise<boolean | void> | boolean | void`. `false` keeps the screen open; anything else closes it.
  Throwing keeps the screen open and calls `onError`.
- `onAnswer({ fieldId, value, answers })`, `onOpenUrl(url)`: notifications; the screen does not wait for them.
- `onError(error: Error)`: failures the screen reports (load failure, a handler that threw, an unusable link); `error.message` has the reason.

## Develop

```bash
scripts/fetch-spec.sh   # the Miniwall spec pinned in SPEC_VERSION -> .spec/ (or set MINIWALL_SPEC_DIR to your own checkout)
npm ci && npm run typecheck && npm test
```

`example/` is a sample Expo app (a development build; Expo Go cannot load native modules) that bundles the spec's templates:
`cd example && npm install && npx expo prebuild && npm run ios` (or `android`). `e2e/` holds the Detox and Maestro flows that drive it
against the spec's mock API (`node .spec/mock-api/server.cjs 8799`); see `e2e/README.md`. To sweep a bigger library than the open spec's
ten example templates, set `MINIWALL_SPEC_DIR` to a spec folder that has more `fixtures/templates`.
