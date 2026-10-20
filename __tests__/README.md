# React Native: Jest tests

`index.test.ts` tests `src/index.ts` in plain node: `react-native` is replaced by `test/react-native-mock.ts` (a fake `NativeModules.MiniwallModule`
and `NativeEventEmitter`), so no Metro, simulator or React Native install is needed.

```bash
npm install        # jest, ts-jest, @types/jest, @types/node, typescript
npm test
```

Covers: configure, pass-through calls, `present` (flags instead of functions, ids, cleanup, native rejection such as the load timeout),
every request from native (purchase, restore, action, answer, openUrl, error, autoResult) including thrown handlers and unknown
presentations, `startAutoPlacements` / `stopAutoPlacements`, `dispose`, and a second copy of the module (Fast Refresh).

