/**
 * ChivaGo - Smart Wellness & Sustainable Tourism.
 * Pilot: Koh Samui, Thailand.
 *
 * Composition root: fonts, navigation, the global SOS banner, the toast.
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  IBMPlexSansThai_600SemiBold, IBMPlexSansThai_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-thai';
import { Anuphan_400Regular, Anuphan_600SemiBold } from '@expo-google-fonts/anuphan';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';

import { emptyBalances, strings, type Balances, type ItineraryItem } from '@chivago/core';
import { api } from './src/api/client.ts';
import { useOutboxFlush } from './src/state/outbox-hook.ts';
import { color } from './src/theme/index.ts';
import {
  useAccount, useLayers, useNav, useNotifications, useProfile, useSos, useToast, type ScreenKey,
} from './src/state/store.tsx';
import type { DeepLink } from './src/notifications/push.ts';
import { ScreenTransition, SosBanner, TabBar, Toast } from './src/components/Shell.tsx';
import { LoadingState } from './src/components/States.tsx';
import { OnboardingScreen } from './src/screens/Onboarding.tsx';
import { MapScreen } from './src/screens/MapScreen.tsx';
import { PlaceScreen } from './src/screens/PlaceScreen.tsx';
import { MissionsScreen } from './src/screens/MissionsScreen.tsx';
import { QuestDetailScreen } from './src/screens/QuestDetail.tsx';
import { WalletScreen } from './src/screens/WalletScreen.tsx';
import { MarketScreen } from './src/screens/MarketScreen.tsx';
import { ImpactScreen } from './src/screens/ImpactScreen.tsx';
import { HomeScreen } from './src/screens/HomeScreen.tsx';
import { PassportScreen } from './src/screens/PassportScreen.tsx';
import { MascotsScreen } from './src/screens/MascotsScreen.tsx';
import { MascotRoomScreen } from './src/screens/MascotRoom.tsx';
import { AccountScreen } from './src/screens/AccountScreen.tsx';
import { PartyScreen } from './src/screens/PartyScreen.tsx';
import { SafetyScreen } from './src/screens/SafetyScreen.tsx';
import { TripScreen, type TripState } from './src/screens/TripScreen.tsx';
import { ConciergeScreen } from './src/screens/ConciergeScreen.tsx';
import { CompanionHomeScreen } from './src/screens/CompanionHome.tsx';
import type { Companion } from '@chivago/core';
import { loadLocale, t, useLocale } from './src/i18n/locale.ts';
import { loadArea, placeFromUrl } from './src/state/area.ts';

export default function App() {
  // Both families are bundled locally rather than fetched at runtime: the app
  // is used on a beach with one bar of signal, and a font that fails to load
  // takes the whole type system with it.
  const [fontsReady] = useFonts({
    IBMPlexSansThai_600SemiBold, IBMPlexSansThai_700Bold,
    Anuphan_400Regular, Anuphan_600SemiBold,
    IBMPlexMono_500Medium,
  });

  const nav = useNav('onboarding');
  // The language. Resolved once before the first screen (stored choice, else
  // the phone's), and a change re-renders from here, which reaches every
  // t() below: nothing in this tree is memoised against its parent.
  const locale = useLocale();
  const [localeReady, setLocaleReady] = React.useState(false);
  React.useEffect(() => { void loadLocale().then(() => setLocaleReady(true)); }, []);
  // The area the same way: the URL first, so a QR code on the campus lands there.
  React.useEffect(() => { void loadArea(); }, []);
  // Route state: it belongs to the pushed screen and dies with it.
  const [companion, setCompanion] = React.useState<Companion | null>(null);
  const toast = useToast();
  // The account first: every other request carries its key in a header.
  const account = useAccount();
  const { profile, loaded: profileLoaded, save } = useProfile(account.ready);
  const { layers, toggle } = useLayers();
  const sos = useSos(toast.show, account.ready);

  /**
   * Where a tapped notification lands.
   *
   * Declared before the hook that uses it and kept stable, so a cold start
   * launched BY a notification routes correctly rather than dropping the user
   * on the map with no idea why the app opened.
   */
  const openFromNotification = React.useCallback((link: DeepLink) => {
    if (link.screen === 'quest' && link.questId) {
      nav.push('quest', { questId: link.questId });
    } else if (link.screen === 'wallet') {
      nav.selectTab('wallet');
      setWalletKey((k) => k + 1);
    } else {
      nav.selectTab('home');
    }
  }, [nav]);

  const notifications = useNotifications(openFromNotification, account.ready);


  /**
   * The push service renders in the device's language, and it learns that
   * language at registration. A traveller who switches on the Account screen
   * re-registers with the new one, so the next "quest approved" arrives in
   * the language they just chose rather than the one the phone had at install.
   */
  const pushGranted = notifications.pushGranted;
  const enablePush = notifications.enablePush;
  React.useEffect(() => {
    if (localeReady && pushGranted) void enablePush(locale);
  }, [locale, localeReady, pushGranted, enablePush]);

  /** Bumped whenever the server-owned balance may have changed. */
  const [walletKey, setWalletKey] = React.useState(0);
  const refreshWallet = React.useCallback(() => setWalletKey((k) => k + 1), []);

  /**
   * Stable, because QuestDetail runs it from an effect. An inline arrow here
   * is a new function every render, and this function causes a render.
   */
  const onPointsChanged = React.useCallback(() => {
    refreshWallet();
    void notifications.refresh();
  }, [refreshWallet, notifications.refresh]);

  // Proofs saved without signal go when there is some. See state/outbox.ts.
  useOutboxFlush(account.ready, toast.show, onPointsChanged);

  const [balances, setBalances] = React.useState<Balances>(emptyBalances());
  React.useEffect(() => {
    // Not before the account: see useSos.
    if (!account.ready) return;
    void api.wallet().then((res) => { if (res.ok) setBalances(res.data.balances); });
  }, [walletKey, account.ready]);

  const [trip, setTrip] = React.useState<TripState>({
    dayNumber: 2,
    dateLabel: new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
    walkingKm: 0,
    pointsToday: 0,
    airLabel: '—',
    items: [],
  });

  const addToTrip = React.useCallback((item: ItineraryItem, walkKm: number) => {
    setTrip((t) => ({
      ...t,
      walkingKm: t.walkingKm + walkKm,
      pointsToday: t.pointsToday + (item.isPointsRelated ? 60 : 0),
      items: [...t.items, item].sort((a, b) => a.time.localeCompare(b.time)),
    }));
  }, []);

  /**
   * Skip onboarding for somebody who has already done it.
   *
   * `useNav('onboarding')` hard-coded the first screen and nothing ever asked
   * whether the traveller had already answered. Their profile was saved
   * correctly on the server and then ignored, so every single launch put them
   * back through the three-step questionnaire — and silently overwrote last
   * time's answers with whatever they picked to get past it.
   */
  const onboarded = profile.completedAt !== null;
  const jumpedIn = React.useRef(false);
  React.useEffect(() => {
    if (!profileLoaded || jumpedIn.current) return;
    jumpedIn.current = true;
    if (onboarded) {
      nav.selectTab('home');
      // A QR code at a pin carries `?place=`; land on it, over Home, once the
      // app has jumped in - a push before this point was wiped by the jump.
      const place = placeFromUrl();
      if (place) nav.push('place', { placeId: place });
    }
  }, [profileLoaded, onboarded, nav]);

  // Wait for the profile as well as the fonts. Rendering onboarding first and
  // snapping to the map a moment later is worse than a beat of loading.
  if (!fontsReady || !account.ready || !profileLoaded || !localeReady) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: color.bg, justifyContent: 'center' }}>
          <LoadingState />
        </View>
      </SafeAreaProvider>
    );
  }

  const renderScreen = (screen: ScreenKey) => {
    switch (screen) {
      case 'onboarding':
        return (
          <OnboardingScreen
            onFinish={async (answers) => {
              await save(answers);
              // Ask for push AFTER onboarding, never before. The OS only lets
              // you ask once, and asking before the user knows what the app
              // does is how you get a permanent no. By here they have just told
              // us what they want watched.
              void notifications.enablePush(locale);
              nav.selectTab('home');
              // A first-time visitor who scanned a QR at a pin has just
              // answered three questions to get here; the place they scanned
              // is where they land, not Home.
              const place = placeFromUrl();
              if (place) nav.push('place', { placeId: place });
            }}
          />
        );

      case 'companion':
        return companion ? (
          <CompanionHomeScreen
            companion={companion}
            onBack={nav.pop}
            onOpenPlace={(id) => nav.push('place', { placeId: id })}
            onFindQuest={() => nav.selectTab('quests')}
          />
        ) : null;

      case 'concierge':
        return (
          <ConciergeScreen
            onOpenPlace={(id) => nav.push('place', { placeId: id })}
            onAction={(action) => {
              // The concierge hands OFF rather than reimplementing a screen.
              if (action === 'plan' || action === 'route' || action === 'price') {
                nav.push('trip');
                return;
              }
              nav.selectTab(action);
            }}
          />
        );

      case 'map':
        return (
          <MapScreen
            layers={layers}
            onToggleLayer={toggle}
            onPlanDay={() => nav.push('trip')}
            onOpenPlace={(id) => nav.push('place', { placeId: id })}
            onOpenQuest={(id) => nav.push('quest', { questId: id })}
            onSeeAllQuests={() => nav.selectTab('quests')}
            onAskConcierge={() => nav.push('concierge')}
            onOpenWallet={() => nav.selectTab('wallet')}
            balances={balances}
          />
        );

      case 'place':
        return (
          <PlaceScreen
            placeId={nav.placeId ?? 'chaweng'}
            onBack={nav.pop}
            onAddToTrip={() => {
              addToTrip(
                {
                  id: `place-${nav.placeId}-${trip.items.length}`,
                  time: '16:00',
                  name: { en: 'Saved place', th: 'สถานที่ที่บันทึก' },
                  tag: 'Saved',
                  isPointsRelated: false,
                  placeId: nav.placeId,
                  questId: null,
                },
                1.2,
              );
              toast.show(`${t(strings.place.addedToast)}`);
              nav.push('trip');
            }}
            onSafePath={() => nav.selectTab('safety')}
            onToast={toast.show}
            onPointsChanged={() => setWalletKey((k) => k + 1)}
          />
        );

      case 'quests':
        return (
          <MissionsScreen
            onOpen={(id) => nav.push('quest', { questId: id })}
            onOpenMarket={() => nav.push('market')}
          />
        );

      case 'quest':
        return (
          <QuestDetailScreen
            questId={nav.questId ?? 'q1'}
            onBack={nav.pop}
            onOpenWallet={() => nav.selectTab('wallet')}
            onToast={toast.show}
            onPointsChanged={onPointsChanged}
          />
        );

      case 'wallet':
        return (
          <WalletScreen
            onOpenCompanion={(c) => { setCompanion(c); nav.push('companion'); }}
            onOpenMarket={() => nav.push('market')}
            onOpenAccount={() => nav.push('account')}
            refreshKey={walletKey}
            notifications={notifications.items}
            unread={notifications.unread}
            onMarkRead={notifications.markRead}
            onMarkAllRead={notifications.markAllRead}
            onOpenQuest={(id) => nav.push('quest', { questId: id })}
          />
        );

      case 'market':
        return (
          <MarketScreen
            onBack={nav.pop}
            onToast={toast.show}
            onPointsChanged={refreshWallet}
            refreshKey={walletKey}
          />
        );

      case 'home':
        return (
          <HomeScreen
            onOpenMap={() => nav.selectTab('map')}
            onOpenQuests={() => nav.selectTab('quests')}
            onOpenQuest={(id) => nav.push('quest', { questId: id })}
            onOpenWallet={() => nav.selectTab('wallet')}
            onOpenPassport={() => nav.push('passport')}
            onOpenImpact={() => nav.push('impact')}
            onOpenConcierge={() => nav.push('concierge')}
            onOpenParty={() => nav.push('party')}
            onOpenSafety={() => nav.selectTab('safety')}
            onOpenPlace={(id) => nav.push('place', { placeId: id })}
          />
        );

      case 'passport':
        return <PassportScreen onOpenMascots={() => nav.push('mascots')} />;

      case 'mascots':
        return <MascotsScreen onBack={nav.pop} onOpen={(code) => nav.push('mascot', { code })} />;

      case 'mascot':
        return <MascotRoomScreen code={nav.code ?? 'TH-84'} onBack={nav.pop} />;

      case 'account':
        return <AccountScreen onBack={nav.pop} onToast={toast.show} />;

      case 'party':
        return <PartyScreen onBack={nav.pop} onToast={toast.show} />;

      case 'impact':
        return <ImpactScreen onToast={toast.show} refreshKey={walletKey} />;

      case 'safety':
        return (
          <SafetyScreen
            alert={sos.alert}
            onFire={sos.fire}
            onCancel={sos.cancel}
            onShare={sos.shareLink}
            firing={sos.firing}
          />
        );

      case 'trip':
        return (
          <TripScreen
            trip={trip}
            onBack={nav.pop}
            onOpenPlace={(id) => nav.push('place', { placeId: id })}
            onOpenQuest={(id) => nav.push('quest', { questId: id })}
          />
        );
    }
  };

  const showTabs = nav.screen !== 'onboarding';

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['top', 'bottom']}>
        <StatusBar style="dark" />

        <View style={{ flex: 1 }}>
          <ScreenTransition screenKey={nav.screen}>{renderScreen(nav.screen)}</ScreenTransition>
        </View>

        {/* A live alert follows the user everywhere. Handoff open question 5,
            resolved against the prototype - see src/state/store.tsx. */}
        {sos.alert && nav.screen !== 'safety' ? (
          <SosBanner onPress={() => nav.selectTab('safety')} />
        ) : null}

        {showTabs ? <TabBar active={nav.activeTab} onChange={nav.selectTab} /> : null}

        <Toast message={toast.message} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
