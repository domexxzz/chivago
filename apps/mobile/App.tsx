/**
 * ChivarGo - Smart Wellness & Sustainable Tourism.
 * Pilot: Koh Samui, Thailand.
 *
 * Composition root: fonts, navigation, the global SOS banner, the toast.
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Linking, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  NotoSansThai_400Regular, NotoSansThai_500Medium,
  NotoSansThai_600SemiBold, NotoSansThai_700Bold,
} from '@expo-google-fonts/noto-sans-thai';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';

import {
  emptyBalances, mapsDirectionsUrl, navigationProviderFor, strings,
  type Balances, type ItineraryItem, type ScoredPlace,
} from '@chivago/core';
import { api } from './src/api/client.ts';
import { forgetKey } from './src/api/account.ts';
import { useOutboxFlush } from './src/state/outbox-hook.ts';
import { color } from './src/theme/index.ts';
import {
  useAccount, useLayers, useNav, useNotifications, useProfile, useSos, useToast, type ScreenKey,
} from './src/state/store.tsx';
import type { DeepLink } from './src/notifications/push.ts';
import { AiGuideButton, NavigationRail, ScreenTransition, SosBanner, TabBar, Toast, WIDE_TABS_AT } from './src/components/Shell.tsx';
import { LoadingState } from './src/components/States.tsx';
import { OnboardingScreen } from './src/screens/Onboarding.tsx';
import { MapScreen } from './src/screens/MapScreen.tsx';
import { NavigateScreen } from './src/screens/NavigateScreen.tsx';
import type { NavDestination } from './src/navigation/session.ts';
import { ALL_OF_THE_FAIR, FairScreen, type FairView } from './src/screens/FairScreen.tsx';
import { PlaceScreen } from './src/screens/PlaceScreen.tsx';
import { MissionsScreen } from './src/screens/MissionsScreen.tsx';
import { QuestDetailScreen } from './src/screens/QuestDetail.tsx';
import { WalletScreen } from './src/screens/WalletScreen.tsx';
import { MarketScreen } from './src/screens/MarketScreen.tsx';
import { AskScreen } from './src/screens/AskScreen.tsx';
import { ImpactScreen } from './src/screens/ImpactScreen.tsx';
import { HomeScreen } from './src/screens/HomeScreen.tsx';
import { LocalPicksScreen } from './src/screens/LocalPicksScreen.tsx';
import { MiniGameScreen } from './src/screens/MiniGameScreen.tsx';
import type { MiniGameKey } from './src/games/index.ts';
import { PassportScreen } from './src/screens/PassportScreen.tsx';
import { MascotsScreen } from './src/screens/MascotsScreen.tsx';
import { MascotRoomScreen } from './src/screens/MascotRoom.tsx';
import { FashionScreen } from './src/screens/FashionScreen.tsx';
import { SummonScreen } from './src/screens/SummonScreen.tsx';
import { AccountScreen } from './src/screens/AccountScreen.tsx';
import { LoginScreen } from './src/screens/LoginScreen.tsx';
import { RegisterScreen } from './src/screens/RegisterScreen.tsx';
import { ProfileScreen } from './src/screens/ProfileScreen.tsx';
import { EditProfileScreen } from './src/screens/EditProfileScreen.tsx';
import { ConnectAppScreen } from './src/screens/ConnectAppScreen.tsx';
import { CommunityFeedScreen } from './src/screens/CommunityFeedScreen.tsx';
import { ShopProfileScreen } from './src/screens/ShopProfileScreen.tsx';
import { ShopManageScreen } from './src/screens/ShopManageScreen.tsx';
import { MedalsScreen } from './src/screens/MedalsScreen.tsx';
import { PartyScreen } from './src/screens/PartyScreen.tsx';
import { FindPartyScreen } from './src/screens/FindPartyScreen.tsx';
import { GameScreen } from './src/screens/GameScreen.tsx';
import { AdventureScreen } from './src/screens/AdventureScreen.tsx';
import { TravelJournalScreen } from './src/screens/TravelJournalScreen.tsx';
import { SeasonScreen } from './src/screens/SeasonScreen.tsx';
import { SafetyScreen } from './src/screens/SafetyScreen.tsx';
import { TripScreen, type TripState } from './src/screens/TripScreen.tsx';
import { ConciergeScreen } from './src/screens/ConciergeScreen.tsx';
import { CompanionHomeScreen } from './src/screens/CompanionHome.tsx';
import type { Companion } from '@chivago/core';
import './src/polyfills/location-emitter.ts';
import { loadLocale, t, useLocale } from './src/i18n/locale.ts';
import { formatDate } from './src/i18n/format.ts';
import { loadArea, placeFromUrl } from './src/state/area.ts';
import { clearGuest, clearLoggedIn, hasLoggedIn, isGuest, setGuest, setLoggedIn } from './src/state/auth.ts';
import { GuestBand } from './src/components/GuestGate.tsx';
import { GuestActionProvider } from './src/components/GuestActionGate.tsx';
import { setGuestSandboxActive } from './src/demo/mode.ts';
import { useServerConfig } from './src/state/server-config.ts';
import { UnfencedBand } from './src/components/UnfencedBand.tsx';
import { ErrorBoundary } from './src/components/ErrorBoundary.tsx';

export default function App() {
  const { width: viewportWidth } = useWindowDimensions();
  const wideShell = viewportWidth >= WIDE_TABS_AT;
  // Both families are bundled locally rather than fetched at runtime: the app
  // is used on a beach with one bar of signal, and a font that fails to load
  // takes the whole type system with it.
  const [fontsReady] = useFonts({
    NotoSansThai_400Regular, NotoSansThai_500Medium,
    NotoSansThai_600SemiBold, NotoSansThai_700Bold,
    IBMPlexMono_500Medium,
  });

  const nav = useNav('login');
  const [partyInviteCode, setPartyInviteCode] = React.useState<string | null>(null);
  const [missionsInitialSection, setMissionsInitialSection] = React.useState<'quests' | 'party'>('quests');
  const consumeMissionsInitialSection = React.useCallback(() => setMissionsInitialSection('quests'), []);
  const detailScroll = React.useRef<Record<string, { offset: number }>>({});
  const scrollStateFor = (key: string) => detailScroll.current[key] ??= { offset: 0 };

  const [authReady, setAuthReady] = React.useState(false);
  const [loggedIn, setLoggedInState] = React.useState(false);
  const [guest, setGuestState] = React.useState(false);
  const [signedInAccountType, setSignedInAccountType] = React.useState<'traveller' | 'operator' | undefined>();
  const [profileRefreshKey, setProfileRefreshKey] = React.useState(0);
  React.useEffect(() => {
    void Promise.all([hasLoggedIn(), isGuest()]).then(([member, visitor]) => {
      setLoggedInState(member);
      setGuestState(!member && visitor);
      setAuthReady(true);
    });
  }, []);

  // Party invite links are application links, so handle them at the
  // composition root instead of only while PartyScreen happens to be open.
  // This lets an OS camera open a QR invitation directly into the join flow.
  React.useEffect(() => {
    const openPartyInvite = (url: string | null) => {
      if (!url) return;
      const match = /[?&]code=([^&#]+)/i.exec(url);
      if (!match?.[1]) return;
      try {
        setPartyInviteCode(decodeURIComponent(match[1]).trim());
        nav.push('party');
      } catch {
        // A malformed external URL is ignored rather than breaking app boot.
      }
    };
    void Linking.getInitialURL().then(openPartyInvite);
    const subscription = Linking.addEventListener('url', ({ url }) => openPartyInvite(url));
    return () => subscription.remove();
  }, [nav.push]);

  /*
    THESE TWO ARE MEMOISED AND THE OTHERS ARE NOT, FOR A REASON.

    The web map rebuilds every DOM marker - pin, quest mark, bus stop,
    with their `innerHTML`, their listeners and their poster images -
    whenever `onSelect` or `onOpenQuest` changes identity, because both sit
    in that effect's dependency array. Written inline, they are new
    functions on every render of this component: every toast, every SOS
    poll, every notification tick tore down the whole map's furniture and
    built it again.

    MapScreen already memoises the arrays it passes (see the note there);
    this is the other half of the same fix. `nav.push` is a stable
    `useCallback`, so these are stable for the life of the screen.

    The identical arrows further down are left alone deliberately: no other
    screen rebuilds anything expensive when a handler's identity changes,
    and a memo that buys nothing is a line that has to be read anyway.
  */
  const openPlaceOnMap = React.useCallback(
    (id: string) => nav.push('place', { placeId: id }),
    [nav.push],
  );
  const openQuestOnMap = React.useCallback(
    (id: string) => nav.push('quest', { questId: id }),
    [nav.push],
  );
  // Where the traveller asked to be shown the way to. Held here rather than
  // in the Map tab because the ASK happens on the place screen, and the tab
  // is remounted by its own key when the area changes.
  const [wayTo, setWayTo] = React.useState<ScoredPlace | null>(null);
  // A concierge result set is a group of highlighted map pins, not a route.
  // Routing still starts only after the traveller chooses Navigate.
  const [mapRecommendations, setMapRecommendations] = React.useState<ScoredPlace[]>([]);
  /*
    Where the navigator is taking them, and what to open on arrival.

    Separate from `wayTo`, which is a SCORED PLACE and always will be - it
    is what the map's way banner draws and what the place screen asks for.
    A business is not one of those, and the navigator does not care: it
    needs a name and a coordinate. Keeping the destination in its own piece
    of state is what lets the shop screen's "นำทาง" reach the same
    navigator as the map's, without either of them pretending to be the
    other's kind of thing.
  */
  const [navTo, setNavTo] = React.useState<{ destination: NavDestination; kind: 'place' | 'shop' } | null>(null);
  const navigateTo = React.useCallback((destination: NavDestination, kind: 'place' | 'shop') => {
    // ChivarGo's own turn-by-turn map is intentionally scoped to Koh
    // Sichang. Everywhere else is handed to Google Maps. Leaving `origin`
    // out makes Google start from the phone's current position while still
    // letting the traveller replace it in Google's own start field.
    if (navigationProviderFor(destination) === 'google') {
      void Linking.openURL(mapsDirectionsUrl(destination));
      return;
    }
    setNavTo({ destination, kind });
    nav.push('navigate');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.push]);
  // The fair lot the traveller asked to see on the map (docs/66), kept here like `wayTo`,
  // and the list it was found in, so the way back from the lot finds the same list.
  // Opening the fair afresh - its card on Home, its pill on the map - starts from the whole directory.
  const [fairFocus, setFairFocus] = React.useState<{ fairId: string; code: string } | null>(null);
  const [fairView, setFairView] = React.useState<FairView>(ALL_OF_THE_FAIR);
  const openFair = () => { setFairView(ALL_OF_THE_FAIR); nav.push('fair'); };
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
  // Which mini-game the game tab opened. Carried here rather than in the nav
  // state for the same reason `companion` is: it belongs to one pushed screen
  // and nothing else in the app has any use for it.
  const [gameKey, setGameKey] = React.useState<MiniGameKey | null>(null);
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
      nav.push('wallet');
      setWalletKey((k) => k + 1);
    } else if (link.screen === 'stays') {
      // An operator answered. The thread is where the answer is.
      nav.push('stays');
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

  /** Leave the sandbox before real credentials are submitted. */
  const openLogin = React.useCallback(() => {
    setGuestSandboxActive(false);
    nav.push('login');
  }, [nav]);

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
    dateLabel: formatDate(new Date(), { weekday: 'short', day: 'numeric', month: 'short' }),
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
   * If the traveller has previously logged in, bypass the login screen and jump to Home.
   */
  const onboarded = profile.completedAt !== null;
  const jumpedIn = React.useRef(false);
  React.useEffect(() => {
    if (!profileLoaded || !authReady || jumpedIn.current) return;
    jumpedIn.current = true;
    if (loggedIn || guest) {
      nav.selectTab('home');
      // A QR code at a pin carries `?place=`; land on it, over Home, once the
      // app has jumped in - a push before this point was wiped by the jump.
      const place = placeFromUrl();
      if (place) nav.push('place', { placeId: place });
    }
  }, [profileLoaded, authReady, loggedIn, guest, nav]);

  /*
    ABOVE THE EARLY RETURN, and it has to stay there.

    The loading branch below returns before the rest of the component runs,
    so a hook called after it runs on the second render and not the first.
    React counts hooks per render and refuses the mismatch - error #310, a
    blank screen and nothing else, which is exactly how this shipped for
    eleven minutes on 8 September. Every hook in this component belongs above
    that `if`.
  */
  const { fenceOff } = useServerConfig();

  // Wait for the profile as well as the fonts and auth state. Rendering login first and
  // snapping to the map a moment later is worse than a beat of loading.
  if (!fontsReady || !account.ready || !profileLoaded || !localeReady || !authReady) {
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
              await setLoggedIn(true);
              setLoggedInState(true);
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
            onBack={nav.pop}
            onOpenMap={() => nav.selectTab('map')}
            onOpenPlace={(id) => nav.push('place', { placeId: id })}
            onShowOnMap={(place) => { setWayTo(null); setMapRecommendations([place]); nav.selectTab('map'); }}
            onShowRecommendationsOnMap={(places) => { setWayTo(null); setMapRecommendations(places); nav.selectTab('map'); }}
            onNavigatePlace={(place) => {
              setWayTo(navigationProviderFor(place) === 'chivago' ? place : null);
              navigateTo({ id: place.id, name: place.name, lat: place.lat, lng: place.lng }, 'place');
            }}
            onAction={(action) => {
              // The concierge hands OFF rather than reimplementing a screen.
              if (action === 'plan' || action === 'route' || action === 'price') {
                nav.push('trip');
                return;
              }
              // The wallet lost its tab and kept its screen, so the concierge
              // pushes it the way every other door now does.
              if (action === 'wallet') {
                nav.push('wallet');
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
            onOpenPlace={openPlaceOnMap}
            onOpenShop={(id) => nav.push('shop', { shopId: id })}
            onNavigateShop={(shop) => {
              if (shop.lat === null || shop.lng === null) return;
              navigateTo({
                id: shop.id,
                name: { en: shop.name, th: shop.name, zh: shop.name },
                lat: shop.lat,
                lng: shop.lng,
              }, 'shop');
            }}
            onOpenQuest={openQuestOnMap}
            onSeeAllQuests={() => nav.selectTab('quests')}
            onAskConcierge={() => nav.push('concierge')}
            onOpenStays={() => nav.push('stays')}
            onToast={toast.show}
            onOpenWallet={() => nav.push('wallet')}
            onOpenProfile={() => nav.push('profile')}
            balances={balances}
            wayTo={wayTo}
            recommendedPlaces={mapRecommendations}
            onClearRecommendations={() => setMapRecommendations([])}
            onClearWay={() => setWayTo(null)}
            onNavigate={(place) => {
              const destination = { id: place.id, name: place.name, lat: place.lat, lng: place.lng };
              // Keep the in-app route banner only for the island router. An
              // external Google handoff must not leave a stale ChivarGo line
              // behind when the traveller returns to the app.
              setWayTo(navigationProviderFor(destination) === 'chivago' ? place : null);
              navigateTo(destination, 'place');
            }}
            fairFocus={fairFocus}
            onClearFair={() => setFairFocus(null)}
            onOpenFair={openFair}
            onBackToFair={() => nav.push('fair')}
          />
        );

      /*
        TURN-BY-TURN. It takes the destination from `wayTo`, which is the
        same piece of state the map's way banner already reads - so the
        place somebody asked the way to and the place they are navigating to
        cannot drift apart.

        With no destination there is nothing to navigate, which happens only
        if the screen is reached by a deep link; it falls back to the map
        rather than to an empty navigator.
      */
      case 'navigate':
        return (
          <NavigateScreen
            destination={navTo?.destination ?? null}
            onBack={nav.pop}
            /*
              On arrival, back to whatever this was. A place opens its place
              screen; a business opens its own, which is where its hours,
              its phone and its reviews are - and which is almost certainly
              the screen the traveller set off from.
            */
            onOpenPlace={(id) => {
              if (navTo?.kind === 'shop') { nav.push('shop', { shopId: id }); return; }
              setWayTo(null);
              nav.push('place', { placeId: id });
            }}
          />
        );

      case 'place':
        return (
          <PlaceScreen
            scrollState={scrollStateFor(`place:${nav.placeId}`)}
            placeId={nav.placeId ?? 'chaweng'}
            onBack={nav.pop}
            onAddToTrip={() => {
              addToTrip(
                {
                  id: `place-${nav.placeId}-${trip.items.length}`,
                  time: '16:00',
                  name: { en: 'Saved place', th: 'สถานที่ที่บันทึก', zh: '已保存的地点' },
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
            /*
              The way there, drawn on the app's own map rather than in
              somebody else's. One map instance in this app, so the place
              screen names a destination and hands over to the Map tab; a
              second MapLibre context on this screen would be a second
              basemap download to show one line.
            */
            onShowWay={(place) => { setWayTo(place); nav.selectTab('map'); }}
            onToast={toast.show}
            onPointsChanged={() => setWalletKey((k) => k + 1)}
          />
        );

      case 'quests':
        return (
          <MissionsScreen
            onOpen={(id) => nav.push('quest', { questId: id })}
            onOpenMarket={() => nav.push('market')}
            onOpenProfile={() => nav.push('profile')}
            onOpenGame={(key) => { setGameKey(key); nav.push('miniGame'); }}
            onOpenAdventure={() => nav.push('adventure')}
            onOpenParty={() => nav.push('party')}
            onFindParty={() => nav.push('findParty')}
            initialSection={missionsInitialSection}
            onInitialSectionConsumed={consumeMissionsInitialSection}
          />
        );

      case 'quest':
        return (
          <QuestDetailScreen
            questId={nav.questId ?? 'q1'}
            onBack={nav.pop}
            onOpenWallet={() => nav.push('wallet')}
            onToast={toast.show}
            onPointsChanged={onPointsChanged}
          />
        );

      case 'game':
        return (
          <GameScreen
            onOpenCompanion={(c) => { setCompanion(c); nav.push('companion'); }}
            onOpenMascots={() => nav.push('mascots')}
            onOpenParty={() => nav.push('party')}
            onOpenProfile={() => nav.push('profile')}
            onOpenWallet={() => nav.push('wallet')}
            onOpenFashion={() => nav.push('fashion')}
          />
        );
      case 'adventure':
        return (
          <AdventureScreen
            onBack={nav.pop}
            onOpenPlace={(id) => nav.push('place', { placeId: id })}
            onOpenJournal={() => nav.push('journal')}
            onOpenSeason={() => nav.push('season')}
            onOpenMissions={() => nav.selectTab('quests')}
            onOpenExplore={() => nav.selectTab('map')}
            onToast={toast.show}
            onPointsChanged={onPointsChanged}
          />
        );
      case 'journal':
        return <TravelJournalScreen onBack={nav.pop} onToast={toast.show} />;
      case 'season':
        return <SeasonScreen onBack={nav.pop} onToast={toast.show} />;
      case 'miniGame':
        return <MiniGameScreen gameKey={gameKey ?? ''} onBack={nav.pop} />;
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
            onOpenMascots={() => nav.push('mascots')}
            onOpenSummon={() => nav.push('summon')}
            onOpenCollect={() => nav.push('game')}
            onOpenMedals={() => nav.push('medals')}
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
            onOpenQuests={() => { setMissionsInitialSection('quests'); nav.selectTab('quests'); }}
            onOpenQuest={(id) => nav.push('quest', { questId: id })}
            onOpenWallet={() => nav.push('wallet')}
            onOpenMarket={() => nav.push('market')}
            onOpenFair={openFair}
            onOpenPassport={() => nav.push('passport')}
            onOpenMascots={() => nav.push('mascots')}
            onOpenImpact={() => nav.push('impact')}
            onOpenConcierge={() => nav.push('concierge')}
            onOpenParty={() => { setMissionsInitialSection('party'); nav.selectTab('quests'); }}
            onOpenStays={() => nav.push('stays')}
            onOpenSummon={() => nav.push('summon')}
            onOpenLocalPicks={() => nav.push('localPicks')}
            onOpenCommunity={() => nav.push('community')}
            onOpenSafety={() => nav.selectTab('safety')}
            onOpenProfile={() => nav.push('profile')}
            onOpenPlace={(id) => nav.push('place', { placeId: id })}
            onOpenShop={(id) => nav.push('shop', { shopId: id })}
            onToast={toast.show}
          />
        );

      case 'localPicks':
        return (
          <LocalPicksScreen
            onBack={nav.pop}
            onOpenShop={(id) => nav.push('shop', { shopId: id })}
            onOpenMap={() => nav.selectTab('map')}
            /*
              The same navigator the map and the shop screen use, not a second
              one. On Koh Sichang `navigationProviderFor` keeps the route
              in-app; anywhere else it hands off to Google. A pick that opened
              its own kind of map would be a third answer to "how do I get
              there" on a screen that already has two.
            */
            onNavigate={(destination) => navigateTo(destination, 'place')}
          />
        );

      case 'community':
        return <CommunityFeedScreen onBack={nav.pop} onToast={toast.show} />;

      case 'profile':
        return (
          <ProfileScreen
            refreshKey={profileRefreshKey}
            onOpenEditProfile={() => nav.push('editProfile')}
            onOpenShops={() => nav.push('shopManage')}
            accountTypeOverride={guest ? 'traveller' : signedInAccountType}
            onBack={nav.pop}
            onOpenAccount={() => nav.push('account')}
            onOpenWallet={() => nav.push('wallet')}
            onOpenPassport={() => nav.push('passport')}
            onOpenMedals={() => nav.push('medals')}
            onOpenCompanion={(c) => { setCompanion(c); nav.push('companion'); }}
            onOpenSafety={() => nav.push('safety')}
            onLogout={async () => {
              if (guest) await clearGuest();
              else await clearLoggedIn();
              setSignedInAccountType(undefined);
              setLoggedInState(false);
              setGuestState(false);
              nav.reset('login');
              toast.show(t(guest
                ? { en: 'Demo session ended', th: 'จบการทดลองใช้งานแล้ว', zh: '演示会话已结束' }
                : { en: 'Logged out successfully', th: 'ออกจากระบบเรียบร้อยแล้ว', zh: '已成功退出登录' }));
            }}
            onDeleteAccount={guest ? undefined : async () => {
              // Throwing keeps the dialog open with its error: nothing local is
              // cleared until the server has said the account is gone.
              const res = await api.deleteProfile();
              if (!res.ok || !res.data.deleted) throw new Error(res.ok ? 'not deleted' : res.error);
              // From here the account IS gone, so nothing below may throw: a
              // throw would show "nothing was removed", which would be false.
              await clearLoggedIn().catch(() => undefined);
              await forgetKey().catch(() => undefined);
              setSignedInAccountType(undefined);
              setLoggedInState(false);
              setGuestState(false);
              nav.reset('login');
              toast.show(t({ en: 'Your account has been deleted', th: 'ลบบัญชีของคุณเรียบร้อยแล้ว', zh: '你的账号已删除' }));
            }}
          />
        );

      case 'editProfile':
        return <EditProfileScreen onBack={nav.pop} onSaved={() => { setProfileRefreshKey((k) => k + 1); nav.pop(); }} />;

      case 'connectApp':
        return <ConnectAppScreen onBack={nav.pop} />;

      case 'shop':
        return <ShopProfileScreen scrollState={scrollStateFor(`shop:${nav.shopId}`)} shopId={nav.shopId ?? ''} guest={false} onSignIn={openLogin} onBack={nav.pop} onEdit={() => { if (loggedIn && !guest) nav.push('shopManage', { shopId: nav.shopId ?? undefined }); }} onNavigate={(shop) => navigateTo({ id: shop.id, name: { en: shop.name, th: shop.name, zh: shop.name }, lat: shop.lat, lng: shop.lng }, 'shop')} />;

      case 'shopManage':
        return <ShopManageScreen initialShopId={nav.shopId} onBack={nav.pop} onOpenShop={(id) => nav.push('shop', { shopId: id })} />;

      case 'medals':
        return <MedalsScreen onBack={nav.pop} />;

      case 'passport':
        return <PassportScreen onBack={nav.pop} onOpenMascots={() => nav.push('mascots')} />;

      case 'mascots':
        return <MascotsScreen onBack={nav.pop} onOpen={(code) => nav.push('mascot', { code })} />;

      case 'mascot':
        return <MascotRoomScreen code={nav.code ?? 'TH-84'} onBack={nav.pop} />;

      case 'fashion':
        return <FashionScreen onBack={nav.pop} />;

      case 'summon':
        return <SummonScreen onBack={nav.pop} />;

      case 'account':
        return (
          <AccountScreen
            onBack={nav.pop}
            onToast={toast.show}
            onOpenLogin={() => nav.push('login')}
          />
        );

      case 'login':
        return (
          <LoginScreen
            onLoginSuccess={async (accountType) => {
              setGuestSandboxActive(false);
              await setLoggedIn(true);
              setLoggedInState(true);
              setGuestState(false);
              setSignedInAccountType(accountType);
              toast.show(t({ en: 'Signed in successfully', th: 'เข้าสู่ระบบสำเร็จ', zh: '登录成功' }));
              if (!nav.returnAfterAuth()) nav.selectTab('home');
            }}
            onRegister={() => nav.push('register')}
            onGuest={loggedIn || guest ? undefined : async () => {
              await setGuest(true);
              setGuestState(true);
              refreshWallet();
              setProfileRefreshKey((k) => k + 1);
              toast.show(t({
                en: 'Demo mode: explore everything. Changes reset when you reload.',
                th: 'โหมดเดโม: ทดลองได้ทุกอย่าง ข้อมูลจะรีเซ็ตเมื่อรีโหลด',
                zh: '演示模式：可体验全部功能，重新加载后数据会重置。',
              }));
              nav.selectTab('home');
            }}
            onBack={nav.stack.length > 0 ? () => {
              if (guest) setGuestSandboxActive(true);
              nav.pop();
            } : undefined}
          />
        );

      case 'register':
        return (
          <RegisterScreen
            initialAccountType={nav.accountType ?? 'traveller'}
            onRegisterSuccess={async (accountType) => {
              setGuestSandboxActive(false);
              await setLoggedIn(true);
              setLoggedInState(true);
              setGuestState(false);
              setSignedInAccountType(accountType);
              toast.show(t({
                en: 'Registration successful! Welcome to ChivarGo',
                th: 'สมัครสมาชิกสำเร็จ! ยินดีต้อนรับสู่ ChivarGo',
                zh: '注册成功！欢迎使用 ChivarGo',
              }));
              if (!nav.returnAfterAuth()) nav.push('onboarding');
            }}
            onLogin={() => {
              if (nav.stack[nav.stack.length - 1] === 'login') {
                nav.pop();
              } else {
                nav.push('login');
              }
            }}
            onBack={nav.pop}
          />
        );

      case 'party':
        return (
          <PartyScreen
            onBack={nav.pop}
            onToast={toast.show}
            onFind={() => nav.push('findParty')}
            initialInviteCode={partyInviteCode ?? undefined}
            onInviteCodeConsumed={() => setPartyInviteCode(null)}
          />
        );
      case 'findParty':
        return <FindPartyScreen onBack={nav.pop} onToast={toast.show} />;

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
            onBack={nav.pop}
            onOpenProfile={() => nav.push('profile')}
          />
        );

      case 'trip':
        return (
          <TripScreen
            trip={trip}
            onBack={nav.pop}
            onOpenPlace={(id) => nav.push('place', { placeId: id })}
            onOpenQuest={(id) => nav.push('quest', { questId: id })}
            onOpenStays={() => nav.push('stays')}
          />
        );

      case 'stays':
        return <AskScreen onBack={nav.pop} onToast={toast.show} />;

      case 'fair':
        return (
          <FairScreen
            onBack={nav.pop}
            initialView={fairView}
            onViewChange={setFairView}
            // Handed to the Map tab the way "Show the way" is: one map, not a second one.
            onShowOnMap={(fair, lot) => { setFairFocus({ fairId: fair.id, code: lot.code }); nav.selectTab('map'); }}
          />
        );
    }
  };

  /*
    The navigator joins the list of screens with no chrome over them.

    A tab bar across the bottom of a turn-by-turn view covers the trip panel,
    and the AI button covers the re-centre control - the same collision the
    mini-game note below describes. The way out of the navigator is its own
    Back and its own Stop, both of which are on the screen.
  */
  const showTabs = nav.screen !== 'onboarding' && nav.screen !== 'login' && nav.screen !== 'register'
    && nav.screen !== 'shopManage' && nav.screen !== 'navigate';

  return (
    <SafeAreaProvider>
      <GuestActionProvider guest={guest} onSignIn={openLogin} onRegister={() => nav.push('register')}>
      <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['top', 'bottom']}>
        <StatusBar style="dark" />

        {/* Above everything, on every screen, when the server has stopped
            checking where anybody is. See apps/api/src/fence.ts: the switch
            is allowed to exist only because the app is required to say so. */}
        {fenceOff ? <UnfencedBand /> : null}
        {guest && showTabs ? <GuestBand onSignIn={openLogin} /> : null}

        <View style={{ flex: 1, width: '100%', maxWidth: 1440, alignSelf: 'center', flexDirection: wideShell ? 'row' : 'column' }}>
          {showTabs && wideShell ? (
            <NavigationRail
              active={nav.activeTab}
              onChange={nav.selectTab}
              /*
                A cell, so it resets the stack the way every other cell does.
                It reads selected across the whole Collect layer as well as
                the wallet: on a rail that layer is entered from the backpack,
                and a tablist with nothing selected strands the reader.
              */
              onOpenBackpack={() => nav.reset('wallet')}
              backpackActive={nav.screen === 'wallet' || nav.activeTab === 'game'}
              onOpenCommunity={() => nav.reset('community')}
              communityActive={nav.screen === 'community'}
              onOpenConnectApp={() => nav.reset('localPicks')}
              connectAppActive={nav.screen === 'localPicks'}
              onOpenProfile={() => nav.reset('profile')}
              profileActive={nav.screen === 'profile'}
            />
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <ErrorBoundary key={nav.screen} onReset={() => nav.selectTab('home')}>
              <ScreenTransition screenKey={nav.screen}>{renderScreen(nav.screen)}</ScreenTransition>
            </ErrorBoundary>
          </View>
        </View>

        {/* A live alert follows the user everywhere. Handoff open question 5,
            resolved against the prototype - see src/state/store.tsx. */}
        {sos.alert && nav.screen !== 'safety' ? (
          <SosBanner onPress={() => nav.selectTab('safety')} />
        ) : null}

        {/*
          Not over a mini-game. A game fills the viewport with a document that
          has its own controls, and this button landed on top of the one that
          restarts it - the same way it landed on Home's last door before it
          moved up to 120. There is nothing to move it above here: the page
          below is a browser and the app cannot see what is under the button.
        */}
        {showTabs && nav.screen !== 'concierge' && nav.screen !== 'safety' && nav.screen !== 'miniGame' ? (
          <AiGuideButton wide={wideShell} onPress={() => nav.push('concierge')} />
        ) : null}

        {showTabs && !wideShell ? (
          <TabBar
            active={nav.activeTab}
            onChange={nav.selectTab}
            onOpenLocalPicks={() => nav.reset('localPicks')}
            localPicksActive={nav.screen === 'localPicks'}
          />
        ) : null}

        <Toast message={toast.message} />
      </SafeAreaView>
      </GuestActionProvider>
    </SafeAreaProvider>
  );
}
