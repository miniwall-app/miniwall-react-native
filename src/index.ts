import { AppRegistry, NativeEventEmitter, NativeModules, Platform, type EmitterSubscription } from 'react-native';

/**
 * Miniwall for React Native. A thin layer over the native SDKs (iOS `MiniwallSDK`, Android
 * `app.miniwall:sdk`): screens render natively; your app keeps selling (Miniwall never charges).
 */

const LINKING_ERROR =
  `@miniwall/react-native is not linked. ${Platform.select({ ios: "Run 'pod install' in ios/.", default: '' })} ` +
  'Rebuild the app after installing (Expo: use a development build, not Expo Go).';

const Native = NativeModules.MiniwallModule
  ? NativeModules.MiniwallModule
  : new Proxy({}, { get: () => { throw new Error(LINKING_ERROR); } });

// Android: the screen is another Activity, so React Native pauses the host Activity and, with it, JavaScript timers
// (a handler that awaits a setTimeout would never answer). While a request waits for JavaScript, the native module runs
// this task, which only exists to keep the timers going (it never ends on its own; native finishes it).
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask('MiniwallKeepAlive', () => () => new Promise<void>(() => {}));
}

export type PeriodUnit = 'day' | 'week' | 'month' | 'year';
export type Period = PeriodUnit | 'lifetime' | { unit: PeriodUnit; count: number };

/** A package's price as your app knows it (store or server). Fills `{{ product.* }}` texts. */
export interface ProductInfo {
  price: number;
  /** ISO 4217 code, e.g. `USD`. */
  currency: string;
  period?: Period;
  /** Shown by `{{ product.store_product_name }}`. */
  title?: string;
  /** Introductory or trial offer; a free trial has price 0. */
  offer?: { price: number; period: Period };
}

/** Answers to questions: an option id or typed text, or option ids for a multiple choice. */
export type Answers = Record<string, string | string[]>;

export type SkipReason = 'frequency_cap' | 'audience' | 'holdout';

export type PurchaseResult =
  | { outcome: 'purchased'; packageId: string; answers: Answers }
  | { outcome: 'restored'; answers: Answers }
  | { outcome: 'closed'; answers: Answers }
  /** A "Run your code" button was pressed. */
  | { outcome: 'action'; actionId: string; answers: Answers }
  /** The placement chose to show nothing. */
  | { outcome: 'skipped'; reason: SkipReason };

export type ColorMode = 'light' | 'dark' | 'system';
export type AttributeValue = string | number | boolean;

export type PresentationStyle =
  | { type: 'fullscreen' }
  | { type: 'modal' }
  | { type: 'sheet' }
  | { type: 'banner'; position?: 'top' | 'bottom' }
  | { type: 'toast'; seconds?: number; position?: 'top' | 'bottom' };

/** Width of a modal, sheet or toast on wide screens (tablets): small 360/320/280, medium 440/380/360, large 560/440/440 dp. */
export type PresentationSize = 'small' | 'medium' | 'large';

export type ScreenSource = { placement: string } | { paywallId: string } | { json: object };

/** Options for placements that show by themselves (`startAutoPlacements`). */
export interface AutoPlacementsOptions extends PresentOptions {
  /** Called when one of them closes or is skipped. */
  onResult?: (placement: string, result: PurchaseResult) => void;
}

export interface ConfigureOptions {
  apiUrl?: string;
  locale?: string;
  colorMode?: ColorMode;
  /** Send views, purchases and answers to Miniwall analytics. Default true. */
  analytics?: boolean;
  /** Audience attributes (`user.<key>`). Read on the device, never sent. */
  attributes?: Record<string, AttributeValue>;
  timeoutMs?: number;
  /** Largest text size multiplier honored from the system font size setting (1 turns it off). Default 1.6. */
  maxFontScale?: number;
}

