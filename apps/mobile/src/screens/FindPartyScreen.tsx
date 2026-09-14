/**
 * Finding somebody to go with.
 *
 * The screen is a list of PLACES, and that is the whole design rather than a
 * layout choice. Every social map in this category pins people where they are
 * standing; this one cannot, because a check-in is consent to be COUNTED and
 * not consent to be FOUND, and because an app used outdoors on an island by
 * people whose ages we have not established must not resolve to a stranger's
 * position. `party-invites.ts` in core carries the argument at length.
 *
 * So the traveller picks a place, reads who is asking there, and asks to come
 * along. Nobody's position is sent, at any point, by any control on this
 * screen — there is no method in the client that could send one and no route
 * on the server that would take it.
 *
 * WHAT EACH NUMBER MEANS, because two different kinds of fact sit side by side
 * and adding them would produce a number with no referent:
 *
 *   the crowd count is HISTORY the island produced, from geofenced check-ins;
 *   the invitation count is a PLAN somebody typed, minutes ago.
 *
 * `pinLine` in core renders both and never sums them, so this screen prints
 * what it is given rather than doing arithmetic of its own.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { Bilingual, InviteListing, ScoredPlace } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, radius } from '../theme/index.ts';
import { gameRadius, gameShadow } from '@chivago/tokens';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';

type Pin = {
  placeId: string; invitesOpen: number; checkinsLastHour: number; line: Bilingual;
};

export function FindPartyScreen({
  onBack, onToast,
}: { onBack: () => void; onToast: (msg: string) => void }) {
  const [openPlace, setOpenPlace] = React.useState<string | null>(null);

  const board = useAsync(async () => {
    const places = await api.places();
    if (!places.ok) return { ok: false as const, error: places.error, code: places.code };
    const ids = places.data.map((p) => p.id);
    const pins = await api.invitePins(ids);
    if (!pins.ok) return { ok: false as const, error: pins.error, code: pins.code };
    return { ok: true as const, data: { places: places.data, pins: pins.data.pins } };
  }, []);

  const data = board.data;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <PushHeader context={t({ en: 'Find a party', th: 'หาปาร์ตี้' })} onBack={onBack} />

      {board.error ? <ErrorState message={board.error} onRetry={board.reload} /> : null}
      {board.loading && !data ? <LoadingState /> : null}

      {data ? (
        <>
          <Preamble />
          <Places
            places={data.places}
            pins={data.pins}
            openPlace={openPlace}
            onToggle={(id) => setOpenPlace((was) => (was === id ? null : id))}
            onToast={onToast}
            onChanged={board.reload}
          />
        </>
      ) : null}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

/**
 * Said before the list rather than after it.
 *
 * "Can people see where I am" is the first question anybody sensible asks
 * about a screen like this, and a traveller should not have to scroll past
 * strangers' invitations to reach the answer.
 */
function Preamble() {
  return (
    <View style={{ paddingHorizontal: gutter, paddingBottom: 4 }}>
      <Body size={13} colour={color.neutral700}>
        {t({
          en: 'Invitations are posted at a place, never at a person. Nobody can see where you are, and you cannot see where anybody else is.',
          th: 'ประกาศผูกกับสถานที่ ไม่ได้ผูกกับตัวคน ไม่มีใครเห็นว่าคุณอยู่ที่ไหน และคุณก็ไม่เห็นว่าใครอยู่ที่ไหน',
        })}
      </Body>
    </View>
  );
}

