// Sample app: the same scenario as the iOS sample app. Needs a development build (Expo Go cannot load native modules):
//   npm install && npx expo prebuild && npx expo run:ios   (or run:android)
// testID and accessibilityLabel are stable on purpose: UI tests (Detox) find controls by testID.
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Miniwall, type PresentOptions, type PurchaseResult, type ScreenSource } from '@miniwall/react-native';
import { loadTemplate, styleFor, templateFromUrl } from './templates';

const DEFAULT_PLACEMENT = 'onboarding';
const DEFAULT_EVENT = 'level_completed';
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Prices come from your app (store or server); Miniwall only renders them. */
const products: NonNullable<PresentOptions['products']> = {
  monthly: { price: 9.99, currency: 'USD', period: 'month' },
  annual: { price: 79.99, currency: 'USD', period: 'year', offer: { price: 0, period: { unit: 'day', count: 7 } } },
};

function Button({ id, label, onPress, disabled }: { id: string; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [apiKey, setApiKey] = useState(''); // a publishable key: Dashboard > Install. Empty = nothing to fetch.
  const [apiUrl, setApiUrl] = useState(''); // empty = the production API; a stub server for UI tests (the spec's mock-api/server.cjs)
  const [placement, setPlacement] = useState(DEFAULT_PLACEMENT);
  const [eventName, setEventName] = useState(DEFAULT_EVENT);
  const [configured, setConfigured] = useState(false);
  const [autoOn, setAutoOn] = useState(false);
  const [template, setTemplate] = useState('');
  const [log, setLog] = useState('Enter an API key, then tap Configure.');

  const handlers = (): PresentOptions => ({
    products,
    // Fake purchase: pretend the store took 0.8 s and said yes. Replace with your billing library.
    onPurchase: async ({ packageId }) => {
      setLog(`Buying ${packageId}...`);
      await sleep(800);
      return true;
    },
    // Fake restore: nothing to restore.
    onRestore: async () => {
      setLog('Restoring...');
      await sleep(500);
      return false;
    },
    onAction: ({ actionId, answers }) => {
      setLog(`Action ${actionId}, answers ${JSON.stringify(answers)}`);
      return true;
    },
    onError: (error) => setLog(`Error: ${error.message}`),
  });

  const present = async (source: ScreenSource) => {
    try {
      const result: PurchaseResult = await Miniwall.present(source, handlers());
      setLog(JSON.stringify(result));
    } catch (error) {
      setLog(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  useEffect(() => () => Miniwall.stopAutoPlacements(), []);

  /** Presents a template of the library without a server (the template sweep). Configures with a throwaway key, no analytics. */
  const presentTemplate = async (name: string) => {
    const screen = loadTemplate(name);
    if (!screen) {
      setLog(`error:template ${name} is not in the app (run node tool/gen-templates.js)`);
      return;
    }
    if (!configured) {
      Miniwall.configure('pk_example', { analytics: false, timeoutMs: 3000 });
      setConfigured(true);
    }
    const welcome = loadTemplate('welcome') as { id?: string } | undefined;
    setLog(`presenting ${name}`);
    try {
      const result = await Miniwall.present(
        { json: screen },
        { ...handlers(), style: styleFor(name), screens: welcome?.id ? { [welcome.id]: welcome } : undefined },
      );
      setLog(JSON.stringify(result));
    } catch (error) {
      setLog(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Template sweep: `miniwall-example://present?tpl=<name>`, on a cold start or while the app runs (tool/sweep-templates.sh).
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      const name = templateFromUrl(url);
      if (name) void presentTemplate(name);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const name = templateFromUrl(url);
      if (name) void presentTemplate(name);
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const configure = () => {
    Miniwall.configure(apiKey.trim(), apiUrl.trim() ? { apiUrl: apiUrl.trim() } : undefined);
    setConfigured(true);
    setLog('Configured.');
  };

  const startAuto = () => {
    Miniwall.startAutoPlacements({
      ...handlers(),
      onResult: (name, result) => setLog(`auto ${name}: ${result.outcome}`),
    });
    setAutoOn(true);
    setLog('Auto placements started.');
  };

  const stopAuto = () => {
    Miniwall.stopAutoPlacements();
    setAutoOn(false);
    setLog('Auto placements stopped.');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">Miniwall sample</Text>

        <Text style={styles.label}>API URL (optional)</Text>
        <TextInput
          testID="api-url-input"
          accessibilityLabel="API URL"
          style={styles.input}
          value={apiUrl}
          onChangeText={setApiUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="http://10.0.2.2:8799"
        />

        <Text style={styles.label}>API key</Text>
        <TextInput
          testID="api-key-input"
          accessibilityLabel="API key"
          style={styles.input}
          value={apiKey}
          onChangeText={setApiKey}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="pk_..."
        />
        <Button id="configure-button" label="Configure" onPress={configure} disabled={!apiKey.trim()} />

        <Text style={styles.label}>Placement</Text>
        <TextInput testID="placement-input" accessibilityLabel="Placement" style={styles.input} value={placement} onChangeText={setPlacement} autoCapitalize="none" />
        <Button id="present-button" label={`Present "${placement}"`} onPress={() => present({ placement })} disabled={!configured || !placement} />
        <Button
          id="preload-button"
          label="Preload"
          onPress={() => {
            Miniwall.preload([placement]).then(() => setLog(`Preloaded ${placement}.`), (e: Error) => setLog(`Error: ${e.message}`));
          }}
          disabled={!configured || !placement}
        />

        <Text style={styles.label}>Auto placements</Text>
        <Button id="auto-start-button" label="Start auto placements" onPress={startAuto} disabled={!configured || autoOn} />
        <Button id="auto-stop-button" label="Stop auto placements" onPress={stopAuto} disabled={!autoOn} />
        <TextInput testID="event-input" accessibilityLabel="Event name" style={styles.input} value={eventName} onChangeText={setEventName} autoCapitalize="none" />
        <Button
          id="track-button"
          label={`Track "${eventName}"`}
          onPress={() => {
            Miniwall.track(eventName);
            setLog(`Tracked ${eventName}.`);
          }}
          disabled={!configured || !eventName}
        />

        <Text style={styles.label}>Template (offline, bundled)</Text>
        <TextInput testID="template-input" accessibilityLabel="Template" style={styles.input} value={template} onChangeText={setTemplate} autoCapitalize="none" autoCorrect={false} placeholder="calm-money" />
        <Button id="present-template-button" label="Present template" onPress={() => void presentTemplate(template.trim())} disabled={!template.trim()} />

        <Text style={styles.label}>Result</Text>
        <View style={styles.logBox}>
          <Text testID="result-text" accessibilityLabel="Result" accessibilityLiveRegion="polite" style={styles.log}>{log}</Text>
        </View>
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f6f8' },
  content: { padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 10 },
  input: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#d0d0d6', padding: 10, fontSize: 16 },
  button: { backgroundColor: '#4f46e5', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  logBox: { backgroundColor: '#fff', borderRadius: 8, padding: 10, minHeight: 60 },
  log: { fontFamily: 'Courier', fontSize: 13 },
});
