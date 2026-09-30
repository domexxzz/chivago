/**
 * Asking an operator a question. docs/61, stage three.
 *
 * NOT the points market. A voucher is a transaction - points out, a code in -
 * and an inquiry is deliberately not one: it reserves nothing and no money
 * moves through ChivaGo. Putting listings inside the market would blur exactly
 * the line docs/61 exists to draw, so they have their own screen, reached from
 * the trip planner, which is where a traveller wonders about stays and boats.
 *
 * WHAT IT REFUSES, ON SCREEN.
 *
 *   The not-a-booking sentence opens the screen and sits again above the send
 *   button, because the moment somebody taps "send" is the moment they decide
 *   what they think they just did.
 *
 *   Nothing is invented. A listing with no stated price says so; an operator
 *   with too few answers shows no response time rather than a flattering one;
 *   and with no operators listed the screen says that, instead of padding
 *   itself with examples that would be claims made in real businesses' names.
 *   The one exception is the demo build's made-up operator, and it says what
 *   it is wherever its name appears (`ExampleMark`).
 *
 *   The form checks the SAME `inquiryProblems` the server runs, so every
 *   problem shows beside its field at once and the two can never disagree
 *   about what a valid question is.
 */

import React from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { X } from 'lucide-react-native';
import {
  INQUIRY_IS_NOT_A_BOOKING, LICENCE_STATED, LISTING_KIND_LABEL, MAX_MESSAGE, MAX_PARTY,
  PROBLEM_LABEL, STATE_LABEL,
  answerNote, inquiryProblems, islandDateKey, strings,
  type InquiryProblem, type ListingCard, type TravellerInquiry,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, onFill, radius } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { ErrorState, SkeletonList } from '../components/States.tsx';
import { getLocale, t } from '../i18n/locale.ts';

const DAY_MS = 86_400_000;

/** The next fortnight, as island dates. Past two weeks, a phone call. */
export function dayChoices(now: Date = new Date(), count = 14): string[] {
  return Array.from({ length: count }, (_, i) => islandDateKey(new Date(now.getTime() + i * DAY_MS)));
}

/**
 * "Sat 4 Oct" / "ส. 4 ต.ค." - read on a chip, so short. Spelt out in full for
 * a screen reader, which would otherwise read the abbreviations letter by
 * letter.
 */
function dayLabel(key: string, spelt = false): string {
  const d = new Date(`${key}T12:00:00+07:00`);
  return d.toLocaleDateString(getLocale() === 'th' ? 'th-TH' : 'en-GB', {
    weekday: spelt ? 'long' : 'short', day: 'numeric', month: spelt ? 'long' : 'short',
    timeZone: 'Asia/Bangkok',
  });
}

const baht = (n: number): string => n.toLocaleString('en-US');

/** A sentence the traveller reads as a boundary, shown whole and plain. */
function NotABooking() {
  return (
    <View
      style={{
        borderLeftWidth: 4, borderLeftColor: color.text, paddingLeft: 12, paddingVertical: 6,
      }}
    >
      <Body size={13} colour={color.text}>{t(INQUIRY_IS_NOT_A_BOOKING)}</Body>
    </View>
  );
}

export function AskScreen({
  onBack, onToast,
}: {
  onBack: () => void;
  onToast: (msg: string) => void;
}) {
  const listings = useAsync(() => api.listings(), []);
  const mine = useAsync(() => api.myInquiries(), []);
  const [asking, setAsking] = React.useState<ListingCard | null>(null);

  const withdraw = async (i: TravellerInquiry) => {
    const res = await api.withdrawInquiry(i.id);
    if (res.ok) mine.reload();
    else onToast(res.error);
  };

  return (
    <View style={{ flex: 1 }}>
      <PushHeader context={t(strings.ask.context)} onBack={onBack} />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: gutter, paddingBottom: 18 }}>
          <NotABooking />
        </View>

        {mine.data && mine.data.length > 0 ? (
          <View style={{ paddingHorizontal: gutter, paddingBottom: 8 }}>
            <Heading size={17}>{t(strings.ask.yourQuestions)}</Heading>
            {mine.data.map((i) => <QuestionRow key={i.id} inquiry={i} onWithdraw={() => withdraw(i)} />)}
          </View>
        ) : null}

        <View style={{ paddingHorizontal: gutter, paddingTop: 10, paddingBottom: 6 }}>
          <Heading size={17}>{t(strings.ask.operators)}</Heading>
        </View>

        {listings.loading ? <SkeletonList rows={4} /> : null}
        {listings.error ? <ErrorState message={listings.error} onRetry={listings.reload} /> : null}
        {listings.data && listings.data.length === 0 ? (
          <View style={{ paddingHorizontal: gutter, paddingVertical: 12 }}>
            <Body size={14} colour={color.neutral700}>{t(strings.ask.none)}</Body>
          </View>
        ) : null}
        {listings.data?.map((l) => <ListingRow key={l.id} listing={l} onAsk={() => setAsking(l)} />)}

        <View style={{ height: 32 }} />
      </ScrollView>

      <AskSheet
        listing={asking}
        onClose={() => setAsking(null)}
        onSent={() => {
          setAsking(null);
          mine.reload();
          onToast(t(strings.ask.sent));
        }}
      />
    </View>
  );
}

