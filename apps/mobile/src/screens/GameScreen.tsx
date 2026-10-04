/**
 * The game layer, one tap from anywhere.
 *
 * Before this screen existed, everything on it was buried. A companion was
 * three taps down behind the wallet; the seventy-seven and the medals hung off
 * the passport, which hung off Home. That is a strange place to keep the part
 * of a product people open it for, and it happened the way these things always
 * happen — each door was reasonable on the day it was added.
 *
 * So the game took the wallet's cell on the tab bar. The wallet already had a
 * door on Home showing both balances, so its tab was a second route to a
 * screen one tap away; the game layer had no door at all. `store.tsx` carries
 * the argument in full.
 *
 * THE LOOK is a game lobby: a level chip, a row of round doors, one large
 * card for what to do next, and a grid of bright tiles with the character
 * standing over the corner of each. That is the shape party-game apps open on,
 * and it is borrowed because it is legible before anybody reads a word.
 *
 * WHAT IS NOT BORROWED. Those lobbies put a coin balance with a "+" in the
 * corner, and the "+" is a shop. Neither balance is on this screen: Green and
 * Trip are the ledger, the ledger is evidence, and evidence does not wear the
 * game surface (`game-surface.test.ts`). The level is here because EXP is the
 * game layer's own number, earned by activity and never spent.
 *
 * WHAT THIS SCREEN REFUSES TO BECOME. A hub is a list of links, and a list of
 * links is what the wallet already was. So every habitat is a tile you can
 * see from here, found or not, and the creature is ON it — you arrive
 * somewhere rather than at a menu.
 *
 * Nothing here is a claim about the world. Every number on it is a count of
 * things this traveller collected, and the one figure that IS evidence — how
 * many a host verified — is printed as itself rather than folded into a score.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { BookOpen, Map as MapIcon, Medal as MedalIcon, Users } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import {
  collectionSummary, SPECIES, strings,
  type Companion, type LayerKey, type Progression, type Species,
} from '@chivago/core';
import { gameHabitat, gameRadius, gameShadow } from '@chivago/tokens';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, radius } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { GameScene, Medal, Tray, TrayLine } from '../components/Game.tsx';
import { Creature } from '../components/Creature.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { STAGE_LABEL } from './CompanionHome.tsx';
import { t } from '../i18n/locale.ts';

/** The habitats in the order the grid draws them. */
const HABITATS = Object.keys(SPECIES) as LayerKey[];

/**
 * The companion to put on the big card: the one with a step left to take.
 *
 * A hatchling before an egg, because it is the nearer of the two to growing
 * and the step it names is the more satisfying one to take. Null when there is
 * nothing to point at — none found yet, or every one already grown.
 */
export function nextUp(companions: Companion[]): Companion | null {
  const waiting = companions.filter((c) => c.stage !== 'grown' && c.nextStep !== null);
  return waiting.find((c) => c.stage === 'hatchling') ?? waiting[0] ?? null;
}

export function GameScreen({
  onOpenCompanion, onOpenMascots, onOpenMedals, onOpenPassport, onOpenParty,
}: {
  onOpenCompanion: (companion: Companion) => void;
  onOpenMascots: () => void;
  onOpenMedals: () => void;
  onOpenPassport: () => void;
  onOpenParty: () => void;
}) {
  const held = useAsync(() => api.companions(), []);
  // Only the progression is read from the wallet. Its balances are the ledger
  // and stay on the wallet's own screen; a wallet that fails to load costs
  // this screen its level chip and nothing else.
  const wallet = useAsync(() => api.wallet(), []);
  const data = held.data;
  const companions = data?.companions ?? [];
  const summary = companions.length > 0 ? collectionSummary(companions) : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <Header progression={wallet.data?.progression ?? null} />
      <Doors onOpenMedals={onOpenMedals} onOpenPassport={onOpenPassport} onOpenParty={onOpenParty} />

      {held.error ? <ErrorState message={held.error} onRetry={held.reload} /> : null}
      {held.loading && !data ? <LoadingState /> : null}

      {data ? (
        <>
          <NextUp companion={nextUp(companions)} anyFound={companions.length > 0} onOpen={onOpenCompanion} />
          <Grid companions={companions} onOpen={onOpenCompanion} onOpenMascots={onOpenMascots} />
          {summary ? <Counts found={summary.found} grown={summary.grown} total={summary.total} /> : null}
          <Footnote />
        </>
      ) : null}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

/** The screen's name and the level, which is the game layer's own number. */
function Header({ progression }: { progression: Progression | null }) {
  return (
    <View
      style={{
        paddingHorizontal: gutter, paddingTop: 18, paddingBottom: 4,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}
    >
      <Heading size={26} tracking={-0.5}>{t({ en: 'Play', th: 'เกม' })}</Heading>
      {progression ? (
        <View
          style={{
            paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.lg,
            backgroundColor: color.goldSoft, borderWidth: 1, borderColor: color.gold,
          }}
        >
          <Label size={10} tracking={0.08} colour={color.goldDeep}>
            {t(strings.profile.levelChip(progression.level, progression.exp))}
          </Label>
        </View>
      ) : null}
    </View>
  );
}

/** Round doors, the way a lobby opens: an icon you can find before you can read. */
function Doors({
  onOpenMedals, onOpenPassport, onOpenParty,
}: { onOpenMedals: () => void; onOpenPassport: () => void; onOpenParty: () => void }) {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: gutter, paddingTop: 12, gap: 8 }}>
      <Door
        Icon={MedalIcon}
        label={t({ en: 'Medals', th: 'เหรียญตรา' })}
        fill={color.goldSoft}
        ink={color.goldDeep}
        onPress={onOpenMedals}
      />
      <Door
        Icon={BookOpen}
        label={t({ en: 'Passport', th: 'พาสปอร์ต' })}
        fill={gameHabitat.Quest.fill}
        ink={gameHabitat.Quest.ink}
        onPress={onOpenPassport}
      />
      <Door
        Icon={Users}
        label={t({ en: 'Travelling with', th: 'ไปกับใคร' })}
        fill={color.brandSoft}
        ink={color.brandDeep}
        onPress={onOpenParty}
      />
    </View>
  );
}

