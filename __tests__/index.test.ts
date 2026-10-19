import type * as RN from '../test/react-native-mock';

type Mock = typeof RN;
type SdkModule = typeof import('../src/index');

interface Loaded {
  Miniwall: SdkModule['Miniwall'];
  native: Record<string, jest.Mock>;
  rn: Mock;
}

/** Loads a fresh copy of the SDK (module state: listener, presentation ids) next to a fresh native module. */
function load(opts: { linked?: boolean } = {}): Loaded {
  let loaded!: Loaded;
  jest.isolateModules(() => {
    const rn = require('../test/react-native-mock') as Mock;
    rn.resetListeners();
    const native = rn.makeNativeModule();
    if (opts.linked !== false) rn.NativeModules.MiniwallModule = native;
    else delete rn.NativeModules.MiniwallModule;
    // src/index.ts imports 'react-native', which the jest config maps to the same mock file.
    const { Miniwall } = require('../src/index') as SdkModule;
    loaded = { Miniwall, native, rn };
  });
  return loaded;
}

beforeEach(() => {
  delete (globalThis as { __miniwallSubscription?: unknown }).__miniwallSubscription;
});

describe('configure and pass-through calls', () => {
  it('sends the api key with the options and subscribes once', () => {
    const { Miniwall, native, rn } = load();
    Miniwall.configure('pk_test', { locale: 'fr_FR', analytics: false, timeoutMs: 3000 });
    Miniwall.configure('pk_test');
    expect(native.configure).toHaveBeenNthCalledWith(1, { apiKey: 'pk_test', locale: 'fr_FR', analytics: false, timeoutMs: 3000 });
    expect(rn.listenerCount('MiniwallRequest')).toBe(1);
  });

  it('passes track, setAttributes, reset, reportPurchase and preload to the native module', async () => {
    const { Miniwall, native } = load();
    Miniwall.setAttributes({ plan: 'pro', beta: null });
    Miniwall.track('level_completed');
    Miniwall.reset(['onboarding']);
    Miniwall.reset();
    Miniwall.reportPurchase({ packageId: 'annual' });
    await Miniwall.preload(['a', 'b']);
    expect(native.setAttributes).toHaveBeenCalledWith({ plan: 'pro', beta: null });
    expect(native.track).toHaveBeenCalledWith({ event: 'level_completed' });
    expect(native.reset).toHaveBeenNthCalledWith(1, { placements: ['onboarding'] });
    expect(native.reset).toHaveBeenNthCalledWith(2, { placements: [] });
    expect(native.reportPurchase).toHaveBeenCalledWith({ packageId: 'annual' });
    expect(native.preload).toHaveBeenCalledWith({ placements: ['a', 'b'] });
  });

  it('throws the linking error when the native module is missing', () => {
    const { Miniwall } = load({ linked: false });
    expect(() => Miniwall.track('x')).toThrow(/not linked/);
  });
});