/**
 * "Example · not a real business".
 *
 * Only the demo build's made-up operator carries `example`, and wherever its
 * name appears - the row, the form, a question about it - this sits directly
 * under it. Coral, because the palette keeps it for the things a reader must
 * not take at face value.
 */
function ExampleMark() {
  return (
    <Label size={10} tracking={0.12} colour={color.accent2} style={{ marginTop: 3 }}>
      {t(strings.ask.example)}
    </Label>
  );
}

export function ListingRow({ listing, onAsk }: { listing: ListingCard; onAsk: () => void }) {
  return (
    <Pressable
      onPress={onAsk}
      accessibilityRole="button"
      accessibilityLabel={
        `${t(strings.ask.operators)}: ${t(listing.title)}, ${listing.operatorName}`
        + (listing.example ? `. ${t(strings.ask.example)}` : '')
      }
      style={{
        paddingVertical: 14,
        paddingHorizontal: gutter,
        borderBottomWidth: 1,
        borderBottomColor: color.neutral300,
      }}
    >
      <Label size={10} tracking={0.12}>{t(LISTING_KIND_LABEL[listing.kind])}</Label>
      <Heading size={15} style={{ marginTop: 3 }}>{t(listing.title)}</Heading>
      <Label size={11} tracking={0} style={{ textTransform: 'none', marginTop: 2 }}>
        {`${listing.operatorName} · ${listing.whereLabel}`}
      </Label>
      {listing.example ? <ExampleMark /> : null}
      <Body size={13} colour={color.neutral700} style={{ marginTop: 6 }}>
        {listing.fromTHB === null
          ? t(strings.ask.noPrice)
          : t(strings.ask.fromPrice(baht(listing.fromTHB)))}
      </Body>
      {listing.responseHours === null ? null : (
        <Body size={13} colour={color.neutral700}>
          {t(strings.ask.usuallyAnswers(String(listing.responseHours)))}
        </Body>
      )}
      {listing.licenceNo === null ? null : (
        <Label size={10} tracking={0} style={{ textTransform: 'none', marginTop: 4 }}>
          {`${listing.licenceNo} · ${t(LICENCE_STATED)}`}
        </Label>
      )}
    </Pressable>
  );
}

