/**
 * A mini-game, inside a browser the app owns.
 *
 * The games in `src/games/` are whole HTML documents. This screen is the
 * frame around one: a header with a way back, a line about language when the
 * page does not speak the app's, and the document itself. Nothing in here
 * knows what the game is about, and nothing in the game knows it is in an app.
 *
 * TWO IMPLEMENTATIONS, which is the same arrangement `SamuiMap` uses for the
 * map and for the same reason. On a phone the document goes into a WebView.
 * In a browser there is already a browser, so it goes into an iframe and
 * `react-native-webview` is never imported - it is a native module that does
 * not exist on the web. The branch is written out rather than hidden behind a
 * `.web.tsx` extension because this codebase imports with explicit extensions
 * so that the node test harness resolves the same files.
 *
 * THE DOCUMENT CANNOT LEAVE. `onShouldStartLoadWithRequest` allows the first
 * load and refuses every navigation after it, and the iframe is sandboxed to
 * scripts alone. Today's page has no links in it at all; the guard is for the
 * page somebody adds in a year, so that a stray `<a href>` turns a game into a
 * dead tap rather than into a browser sitting inside the app with no address
 * bar and no way home.
 *
 * WHERE THE SCORE LIVES, and why it differs by platform. The WebView is given
 * a `baseUrl`, which gives the document a real origin and therefore a
 * `localStorage` that survives closing the game - that is where the best
 * score is kept. The iframe is sandboxed WITHOUT `allow-same-origin`, so on
 * the web the page has an opaque origin and no storage at all. That is the
 * trade taken knowingly: `allow-same-origin` on a srcdoc iframe is the same
 * origin as the app, and the app's own `localStorage` on the web holds the
 * signed-in session. A high score is not worth handing a game page the keys
 * to that. The page already wraps every storage call in try/catch, so what a
 * web player loses is persistence between visits and nothing else.
 */

import React from 'react';
import { Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { miniGame } from '../games/index.ts';
import { color, gutter } from '../theme/index.ts';
import { Body } from '../components/Type.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { ErrorState } from '../components/States.tsx';
import { t, useLocale } from '../i18n/locale.ts';

/**
 * Where the document thinks it lives.
 *
 * Nothing is ever fetched from it - the games carry their own fonts and
 * artwork, and `mini-games.test.ts` keeps them that way. It is here because a
 * WebView handed bare HTML has an opaque origin, and an opaque origin has no
 * `localStorage`, which is where a game keeps its best score.
 */
const ORIGIN = 'https://chivargo.com/games/';

const inBrowser = Platform.OS === 'web'
  && typeof document !== 'undefined'
  && typeof window !== 'undefined';

export function MiniGameScreen({ gameKey, onBack }: { gameKey: string; onBack: () => void }) {
  const game = miniGame(gameKey);
  const locale = useLocale();

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <PushHeader
        context={t({ en: 'MINI GAME', th: 'มินิเกม', zh: '小游戏' })}
        onBack={onBack}
      />
      {game === null ? (
        <ErrorState
          message={t({
            en: 'This game is not here any more.',
            th: 'ไม่มีเกมนี้แล้ว',
            zh: '这个游戏已经不在了。',
          })}
          onRetry={onBack}
        />
      ) : (
        <>
          {/*
            Said before the game opens, not discovered inside it. A page in a
            language somebody cannot read looks exactly like a page that
            failed to load, and they will tap back and tell you it is broken.
          */}
          {locale === game.language ? null : (
            <View style={{ paddingHorizontal: gutter, paddingBottom: 8 }}>
              <Body size={13} colour={color.neutral700}>
                {t({
                  en: 'This game is in Thai only.',
                  th: 'เกมนี้เป็นภาษาไทย',
                  zh: '这个游戏只有泰文版本。',
                })}
              </Body>
            </View>
          )}
          <GameFrame html={game.html} label={t(game.name)} />
        </>
      )}
    </View>
  );
}

/** The document, in whichever browser this platform already has. */
function GameFrame({ html, label }: { html: string; label: string }) {
  if (inBrowser) {
    return (
      <View style={{ flex: 1 }}>
        {React.createElement('iframe', {
          title: label,
          srcDoc: html,
          // Scripts, and nothing else. No same-origin, no forms, no popups,
          // no top-level navigation: see the note at the top of the file.
          sandbox: 'allow-scripts',
          style: { flex: 1, width: '100%', height: '100%', border: 'none' },
        })}
      </View>
    );
  }
  return <NativeGameFrame html={html} label={label} />;
}

/**
 * The phone's copy, in a WebView.
 *
 * Imported at the top of the file the way `WebTerrainMap` imports it, which
 * is what makes the node harness able to render this screen at all: it aliases
 * the package to a stub, because the real one re-exports from a path that
 * only exists once a bundler has picked a platform.
 */
function NativeGameFrame({ html, label }: { html: string; label: string }) {
  return (
    <WebView
      accessibilityLabel={label}
      originWhitelist={['*']}
      source={{ html, baseUrl: ORIGIN }}
      javaScriptEnabled
      // The best score is kept in `localStorage`; without this it is dropped.
      domStorageEnabled
      // The game is one scrolling page and handles its own gestures.
      bounces={false}
      setSupportMultipleWindows={false}
      // The document and nothing else. Checked by URL rather than by counting
      // loads, because whether the FIRST load fires this callback at all
      // differs between the two platforms, and a counter that guesses wrong
      // either blocks the game or lets the next navigation through.
      onShouldStartLoadWithRequest={(req: { url: string }) =>
        req.url === 'about:blank' || req.url.startsWith(ORIGIN)}
      style={{ flex: 1, backgroundColor: color.bg }}
    />
  );
}