function Door({
  Icon, label, fill, ink, onPress,
}: { Icon: LucideIcon; label: string; fill: string; ink: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 4 }}
    >
      <View
        style={[
          {
            width: 56, height: 56, borderRadius: gameRadius.control,
            backgroundColor: fill, alignItems: 'center', justifyContent: 'center',
          },
          gameShadow.lift,
        ]}
      >
        <Icon size={26} color={ink} strokeWidth={2} />
      </View>
      <Body size={13} colour={color.neutral800}>{label}</Body>
    </Pressable>
  );
}

/**
 * The big card: one thing to do next, in the companion's own words.
 *
 * The step is the one `nextStepFor` wrote in core, so the card can only ever
 * promise what the ledger would actually count.
 */
function NextUp({
  companion, anyFound, onOpen,
}: { companion: Companion | null; anyFound: boolean; onOpen: (c: Companion) => void }) {
  const frame = [
    { marginHorizontal: gutter, marginTop: 16, height: 132, borderRadius: gameRadius.panel, overflow: 'hidden' as const },
    gameShadow.lift,
  ];

  if (!companion) {
    // Nobody found yet, or every one grown: a sentence, never a blank panel.
    const said = anyFound
      ? { en: 'Every companion you have found is grown.', th: 'เพื่อนร่วมทางที่คุณพบโตเต็มวัยครบทุกตัวแล้ว' }
      : {
        en: 'Nothing here yet. A companion arrives on your second day in a habitat.',
        th: 'ยังไม่มีอะไรที่นี่ เพื่อนร่วมทางจะมาถึงในวันที่สองที่คุณอยู่ในถิ่นนั้น',
      };
    return (
      <View style={frame}>
        <GameScene>
          <View style={{ flex: 1, justifyContent: 'center', padding: 18 }}>
            <Body size={14} colour={color.neutral800}>{t(said)}</Body>
          </View>
        </GameScene>
      </View>
    );
  }

  const name = t(companion.species.name);
  return (
    <Pressable
      onPress={() => onOpen(companion)}
      accessibilityRole="button"
      accessibilityLabel={`${t({ en: 'Next up', th: 'ก้าวต่อไป' })}: ${name}. ${t(companion.nextStep!)}`}
      style={frame}
    >
      <GameScene>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <View
              style={{
                alignSelf: 'flex-start', backgroundColor: color.ctaDeep,
                borderRadius: gameRadius.chip, paddingHorizontal: 8, paddingVertical: 2,
              }}
            >
              <Label size={9} tracking={0.1} colour={color.surface}>{t({ en: 'NEXT UP', th: 'ก้าวต่อไป' })}</Label>
            </View>
            <Heading size={19} tracking={-0.2}>{name}</Heading>
            <Body size={13} colour={color.neutral800}>{t(companion.nextStep!)}</Body>
          </View>
          <Creature species={companion.species.key} stage={companion.stage} size={88} />
        </View>
      </GameScene>
    </Pressable>
  );
}

/**
 * Every habitat as a tile, found or not, and the seventy-seven as a sixth.
 *
 * An unfound habitat shows its EGG name and the place it comes from, never
 * the animal: the egg is the one thing in this layer that is meant to keep a
 * secret, and a grid that named every species would give all five away.
 */
