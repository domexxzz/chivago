/**
 * A companion's home. The room you visit it in.
 *
 * Modelled on the pet-keeper screens people already know - one creature, large
 * and alive, in its own room, with meters and things to do. That shape is
 * borrowed on purpose: it is legible before anybody reads a word of it.
 *
 * WHAT IS NOT BORROWED IS THE ENGINE. In those games the meters fall because
 * time passed, and you refill them by tapping. Nothing outside the app is
 * being described. Put that here and it would be the first thing in ChivaGo
 * whose numbers are not derived from something that actually happened - on the
 * screen most likely to be shown to someone, which is exactly where the rule
 * matters most.
 *
 * So the meters are the habitat's real condition today. The langur's bar is
 * the air at Na Muang; the turtle's is how crowded Chaweng is this afternoon.
 * Both are measured, both are already on the map screen, and both move for
 * reasons that have nothing to do with whether you opened the app. A creature
 * whose home is doing badly is telling you something true about the island.
 *
 * And the actions are the two things that genuinely move a companion on:
 * being there, and having a host vouch for what you did there. There is no
 * feed button, because there is nothing to feed.
 */

import React from 'react';
import { Animated, Easing, Pressable, ScrollView, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { crowdLabel, type Companion, type ScoredPlace } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, radius } from '../theme/index.ts';
import { Body, Heading, Label, Thai } from '../components/Type.tsx';
import { Creature } from '../components/Creature.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { IconButton } from '../components/Button.tsx';
import { t } from '../i18n/locale.ts';

/**
 * A slow breath, and nothing else.
 *
 * The reference bounces; a two-second rise and fall reads as alive without
 * asking to be watched. It also stops entirely under reduce-motion, which a
 * bounce cannot do gracefully.
 */
function useBreath(): Animated.Value {
  const breath = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);
  return breath;
}

/** The three stages, named. Exported: the wallet lists the same creatures. */
export const STAGE_LABEL: Record<Companion['stage'], { en: string; th: string }> = {
  egg: { en: 'Egg', th: 'ไข่' },
  hatchling: { en: 'Hatchling', th: 'ลูกอ่อน' },
  grown: { en: 'Grown', th: 'โตเต็มวัย' },
};

export function CompanionHomeScreen({
  companion, onBack, onOpenPlace, onFindQuest,
}: {
  companion: Companion;
  onBack: () => void;
  onOpenPlace: (placeId: string) => void;
  onFindQuest: () => void;
}) {
  const places = useAsync(() => api.places(), []);
  const breath = useBreath();

  const { species, stage, evidence, nextStep } = companion;
  const grown = stage === 'grown';

  // The habitat is the place this species lives in, matched by layer - the
  // same join the collection already makes, just shown instead of counted.
  const habitat = (places.data as ScoredPlace[] | null)
    ?.find((p) => p.layer === species.layer) ?? null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 8,
        }}
      >
        <IconButton onPress={onBack} accessibilityLabel="Back to the collection">
          <ChevronLeft size={16} color={color.text} strokeWidth={2} />
        </IconButton>
        <Label size={10} tracking={0.16}>{`${t(species.habitat)}`}</Label>
      </View>

      {/*
        The room. Deliberately the tallest thing on the screen: the creature is
        why anybody opened this, and a card would make it an item in a list
        again, which is what this screen exists to stop being.
      */}
      <View
        style={{
          marginHorizontal: gutter,
          paddingVertical: 34,
          alignItems: 'center',
          backgroundColor: grown ? color.accent100 : color.surface,
          borderWidth: grown ? layout.ruleStrong : 1,
          borderColor: grown ? color.accent : color.neutral300,
          // md, not lg: lg is 999, a pill, and a pill-shaped room is a lozenge.
          borderRadius: radius.md,
        }}
      >
        <Animated.View
          style={{
            transform: [
              { translateY: breath.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
              { scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) },
            ],
          }}
        >
          <Creature species={species.key} stage={stage} size={168} />
        </Animated.View>

        <Heading
          size={22}
          colour={grown ? color.accent : color.text}
          style={{ marginTop: 18 }}
        >
          {stage === 'egg' ? t(species.eggName) : t(species.name)}
        </Heading>

        <View
          style={{
            marginTop: 12, paddingVertical: 5, paddingHorizontal: 12,
            borderWidth: 1, borderColor: grown ? color.accent : color.neutral400,
            borderRadius: radius.sm,
          }}
        >
          <Label size={9} tracking={0.12} colour={grown ? color.accent : color.neutral700}>
            {`${t(STAGE_LABEL[stage])}`}
          </Label>
        </View>
      </View>

      {/* What would move it on. An egg that does not say this is a locked box. */}
      {nextStep ? (
        <View
          style={{
            marginTop: 12, marginHorizontal: gutter, padding: 14,
            borderWidth: 1, borderColor: color.neutral400, borderRadius: radius.md,
          }}
        >
          <Label size={9} tracking={0.14} colour={color.neutral600}>{t({ en: 'Next', th: 'ต่อไป' })}</Label>
          {/* An instruction, not a receipt: "do this next" has not happened yet. */}
          <Body size={14} colour={color.ctaDeep} style={{ marginTop: 6 }}>{t(nextStep)}</Body>

        </View>
      ) : null}

      <HabitatCondition habitat={habitat} loading={places.loading} error={places.error} onRetry={places.reload} />

      {/* What this species is, and one fact that is checkably true. */}
      {stage !== 'egg' ? (
        <View style={{ marginTop: 20, paddingHorizontal: gutter }}>
          <Label size={9} tracking={0.14} colour={color.neutral600}>
            {`${species.scientific} · IUCN ${species.status}`}
          </Label>
          <Body size={14} style={{ marginTop: 8 }}>{t(species.fact)}</Body>

        </View>
      ) : null}

      {/*
        Two actions, and both are things you do outdoors. The reference has
        three buttons that all resolve inside the app; these leave it.
      */}
      <View style={{ marginTop: 24, marginBottom: 32, paddingHorizontal: gutter, gap: 10 }}>
        {habitat ? (
          <Action
            label="Go there"
            thai={`ไปที่ ${habitat.name.th}`}
            detail={`${t(habitat.name)} · ${evidence.visitDays} ${evidence.visitDays === 1 ? 'day' : 'days'} so far`}
            onPress={() => onOpenPlace(habitat.id)}
          />
        ) : null}
        <Action
          label="Find a quest here"
          thai="หาภารกิจในพื้นที่นี้"
          detail={
            grown
              ? 'Already grown — a verified quest still adds Green Points'
              : 'A host-verified quest is the only thing that grows a companion'
          }
          onPress={onFindQuest}
        />
      </View>
    </ScrollView>
  );
}