export function QuestionRow({
  inquiry, onWithdraw,
}: { inquiry: TravellerInquiry; onWithdraw: () => void }) {
  const { listing } = inquiry;
  return (
    <View style={{ borderLeftWidth: 4, borderLeftColor: color.neutral400, paddingLeft: 12, marginTop: 14 }}>
      <Heading size={14}>{t(listing.title)}</Heading>
      <Label size={11} tracking={0} style={{ textTransform: 'none', marginTop: 2 }}>
        {`${listing.operatorName} · ${dayLabel(inquiry.forDate)} · ${t(strings.ask.people(inquiry.partySize))}`}
      </Label>
      {listing.example ? <ExampleMark /> : null}
      <Label size={10} tracking={0.1} style={{ marginTop: 6 }}>{t(STATE_LABEL[inquiry.now])}</Label>

      {inquiry.now === 'answered' ? (
        <View style={{ marginTop: 6 }}>
          {inquiry.answer ? <Body size={14}>{inquiry.answer}</Body> : null}
          <Body size={13} colour={color.neutral700} style={{ marginTop: 6 }}>
            {t(answerNote(listing.operatorName, inquiry.quoteTHB))}
          </Body>
        </View>
      ) : null}

      {inquiry.now === 'declined' && inquiry.answer ? (
        <Body size={13} colour={color.neutral700} style={{ marginTop: 6 }}>
          {`${t(strings.ask.theirReason)}: ${inquiry.answer}`}
        </Body>
      ) : null}

      {inquiry.now === 'sent' ? (
        <Pressable
          onPress={onWithdraw}
          accessibilityRole="button"
          // Heard in a list of questions, "Withdraw" alone does not say which.
          accessibilityLabel={`${t(strings.ask.withdraw)}: ${t(listing.title)}`}
          hitSlop={8}
          style={{ marginTop: 8, alignSelf: 'flex-start' }}
        >
          <Label size={11} tracking={0.08} colour={color.neutral700}>{t(strings.ask.withdraw)}</Label>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The question itself.
 *
 * Problems are shown only after a first attempt, then kept live - so a
 * traveller is not greeted by red text before typing, and once they have
 * tried, each field clears its own complaint as they fix it.
 */
function AskSheet({
  listing, onClose, onSent,
}: {
  listing: ListingCard | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const days = React.useMemo(() => dayChoices(), [listing?.id]);
  const [forDate, setForDate] = React.useState<string>(days[1] ?? days[0]!);
  const [partySize, setPartySize] = React.useState(2);
  const [message, setMessage] = React.useState('');
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);

  React.useEffect(() => {
    // A fresh sheet for each listing: last listing's question is not this one's.
    setForDate(days[1] ?? days[0]!);
    setPartySize(2);
    setMessage('');
    setTried(false);
    setFailed(null);
  }, [listing?.id, days]);

  if (!listing) return null;

  const problems: InquiryProblem[] = inquiryProblems({ forDate, partySize, message });
  const shown = tried ? problems : [];
  const problem = (p: InquiryProblem) =>
    shown.includes(p) ? (
      <Body size={13} colour={color.accent2} style={{ marginTop: 4 }}>{t(PROBLEM_LABEL[p])}</Body>
    ) : null;

  const send = async () => {
    setTried(true);
    if (problems.length > 0) return;
    setBusy(true);
    setFailed(null);
    const res = await api.inquire(listing.id, { forDate, partySize, message });
    setBusy(false);
    // A refusal is said HERE, under the button, and not in a toast. The toast
    // draws beneath this Modal, so a send that failed - offline on a pier -
    // read as a button that did nothing, and a traveller could close the
    // sheet believing the question had gone.
    if (res.ok) onSent();
    else setFailed(res.error);
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(32,30,29,0.45)', justifyContent: 'flex-end' }}>
        <ScrollView
          style={{ backgroundColor: color.bg, maxHeight: '92%' }}
          contentContainerStyle={{ padding: gutter, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Heading size={20}>{t(listing.title)}</Heading>
              <Label size={11} tracking={0} style={{ textTransform: 'none', marginTop: 4 }}>
                {`${listing.operatorName} · ${listing.whereLabel}`}
              </Label>
              {listing.example ? <ExampleMark /> : null}
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t(strings.common.close)} hitSlop={12}>
              <X size={20} color={color.text} strokeWidth={2} />
            </Pressable>
          </View>

          <Label size={10} tracking={0.14} style={{ marginTop: 20 }}>{t(strings.ask.day)}</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {days.map((d) => {
                const on = d === forDate;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setForDate(d)}
                    accessibilityRole="button"
                    accessibilityLabel={dayLabel(d, true)}
                    accessibilityState={{ selected: on }}
                    style={{
                      paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.sm,
                      borderWidth: layout.ruleStrong, borderColor: on ? color.text : color.neutral300,
                      backgroundColor: on ? color.text : 'transparent',
                    }}
                  >
                    <Label size={11} tracking={0} colour={on ? onFill.text : color.text} style={{ textTransform: 'none' }}>
                      {dayLabel(d)}
                    </Label>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          {problem('date_past')}{problem('date_far')}{problem('date_format')}

          <Label size={10} tracking={0.14} style={{ marginTop: 18 }}>{t(strings.ask.party)}</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 8 }}>
            <Stepper sign="−" label={t(strings.ask.fewer)} onPress={() => setPartySize((n) => Math.max(1, n - 1))} disabled={partySize <= 1} />
            <Heading size={20} style={{ minWidth: 28, textAlign: 'center' }}>{String(partySize)}</Heading>
            <Stepper sign="+" label={t(strings.ask.more)} onPress={() => setPartySize((n) => Math.min(MAX_PARTY, n + 1))} disabled={partySize >= MAX_PARTY} />
          </View>
          {problem('party_size')}

          <Label size={10} tracking={0.14} style={{ marginTop: 18 }}>{t(strings.ask.question)}</Label>
          <TextInput
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={MAX_MESSAGE}
            placeholder={t(strings.ask.questionHint)}
            placeholderTextColor={color.neutral500}
            accessibilityLabel={t(strings.ask.question)}
            style={{
              borderWidth: 1, borderColor: color.neutral400, borderRadius: radius.sm,
              paddingHorizontal: 10, paddingVertical: 10, marginTop: 6, minHeight: 100,
              fontSize: 15, color: color.text, textAlignVertical: 'top',
            }}
          />
          {problem('message')}

          <View style={{ marginTop: 18 }}>
            <NotABooking />
          </View>

          <Button
            label={strings.ask.send.en}
            thai={strings.ask.send.th}
            onPress={send}
            busy={busy}
            busyLabel={t({ en: 'Sending…', th: 'กำลังส่ง…' })}
            style={{ marginTop: 16 }}
          />
          {failed ? (
            <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ marginTop: 8 }}>
              <Body size={13} colour={color.accent2}>{failed}</Body>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Stepper({
  sign, label, onPress, disabled,
}: { sign: string; label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={{
        width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
        borderWidth: layout.ruleStrong, borderColor: disabled ? color.neutral300 : color.text,
      }}
    >
      <Heading size={18} colour={disabled ? color.neutral400 : color.text}>{sign}</Heading>
    </Pressable>
  );
}
