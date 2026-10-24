/**
 * Place detail - score breakdown first, opinion second.
 *
 * The design shows the four metrics as a bare 2x2 grid. This adds one thing the
 * design does not have and the handoff explicitly worries about: a
 * "How is this calculated?" disclosure. A wellness score aimed at tourists that
 * nobody can interrogate is a trust problem and, in some markets, a regulatory
 * one. The breakdown comes straight from the server so it can never drift from
 * the number above it.
 */

import React from 'react';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Image, Linking, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { ExternalLink, MapPin, X } from 'lucide-react-native';
import {
  areaByKey, areaOfPlace, findProvince, isBookingLink, newlyEarned, stallSourceFor, strings,
  type MedalState, type MedalsView, type ScoredPlace,
} from '@chivago/core';
import { api } from '../api/client.ts';
import type { PickedMedia } from '../api/client.ts';
import { photoUri } from '../api/photos.ts';
import { useAsync } from '../state/store.tsx';
import { useServerConfig } from '../state/server-config.ts';
import { pickStoryMedia, postStory } from '../state/tell-story.ts';
import { color, gutter, layout, onFill, radius, shadow } from '../theme/index.ts';
import { AccentNumeral, Body, Heading, Label } from '../components/Type.tsx';
import { Button, Tag } from '../components/Button.tsx';
import { OceanBackdrop, PushHeader } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { ReviewsBlock } from './PlaceReviews.tsx';
import { t } from '../i18n/locale.ts';
import { AirHistoryCard, HereNow } from '../components/PlaceLive.tsx';
import { GettingThere } from '../components/GettingThere.tsx';
import { StoriesBlock } from '../components/Stories.tsx';
import { StallsCard } from '../components/Stalls.tsx';

/*
  WHERE THE SECOND COLUMN STARTS, and why it is this number.

  768 is the usual tablet line and it is too early here: the right-hand rail
  has to hold a 2x2 metric grid and a full-width button without either
  wrapping, which needs about 320, and the left column stops being able to
  carry a 16:9 hero below about 560. 940 is the first width where both are
  comfortable, so a tablet in portrait keeps the phone's single column and
  only a real window gets two.
*/
const WIDE_AT = 940;
/** The reading measure. Past this the columns stop growing and centre. */
const WIDE_MAX = 1180;
const WIDE_GUTTER = 24;
const WIDE_HERO_H = 330;
const WIDE_RAIL_MIN = 320;
const WIDE_RAIL_MAX = 420;

/**
 * "KOH SICHANG, CHON BURI" - the line above the name.
 *
 * Both halves are already on the place: its area is read from where it
 * stands (`areaOfPlace`) and its province from the code every place carries
 * for the passport. Nothing here is new data, and a place in a province
 * with no name in the list simply shows its area.
 */
function whereLine(place: ScoredPlace): string {
  const area = t(areaByKey(areaOfPlace(place)).name);
  const province = findProvince(place.province);
  return province ? `${area}, ${t(province.name)}` : area;
}

