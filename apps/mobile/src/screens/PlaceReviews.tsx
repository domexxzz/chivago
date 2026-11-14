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
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { AlertTriangle, Camera, Play, Star, Trash2, X } from 'lucide-react-native';
import {
  ledgerDate,
  APPEAL_MAX_MESSAGE, isModerationReasonKey, MODERATION_REASONS,
  REPORT_MAX_NOTE, REPORT_REASON_KEYS, REPORT_REASONS,
  REVIEW_MAX_BODY, strings,
  type PlaceReview, type ReportReasonKey, type ReviewSummary,
} from '@chivago/core';
import { api, type MyReviewState, type PickedMedia } from '../api/client.ts';
import { color, gutter, layout, onFill, radius, shadow } from '../theme/index.ts';
import { AccentNumeral, Body, Heading, Label } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { ErrorState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';
import { ratingMeaning } from '../components/review-copy.ts';
import { useRequireAccount } from '../components/GuestActionGate.tsx';

export function ReviewsBlock({
  placeId, summary, justCheckedIn, storiesOpen, busy, onPickMedia, onPostStory, onToast, onPointsChanged,
  onCheckIn, checkInBusy,
}: {
  placeId: string;
  summary: ReviewSummary;
  /** The story door, passed to the sheet: shut, and there is nothing to attach. */
  storiesOpen: boolean;
  busy: boolean;
  onPickMedia: () => Promise<PickedMedia | null>;
  onPostStory: (media: PickedMedia, caption: string) => Promise<boolean>;
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
  onCheckIn?: () => Promise<{ ok: boolean; error?: string } | void>;
  checkInBusy?: boolean;
}) {
  const requireAccount = useRequireAccount();
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
    <View style={{ marginTop: 24, paddingTop: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Heading size={20}>
          {`${t(strings.reviews.title)}`}
        </Heading>
        {/* A place nobody has reviewed shows nothing here, not "0.0" - zero is
            a rating, and we have no basis for that claim. */}
        {summary.average !== null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFF4D8', borderRadius: 18, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Star size={14} color="#F5A623" fill="#F5A623" strokeWidth={2} />
            <AccentNumeral size={22}>{summary.average.toFixed(1)}</AccentNumeral>
          </View>
        ) : null}
      </View>

      <Body size={13} colour={color.neutral700} style={{ marginTop: 6 }}>
        {t(strings.reviews.verifiedOnly)}
      </Body>


      {/*
        ONE BUTTON. It opens the sheet that takes the stars, the words and
        the clip together, so it is offered whenever EITHER half is on offer:
        a traveller who has checked in may rate, and one who has not may
        still leave a photograph. Only when neither is possible does the
        block fall through to the "check in first" note below.
      */}
      {canReview || storiesOpen ? (
        <Button
          label={mine ? t(strings.reviews.edit) : t(strings.reviews.write)}
          thai={mine ? strings.reviews.edit.th : strings.reviews.write.th}
          chinese={mine ? strings.reviews.edit.zh : strings.reviews.write.zh}
          onPress={() => {
            if (requireAccount({ en: 'Please sign in or create an account to write a review.', th: 'เข้าสู่ระบบเพื่อเขียนรีวิวสถานที่นี้', zh: '请登录或注册账号以撰写评价。' })) return;
            setComposing(true);
          }}
          variant="secondary"
          height={44}
          style={{ marginTop: 16, borderRadius: 24 }}
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
          <Body size={13} colour={color.neutral700}>{t(strings.reviews.lockedUntilCheckin)}</Body>

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
          {t(strings.reviews.none)}
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
        storiesOpen={storiesOpen}
        canReview={canReview}
        busy={busy}
        onPickMedia={onPickMedia}
        onPostStory={onPostStory}
        onCheckIn={onCheckIn}
        checkInBusy={checkInBusy}
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
          onToast(t(strings.reviews.updated));
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
      style={[shadow.card, {
        marginTop: 12,
        padding: 16,
        backgroundColor: color.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#DCEFF5',
      }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {/*
          No author name. The pilot has no accounts, so `review.authorName` is
          the default "Traveller" for everyone - a column of identical names
          reads as a bug, and inventing distinct ones would be fabricating
          people. What the reader can actually use is that this was verified,
          and one-review-per-person-per-place already guarantees every row
          below is a different traveller.
        */}
        <Heading size={14}>
          {isMine ? t(strings.reviews.yours) : t(strings.reviews.verifiedVisit)}
        </Heading>
        <View style={{ flexDirection: 'row', gap: 2 }} accessibilityLabel={`${review.rating} / 5`}>
          <Text style={{ position: 'absolute', color: 'transparent', fontSize: 1 }}>{`${review.rating} / 5`}</Text>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} size={14} color={n <= review.rating ? '#F5A623' : '#D8E3E8'} fill={n <= review.rating ? '#F5A623' : 'transparent'} strokeWidth={2} />
          ))}
        </View>
      </View>

      {/* When they were THERE, not when they typed. */}
      <Label size={10} tracking={0} colour={color.neutral600} style={{ textTransform: 'none', marginTop: 3 }}>
        {t(strings.reviews.visited(t(ledgerDate(review.visitedAt, now))))}
      </Label>

      {review.body ? (
        <Body size={13} style={{ marginTop: 8 }}>{review.body}</Body>
      ) : null}

      {/* Labelled, never translated. A machine translation presented as the
          traveller's own words is a quote they never said. */}
      {review.body && review.language !== 'en' ? (
        <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 6 }}>
          {t(strings.reviews.inLanguage(review.language.toUpperCase()))}
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
              ? t(strings.reviews.reportedAlready)
              : t(strings.reviews.reportTitle)
          }
          hitSlop={8}
          style={{ alignSelf: 'flex-start', marginTop: 10, paddingVertical: 2 }}
        >
          <Label size={9} tracking={0.1} colour={color.neutral600}>
            {alreadyReported
              ? t(strings.reviews.reportedAlready)
              : t(strings.reviews.report)}
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
/**
 * One sheet for everything somebody leaves at a place.
 *
 * It was the review composer. Beside it, in another block, sat a separate
 * "Tell a story here" button, which asked a traveller to decide which KIND
 * of thing they were leaving before they had said anything - and a clip
 * posted through it carried no words at all, because that flow had no text
 * box.
 *
 * Now: stars, words, and an optional photo or clip, together. What is
 * STORED stays apart, and should. A rating aggregates into a place's score
 * and lasts; a clip expires in seven days and goes on the projector. One
 * table for both would have to choose one lifetime and force a rating onto
 * every photograph. So this posts to both halves, and the words go to
 * whichever ones are there: as the review body, and as the clip's caption.
 *
 * The three states it has to hold at once: somebody who has checked in and
 * may rate, somebody who has not and may still leave a clip, and a place
 * whose story door is shut where only the rating is on offer.
 */
/**
 * What was just taken, before it is sent.
 *
 * A line of text saying "attached · image.jpg" is a receipt, not a check.
 * The one thing somebody wants to know at that moment is whether they got
 * the shot - a phone camera in a hurry produces a thumb over the lens as
 * often as a beach - and a file name cannot answer that. The picture can.
 *
 * A video gets a tile rather than a frame: nothing here can decode one
 * before it is uploaded, and a black rectangle would read as a clip that
 * failed. The tile says "a clip is attached" and means it.
 */
function MediaPreview({ media }: { media: PickedMedia }) {
  const isVideo = media.type.startsWith('video/');
  const box = {
    width: 56, height: 56, borderRadius: radius.sm,
    backgroundColor: color.neutral200, overflow: 'hidden' as const,
  };
  if (isVideo) {
    return (
      <View
        accessibilityLabel={t(strings.place.mediaAttached)}
        style={[box, { alignItems: 'center', justifyContent: 'center', backgroundColor: color.neutral800 }]}
      >
        <Play size={20} color={onFill.text} strokeWidth={2} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: media.uri }}
      accessibilityLabel={t(strings.place.mediaAttached)}
      resizeMode="cover"
      style={box}
    />
  );
}

export function ComposeSheet({
  placeId, existing, visible, storiesOpen, canReview, busy: postingStory,
  onPickMedia, onPostStory, onClose, onSaved, onWithdrawn,
  onCheckIn, checkInBusy,
}: {
  placeId: string;
  existing: PlaceReview | null;
  visible: boolean;
  /** The story door. Shut, and there is nothing to attach a clip to. */
  storiesOpen: boolean;
  /** A rating needs a check-in. Words and a clip do not. */
  canReview: boolean;
  busy: boolean;
  onPickMedia: () => Promise<PickedMedia | null>;
  onPostStory: (media: PickedMedia, caption: string) => Promise<boolean>;
  onClose: () => void;
  onSaved: (message: string) => void;
  onWithdrawn: () => void;
  onCheckIn?: () => Promise<{ ok: boolean; error?: string } | void>;
  checkInBusy?: boolean;
}) {
  const requireAccount = useRequireAccount();
  const [rating, setRating] = React.useState(existing?.rating ?? 0);
  const [body, setBody] = React.useState(existing?.body ?? '');
  const [media, setMedia] = React.useState<PickedMedia | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [checkingIn, setCheckingIn] = React.useState(false);
  const actionLock = React.useRef(false);
  const uploadedMedia = React.useRef<PickedMedia | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = React.useState(false);
  const [checkInError, setCheckInError] = React.useState<string | null>(null);

  const handleCheckIn = async () => {
    if (requireAccount({ en: 'Please sign in or create an account to check in here.', th: 'กรุณาสมัครสมาชิกหรือเข้าสู่ระบบเพื่อเช็กอินที่นี่', zh: '请登录或注册账号，以在这里签到。' })) return;
    if (!onCheckIn) return;
    setCheckingIn(true);
    setCheckInError(null);
    try {
      const res = await onCheckIn();
      if (res && !res.ok && res.error) {
        setCheckInError(res.error);
      }
    } finally {
      setCheckingIn(false);
    }
  };

  // Re-seed when the sheet opens, or an edit would show the previous draft.
  React.useEffect(() => {
    if (!visible) return;
    setRating(existing?.rating ?? 0);
    setBody(existing?.body ?? '');
    setMedia(null);
    uploadedMedia.current = null; setSubmitError(null); setConfirmWithdraw(false);
    setCheckInError(null);
  }, [visible, existing]);

  /*
    Post whichever halves are there.

    The clip goes FIRST, because it is the half that can be refused for a
    reason the person can act on - too large, an iPhone HEIC - and a refusal
    is more useful before their words have been swallowed by a sheet that
    closed. A rating that then fails leaves the clip up, which is the right
    way round: the clip is the thing they made.
  */
  const save = async () => {
    if (actionLock.current || (rating < 1 && !media)) return;
    if (requireAccount({ en: 'Sign in to review this place.', th: 'เข้าสู่ระบบเพื่อเขียนรีวิวสถานที่นี้', zh: '登录以评价此地点。' })) return;
    actionLock.current = true; setBusy(true); setSubmitError(null);
    try {
      const words = body.trim();
      if (media && uploadedMedia.current !== media) {
        if (!await onPostStory(media, words)) { setSubmitError(t({ en: 'Upload failed. Your draft is kept.', th: 'อัปโหลดไม่สำเร็จ ข้อมูลที่กรอกยังอยู่', zh: '上传失败，草稿已保留。' })); return; }
        uploadedMedia.current = media;
      }
      let message = t(strings.place.storyPosted);
      if (rating >= 1) {
        const res = await api.writeReview(placeId, { rating, body: words || null });
        if (!res.ok) { setSubmitError(res.error); return; }
        message = res.data.pointsAwarded > 0 ? t(strings.reviews.posted(res.data.pointsAwarded)) : res.data.created ? t(strings.reviews.tooShortForPoints(40)) : t(strings.reviews.updated);
      }
      onSaved(message);
    } catch { setSubmitError(t({ en: 'Could not save. Your draft is kept.', th: 'บันทึกไม่สำเร็จ ข้อมูลที่กรอกยังอยู่', zh: '保存失败，草稿已保留。' })); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const attach = async () => {
    const picked = await onPickMedia();
    if (picked) setMedia(picked);
  };

  const withdraw = async () => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setSubmitError(null);
    try {
      const result = await api.withdrawReview(placeId);
      if (!result.ok) { setSubmitError(result.error); return; }
      setConfirmWithdraw(false); onWithdrawn();
    } catch { setSubmitError(t({ en: 'Could not delete. Try again.', th: 'ลบไม่สำเร็จ กรุณาลองใหม่', zh: '删除失败，请重试。' })); }
    finally { actionLock.current = false; setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(32,30,29,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#F5FBFD', maxHeight: '92%', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }}>
          <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: color.neutral400, alignSelf: 'center', marginTop: 9 }} />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: gutter,
              paddingTop: 14,
              paddingBottom: 12,
            }}
          >
            <Heading size={20}>
              {existing ? t(strings.reviews.edit) : t(strings.reviews.write)}
            </Heading>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t(strings.common.close)} hitSlop={12} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: color.neutral200, alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color={color.text} />
            </Pressable>
          </View>

          <ScrollView style={{ paddingHorizontal: gutter }} keyboardShouldPersistTaps="handled">
            {!canReview ? (
              /*
                Said, not hidden. Somebody who cannot rate yet can still leave
                a clip and words from this same sheet, and the sentence tells
                them which half is missing and how to get it.
              */
              <View
                style={{
                  marginTop: 16,
                  padding: 14,
                  backgroundColor: color.surface,
                  borderRadius: radius.sm,
                  borderWidth: layout.ruleHair,
                  borderColor: color.neutral300,
                }}
              >
                <Body size={13} colour={color.neutral700}>
                  {t(strings.place.starsNeedCheckIn)}
                </Body>
                {onCheckIn ? (
                  <Button
                    label={checkingIn || checkInBusy ? t(strings.checkin.checkingIn) : t(strings.checkin.cta)}
                    thai={checkingIn || checkInBusy ? strings.checkin.checkingIn.th : strings.checkin.cta.th}
                    chinese={checkingIn || checkInBusy ? strings.checkin.checkingIn.zh : strings.checkin.cta.zh}
                    onPress={handleCheckIn}
                    disabled={checkingIn || checkInBusy || busy}
                    height={40}
                    style={{ marginTop: 10 }}
                  />
                ) : null}
                {checkInError ? (
                  <Body size={13} colour={color.accent2} style={{ marginTop: 8 }}>
                    {checkInError}
                  </Body>
                ) : null}
              </View>
            ) : null}

            <Label size={10} tracking={0.12} style={{ marginTop: 16 }}>
              {t(strings.reviews.rating(rating || 0))} · {ratingMeaning(rating)}
            </Label>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 12, paddingVertical: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => { if (canReview) setRating(n); }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: rating === n, disabled: !canReview }}
                  accessibilityLabel={t(strings.reviews.rating(n))}
                  style={{
                    width: 45,
                    height: 45,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 23,
                    backgroundColor: n <= rating ? '#FFF4D8' : 'transparent',
                  }}
                >
                  <Star size={34} color={n <= rating ? '#F5A623' : '#C9D7DD'} fill={n <= rating ? '#F5A623' : 'transparent'} strokeWidth={2} />
                  <Text style={{ position: 'absolute', color: 'transparent', fontSize: 1 }}>{n}</Text>
                </Pressable>
              ))}
            </View>

            <Label size={10} tracking={0.12} style={{ marginTop: 18 }}>
              {t(strings.reviews.placeholder)}
            </Label>
            <TextInput
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={REVIEW_MAX_BODY}
              placeholder={t(strings.reviews.placeholder)}
              placeholderTextColor={color.neutral500}
              accessibilityLabel={t(strings.reviews.placeholder)}
              style={{
                borderWidth: 1,
                borderColor: '#D7E8EE',
                borderRadius: 18,
                paddingHorizontal: 16,
                paddingVertical: 14,
                marginTop: 8,
                minHeight: 104,
                fontSize: 15,
                lineHeight: 21,
                textAlignVertical: 'top',
                color: color.text,
                backgroundColor: color.surface,
              }}
            />
            <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 6 }}>
              {`${body.trim().length} / ${REVIEW_MAX_BODY}`}
            </Label>
            <Body size={13} colour={color.neutral700} style={{ marginTop: 10 }}>
              {t(strings.reviews.tooShortForPoints(40))}
            </Body>

            {storiesOpen ? (
              <>
                {/*
                  The camera lives here now, beside the words rather than
                  behind its own button in another block. The consent notice
                  comes with it: this is the moment before the camera opens,
                  which is where docs/46 says it belongs, and going on is the
                  consent.
                */}
                <Body size={13} colour={color.neutral600} style={{ marginTop: 18 }}>
                  {t(strings.place.storyNotice)}
                </Body>
                {media ? (
                  <View
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      gap: 12, marginTop: 10, padding: 10,
                      borderWidth: 1, borderColor: '#D7E8EE', borderRadius: 18,
                      backgroundColor: color.surface,
                    }}
                  >
                    <MediaPreview media={media} />
                    <View style={{ flex: 1 }}>
                      <Body size={13}>{t(strings.place.mediaAttached)}</Body>
                      <Label size={9} tracking={0.06} colour={color.neutral600} style={{ textTransform: 'none', marginTop: 2 }}>{media.name}</Label>
                    </View>
                    <Pressable
                      onPress={() => setMedia(null)}
                      accessibilityRole="button"
                      accessibilityLabel={t(strings.place.mediaRemove)}
                      hitSlop={10}
                    >
                      <Body size={13} colour={color.accent2}>{t(strings.place.mediaRemove)}</Body>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={attach}
                    disabled={busy || postingStory}
                    accessibilityRole="button"
                    accessibilityLabel={t(strings.place.addMedia)}
                    style={({ pressed }) => ({
                      marginTop: 10, height: 76, borderRadius: 18,
                      borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#9DCBD8',
                      backgroundColor: pressed ? '#E8F7FB' : color.surface,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                      opacity: busy || postingStory ? 0.5 : 1,
                    })}
                  >
                    <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#E4F7FC', alignItems: 'center', justifyContent: 'center' }}>
                      <Camera size={22} color="#1598BE" strokeWidth={2} />
                    </View>
                    <Heading size={14} colour="#127C9B">{t(strings.place.addMedia)}</Heading>
                  </Pressable>
                )}
              </>
            ) : null}

            {/* Nothing to post is not an error; it is a button that waits. */}
            {rating < 1 && !media ? (
              <Body size={13} colour={color.neutral600} style={{ marginTop: 16 }}>
                {t(strings.place.leaveNothing)}
              </Body>
            ) : null}

            {submitError ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, padding: 11, borderRadius: radius.sm, backgroundColor: '#FEF2F2' }}><AlertTriangle size={16} color={color.accent2} /><Body colour={color.accent2} style={{ flex: 1 }}>{submitError}</Body></View> : null}
            <Button
              label={busy ? t({ en: 'Saving…', th: 'กำลังบันทึก…', zh: '正在保存…' }) : t(strings.place.leaveSubmit)}
              thai={strings.place.leaveSubmit.th}
              chinese={strings.place.leaveSubmit.zh}
              onPress={save}
              disabled={busy || postingStory || (rating < 1 && !media)}
              height={48}
              style={{ marginTop: 20, borderRadius: 24 }}
            />
            {confirmWithdraw ? <View accessibilityRole="alert" style={{ padding: 16, marginTop: 12, borderRadius: radius.md, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Trash2 size={20} color={color.accent2} /><Heading size={15} colour={color.accent2}>{t({ en: 'Delete your review?', th: 'ยืนยันลบรีวิวของคุณ?', zh: '删除您的评价？' })}</Heading></View><Body size={13} colour={color.neutral700} style={{ marginTop: 6 }}>{t({ en: 'This action cannot be undone.', th: 'เมื่อลบแล้วจะไม่สามารถกู้คืนรีวิวได้', zh: '此操作无法撤销。' })}</Body>
              <Button label={t({ en: 'Confirm delete', th: 'ยืนยันลบ', zh: '确认删除' })} onPress={withdraw} disabled={busy} style={{ marginTop: 12 }} />
              <Button label={t({ en: 'Cancel', th: 'ยกเลิก', zh: '取消' })} onPress={() => setConfirmWithdraw(false)} disabled={busy} variant="ghost" style={{ marginTop: 6 }} />
            </View> : null}
            {existing ? (
              <Button
                label={t(strings.reviews.remove)}
                onPress={() => setConfirmWithdraw(true)}
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
  const requireAccount = useRequireAccount();
  const [reason, setReason] = React.useState<ReportReasonKey | null>(null);
  const [note, setNote] = React.useState('');
  const requestLock = React.useRef(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!review) return;
    setReason(null);
    setSubmitError(null);
    setNote('');
  }, [review]);

  if (!review) return null;

  const send = async () => {
    if (!reason || requestLock.current) return;
    if (requireAccount({ en: 'Sign in to report a review.', th: 'เข้าสู่ระบบเพื่อรายงานรีวิว', zh: '登录以举报评价。' })) return;
    requestLock.current = true; setBusy(true); setSubmitError(null);
    try {
      const result = await api.reportReview(review.id, { reason, note: note.trim() || null });
      if (!result.ok) { setSubmitError(result.error); return; }
      onSent(t(strings.reviews.reported));
    } catch { setSubmitError(t({ en: 'Report failed. Your text is kept.', th: 'ส่งรายงานไม่สำเร็จ ข้อความยังอยู่ กรุณาลองใหม่', zh: '举报失败，内容已保留。' })); }
    finally { requestLock.current = false; setBusy(false); }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(32,30,29,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: color.bg, maxHeight: '88%', borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' }}>
          <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: color.neutral400, alignSelf: 'center', marginTop: 9 }} />
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
            <View><Heading size={16}>{t(strings.reviews.reportTitle)}</Heading>{submitError ? <Body colour={color.accent2}>{submitError}</Body> : null}</View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t(strings.common.close)} hitSlop={12} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: color.neutral200, alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color={color.text} />
            </Pressable>
          </View>

          <ScrollView style={{ paddingHorizontal: gutter }} keyboardShouldPersistTaps="handled">
            <Body size={13} colour={color.neutral700} style={{ marginTop: 14 }}>
              {t(strings.reviews.reportBlurb)}
            </Body>

            <ReasonPicker reason={reason} onPick={setReason} />
            <NoteField note={note} onChange={setNote} />
            <Button
              label={busy ? t({ en: 'Sending…', th: 'กำลังส่ง…', zh: '正在发送…' }) : t(strings.reviews.reportSubmit)}
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
        {t(strings.reviews.reportReason)}
      </Label>
      {REPORT_REASON_KEYS.map((key) => {
        const picked = reason === key;
        return (
          <Pressable
            key={key}
            onPress={() => onPick(key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: picked }}
            accessibilityLabel={t(REPORT_REASONS[key])}
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
              {t(REPORT_REASONS[key])}
            </Heading>

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
        {t(strings.reviews.reportNote)}
      </Label>
      <TextInput
        value={note}
        onChangeText={onChange}
        multiline
        maxLength={REPORT_MAX_NOTE}
        placeholderTextColor={color.neutral500}
        accessibilityLabel={t(strings.reviews.reportNote)}
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
    ? t(MODERATION_REASONS[reasonKey])
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
        {t(strings.reviews.takenDown)}
      </Label>
      <Body size={13} style={{ marginTop: 8 }}>
        {reason
          ? t(strings.reviews.takenDownExplain(reason))
          : t(strings.reviews.takenDown)}
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
          label={t(strings.reviews.appeal)}
          onPress={onAppeal}
          variant="secondary"
          height={44}
          style={{ marginTop: 14 }}
        />
      ) : (
        <Label size={10} tracking={0.1} colour={color.neutral700} style={{ marginTop: 12 }}>
          {appeal.outcome === 'declined'
            ? t(strings.reviews.appealDeclined)
            : t(strings.reviews.appealPending)}
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
  const requireAccount = useRequireAccount();
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { if (state) setMessage(''); }, [state]);
  if (!state) return null;

  const send = async () => {
    if (requireAccount({ en: 'Please sign in or create an account to appeal a review decision.', th: 'กรุณาสมัครสมาชิกหรือเข้าสู่ระบบเพื่ออุทธรณ์ผลรีวิว', zh: '请登录或注册账号，以对评价处理结果提出申诉。' })) return;
    setBusy(true);
    const res = await api.appealReview(state.review.id, message.trim());
    setBusy(false);
    onSent(res.ok ? t(strings.reviews.appealSent) : res.error);
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
              borderBottomWidth: layout.ruleHair,
              borderBottomColor: color.neutral300,
            }}
          >
            <Heading size={16}>{t(strings.reviews.appealTitle)}</Heading>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t(strings.common.close)} hitSlop={12}>
              <X size={20} color={color.text} />
            </Pressable>
          </View>

          <ScrollView style={{ paddingHorizontal: gutter }} keyboardShouldPersistTaps="handled">
            <Body size={13} colour={color.neutral700} style={{ marginTop: 14 }}>
              {t(strings.reviews.appealBlurb)}
            </Body>


            <TextInput
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={APPEAL_MAX_MESSAGE}
              placeholderTextColor={color.neutral500}
              accessibilityLabel={t(strings.reviews.appealTitle)}
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
              label={t(strings.reviews.appealSubmit)}
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