function Grid({
  companions, onOpen, onOpenMascots,
}: { companions: Companion[]; onOpen: (c: Companion) => void; onOpenMascots: () => void }) {
  const byLayer = new Map(companions.map((c) => [c.species.layer, c]));
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 18, gap: 10 }}>
      <Label size={10} tracking={0.14}>{t({ en: 'HABITATS', th: 'ถิ่นที่อยู่' })}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {HABITATS.map((layer) => {
          const found = byLayer.get(layer);
          return found
            ? <FoundTile key={layer} companion={found} onOpen={onOpen} />
            : <UnfoundTile key={layer} species={SPECIES[layer]} />;
        })}
        <Pressable
          onPress={onOpenMascots}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'The seventy-seven province emblems', th: 'มาสคอตครบ 77 จังหวัด' })}
          style={[tileFrame(gameHabitat.mascots.fill), gameShadow.lift]}
        >
          <TileText
            title={t({ en: 'The 77', th: 'ครบ 77 จังหวัด' })}
            sub={t({ en: 'Province emblems', th: 'มาสคอตประจำจังหวัด' })}
            ink={gameHabitat.mascots.ink}
          />
          <View style={{ position: 'absolute', right: 10, bottom: 10 }}>
            <MapIcon size={34} color={gameHabitat.mascots.ink} strokeWidth={1.8} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const tileFrame = (fill: string) => ({
  width: '48%' as const, flexGrow: 1, height: 104, borderRadius: gameRadius.panel,
  backgroundColor: fill, padding: 12, overflow: 'hidden' as const,
});

function TileText({ title, sub, ink }: { title: string; sub: string; ink: string }) {
  return (
    <View style={{ maxWidth: '62%', gap: 2 }}>
      <Heading size={15} colour={ink}>{title}</Heading>
      <Body size={13} colour={ink}>{sub}</Body>
    </View>
  );
}

function FoundTile({ companion, onOpen }: { companion: Companion; onOpen: (c: Companion) => void }) {
  const tone = gameHabitat[companion.species.layer];
  const name = t(companion.species.name);
  const stage = t(STAGE_LABEL[companion.stage]);
  return (
    <Pressable
      onPress={() => onOpen(companion)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${stage}. ${t({ en: 'Visit its home.', th: 'ไปที่บ้านของมัน' })}`}
      style={[tileFrame(tone.fill), gameShadow.lift]}
    >
      <TileText title={name} sub={stage} ink={tone.ink} />
      <View style={{ position: 'absolute', right: -6, bottom: -6 }}>
        <Creature species={companion.species.key} stage={companion.stage} size={72} />
      </View>
    </Pressable>
  );
}

function UnfoundTile({ species }: { species: Species }) {
  const tone = gameHabitat[species.layer];
  const egg = t(species.eggName);
  return (
    <View
      accessibilityLabel={`${egg}, ${t({ en: 'not found yet', th: 'ยังไม่พบ' })}. ${t(species.habitat)}`}
      style={tileFrame(tone.fill)}
    >
      <TileText title={egg} sub={t({ en: 'Not found yet', th: 'ยังไม่พบ' })} ink={tone.ink} />
      <View style={{ position: 'absolute', right: -6, bottom: -6, opacity: 0.55 }}>
        <Creature species={species.key} stage="egg" size={72} />
      </View>
    </View>
  );
}

/**
 * Three counts, in a tray.
 *
 * `grown` is the only one that is evidence — a companion grows when a host
 * verifies a quest — so it is named as such rather than left to look like the
 * same kind of number as the others.
 */
function Counts({ found, grown, total }: { found: number; grown: number; total: number }) {
  return (
    <Tray style={{ marginHorizontal: gutter, marginTop: 14, borderRadius: gameRadius.panel }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Medal value={found} />
        <View style={{ flex: 1 }}>
          <TrayLine>
            {t({
              en: `${found} of ${total} habitats, ${grown} grown by a verified quest`,
              th: `${found} จาก ${total} ถิ่น · โตแล้ว ${grown} ตัวจากภารกิจที่ผู้จัดตรวจ`,
            })}
          </TrayLine>
        </View>
      </View>
    </Tray>
  );
}

function Footnote() {
  return (
    <View
      style={{
        marginHorizontal: gutter, marginTop: 14, padding: 12, borderRadius: radius.md,
        backgroundColor: color.neutral100,
      }}
    >
      <Body size={13} colour={color.neutral700}>
        {t({
          en: 'Nothing on this screen is a claim about the world. What a host verified is said as itself, on the pages that carry it.',
          th: 'ไม่มีอะไรในหน้านี้ที่เป็นการอ้างเรื่องจริงในโลก สิ่งที่ผู้จัดตรวจแล้วจะบอกตรง ๆ ในหน้าที่มันอยู่',
        })}
      </Body>
    </View>
  );
}