export function PlaceScreen({
  placeId, onBack, onAddToTrip, onSafePath, onShowWay, onToast, onPointsChanged,
}: {
  placeId: string;
  onBack: () => void;
  onAddToTrip: () => void;
  onSafePath: () => void;
  /** Draw the way to this place on the app's own map. Absent in tests that do not need it. */
  onShowWay?: (place: ScoredPlace) => void;
  onToast: (msg: string) => void;
  onPointsChanged: () => void;
}) {
  const place = useAsync(() => api.place(placeId), [placeId]);
  /*
    The window, not the platform. `Platform.OS === 'web'` would be the wrong
    question twice over: a phone browser is web and gets one column, and a
    tablet app is native and may be wide enough for two. This also re-renders
    when somebody drags the window across the line, which a one-time read of
    `Dimensions.get` would not.
  */
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_AT;
  const [showBreakdown, setShowBreakdown] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [checkedIn, setCheckedIn] = React.useState(false);
  // The other half. Offered only once a check-in has actually failed, so
  // the primary path stays primary.
  const [offerNote, setOfferNote] = React.useState(false);
  const [noted, setNoted] = React.useState(false);
  // Null until the server has said. It started at 0, so a failed fetch of
  // the quota - offline, the same moment a check-in tends to fail - turned
  // the offer into a disabled "all stamps for this year are used".
  const [notesLeft, setNotesLeft] = React.useState<number | null>(null);
  // Stories (docs/44-45): what is on the pin, whether the door is open, and
  // how many this device has sent that nobody has looked at yet.
  const stories = useAsync(() => api.stories(placeId), [placeId]);
  const [storiesPending, setStoriesPending] = React.useState(0);
  const [telling, setTelling] = React.useState(false);
  // The medals as they stood on arrival, so a check-in can say which one it
  // finished. The server does the counting both times; the phone compares.
  const medals = useAsync(() => api.medals(), [placeId]);
  // Whether a clip is looked at before it is public. See apps/api/src/fence.ts.
  const { autoApprove } = useServerConfig();

  React.useEffect(() => {
    // Whether they already checked in today is server state, not screen
    // state: it survives a reinstall, and it is the same answer on every
    // device they own.
    void api.checkinsToday().then((res) => {
      if (res.ok) setCheckedIn(res.data.includes(placeId));
    });
    void api.selfVisits().then((res) => {
      if (!res.ok) return;
      setNoted(res.data.places.includes(placeId));
      setNotesLeft(res.data.remainingThisYear);
    });
  }, [placeId]);

  /**
   * Check in. Real GPS, checked SERVER-side against the place.
   *
   * The phone never decides whether it is close enough - a client that judges
   * its own geofence is a client that can be told to lie.
   */
  const checkIn = async (): Promise<{ ok: boolean; error?: string }> => {
    setBusy(true);
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      setBusy(false);
      const msg = t({
        en: 'Location permission is needed to check in here.',
        th: 'ต้องอนุญาตให้เข้าถึงตำแหน่งเพื่อเช็กอินที่นี่',
      });
      onToast(msg);
      // A declined permission is the commonest way the phone cannot prove a
      // visit. The other half is offered here too.
      setOfferNote(true);
      return { ok: false, error: msg };
    }
    // A fix that times out or fails must release the button, not strand it.
    let pos: Location.LocationObject;
    try {
      pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    } catch {
      setBusy(false);
      const msg = t(strings.checkin.noFix);
      onToast(msg);
      setOfferNote(true);
      return { ok: false, error: msg };
    }
    // The fix's own accuracy and mock flag travel with it - the second
    // signal the server reads. See docs/30.
    const res = await api.checkIn(placeId, {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: pos.coords.accuracy ?? null,
      mocked: pos.mocked ?? false,
    });
    setBusy(false);
    if (!res.ok) {
      onToast(res.error);
      setOfferNote(true);
      return { ok: false, error: res.error };
    }
    // Also the gate on reviewing: a check-in is what makes one writable, so
    // the review block must open in the same beat rather than on a reload.
    setCheckedIn(true);
    // `awarded: false` means they are here and already checked in today. Say
    // so warmly - a second visit is the behaviour we want, not a mistake.
    const awardedLine = res.data.awarded
      ? t(strings.checkin.awarded(res.data.pointsAwarded))
      : t(strings.checkin.already);
    // The leg that brought them here, said beside the check-in it closed.
    const line = res.data.walk ? `${awardedLine} · ${t(strings.checkin.walked(res.data.walk.points, res.data.walk.fromPlaceName))}` : awardedLine;
    // And any medal this check-in finished, beside that.
    const fresh = await medalsFinishedBy(medals.data);
    onToast([line, ...fresh.map((m) => t(strings.medals.justEarned(t(m.name))))].join(' · '));
    if (fresh.length > 0) medals.reload();
    if (res.data.awarded) onPointsChanged();
    return { ok: true };
  };

  /**
   * What a check-in just finished: the medals as the server counts them now,
   * against how they stood when the screen opened. Nothing to compare
   * against - the first answer never arrived - is nothing to announce.
   */
  async function medalsFinishedBy(before: MedalsView | null): Promise<MedalState[]> {
    if (!before) return [];
    const after = await api.medals();
    return after.ok ? newlyEarned(before.medals, after.data.medals) : [];
  }

  /**
   * Stamp the passport on the traveller's word. Recorded, not scored - see
   * packages/core/src/visits.ts. The button says what it does not pay.
   */
  const noteVisit = async () => {
    setBusy(true);
    const res = await api.recordVisit(placeId);
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    setNoted(true);
    setNotesLeft(res.data.remainingThisYear);
    onToast(res.data.recorded
      ? t(strings.checkin.noted(res.data.remainingThisYear))
      : t(strings.checkin.notedAlready));
  };

  /**
   * Tell a story: the phone's own camera (a file input with `capture` on the
   * web), then a fix, then the upload. Pending until the team has looked -
   * the row does not change, the count does.
   */
  /*
    Two halves of what used to be one button.

    The camera and the upload were a single `tellStory` that opened the
    picker and posted straight away with an empty caption. They are apart
    now because a clip and a rating are left in the SAME sheet: the picker
    runs when somebody attaches, and the upload runs when they post, with
    whatever they typed carried along as the caption. A story used to have
    no caption at all - it gets one for free out of the merge.
  */
  // Both halves live in one place now, because the bar at the foot of the
  // map needs the same three steps and the same four refusals. See
  // src/state/tell-story.ts.
  const pickMedia = () => pickStoryMedia(onToast);
  const sendStory = async (media: PickedMedia, caption: string) => {
    setTelling(true);
    const ok = await postStory(placeId, media, caption, onToast);
    setTelling(false);
    if (ok) { setStoriesPending((n) => n + 1); stories.reload(); }
    return ok;
  };

  /*
    ONE SET OF BLOCKS, TWO ARRANGEMENTS.

    Every child below is built once and then placed - the phone stacks them
    in the order it always did, and a wide window puts the same elements in
    two columns. Nothing is rendered twice and nothing is conditional on
    width except WHERE it sits, which is the only way a layout change can be
    promised not to change what the screen says.
  */
  const titleBlock = place.data ? (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <MapPin size={13} color={color.accent700} strokeWidth={2.2} />
        <Label size={10} tracking={0.14} colour={color.accent700}>{whereLine(place.data)}</Label>
      </View>
      <Heading size={wide ? 38 : 26} tracking={-0.52} style={{ marginTop: 4 }}>
        {t(place.data.name)}
      </Heading>
    </>
  ) : null;

  const scoreCard = place.data ? (
    <View
      style={[shadow.card, {
        marginTop: 14,
        paddingHorizontal: 14,
        paddingBottom: 6,
        backgroundColor: color.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: '#DCEFF5',
        overflow: 'hidden',
      }]}
    >
      <OceanBackdrop subtle />
      <ScoreBlock place={place.data} onExplain={() => setShowBreakdown(true)} />
      <MetricGrid place={place.data} />
    </View>
  ) : null;

  const aboutBlock = place.data ? (
    <>
      <Body style={{ marginTop: 16 }}>{t(place.data.blurb)}</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
        {place.data.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
      </View>
    </>
  ) : null;

  const actionsBlock = place.data ? (
    <>
      {/* The API checked this link; it is checked again here before a tap can take anyone anywhere. */}
      {isBookingLink(place.data.bookingUrl) ? (
        <Button
          label={t(strings.place.book)}
          onPress={() => { void Linking.openURL(place.data!.bookingUrl!); }}
          icon={<ExternalLink size={16} color={onFill.brand} strokeWidth={2} />}
          height={48}
          style={{ marginTop: 16 }}
        />
      ) : null}

      {/*
        Directly above the check-in, because the two answer the same
        question in order: how far away am I, and can I claim this yet.
      */}
      <GettingThere
        place={place.data}
        onShowWay={onShowWay ? () => onShowWay(place.data!) : undefined}
      />

      <Button
        label={checkedIn ? t(strings.checkin.already) : t(strings.checkin.cta)}
        thai={checkedIn ? undefined : strings.checkin.cta.th}
        onPress={checkIn}
        disabled={busy || checkedIn}
        height={48}
        style={{ marginTop: 24 }}
      />
      {offerNote && !checkedIn ? (
        <Button
          label={noted
            ? t(strings.checkin.notedAlready)
            : notesLeft === 0 ? t(strings.checkin.quotaGone) : t(strings.checkin.noteOffer)}
          onPress={noteVisit}
          disabled={busy || noted || notesLeft === 0}
          variant="secondary"
          height={44}
          style={{ marginTop: 10 }}
        />
      ) : null}
      <Button
        label={t(strings.place.addToRoute)}
        thai={strings.place.addToRoute.th}
        onPress={onAddToTrip}
        variant="secondary"
        height={44}
        style={{ marginTop: 10 }}
      />
      <Button
        label={t(strings.place.safePath)}
        onPress={onSafePath}
        variant="secondary"
        height={44}
        style={{ marginTop: 10 }}
      />
    </>
  ) : null;

  const reviews = place.data ? (
    <ReviewsBlock
      placeId={placeId}
      summary={place.data.reviews}
      justCheckedIn={checkedIn}
      // One sheet takes the stars, the words and the clip, so the
      // things it needs to do all three live here.
      storiesOpen={stories.data?.open ?? false}
      busy={telling}
      onPickMedia={pickMedia}
      onPostStory={sendStory}
      onToast={onToast}
      onCheckIn={checkIn}
      checkInBusy={busy}
      onPointsChanged={() => {
        onPointsChanged();
        // The average moved, so the header figure is now stale.
        place.reload();
      }}
    />
  ) : null;

  const storiesBlock = (
    <StoriesBlock
      open={stories.data?.open ?? false}
      stories={stories.data?.stories ?? []}
      pending={storiesPending}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <PushHeader context={t(strings.place.context)} onBack={onBack} />

      {place.loading ? <LoadingState /> : null}
      {place.error ? <ErrorState message={place.error} onRetry={place.reload} /> : null}

      {place.data && wide ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/*
            The desktop reading order, which is not the phone's.

            On a phone every block is equally far down one column, so the
            order IS the hierarchy. A wide window has two, and the question
            becomes which column the eye owns. The left is the place - what
            it looks like, what its air has done, what people said. The right
            is the panel of figures and the things you can do about them,
            kept together so the score and the check-in under it are read as
            one thought rather than found at two scroll positions.
          */}
          <View
            style={{
              width: '100%',
              maxWidth: WIDE_MAX,
              alignSelf: 'center',
              paddingHorizontal: WIDE_GUTTER,
              paddingTop: 18,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: WIDE_GUTTER,
            }}
          >
            {/* minWidth 0 so a long name wraps instead of pushing the rail off. */}
            <View style={{ flex: 1.9, minWidth: 0 }}>
              {titleBlock}
              <Hero place={place.data} inset={0} height={WIDE_HERO_H} />
              <AirHistoryCard placeId={place.data.id} />
              {/* Asked for only where there are stalls: every other place makes no extra request. */}
              {stallSourceFor(place.data.id) ? <StallsCard placeId={place.data.id} /> : null}
              {aboutBlock}
              {storiesBlock}
              {reviews}
              <View style={{ height: 40 }} />
            </View>

            <View style={{ flex: 1, minWidth: WIDE_RAIL_MIN, maxWidth: WIDE_RAIL_MAX }}>
              {scoreCard}
              <HereNow crowd={place.data.crowd} />
              {actionsBlock}
              <View style={{ height: 40 }} />
            </View>
          </View>
        </ScrollView>
      ) : null}

      {place.data && !wide ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <Hero place={place.data} />

          <View style={{ paddingHorizontal: gutter, paddingTop: 16 }}>
            {titleBlock}
            {scoreCard}
            <HereNow crowd={place.data.crowd} />
            {/* Asked for only where there are stalls: every other place makes no extra request. */}
            {stallSourceFor(place.data.id) ? <StallsCard placeId={place.data.id} /> : null}
            <AirHistoryCard placeId={place.data.id} />
            {storiesBlock}
            {aboutBlock}
            {actionsBlock}
            {reviews}
            <View style={{ height: 32 }} />
          </View>
        </ScrollView>
      ) : null}

      {place.data ? (
        <BreakdownSheet
          place={place.data}
          visible={showBreakdown}
          onClose={() => setShowBreakdown(false)}
        />
      ) : null}
    </View>
  );
}

