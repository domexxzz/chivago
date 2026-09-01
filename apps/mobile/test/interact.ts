/**
 * Mount a component, press things, and read what changed.
 *
 * `render.ts` renders to a string and can only ask what a screen SAYS.
 * Everything a traveller actually DOES — picking a rating, choosing a report
 * reason, submitting — needs a mounted tree with state, which is what
 * react-test-renderer gives without a DOM.
 *
 * The network is faked at `globalThis.fetch` rather than by stubbing the api
 * module. Faking the module would test the screens against a hand-written
 * client; faking fetch runs the REAL client, envelope handling and all, and
 * still lets a test decide what the server said.
 */

import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import type { ReactElement } from 'react';

export interface Mounted {
  root: ReactTestInstance;
  renderer: ReactTestRenderer;
  /** Visible text, in order, whitespace collapsed. */
  text(): string;
  /** Every accessibility label currently in the tree. */
  labels(): string[];
  /** Fire a press on the first node whose accessibility label matches. */
  press(label: string | RegExp): Promise<void>;
  /**
   * Begin and end a press-and-hold, separately.
   *
   * The SOS is the one control in the app where the two halves mean
   * different things - the press starts a timer and the release cancels it -
   * so a single `press` cannot exercise it at all.
   */
  pressIn(label: string | RegExp): Promise<void>;
  pressOut(label: string | RegExp): Promise<void>;
  /** Fire a text change on the first TextInput. */
  type(value: string, label?: string | RegExp): Promise<void>;
  /** The node whose accessibility label matches, or undefined. */
  find(label: string | RegExp): ReactTestInstance | undefined;
  /**
   * Press the innermost pressable whose own text says this.
   *
   * Not every control carries an `accessibilityLabel`: a button named by the
   * words inside it is correct on a phone, where the screen reader reads the
   * content. This finds those the way a traveller does - by what it says.
   */
  pressText(text: string | RegExp): Promise<void>;
  unmount(): void;
}

const collectText = (node: unknown): string[] => {
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (node && typeof node === 'object' && 'children' in node) {
    return collectText((node as { children: unknown }).children);
  }
  return [];
};

const matches = (value: unknown, want: string | RegExp): boolean => {
  if (typeof value !== 'string') return false;
  return typeof want === 'string' ? value === want : want.test(value);
};

/** Every string rendered inside this node, including its descendants. */
const textOf = (node: ReactTestInstance): string => {
  const parts: string[] = [];
  const walk = (n: ReactTestInstance | string): void => {
    if (typeof n === 'string') { parts.push(n); return; }
    n.children.forEach(walk);
  };
  walk(node);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

export function mount(element: ReactElement): Mounted {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(element);
  });

  const withLabel = (label: string | RegExp): ReactTestInstance | undefined =>
    renderer.root.findAll(
      (n) => matches(n.props.accessibilityLabel, label) || matches(n.props['aria-label'], label),
      { deep: true },
    )[0];

  return {
    root: renderer.root,
    renderer,
    text: () => collectText(renderer.toJSON()).join(' ').replace(/\s+/g, ' ').trim(),
    labels: () =>
      renderer.root
        .findAll((n) => typeof n.props.accessibilityLabel === 'string', { deep: true })
        .map((n) => n.props.accessibilityLabel as string),
    find: withLabel,
    async press(label) {
      const node = withLabel(label);
      if (!node) throw new Error(`no pressable labelled ${String(label)}`);
      if (typeof node.props.onPress !== 'function') {
        throw new Error(`"${String(label)}" is labelled but has no onPress`);
      }
      await act(async () => { node.props.onPress(); });
    },
    async pressIn(label) {
      const node = withLabel(label);
      if (!node) throw new Error(`no pressable labelled ${String(label)}`);
      if (typeof node.props.onPressIn !== 'function') {
        throw new Error(`"${String(label)}" is labelled but has no onPressIn`);
      }
      await act(async () => { node.props.onPressIn(); });
    },
    async pressOut(label) {
      const node = withLabel(label);
      if (!node) throw new Error(`no pressable labelled ${String(label)}`);
      if (typeof node.props.onPressOut !== 'function') {
        throw new Error(`"${String(label)}" is labelled but has no onPressOut`);
      }
      await act(async () => { node.props.onPressOut(); });
    },
    async pressText(want) {
      const hits = renderer.root
        .findAll((n) => typeof n.props.onPress === 'function', { deep: true })
        .filter((n) => matches(textOf(n), want) || (want instanceof RegExp
          ? want.test(textOf(n))
          : textOf(n).includes(want)));
      // Innermost wins: an outer container often wraps the real control and
      // contains its text too, and pressing the wrapper is not the same act.
      const node = hits[hits.length - 1];
      if (!node) throw new Error(`no pressable saying ${String(want)}`);
      await act(async () => { node.props.onPress(); });
    },
    async type(value, label) {
      const inputs = renderer.root.findAll(
        (n) => typeof n.props.onChangeText === 'function'
          && (label === undefined || matches(n.props.accessibilityLabel, label)),
        { deep: true },
      );
      if (inputs.length === 0) throw new Error('no text input found');
      await act(async () => { inputs[0]!.props.onChangeText(value); });
    },
    unmount: () => act(() => { renderer.unmount(); }),
  };
}