export interface PresentOptions {
  products?: Record<string, ProductInfo>;
  variablesPerPackage?: Record<string, Record<string, string>>;
  customVariables?: Record<string, AttributeValue>;
  attributes?: Record<string, AttributeValue>;
  locale?: string;
  colorMode?: ColorMode;
  /** Overrides the placement's display. */
  style?: PresentationStyle;
  /** Screens a "Go to screen" button may open, by paywall id (for `json` sources). */
  screens?: Record<string, object>;
  /** Run your purchase. Resolve true when bought, false when cancelled; throw on failure. */
  onPurchase?: (args: { packageId: string; product?: ProductInfo; answers: Answers }) => Promise<boolean> | boolean;
  /** Restore purchases; resolve true when something was restored. Without it the button is hidden. */
  onRestore?: () => Promise<boolean> | boolean;
  /** A "Run your code" button. Resolve false to keep the screen open. */
  onAction?: (args: { actionId: string; answers: Answers }) => Promise<boolean | void> | boolean | void;
  onAnswer?: (args: { fieldId: string; value: string | string[] | undefined; answers: Answers }) => void;
  /** Links in the screen. Default: the system browser. */
  onOpenUrl?: (url: string) => void;
  /** Called with an `Error` (its `message` is the reason) when the screen reports a problem: load failure, a handler that threw, an unusable link. */
  onError?: (error: Error) => void;
  /** The user closed the screen (close button, Back, tap outside): the outcome is `closed`. Not called for a purchase, restore or action. */
  onClose?: () => void;
  /** The placement's targeting chose to show nothing (frequency cap, audience, holdout): no screen was opened. */
  onSkip?: (args: { reason: SkipReason }) => void;
  /** Widest the content gets, in dp/pt; centered on wide screens. Wins over `size`. Default: no limit. */
  maxContentWidth?: number;
  /** Close a modal or sheet by tapping outside it (iOS: also by swiping down). Default true. */
  closeOnBackdrop?: boolean;
  /** Width of a modal, sheet or toast on wide screens. Overrides the placement's display. */
  size?: PresentationSize;
  /** Where a banner or toast sits. Overrides the placement's display. */
  position?: 'top' | 'bottom';
}

interface NativeRequest {
  requestId: string;
  presentationId: string;
  method: 'purchase' | 'restore' | 'action' | 'answer' | 'openUrl' | 'error' | 'autoResult';
  args: Record<string, unknown>;
}

const presentations = new Map<string, PresentOptions>();
let nextId = 0;
let subscribed = false;

// Fast Refresh re-evaluates this module: the previous copy's listener must go, or two listeners answer each request.
const globals = globalThis as typeof globalThis & { __miniwallSubscription?: EmitterSubscription };

