// A stand-in for the `react-native` package, only what src/index.ts uses. It lets Jest run the TypeScript layer in plain
// node (no Metro, no simulator). The native module is a set of jest.fn(); `emit` plays the native side calling JS.
type Listener = (payload: unknown) => unknown;

const listeners = new Map<string, Set<Listener>>();

export const Platform = {
  OS: 'ios',
  select: <T>(spec: { ios?: T; android?: T; default?: T }): T | undefined => spec.ios ?? spec.default,
};

export const AppRegistry = { registerHeadlessTask: jest.fn() };

export const NativeModules: { MiniwallModule?: Record<string, jest.Mock> } = {};

export function makeNativeModule(): Record<string, jest.Mock> {
  return {
    configure: jest.fn(),
    setAttributes: jest.fn(),
    present: jest.fn(),
    preload: jest.fn(() => Promise.resolve()),
    startAutoPlacements: jest.fn(),
    stopAutoPlacements: jest.fn(),
    track: jest.fn(),
    reportPurchase: jest.fn(),
    reset: jest.fn(),
    reply: jest.fn(),
  };
}

export type EmitterSubscription = { remove: () => void };

export class NativeEventEmitter {
  constructor(public readonly nativeModule?: unknown) {}

  addListener(event: string, listener: Listener): EmitterSubscription {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(listener);
    return { remove: () => void listeners.get(event)?.delete(listener) };
  }
}

/** Native -> JS: deliver an event and wait for every listener (they are async). Returns how many heard it. */
export async function emit(event: string, payload: unknown): Promise<number> {
  const heard = [...(listeners.get(event) ?? [])];
  await Promise.all(heard.map((listener) => listener(payload)));
  return heard.length;
}

export function listenerCount(event: string): number {
  return listeners.get(event)?.size ?? 0;
}

export function resetListeners(): void {
  listeners.clear();
}
