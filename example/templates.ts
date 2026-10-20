// Template sweep support, the counterpart of `-tpl <name>` in the iOS sample app and `--es tpl <name>` in the Android sample app:
// presents a template of the library by name, from a deep link `miniwall-example://present?tpl=<name>` or the sample's text field.
import type { PresentationStyle } from '@miniwall/react-native';
import { bundledTemplates } from './templates.generated';

/** The template named in a deep link, or null when the link names none. */
export function templateFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /[?&]tpl=([^&#]*)/.exec(url);
  const name = match ? decodeURIComponent(match[1]) : '';
  return name || null;
}

/** How a placement would show the template: the library names its display in the file name; everything else is a full screen. */
export function styleFor(name: string): PresentationStyle | undefined {
  if (name.endsWith('-toast')) return { type: 'toast', seconds: 60 };
  if (name.endsWith('-bar') || name.endsWith('-banner')) return { type: 'banner', position: 'top' };
  if (name.endsWith('-slide-in')) return { type: 'sheet' };
  if (name.endsWith('-drawer') || name.endsWith('-launcher')) return { type: 'modal' };
  return undefined;
}

/** A template (`{description, paywall}`) or one of the small component screens; undefined when the library has none by that name. */
export function loadTemplate(name: string): object | undefined {
  const root = bundledTemplates[name];
  return root ? (root.paywall ?? root) : undefined;
}