export interface FakeCall {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Replace `globalThis.fetch` with something that records and answers.
 *
 * Returns the recorded calls and a restore function. A test that forgets to
 * restore would leak into the next one, so every use is in a try/finally.
 */
export function fakeFetch(
  answer: (path: string, method: string, body: unknown) => unknown,
): { calls: FakeCall[]; restore: () => void } {
  const calls: FakeCall[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    calls.push({ method, path, body });
    const data = answer(path, method, body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data }),
    } as Response;
  }) as typeof fetch;

  return { calls, restore: () => { globalThis.fetch = original; } };
}

// ---------------------------------------------------------------------------
// Whole screens
// ---------------------------------------------------------------------------

/**
 * A screen fetches on mount, so a freshly mounted one is showing its loading
 * state. `settle` lets the effect's promise chain finish and React commit the
 * result, which is the difference between asserting on a spinner and asserting
 * on the screen.
 */
export async function settle(): Promise<void> {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

/** Mount, then wait for whatever it fetches on mount. */
export async function mountScreen(element: ReactElement): Promise<Mounted> {
  const ui = mount(element);
  await settle();
  return ui;
}

/** The server said no. A refusal with a reason, not a broken connection. */
export const refuses = (code: string, error: string) => ({ __refuses: { code, error } });
/** The connection died. `fetch` itself rejects; the client should say offline. */
export const offline = () => ({ __throws: 'NETWORK' as const });
/**
 * The request was aborted.
 *
 * NOT a real timer - the client's own timeout is 8 seconds and no test should
 * wait for it. This produces the AbortError that timer would have produced, so
 * it exercises the HANDLING of a timeout and not the timing of one.
 */
export const timedOut = () => ({ __throws: 'TIMEOUT' as const });

type Reply = unknown | ((body: unknown) => unknown);

/**
 * Fake the network with a route table instead of a single answer.
 *
 * Keyed `"GET /wallet"`, or `"/wallet"` for any method. A path the table does
 * not cover is answered with a refusal that names it, so a screen fetching
 * something the test forgot says so on screen rather than rendering an
 * unexplained blank.
 */
export function server(routes: Record<string, Reply>): {
  calls: FakeCall[];
  missing: string[];
  restore: () => void;
} {
  const missing: string[] = [];
  const original = globalThis.fetch;
  const calls: FakeCall[] = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    const full = url.replace(/^https?:\/\/[^/]+/, '');
    const bare = full.split('?')[0]!;
    const method = init?.method ?? 'GET';
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    calls.push({ method, path: full, body });

    const key = [`${method} ${full}`, `${method} ${bare}`, full, bare]
      .find((k) => Object.prototype.hasOwnProperty.call(routes, k));

    if (key === undefined) {
      missing.push(`${method} ${bare}`);
      return envelope({ ok: false, code: 'NO_ROUTE', error: `no route for ${method} ${bare}` });
    }

    const route = routes[key];
    const value = typeof route === 'function' ? (route as (b: unknown) => unknown)(body) : route;

    if (isMarked(value, '__throws')) {
      const err = new Error('fetch failed');
      if (value.__throws === 'TIMEOUT') err.name = 'AbortError';
      throw err;
    }
    if (isMarked(value, '__refuses')) {
      return envelope({ ok: false, ...value.__refuses });
    }
    return envelope({ ok: true, data: value });
  }) as typeof fetch;

  return { calls, missing, restore: () => { globalThis.fetch = original; } };
}

const envelope = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const isMarked = <K extends string>(v: unknown, key: K): v is Record<K, string & never> & Record<K, never> =>
  typeof v === 'object' && v !== null && key in v;