/**
 * The meters, and where they come from.
 *
 * This is the part the reference would fill with hunger and sleep. Air and
 * crowding are measured, they are the same values the map and the Healthy
 * Score already use, and they carry the date they were taken - so a bar that
 * looks bad can be checked rather than believed.
 */
function HabitatCondition({
  habitat, loading, error, onRetry,
}: {
  habitat: ScoredPlace | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!habitat) return null;

  const crowd = crowdLabel(habitat.metrics.crowdDensity);

  // Lower is better for both, so the bar fills toward "good".
  const air = Math.max(0, Math.min(1, 1 - habitat.metrics.aqi / 150));
  const room = Math.max(0, Math.min(1, 1 - habitat.metrics.crowdDensity / 5));

  return (
    <View style={{ marginTop: 20, paddingHorizontal: gutter }}>
      <Label size={9} tracking={0.14} colour={color.neutral600}>{t({ en: 'Its home today', th: 'ถิ่นอาศัยวันนี้' })}</Label>

      <Meter
        label="Air"
        thai="อากาศ"
        value={air}
        reading={`${habitat.metrics.aqi} AQI`}
      />
      <Meter
        label="Room to move"
        thai="ความพลุกพล่าน"
        value={room}
        reading={`${t(crowd)} · ${habitat.metrics.crowdDensity.toFixed(1)} per 100 m²`}
      />

      <Label
        size={9}
        tracking={0.06}
        colour={color.neutral600}
        style={{ marginTop: 10, textTransform: 'none' }}
      >
        Measured at {t(habitat.name)}, not simulated. These move whether or not
        you open the app.
      </Label>
    </View>
  );
}

function Meter({
  label, thai, value, reading,
}: { label: string; thai: string; value: number; reading: string }) {
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Heading size={13}>{thai ? t({ en: label, th: thai }) : label}</Heading>
        <Label
          size={9}
          tracking={0.04}
          colour={color.neutral700}
          style={{ marginLeft: 'auto', textTransform: 'none' }}
        >
          {reading}
        </Label>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`${label}: ${reading}`}
        style={{
          height: 8, marginTop: 6, borderRadius: 4,
          backgroundColor: color.neutral300, overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${Math.round(value * 100)}%`,
            height: '100%',
            // Coral below a third: the counter-accent is for the one thing that
            // must not read green, and a habitat in trouble is exactly that.
            backgroundColor: value < 0.34 ? color.accent2 : color.accent,
          }}
        />
      </View>
    </View>
  );
}

function Action({
  label, thai, detail, onPress,
}: { label: string; thai: string; detail: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${thai}. ${detail}`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        minHeight: 44, paddingVertical: 14, paddingHorizontal: 16,
        borderWidth: layout.ruleStrong, borderColor: color.brand, borderRadius: radius.md,
      }}
    >
      <View style={{ flex: 1 }}>
        <Heading size={15} colour={color.brand}>{thai ? t({ en: label, th: thai }) : label}</Heading>
        <Label
          size={9}
          tracking={0.04}
          colour={color.neutral600}
          style={{ marginTop: 5, textTransform: 'none' }}
        >
          {detail}
        </Label>
      </View>
      <ChevronRight size={18} color={color.brand} strokeWidth={2} />
    </Pressable>
  );
}
