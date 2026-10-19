# @miniwall/react-native

Miniwall for React Native: screens built in the Miniwall dashboard, rendered natively by the iOS
and Android SDKs. React Native 0.74+ (tested on 0.88 / Expo SDK 58; Expo SDK 58 itself needs iOS 16.4+), iOS 16+, Android minSdk 24. React Native 0.74 does not start on the iOS 27 SDK (no scene lifecycle): use a current release there (0.88 is tested). Status: preview (not on npm yet).

## Install (local, before publishing)

1. `npm install <repo>/sdks/react-native`
2. iOS `Podfile`: `pod 'MiniwallCore', :path => '<repo>/sdks/ios'` and `pod 'MiniwallSDK', :path => '<repo>/sdks/ios'`, then `pod install`. The wrapper pod depends on `MiniwallSDK ~> 0.1`; until that pod is published, the two `:path` lines above are required.
3. Android: until `app.miniwall:sdk` is on Maven Central, publish it once to your machine (`cd <repo>/sdks/android && ./gradlew publishToMavenLocal`) and add `mavenLocal()` to the app's `allprojects { repositories { ... } }` (the Expo config plugin does this with `androidMavenLocal: true`). Do not use `includeBuild` with a current React Native: the native SDK builds with AGP 8.7.3, React Native 0.88 / Expo SDK 58 with AGP 9, and Gradle refuses two AGP versions in one build. Add `MiniwallPackage()` to your packages if autolinking does not.
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
