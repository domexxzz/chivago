/**
 * Reviews for a place.
 *
 * The section makes ONE claim, once, at the top: everything below is from
 * someone the app confirmed was standing here. That is a statement about the
 * whole list rather than a badge on individual rows - and it is only sayable
 * because the server refuses to write an unverified review at all.
 *
 * Rating renders as NUMERALS in squares, matching the rank ladder. No stars:
 * they are decorative icons, and the design system does not use them.
 */

import React from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { X } from 'lucide-react-native';
import {
  APPEAL_MAX_MESSAGE, formatLedgerDate, isModerationReasonKey, MODERATION_REASONS,
  REPORT_MAX_NOTE, REPORT_REASON_KEYS, REPORT_REASONS,
  REVIEW_MAX_BODY, strings,
  type PlaceReview, type ReportReasonKey, type ReviewSummary,
} from '@chivago/core';
import { api, type MyReviewState } from '../api/client.ts';
import { color, gutter, layout, onFill, radius } from '../theme/index.ts';
import { AccentNumeral, Body, Heading, Label, Thai } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { ErrorState } from '../components/States.tsx';

export function ReviewsBlock({
  placeId, summary, justCheckedIn, onToast, onPointsChanged,
}: {
  placeId: string;
  summary: ReviewSummary;
  /**
   * True when the traveller has JUST checked in on this screen.
   *
   * Only ever used to open the control early. Whether they may review is the
   * server's answer, below, and it asks whether they have EVER been here -
   * a check-in from last Tuesday still counts, and the app must not tell
   * someone to do a thing they already did.
   */
  justCheckedIn: boolean;
  onToast: (msg: string) => void;
  onPointsChanged: () => void;
}) {
  const [reviews, setReviews] = React.useState<PlaceReview[]>([]);
  const [mine, setMine] = React.useState<MyReviewState | null>(null);
  const [appealing, setAppealing] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const [everVisited, setEverVisited] = React.useState(false);
  const [reported, setReported] = React.useState<string[]>([]);
  const [reporting, setReporting] = React.useState<PlaceReview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const canReview = everVisited || justCheckedIn;

  const load = React.useCallback(() => {
    void api.reviews(placeId).then((res) => {
      // A dropped failure here is worse than it looks: an empty list reads as
      // a place nobody has reviewed, AND canReview stays false, so someone who
      // HAS been here silently loses the ability to write. Say what happened.
      if (!res.ok) { setError(res.error); return; }
      setError(null);
      setReviews(res.data.reviews);
      setMine(res.data.mine);
      setEverVisited(res.data.canReview);
      setReported(res.data.reported);
    });
  }, [placeId]);

  React.useEffect(load, [load]);

  return (
    <View style={{ marginTop: 24, borderTopWidth: layout.ruleStrong, borderTopColor: color.text, paddingTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Label size={10} tracking={0.14}>
          {`${strings.reviews.title.en} · ${strings.reviews.title.th}`}
        </Label>
        {/* A place nobody has reviewed shows nothing here, not "0.0" - zero is
            a rating, and we have no basis for that claim. */}
        {summary.average !== null ? (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <AccentNumeral size={22}>{summary.average.toFixed(1)}</AccentNumeral>
            <Label size={10} tracking={0.1}>{strings.reviews.count(summary.count).en}</Label>
          </View>
        ) : null}
      </View>

      <Body size={13} colour={color.neutral700} style={{ marginTop: 8 }}>
        {strings.reviews.verifiedOnly.en}
      </Body>
      <Thai size={10} style={{ marginTop: 4 }}>{strings.reviews.verifiedOnly.th}</Thai>

      {canReview ? (
        <Button
          label={mine ? strings.reviews.edit.en : strings.reviews.write.en}
          onPress={() => setComposing(true)}
          variant="secondary"
          height={44}
          style={{ marginTop: 14 }}
        />
      ) : (
        // Never a disabled button with no explanation. The answer is "check
        // in", and the traveller can act on that.
        <View
          style={{
            marginTop: 14,
            padding: 12,
            borderWidth: 1,
            borderColor: color.neutral400,
            borderRadius: radius.sm,
          }}
        >
          <Body size={13} colour={color.neutral700}>{strings.reviews.lockedUntilCheckin.en}</Body>
          <Thai size={10} style={{ marginTop: 4 }}>{strings.reviews.lockedUntilCheckin.th}</Thai>
        </View>
      )}

      {mine?.hiddenAt ? (
        <TakenDownNotice
          state={mine}
          onAppeal={() => setAppealing(true)}
        />
      ) : null}

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!error && reviews.length === 0 ? (
        <Body size={13} colour={color.neutral600} style={{ marginTop: 16 }}>
          {strings.reviews.none.en}
        </Body>
      ) : null}

      {reviews.map((review) => (
        <ReviewRow
          key={review.id}
          review={review}
          isMine={review.id === mine?.review.id}
          alreadyReported={reported.includes(review.id)}
          onReport={() => setReporting(review)}
        />
      ))}

      <AppealSheet
        state={appealing ? mine : null}
        onClose={() => setAppealing(false)}
        onSent={(msg) => {
          setAppealing(false);
          load();
          onToast(msg);
        }}
      />

      <ReportSheet
        review={reporting}
        onClose={() => setReporting(null)}
        onSent={(msg) => {
          if (reporting) setReported((ids) => [...ids, reporting.id]);
          setReporting(null);
          onToast(msg);
        }}
      />

      <ComposeSheet
        placeId={placeId}
        existing={mine?.review ?? null}
        visible={composing}
        onClose={() => setComposing(false)}
        onSaved={(msg) => {
          setComposing(false);
          load();
          onPointsChanged();
          onToast(msg);
        }}
        onWithdrawn={() => {
          setComposing(false);
          load();
          onToast(strings.reviews.updated.en);
        }}
      />
    </View>
  );
}

export function ReviewRow({
  review, isMine, alreadyReported, onReport,
}: {
  review: PlaceReview;
  isMine: boolean;
  alreadyReported: boolean;
  onReport: () => void;
}) {
  const now = React.useMemo(() => new Date(), []);
  return (
    <View
      style={{
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: color.neutral300,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        {/*
          No author name. The pilot has no accounts, so `review.authorName` is
          the default "Traveller" for everyone - a column of identical names
          reads as a bug, and inventing distinct ones would be fabricating
          people. What the reader can actually use is that this was verified,
          and one-review-per-person-per-place already guarantees every row
          below is a different traveller.
        */}
        <Heading size={14}>
          {isMine ? strings.reviews.yours.en : strings.reviews.verifiedVisit.en}
        </Heading>
        <Label size={11} tracking={0.08}>{`${review.rating} / 5`}</Label>
      </View>

      {/* When they were THERE, not when they typed. */}
      <Label size={10} tracking={0} colour={color.neutral600} style={{ textTransform: 'none', marginTop: 3 }}>
        {strings.reviews.visited(formatLedgerDate(review.visitedAt, now)).en}
      </Label>

      {review.body ? (
        <Body size={13} style={{ marginTop: 8 }}>{review.body}</Body>
      ) : null}

      {/* Labelled, never translated. A machine translation presented as the
          traveller's own words is a quote they never said. */}
      {review.body && review.language !== 'en' ? (
        <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 6 }}>
          {strings.reviews.inLanguage(review.language.toUpperCase()).en}
        </Label>
      ) : null}

      {/* Quiet, and only on other people's reviews. Reporting is rare and
          should not compete with reading: a prominent button invites idle
          pressing, and every idle press is a moderator's minute. */}
      {isMine ? null : (
        <Pressable
          onPress={alreadyReported ? undefined : onReport}
          disabled={alreadyReported}
          accessibilityRole="button"
          accessibilityLabel={
            alreadyReported
              ? strings.reviews.reportedAlready.en
              : strings.reviews.reportTitle.en
          }
          hitSlop={8}
          style={{ alignSelf: 'flex-start', marginTop: 10, paddingVertical: 2 }}
        >
          <Label size={9} tracking={0.1} colour={color.neutral600}>
            {alreadyReported
              ? strings.reviews.reportedAlready.en
              : strings.reviews.report.en}
          </Label>
        </Pressable>
      )}
    </View>
  );
}

/**
 * The compose sheet.
 *
 * Rating first, words second, because a rating alone is a valid review and
 * demanding prose would only produce padding. The helper under the field says
 * plainly what earns points rather than letting the traveller discover it by
 * watching a number not move.
 */
export function ComposeSheet({
  placeId, existing, visible, onClose, onSaved, onWithdrawn,
}: {
  placeId: string;
  existing: PlaceReview | null;
  visible: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onWithdrawn: () => void;
}) {
  const [rating, setRating] = React.useState(existing?.rating ?? 0);
  const [body, setBody] = React.useState(existing?.body ?? '');
  const [busy, setBusy] = React.useState(false);

  // Re-seed when the sheet opens, or an edit would show the previous draft.
  React.useEffect(() => {
    if (!visible) return;
    setRating(existing?.rating ?? 0);
    setBody(existing?.body ?? '');
  }, [visible, existing]);

  const save = async () => {
    if (rating < 1) return;
    setBusy(true);
    const res = await api.writeReview(placeId, { rating, body: body.trim() || null });
    setBusy(false);
    if (!res.ok) { onSaved(res.error); return; }
    onSaved(
      res.data.pointsAwarded > 0
        ? strings.reviews.posted(res.data.pointsAwarded).en
        : res.data.created
          ? strings.reviews.tooShortForPoints(40).en
          : strings.reviews.updated.en,
    );
  };

  const withdraw = async () => {
    setBusy(true);
    await api.withdrawReview(placeId);
    setBusy(false);
    onWithdrawn();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(32,30,29,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: color.bg, maxHeight: '85%' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: gutter,
              paddingVertical: 14,
              borderBottomWidth: layout.ruleStrong,
              borderBottomColor: color.text,
            }}
          >
            <Heading size={16}>
              {existing ? strings.reviews.edit.en : strings.reviews.write.en}
            </Heading>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
              <X size={20} color={color.text} />
            </Pressable>
          </View>

          <ScrollView style={{ paddingHorizontal: gutter }} keyboardShouldPersistTaps="handled">
            <Label size={10} tracking={0.12} style={{ marginTop: 16 }}>
              {strings.reviews.rating(rating || 0).en}
            </Label>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setRating(n)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: rating === n }}
                  accessibilityLabel={strings.reviews.rating(n).en}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: layout.ruleStrong,
                    borderRadius: radius.sm,
                    // A rating the traveller sets themselves. Gold, like every
                    // other self-reported figure in the app.
                    borderColor: n <= rating ? color.gold : color.neutral400,
                    backgroundColor: n <= rating ? color.gold : 'transparent',
                  }}
                >
                  <Heading size={16} colour={n <= rating ? onFill.gold : color.neutral500}>{n}</Heading>
                </Pressable>
              ))}
            </View>

            <Label size={10} tracking={0.12} style={{ marginTop: 18 }}>
              {strings.reviews.placeholder.en}
            </Label>
            <TextInput
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={REVIEW_MAX_BODY}
              placeholder={strings.reviews.placeholder.th}
              placeholderTextColor={color.neutral500}
              accessibilityLabel={strings.reviews.placeholder.en}
              style={{
                borderWidth: 1,
                borderColor: color.neutral400,
                borderRadius: radius.sm,
                paddingHorizontal: 10,
                paddingVertical: 10,
                marginTop: 6,
                minHeight: 110,
                fontSize: 15,
                lineHeight: 21,
                textAlignVertical: 'top',
                color: color.text,
                backgroundColor: color.bg,
              }}
            />
            <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 6 }}>
              {`${body.trim().length} / ${REVIEW_MAX_BODY}`}
            </Label>
            <Body size={13} colour={color.neutral700} style={{ marginTop: 10 }}>
              {strings.reviews.tooShortForPoints(40).en}
            </Body>

            <Button
              label={strings.reviews.submit.en}
              onPress={save}
              disabled={busy || rating < 1}
              height={48}
              style={{ marginTop: 20 }}
            />
            {existing ? (
              <Button
                label={strings.reviews.remove.en}
                onPress={withdraw}
                disabled={busy}
                variant="ghost"
                style={{ marginTop: 12, marginBottom: 28 }}
              />
            ) : (
              <View style={{ height: 28 }} />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The report sheet.
 *
 * The blurb under the title is the important part. Someone who presses Report
 * expecting the review to disappear, and then watches it stay up, concludes the
 * button is decorative — and stops using it for the one that really matters. So
 * it says plainly what happens: a moderator looks, and only a moderator removes.
 */
export function ReportSheet({
  review, onClose, onSent,
}: {
  review: PlaceReview | null;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [reason, setReason] = React.useState<ReportReasonKey | null>(null);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!review) return;
    setReason(null);
    setNote('');
  }, [review]);

  if (!review) return null;

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    const res = await api.reportReview(review.id, { reason, note: note.trim() || null });
    setBusy(false);
    onSent(res.ok ? strings.reviews.reported.en : res.error);
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(32,30,29,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: color.bg, maxHeight: '85%' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: gutter,
              paddingVertical: 14,
              borderBottomWidth: layout.ruleStrong,
              borderBottomColor: color.text,
            }}
          >
            <Heading size={16}>{strings.reviews.reportTitle.en}</Heading>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
              <X size={20} color={color.text} />
            </Pressable>
          </View>

          <ScrollView style={{ paddingHorizontal: gutter }} keyboardShouldPersistTaps="handled">
            <Body size={13} colour={color.neutral700} style={{ marginTop: 14 }}>
              {strings.reviews.reportBlurb.en}
            </Body>
            <Thai size={11} style={{ marginTop: 6 }}>{strings.reviews.reportBlurb.th}</Thai>
            <ReasonPicker reason={reason} onPick={setReason} />
            <NoteField note={note} onChange={setNote} />
            <Button
              label={strings.reviews.reportSubmit.en}
              onPress={send}
              disabled={busy || reason === null}
              height={48}
              style={{ marginTop: 20, marginBottom: 28 }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Full-width rows rather than a native picker: five options fit, and a picker
    on Android hides them behind a tap. */
export function ReasonPicker({
  reason, onPick,
}: { reason: ReportReasonKey | null; onPick: (key: ReportReasonKey) => void }) {
  return (
    <>
      <Label size={10} tracking={0.12} style={{ marginTop: 18 }}>
        {strings.reviews.reportReason.en}
      </Label>
      {REPORT_REASON_KEYS.map((key) => {
        const picked = reason === key;
        return (
          <Pressable
            key={key}
            onPress={() => onPick(key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: picked }}
            accessibilityLabel={REPORT_REASONS[key].en}
            style={{
              marginTop: 8,
              padding: 12,
              borderWidth: layout.ruleStrong,
              borderRadius: radius.sm,
              borderColor: picked ? color.brand : color.neutral400,
              backgroundColor: picked ? color.brand : 'transparent',
            }}
          >
            <Heading size={13} colour={picked ? onFill.brand : color.text}>
              {REPORT_REASONS[key].en}
            </Heading>
            <Thai
              size={10}
              colour={picked ? onFill.brand : color.neutral600}
              style={{ marginTop: 2 }}
            >
              {REPORT_REASONS[key].th}
            </Thai>
          </Pressable>
        );
      })}
    </>
  );
}

function NoteField({ note, onChange }: { note: string; onChange: (v: string) => void }) {
  return (
    <>
      <Label size={10} tracking={0.12} style={{ marginTop: 18 }}>
        {strings.reviews.reportNote.en}
      </Label>
      <TextInput
        value={note}
        onChangeText={onChange}
        multiline
        maxLength={REPORT_MAX_NOTE}
        placeholderTextColor={color.neutral500}
        accessibilityLabel={strings.reviews.reportNote.en}
        style={{
          borderWidth: 1,
          borderColor: color.neutral400,
          borderRadius: radius.sm,
          paddingHorizontal: 10,
          paddingVertical: 10,
          marginTop: 6,
          minHeight: 80,
          fontSize: 15,
          lineHeight: 21,
          textAlignVertical: 'top',
          color: color.text,
          backgroundColor: color.bg,
        }}
      />
    </>
  );
}

/**
 * The author's own taken-down review.
 *
 * Shown only to them, above the public list. A review that silently disappears
 * from your own screen is the worst version of moderation: you cannot tell
 * whether it was removed, lost, or never saved. This says which, why, and what
 * you can do about it.
 */
export function TakenDownNotice({
  state, onAppeal,
}: { state: MyReviewState; onAppeal: () => void }) {
  const reasonKey = state.hiddenReasonKey;
  const reason = reasonKey && isModerationReasonKey(reasonKey)
    ? MODERATION_REASONS[reasonKey].en
    : null;
  const appeal = state.appeal;

  return (
    <View
      style={{
        marginTop: 16,
        padding: 14,
        borderWidth: layout.ruleStrong,
        // "Taken down" is a moderation outcome. It was bordered in the success
        // green, which read as though the removal were an achievement.
        borderColor: color.neutral400,
        borderRadius: radius.sm,
      }}
    >
      <Label size={10} tracking={0.14} colour={color.neutral700}>
        {strings.reviews.takenDown.en}
      </Label>
      <Body size={13} style={{ marginTop: 8 }}>
        {reason
          ? strings.reviews.takenDownExplain(reason).en
          : strings.reviews.takenDown.en}
      </Body>
      {state.review.body ? (
        <Body size={13} colour={color.neutral700} style={{ marginTop: 10 }}>
          {state.review.body}
        </Body>
      ) : null}

      {/* One open appeal at a time, and the state of the last one is shown
          rather than silently swallowing a second press. */}
      {appeal === null ? (
        <Button
          label={strings.reviews.appeal.en}
          onPress={onAppeal}
          variant="secondary"
          height={44}
          style={{ marginTop: 14 }}
        />
      ) : (
        <Label size={10} tracking={0.1} colour={color.neutral700} style={{ marginTop: 12 }}>
          {appeal.outcome === 'declined'
            ? strings.reviews.appealDeclined.en
            : strings.reviews.appealPending.en}
        </Label>
      )}
    </View>
  );
}

/**
 * The appeal sheet.
 *
 * Free text, deliberately. Every other reason in this system is a key so it can
 * be translated for whoever reads it — but a person defending their own words
 * cannot be made to pick from a list, and the moderator who reads this is the
 * one who wrote the reason they are arguing with.
 */
export function AppealSheet({
  state, onClose, onSent,
}: {
  state: MyReviewState | null;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { if (state) setMessage(''); }, [state]);
  if (!state) return null;

  const send = async () => {
    setBusy(true);
    const res = await api.appealReview(state.review.id, message.trim());
    setBusy(false);
    onSent(res.ok ? strings.reviews.appealSent.en : res.error);
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(32,30,29,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: color.bg, maxHeight: '85%' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: gutter,
              paddingVertical: 14,
              borderBottomWidth: layout.ruleStrong,
              borderBottomColor: color.text,
            }}
          >
            <Heading size={16}>{strings.reviews.appealTitle.en}</Heading>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
              <X size={20} color={color.text} />
            </Pressable>
          </View>

          <ScrollView style={{ paddingHorizontal: gutter }} keyboardShouldPersistTaps="handled">
            <Body size={13} colour={color.neutral700} style={{ marginTop: 14 }}>
              {strings.reviews.appealBlurb.en}
            </Body>
            <Thai size={11} style={{ marginTop: 6 }}>{strings.reviews.appealBlurb.th}</Thai>

            <TextInput
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={APPEAL_MAX_MESSAGE}
              placeholderTextColor={color.neutral500}
              accessibilityLabel={strings.reviews.appealTitle.en}
              style={{
                borderWidth: 1,
                borderColor: color.neutral400,
                borderRadius: radius.sm,
                paddingHorizontal: 10,
                paddingVertical: 10,
                marginTop: 14,
                minHeight: 120,
                fontSize: 15,
                lineHeight: 21,
                textAlignVertical: 'top',
                color: color.text,
                backgroundColor: color.bg,
              }}
            />
            <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 6 }}>
              {`${message.trim().length} / ${APPEAL_MAX_MESSAGE}`}
            </Label>

            <Button
              label={strings.reviews.appealSubmit.en}
              onPress={send}
              disabled={busy || message.trim().length < 10}
              height={48}
              style={{ marginTop: 20, marginBottom: 28 }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