describe('present', () => {
  it('sends the source and the options without functions, with flags for the handlers', async () => {
    const { Miniwall, native } = load();
    native.present.mockResolvedValue({ outcome: 'closed', answers: {} });
    const products = { monthly: { price: 9.99, currency: 'USD', period: 'month' as const } };
    const result = await Miniwall.present(
      { placement: 'onboarding' },
      { products, locale: 'en_US', onPurchase: () => true, onRestore: () => false, onError: () => {} },
    );
    expect(result).toEqual({ outcome: 'closed', answers: {} });
    const call = native.present.mock.calls[0][0];
    expect(call.source).toEqual({ placement: 'onboarding' });
    expect(call.options).toEqual({ products, locale: 'en_US', hasPurchase: true, hasRestore: true, hasAction: false, hasOpenUrl: false });
    expect(Object.values(call.options).some((v) => typeof v === 'function')).toBe(false);
  });

  it('passes the display options to native and keeps onClose / onSkip in JavaScript', async () => {
    const { Miniwall, native } = load();
    const onClose = jest.fn();
    const onSkip = jest.fn();
    native.present.mockResolvedValueOnce({ outcome: 'closed', answers: {} });
    await Miniwall.present({ placement: 'p' }, { maxContentWidth: 480, closeOnBackdrop: false, size: 'small', position: 'top', onClose, onSkip, onPurchase: () => true });
    const options = native.present.mock.calls[0][0].options;
    expect(options).toEqual({ maxContentWidth: 480, closeOnBackdrop: false, size: 'small', position: 'top', hasPurchase: true, hasRestore: false, hasAction: false, hasOpenUrl: false });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('calls onSkip with the reason when the placement showed nothing, and neither for a purchase', async () => {
    const { Miniwall, native } = load();
    const onClose = jest.fn();
    const onSkip = jest.fn();
    native.present.mockResolvedValueOnce({ outcome: 'skipped', reason: 'holdout' });
    await Miniwall.present({ placement: 'p' }, { onClose, onSkip });
    expect(onSkip).toHaveBeenCalledWith({ reason: 'holdout' });
    native.present.mockResolvedValueOnce({ outcome: 'purchased', packageId: 'm', answers: {} });
    await Miniwall.present({ placement: 'p' }, { onClose, onSkip });
    expect(onClose).not.toHaveBeenCalled();
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('gives every presentation its own id and forgets it when it ends', async () => {
    const { Miniwall, native, rn } = load();
    let finish!: (value: unknown) => void;
    native.present.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const pending = Miniwall.present({ placement: 'a' }, { onPurchase: () => true });
    const id = native.present.mock.calls[0][0].presentationId;
    await rn.emit('MiniwallRequest', { requestId: 'r1', presentationId: id, method: 'purchase', args: { packageId: 'm', answers: {} } });
    expect(native.reply).toHaveBeenLastCalledWith('r1', true);
    finish({ outcome: 'purchased', packageId: 'm', answers: {} });
    await pending;
    // The screen is gone: a late request for it gets a null reply instead of reaching the old handler.
    await rn.emit('MiniwallRequest', { requestId: 'r2', presentationId: id, method: 'purchase', args: { packageId: 'm', answers: {} } });
    expect(native.reply).toHaveBeenLastCalledWith('r2', null);
    native.present.mockResolvedValueOnce({ outcome: 'closed', answers: {} });
    await Miniwall.presentPlacement('b');
    expect(native.present.mock.calls[1][0].presentationId).not.toBe(id);
    expect(native.present.mock.calls[1][0].source).toEqual({ placement: 'b' });
  });

  it('rejects when the native side gives up (load timeout) and still cleans up', async () => {
    const { Miniwall, native, rn } = load();
    native.present.mockRejectedValueOnce(new Error('Miniwall: the screen took too long to load'));
    await expect(Miniwall.present({ placement: 'slow' }, { onPurchase: () => true })).rejects.toThrow('took too long');
    const id = native.present.mock.calls[0][0].presentationId;
    await rn.emit('MiniwallRequest', { requestId: 'late', presentationId: id, method: 'restore', args: {} });
    expect(native.reply).toHaveBeenLastCalledWith('late', null);
  });
});

describe('requests from the native side', () => {
  async function open(options: Parameters<Loaded['Miniwall']['present']>[1]) {
    const loaded = load();
    loaded.native.present.mockImplementation(() => new Promise(() => {}));
    void loaded.Miniwall.present({ json: {} }, options);
    const presentationId = loaded.native.present.mock.calls[0][0].presentationId as string;
    const ask = (method: string, args: Record<string, unknown> = {}, requestId = 'req') =>
      loaded.rn.emit('MiniwallRequest', { requestId, presentationId, method, args });
    return { ...loaded, ask };
  }

  it('purchase: calls onPurchase with the package, its product and the answers, and replies with the result', async () => {
    const onPurchase = jest.fn().mockResolvedValue(true);
    const products = { annual: { price: 79.99, currency: 'USD', period: 'year' as const } };
    const { ask, native } = await open({ products, onPurchase });
    await ask('purchase', { packageId: 'annual', answers: { goal: 'energy' } });
    expect(onPurchase).toHaveBeenCalledWith({ packageId: 'annual', product: products.annual, answers: { goal: 'energy' } });
    expect(native.reply).toHaveBeenCalledWith('req', true);
  });

  it('purchase without a handler replies false; a cancelled purchase replies false', async () => {
    const none = await open({});
    await none.ask('purchase', { packageId: 'm', answers: {} });
    expect(none.native.reply).toHaveBeenCalledWith('req', false);
    const cancelled = await open({ onPurchase: () => false });
    await cancelled.ask('purchase', { packageId: 'm', answers: {} });
    expect(cancelled.native.reply).toHaveBeenCalledWith('req', false);
  });

  it('a handler that throws replies with { error } so the screen reports it', async () => {
    const { ask, native } = await open({ onPurchase: async () => { throw new Error('store busy'); } });
    await ask('purchase', { packageId: 'm', answers: {} });
    expect(native.reply).toHaveBeenCalledWith('req', { error: 'store busy' });
  });

  it('restore replies with the handler result, false without one', async () => {
    const yes = await open({ onRestore: async () => true });
    await yes.ask('restore');
    expect(yes.native.reply).toHaveBeenCalledWith('req', true);
    const no = await open({});
    await no.ask('restore');
    expect(no.native.reply).toHaveBeenCalledWith('req', false);
  });

  it('action: only an explicit false keeps the screen open', async () => {
    const calls: Array<boolean | void | Promise<boolean | void>> = [false, true, undefined, Promise.resolve(false)];
    const expected = [false, true, true, false];
    for (const [i, value] of calls.entries()) {
      const { ask, native } = await open({ onAction: () => value });
      await ask('action', { actionId: 'upgrade', answers: { q: 'a' } });
      expect(native.reply).toHaveBeenCalledWith('req', expected[i]);
    }
    const { ask, native } = await open({});
    await ask('action', { actionId: 'x', answers: {} });
    expect(native.reply).toHaveBeenCalledWith('req', true);
  });

  it('answer, openUrl and error notify the handlers and reply null', async () => {
    const onAnswer = jest.fn();
    const onOpenUrl = jest.fn();
    const onError = jest.fn();
    const { ask, native } = await open({ onAnswer, onOpenUrl, onError });
    await ask('answer', { fieldId: 'goal', value: 'energy', answers: { goal: 'energy' } });
    await ask('answer', { fieldId: 'name', answers: {} });
    await ask('openUrl', { url: 'https://example.com/terms' });
    await ask('error', { message: 'could not load' });
    expect(onAnswer).toHaveBeenNthCalledWith(1, { fieldId: 'goal', value: 'energy', answers: { goal: 'energy' } });
    expect(onAnswer).toHaveBeenNthCalledWith(2, { fieldId: 'name', value: undefined, answers: {} });
    expect(onOpenUrl).toHaveBeenCalledWith('https://example.com/terms');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'could not load' }));
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(native.reply).toHaveBeenCalledTimes(4);
    expect(native.reply.mock.calls.every(([, value]) => value === null)).toBe(true);
  });

  it('a request for an unknown presentation replies null', async () => {
    const { Miniwall, native, rn } = load();
    Miniwall.configure('pk');
    await rn.emit('MiniwallRequest', { requestId: 'x', presentationId: 'nope', method: 'purchase', args: { packageId: 'm', answers: {} } });
    expect(native.reply).toHaveBeenCalledWith('x', null);
  });
});

describe('auto placements', () => {
  it('startAutoPlacements registers the options as "auto" and routes autoResult to onResult', async () => {
    const { Miniwall, native, rn } = load();
    const onResult = jest.fn();
    const onPurchase = jest.fn().mockResolvedValue(true);
    Miniwall.startAutoPlacements({ products: { m: { price: 1, currency: 'USD' } }, onPurchase, onResult });
    expect(native.startAutoPlacements).toHaveBeenCalledWith({
      options: { products: { m: { price: 1, currency: 'USD' } }, hasPurchase: true, hasRestore: false, hasAction: false, hasOpenUrl: false },
    });
    await rn.emit('MiniwallRequest', { requestId: 'a', presentationId: 'auto', method: 'purchase', args: { packageId: 'm', answers: {} } });
    expect(onPurchase).toHaveBeenCalled();
    await rn.emit('MiniwallRequest', { requestId: 'b', presentationId: 'auto', method: 'autoResult', args: { placement: 'launch', result: { outcome: 'skipped', reason: 'frequency_cap' } } });
    expect(onResult).toHaveBeenCalledWith('launch', { outcome: 'skipped', reason: 'frequency_cap' });
  });

  it('stopAutoPlacements stops native and drops the handlers: later requests get null', async () => {
    const { Miniwall, native, rn } = load();
    const onResult = jest.fn();
    Miniwall.startAutoPlacements({ onResult });
    Miniwall.stopAutoPlacements();
    expect(native.stopAutoPlacements).toHaveBeenCalledTimes(1);
    await rn.emit('MiniwallRequest', { requestId: 'c', presentationId: 'auto', method: 'autoResult', args: { placement: 'p', result: { outcome: 'closed', answers: {} } } });
    expect(onResult).not.toHaveBeenCalled();
    expect(native.reply).toHaveBeenCalledWith('c', null);
    // It can be started again.
    Miniwall.startAutoPlacements({ onResult });
    await rn.emit('MiniwallRequest', { requestId: 'd', presentationId: 'auto', method: 'autoResult', args: { placement: 'p', result: { outcome: 'closed', answers: {} } } });
    expect(onResult).toHaveBeenCalledTimes(1);
  });
});

describe('dispose and reload', () => {
  it('dispose removes the listener, forgets presentations and stops auto placements; configure sets it up again', async () => {
    const { Miniwall, native, rn } = load();
    Miniwall.configure('pk');
    expect(rn.listenerCount('MiniwallRequest')).toBe(1);
    native.present.mockImplementation(() => new Promise(() => {}));
    void Miniwall.present({ placement: 'p' }, { onPurchase: () => true });
    Miniwall.dispose();
    expect(rn.listenerCount('MiniwallRequest')).toBe(0);
    expect(native.stopAutoPlacements).toHaveBeenCalledTimes(1);
    Miniwall.configure('pk');
    expect(rn.listenerCount('MiniwallRequest')).toBe(1);
    const id = native.present.mock.calls[0][0].presentationId;
    await rn.emit('MiniwallRequest', { requestId: 'z', presentationId: id, method: 'purchase', args: { packageId: 'm', answers: {} } });
    expect(native.reply).toHaveBeenCalledWith('z', null);
  });

  it('a second copy of the module (Fast Refresh) removes the first copy\'s listener before adding its own', () => {
    const globals = globalThis as { __miniwallSubscription?: { remove: () => void } };
    const first = load();
    first.Miniwall.configure('pk');
    const old = globals.__miniwallSubscription!;
    const removeOld = jest.spyOn(old, 'remove');
    const second = load(); // fresh module state, the global subscription of the first copy is still there
    second.Miniwall.configure('pk');
    expect(removeOld).toHaveBeenCalledTimes(1);
    expect(globals.__miniwallSubscription).not.toBe(old);
    expect(second.rn.listenerCount('MiniwallRequest')).toBe(1);
  });
});

describe('Android keeps JavaScript timers running while a screen waits for JS', () => {
  it('registers the MiniwallKeepAlive headless task on Android only', () => {
    const android = load();
    expect(android.rn.AppRegistry.registerHeadlessTask).not.toHaveBeenCalled();
    jest.isolateModules(() => {
      const rn = require('../test/react-native-mock') as Mock;
      rn.Platform.OS = 'android';
      rn.AppRegistry.registerHeadlessTask.mockClear();
      require('../src/index');
      expect(rn.AppRegistry.registerHeadlessTask).toHaveBeenCalledWith('MiniwallKeepAlive', expect.any(Function));
      rn.Platform.OS = 'ios';
    });
  });
});