function listen() {
  if (subscribed && globals.__miniwallSubscription) return;
  globals.__miniwallSubscription?.remove();
  subscribed = true;
  const emitter = new NativeEventEmitter(Native);
  globals.__miniwallSubscription = emitter.addListener('MiniwallRequest', async (request: NativeRequest) => {
    const options = presentations.get(request.presentationId);
    const reply = (value: unknown) => Native.reply(request.requestId, value ?? null);
    if (!options) return reply(null);
    const a = request.args;
    try {
      switch (request.method) {
        case 'purchase': {
          const packageId = String(a.packageId);
          reply((await options.onPurchase?.({ packageId, product: options.products?.[packageId], answers: a.answers as Answers })) ?? false);
          return;
        }
        case 'restore':
          reply((await options.onRestore?.()) ?? false);
          return;
        case 'action':
          reply((await options.onAction?.({ actionId: String(a.actionId), answers: a.answers as Answers })) !== false);
          return;
        case 'answer':
          options.onAnswer?.({ fieldId: String(a.fieldId), value: (a.value ?? undefined) as string | string[] | undefined, answers: a.answers as Answers });
          return reply(null);
        case 'openUrl':
          options.onOpenUrl?.(String(a.url));
          return reply(null);
        case 'autoResult':
          notify(options, a.result as PurchaseResult);
          (options as AutoPlacementsOptions).onResult?.(String(a.placement), a.result as PurchaseResult);
          return reply(null);
        case 'error':
          options.onError?.(new Error(String(a.message)));
          return reply(null);
      }
    } catch (error) {
      reply({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}

/** `onClose` / `onSkip` as the Web SDK fires them, from the result the native side reports. */
function notify(options: PresentOptions, result: PurchaseResult) {
  if (result.outcome === 'closed') options.onClose?.();
  else if (result.outcome === 'skipped') options.onSkip?.({ reason: result.reason });
}

/** Options without functions, for the native side; which handlers exist goes as flags. */
function nativeOptions(options: PresentOptions & { onResult?: unknown }) {
  const { onPurchase, onRestore, onAction, onAnswer, onOpenUrl, onError, onResult, onClose, onSkip, ...data } = options;
  void onAnswer;
  void onClose;
  void onSkip;
  void onResult;
  void onError;
  return { ...data, hasPurchase: !!onPurchase, hasRestore: !!onRestore, hasAction: !!onAction, hasOpenUrl: !!onOpenUrl };
}

export const Miniwall = {
  /** Call once at startup: `Miniwall.configure('pk_...')`. */
  configure(apiKey: string, options: ConfigureOptions = {}): void {
    listen();
    Native.configure({ ...options, apiKey });
  },

  /** Adds or changes audience attributes; `null` removes one. */
  setAttributes(attributes: Record<string, AttributeValue | null>): void {
    Native.setAttributes(attributes);
  },

  /** Shows a screen and resolves when it closes. */
  async present(source: ScreenSource, options: PresentOptions = {}): Promise<PurchaseResult> {
    listen();
    const presentationId = String(++nextId);
    presentations.set(presentationId, options);
    try {
      const result: PurchaseResult = await Native.present({ presentationId, source, options: nativeOptions(options) });
      notify(options, result);
      return result;
    } finally {
      presentations.delete(presentationId);
    }
  },

  /** `present({ placement })`. */
  presentPlacement(placement: string, options: PresentOptions = {}): Promise<PurchaseResult> {
    return Miniwall.present({ placement }, options);
  },

  /** Loads placements' screens and images ahead of time. */
  preload(placements: string[]): Promise<void> {
    return Native.preload({ placements });
  },

  /**
   * Starts the placements that show by themselves (dashboard > placement > "Show it": when the app
   * opens, after a delay, or on an event you report with `track`). Call once after `configure`.
   * The options (prices, purchase handlers) apply to all of them.
   */
  startAutoPlacements(options: AutoPlacementsOptions = {}): void {
    listen();
    presentations.set('auto', options);
    Native.startAutoPlacements({ options: nativeOptions(options) });
  },

  /** Stops the placements started by `startAutoPlacements` (e.g. on sign-out). They can be started again. */
  stopAutoPlacements(): void {
    presentations.delete('auto');
    Native.stopAutoPlacements();
  },

  /**
   * Removes the JavaScript listener and stops the auto placements. Call it when you tear down the whole app
   * (tests, an embedded React Native view); `configure`, `present` or `startAutoPlacements` set it up again.
   */
  dispose(): void {
    globals.__miniwallSubscription?.remove();
    globals.__miniwallSubscription = undefined;
    subscribed = false;
    presentations.clear();
    Native.stopAutoPlacements();
  },

  /** Tells Miniwall something happened in the app, e.g. `track('level_completed')`. */
  track(event: string): void {
    Native.track({ event });
  },

  /** A purchase that finished outside the screen; credited to the screen where buy was tapped. */
  reportPurchase(details: { packageId?: string; paywallId?: string } = {}): void {
    Native.reportPurchase(details);
  },

  /** Forgets this device's visitor id and counters (e.g. on sign-out). */
  reset(placements: string[] = []): void {
    Native.reset({ placements });
  },
};

export default Miniwall;