function ScoreBlock({ place, onExplain }: { place: ScoredPlace; onExplain: () => void }) {
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: '#DCEFF5',
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
        <AccentNumeral size={44}>{place.healthyScore}</AccentNumeral>
        <View>
          <Label size={10} tracking={0.14}>{t(strings.place.healthyScore)}</Label>
        </View>
      </View>
      <Button label={t(strings.place.howCalculated)} onPress={onExplain} variant="ghost" />
    </View>
  );
}

function MetricGrid({ place }: { place: ScoredPlace }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {place.breakdown.components.map((c, i) => (
        <View
          key={c.key}
          style={{
            width: '50%',
            paddingVertical: 12,
            paddingRight: 12,
            paddingLeft: i % 2 === 1 ? 12 : 0,
            borderRightWidth: i % 2 === 0 ? 1 : 0,
            borderRightColor: '#DCEFF5',
            borderBottomWidth: i < 2 ? 1 : 0,
            borderBottomColor: '#DCEFF5',
          }}
        >
          <Label size={10} tracking={0.12}>{t(c.label)}</Label>
          <Heading size={17} style={{ marginTop: 4 }}>{c.display}</Heading>
        </View>
      ))}
    </View>
  );
}

/**
 * The score explainer.
 *
 * Shows each component's raw value, its normalised sub-score, the weight
 * applied for THIS user, and where the reading came from. Everything is server
 * output - the client does no arithmetic, so the sheet cannot disagree with the
 * headline number.
 */
