# React Native: end-to-end tests

Two layers, because the screen Miniwall shows is native (SwiftUI / Compose), not React Native:

| Layer | Tool | Covers | Where |
|---|---|---|---|
| TypeScript wrapper | **Jest** (runs anywhere, no simulator) | `present`/reply protocol, handler results, errors, timeout rejection, `dispose`, `stopAutoPlacements`, Fast Refresh | `../__tests__`, `npm test` in this repository |
| App + native bridge | **Detox** (`miniwall.e2e.ts`) | configure/present from RN, toast auto-close, skipped (cap, holdout), offline cache, auto placements, Android Back | here |
| Inside the native screen | **Maestro** (`maestro/*.yaml`) | choose plan, buy, restore, close, multi-screen flow + Back, required question, Android Back | here |

Detox cannot see SwiftUI/Compose nodes; Maestro reads the platform accessibility tree, so it can. Neither has run yet (no Mac,
no emulator at cloud).

## Run

```bash
# 1. Jest (anywhere with node 18+)
npm install && npm test

# 2. Stub API with the test screens (the spec's mock-api/ui), keep it running
node .spec/mock-api/server.cjs 8799

# 3. Sample app build (Mac for iOS), see ../example and ../README.md
cd example && npm install && npx expo prebuild
cd ../e2e && npm install
npm run build:ios && npm run test:ios          # Detox, iOS simulator "iPhone 15"
npm run build:android && npm run test:android  # Detox, AVD "Pixel_7_API_34"

# 4. Maestro (https://maestro.mobile.dev), app installed on the booted simulator/emulator
maestro test maestro/purchase.yaml maestro/restore-close.yaml maestro/flow.yaml
maestro test maestro/android-back.yaml          # Android only
```

Before running 3-4: the sample app needs an `api-url-input` TextInput (value goes to `configure(apiKey, { apiUrl })`; the stub is
`http://127.0.0.1:8799` on iOS and `http://10.0.2.2:8799` on Android). Check the binary paths and scheme name in `.detoxrc.js` after
`expo prebuild` (the iOS project name comes from `app.json`).

## Template sweep

Not a test of behavior: the sample app presents any template of the spec through the deep link
`miniwall-example://present?tpl=<name>` (the sample's `scheme`, handled in `example/App.tsx`, templates in `example/templates.generated.ts`,
`npm run gen:templates` in `example/` writes it from `../.spec`, or from `MINIWALL_SPEC_DIR`) and screenshots each, to compare with the iOS and Android sweeps. The sample also has a
"Template" field (`template-input`, `present-template-button`). Not run yet: needs a simulator or emulator.
