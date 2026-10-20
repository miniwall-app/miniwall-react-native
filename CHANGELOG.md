## 0.1.0

- First preview: `Miniwall.configure`, `present`, `presentPlacement`, `preload`, `startAutoPlacements`, `track`, `setAttributes`, `reportPurchase`, `reset`.
- Screens are drawn by the native iOS and Android SDKs.
- Android: JavaScript timers keep running while a screen is open, so handlers may use `setTimeout`.
- The native SDKs show a screen after waiting at most 1.5 s for its custom fonts (see their changelogs).