function BreakdownSheet({
  place, visible, onClose,
}: { place: ScoredPlace; visible: boolean; onClose: () => void }) {
  const { breakdown } = place;
  const air = place.readings?.aqi;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(32,30,29,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: color.bg, maxHeight: '86%' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: gutter,
              paddingVertical: 14,
              borderBottomWidth: layout.ruleHair,
              borderBottomColor: color.neutral300,
            }}
          >
            <View style={{ flex: 1 }}>
              <Heading size={20}>{t(strings.place.howCalculated)}</Heading>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t(strings.common.close)} hitSlop={12}>
              <X size={20} color={color.text} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: gutter }}>
            <Body size={13} colour={color.neutral700}>
              {t({
                en: `The Healthy Score is a weighted composite of four signals. Weighting is set by your wellness profile — ${breakdown.profileApplied}.`,
                th: `คะแนนสุขภาวะคำนวณจากสัญญาณสี่อย่างแบบถ่วงน้ำหนัก น้ำหนักกำหนดจากโปรไฟล์สุขภาวะของคุณ — ${breakdown.profileApplied}`,
              })}
            </Body>

            {breakdown.components.map((c) => (
              <View
                key={c.key}
                style={{
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: color.neutral300,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Heading size={15}>{t(c.label)}</Heading>
                  <Heading size={15} colour={color.accent700}>{`${Math.round(c.subScore)} / 100`}</Heading>
                </View>

                {/* Shape only: the colours of a measured score stay as they were. */}
                <View style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: color.neutral300, marginTop: 10 }}>
                  <View style={{ width: `${c.subScore}%`, height: '100%', borderRadius: 3, backgroundColor: color.text }} />
                </View>

                <View style={{ flexDirection: 'row', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                  <Label size={10} tracking={0.1}>{`Reading · ${c.display}`}</Label>
                  <Label size={10} tracking={0.1}>{`Weight · ${Math.round(c.weight * 100)}%`}</Label>
                  <Label size={10} tracking={0.1} colour={c.provenance === 'live' ? color.accent700 : color.neutral600}>
                    {t(strings.place.provenance[c.provenance])}
                  </Label>
                </View>
              </View>
            ))}

            <View
              style={{
                borderWidth: layout.ruleHair,
                borderColor: color.neutral300,
                borderRadius: radius.md,
                padding: 14,
                marginTop: 18,
              }}
            >
              <Label size={10} tracking={0.14} colour={color.accent700}>
                {t({ en: 'Where the air reading comes from', th: 'ค่าอากาศนี้มาจากไหน' })}
              </Label>
              <Body size={13} style={{ marginTop: 8 }}>
                {air?.source ?? t({ en: 'Seeded baseline', th: 'ค่าพื้นฐานตั้งต้น' })}
              </Body>
              {/* Said plainly, because the alternative is implying a precision
                  the data does not have. Thailand has no air monitoring station
                  on Koh Samui; the nearest is ~87 km away on the mainland. */}
              <Body size={13} colour={color.neutral700} style={{ marginTop: 8 }}>
                {t({
                  en: 'Air is modelled for an ~11 km area, not this exact spot. Thailand has no monitoring station on Koh Samui — the nearest is about 87 km away on the mainland — so island-wide readings are the honest resolution today.',
                  th: 'ค่าอากาศเป็นแบบจำลองครอบคลุมพื้นที่ราว 11 กม. ไม่ใช่จุดนี้จุดเดียว เกาะสมุยไม่มีสถานีตรวจวัดอากาศ สถานีที่ใกล้ที่สุดอยู่ห่างราว 87 กม. บนฝั่ง ค่าระดับเกาะจึงเป็นความละเอียดที่ตรงไปตรงมาที่สุดในวันนี้',
                })}
              </Body>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The 16:9 hero.
 *
 * A photograph when there is one, and something deliberate when there is not.
 * The grey rectangle it replaces was the single loudest "prototype" signal in
 * the app, and a placeholder that admits what it is beats one that looks like
 * a failed image load.
 *
 * Photography renders through grayscale(1) contrast(1.08) per the design, and
 * imagery is NEVER tinted.
 */
export function Hero({
  place, inset = gutter, height = 190,
}: {
  place: ScoredPlace;
  /**
   * Side margin. The phone bleeds the hero to the screen's gutter; a wide
   * column already has its own padding and passes 0, so the picture fills
   * the column rather than sitting inside a second margin.
   */
  inset?: number;
  height?: number;
}) {
  return (
    <View
      style={[shadow.card, {
        height,
        marginHorizontal: inset,
        marginTop: 6,
        borderRadius: radius.md,
        overflow: 'hidden',
        backgroundColor: color.surface,
      }]}
    >
      {place.photo ? (
        <>
          <Image
            source={{ uri: photoUri(place.photo.url) }}
            accessibilityLabel={`${t(place.name)}, ${t(strings.common.photographedBy)} ${place.photo.credit}`}
            resizeMode="cover"
            style={{ width: '100%', height: '100%' }}
          />
          {/*
            The credit rides ON the image. Most licences require attribution to
            appear with the work, and one that does not still deserves it.
          */}
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              backgroundColor: color.bg,
              paddingVertical: 4,
              paddingHorizontal: 8,
            }}
          >
            <Label size={9} tracking={0.08} colour={color.neutral600}>
              {`${place.photo.credit} · ${place.photo.licence}`}
            </Label>
          </View>
        </>
      ) : (
        <PlaceholderHero place={place} />
      )}
    </View>
  );
}