function Places({
  places, pins, openPlace, onToggle, onToast, onChanged,
}: {
  places: ScoredPlace[];
  pins: Pin[];
  openPlace: string | null;
  onToggle: (id: string) => void;
  onToast: (msg: string) => void;
  onChanged: () => void;
}) {
  const byId = new Map(pins.map((p) => [p.placeId, p]));

  // Places where somebody is actually asking come first. Nothing is hidden:
  // a place with no invitation is still somewhere you may want to post one,
  // and a list that showed only busy places would make an empty island look
  // like a broken screen.
  const sorted = [...places].sort(
    (a, b) => (byId.get(b.id)?.invitesOpen ?? 0) - (byId.get(a.id)?.invitesOpen ?? 0),
  );

  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 12 }}>
      {sorted.map((place) => {
        const pin = byId.get(place.id);
        const asking = pin?.invitesOpen ?? 0;
        const open = openPlace === place.id;
        return (
          <View
            key={place.id}
            style={{
              marginBottom: 10, borderRadius: gameRadius.panel, backgroundColor: color.surface,
              borderWidth: 1, borderColor: open ? color.brand : color.neutral300,
              overflow: 'hidden',
            }}
          >
            <Pressable
              onPress={() => onToggle(place.id)}
              accessibilityRole="button"
              accessibilityLabel={`${place.name.en}, ${asking} looking`}
              style={{ padding: 14, minHeight: 48 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Heading size={17} tracking={-0.2}>{t(place.name)}</Heading>
                  <Body size={13} colour={color.neutral600} style={{ marginTop: 2 }}>
                    {pin ? t(pin.line) : ''}
                  </Body>
                </View>
                {asking > 0 ? (
                  <View
                    style={{
                      minWidth: 34, paddingHorizontal: 8, paddingVertical: 4,
                      borderRadius: radius.sm, backgroundColor: color.accent,
                      alignItems: 'center',
                    }}
                  >
                    <Label size={11} tracking={0} colour={color.surface}>{String(asking)}</Label>
                  </View>
                ) : null}
              </View>
            </Pressable>

            {open ? (
              <AtPlace placeId={place.id} onToast={onToast} onChanged={onChanged} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** The open invitations at one place, loaded when the traveller opens it. */
function AtPlace({
  placeId, onToast, onChanged,
}: { placeId: string; onToast: (msg: string) => void; onChanged: () => void }) {
  const at = useAsync(() => api.invitesAt(placeId), [placeId]);

  if (at.loading && !at.data) return <LoadingState />;
  if (at.error) return <ErrorState message={at.error} onRetry={at.reload} />;
  if (!at.data) return null;

  const { invitations, doesNot } = at.data;

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: color.neutral300, padding: 14, paddingTop: 12 }}>
      {invitations.length === 0 ? (
        <Body size={13} colour={color.neutral600}>
          {t({
            en: 'No party is asking here yet.',
            th: 'ยังไม่มีปาร์ตี้ประกาศหาคนที่นี่',
          })}
        </Body>
      ) : (
        invitations.map((invite) => (
          <Invitation
            key={invite.id}
            invite={invite}
            onToast={onToast}
            onChanged={() => { at.reload(); onChanged(); }}
          />
        ))
      )}

      <DoesNot items={doesNot} />
    </View>
  );
}

function Invitation({
  invite, onToast, onChanged,
}: { invite: InviteListing; onToast: (msg: string) => void; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [asked, setAsked] = React.useState(false);

  const ask = async () => {
    if (busy) return;
    setBusy(true);
    const res = await api.askToJoin(invite.id);
    setBusy(false);
    // Seven refusals, seven sentences. Passing the server's own words through
    // is more use than "could not ask" — "somebody took the last space" and
    // "leave your current party first" send a traveller to different places.
    if (!res.ok) { onToast(res.error); return; }
    setAsked(true);
    onToast(t({ en: 'Asked. The party will see it.', th: 'ส่งคำขอแล้ว ปาร์ตี้จะเห็น' }));
    onChanged();
  };

  return (
    <View
      style={{
        marginBottom: 10, padding: 12, borderRadius: radius.sm,
        backgroundColor: color.neutral100,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Heading size={15} tracking={-0.1} style={{ flex: 1 }}>{invite.partyName}</Heading>
        <Verified count={invite.missionsVerified} />
      </View>

      <Body size={13} colour={color.neutral700} style={{ marginTop: 4 }}>
        {t({
          en: `${clockWindow(invite)} · ${invite.spacesLeft} ${invite.spacesLeft === 1 ? 'space' : 'spaces'} left`,
          th: `${clockWindow(invite)} · ว่างอีก ${invite.spacesLeft} ที่`,
        })}
      </Body>

      {invite.note ? (
        <Body size={13} colour={color.neutral600} style={{ marginTop: 4 }}>{invite.note}</Body>
      ) : null}

      {invite.yours ? (
        <Label size={10} tracking={0.12} colour={color.neutral600} style={{ marginTop: 8 }}>
          {t({ en: 'YOUR PARTY', th: 'ปาร์ตี้ของคุณ' })}
        </Label>
      ) : (
        <Button
          label={asked ? 'Asked' : busy ? 'Asking…' : 'Ask to come along'}
          thai={asked ? 'ส่งคำขอแล้ว' : 'ขอไปด้วย'}
          onPress={ask}
          disabled={busy || asked}
          height={44}
          style={{ marginTop: 10 }}
        />
      )}
    </View>
  );
}

/**
 * The one figure a stranger is shown about a party.
 *
 * Host-verified missions, which is the same number the public standing ranks
 * on — so it cannot be inflated by self-reporting, and what a stranger reads
 * here and what the board shows can never disagree. Zero is printed rather
 * than hidden: everybody starts there, and a party with no verified work is
 * a fact the reader is entitled to weigh, not a shame to conceal.
 */
function Verified({ count }: { count: number }) {
  const none = count === 0;
  return (
    <View
      style={{
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm,
        backgroundColor: none ? color.neutral200 : color.accent100,
      }}
    >
      <Label size={10} tracking={0.06} colour={none ? color.neutral700 : color.accent700}>
        {none
          ? t({ en: 'NOTHING VERIFIED YET', th: 'ยังไม่มีงานที่ตรวจแล้ว' })
          : t({ en: `${count} VERIFIED`, th: `ตรวจแล้ว ${count}` })}
      </Label>
    </View>
  );
}

/** Carried with every list, on the screen rather than in a help page. */
function DoesNot({ items }: { items: Bilingual[] }) {
  return (
    <View
      style={{
        marginTop: 4, paddingTop: 10,
        borderTopWidth: layout.ruleHair, borderTopColor: color.neutral300,
      }}
    >
      <Label size={9} tracking={0.16} colour={color.neutral600}>
        {t({ en: 'WHAT THIS DOES NOT DO', th: 'สิ่งที่ระบบนี้ไม่ทำ' })}
      </Label>
      {items.map((line) => (
        <Body key={line.en} size={13} colour={color.neutral700} style={{ marginTop: 4 }}>
          {t(line)}
        </Body>
      ))}
    </View>
  );
}

/**
 * The window, in the reader's own clock.
 *
 * Deliberately not a countdown. "In 40 minutes" is a number that is wrong the
 * moment it renders and has to be kept alive by a timer; a clock time is true
 * until the day ends, and it is what somebody would say out loud.
 */
function clockWindow(invite: { from: string; until: string }): string {
  const from = new Date(invite.from);
  const until = new Date(invite.until);
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) return '';
  const hhmm = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${hhmm(from)}–${hhmm(until)}`;
}

export const __test = { clockWindow };