/**
 * What stands in for a photograph, built from the place's own data.
 *
 * Deliberately graphic rather than photographic: bands keyed to the layer and
 * a contour line whose height follows the Healthy Score. It is not pretending
 * to be a picture of anywhere, which is the point - a generated image of a
 * real beach presented as that beach would be a fabrication, and the one
 * thing this app never does is claim more than it knows.
 */
function PlaceholderHero({ place }: { place: ScoredPlace }) {
  const bands = 7;
  const lift = place.healthyScore / 100;
  return (
    <View style={{ flex: 1, overflow: 'hidden' }}>
      {Array.from({ length: bands }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            backgroundColor: i / bands < lift ? color.neutral200 : color.neutral100,
            borderBottomWidth: 1,
            borderBottomColor: color.neutral300,
            opacity: 0.5 + (i / bands) * 0.5,
          }}
        />
      ))}
      {place.id === 'mangrove' ? (
        <Image
          source={{ uri: photoUri('/media/illustrations/mangrove-habitat-v1.jpg') }}
          accessible={false}
          resizeMode="cover"
          style={{ position: 'absolute', top: 0, bottom: 32, width: '100%' }}
        />
      ) : null}
      <View style={{ position: 'absolute', left: gutter, bottom: 12 }}>
        <Label size={9} tracking={0.14} colour={color.neutral600}>
          {`${place.layer} · ${t(strings.place.noPhotoYet)}`}
        </Label>
      </View>
    </View>
  );
}
