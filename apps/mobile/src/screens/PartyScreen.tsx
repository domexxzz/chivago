/**
 * Who you are travelling with.
 *
 * The first question anybody asks about a group in a points app is "do we all
 * get the points", and the answer is no — everyone earns their own from work a
 * host verified for them. That is not a limitation to bury; it is the reason
 * the points are worth having, so it sits on the screen in a panel of its own
 * rather than in a help page.
 *
 * What a party actually adds is the one number that IS more than the sum of
 * its parts: provinces reached BETWEEN you, counted once each. Four people who
 * each went somewhere different have covered four; two who went together have
 * covered one. That is the only figure here that rewards splitting up, and it
 * is the honest reason to travel as a group in this app.
 *
 * Solo is a first-class state, not an empty one. It is what everybody starts
 * as, so it gets a real screen with two doors rather than a shrug.
 */

import React from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { PARTY_KIND_LABEL, nextTogether, type Bilingual, type PartySummary } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, onFill, radius } from '../theme/index.ts';
import { Body, Heading, Label, Thai } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';

/** Provinces open today. Two, and the passport says so on its own screen. */
const OPEN_PROVINCES = 2;

export function PartyScreen({
  onBack, onToast,
}: { onBack: () => void; onToast: (msg: string) => void }) {
  const party = useAsync(() => api.party(), []);
  const data = party.data;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <PushHeader context="Travelling with · ไปกับใคร" onBack={onBack} />

      {party.error ? <ErrorState message={party.error} onRetry={party.reload} /> : null}
      {party.loading && !data ? <LoadingState /> : null}

      {data ? (
        data.party === null
          ? <Alone onChanged={party.reload} onToast={onToast} />
          : (
            <>
              <Together name={data.party.name} summary={data.summary} />
              <Members summary={data.summary} />
              <DoesNot items={data.doesNot} />
              <Leave onChanged={party.reload} onToast={onToast} />
            </>
          )
      ) : null}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Solo
// ---------------------------------------------------------------------------

function Alone({
  onChanged, onToast,
}: { onChanged: () => void; onToast: (msg: string) => void }) {
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [made, setMade] = React.useState<string | null>(null);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    const res = await api.createParty('Our trip');
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    // The code stays on screen rather than bouncing straight to the group:
    // the traveller started this to give somebody a code, and navigating away
    // from it is taking away the thing they came for.
    setMade(res.data.code);
    onChanged();
  };

  const join = async () => {
    if (busy || code.trim().length === 0) return;
    setBusy(true);
    const res = await api.joinParty(code.trim());
    setBusy(false);
    // The server writes four different sentences for four different problems;
    // passing its own words through is more use than "could not join".
    if (!res.ok) { onToast(res.error); return; }
    setCode('');
    onToast(`You are travelling with ${res.data.party.name}.`);
    onChanged();
  };

  return (
    <>
      <View
        style={{
          margin: gutter, padding: 20, borderRadius: radius.md, backgroundColor: color.paper,
        }}
      >
        <Label size={10} tracking={0.16} colour={color.brandSoft}>
          {t(PARTY_KIND_LABEL.solo).toUpperCase()}
        </Label>
        <Heading size={26} colour={color.surface} tracking={-0.5} style={{ marginTop: 8 }}>
          {t({ en: 'You are travelling on your own', th: 'คุณเดินทางคนเดียว · เชิญเพื่อนมาร่วมทางได้' })}
        </Heading>
      </View>

      <View style={{ paddingHorizontal: gutter }}>
        <Body size={13} colour={color.neutral700}>{t({ en: 'A group does not share points — everyone keeps their own. What it adds is the count of provinces you have reached between you.', th: 'กลุ่มไม่แชร์แต้ม แต่ละคนได้ของตัวเอง สิ่งที่เพิ่มคือจำนวนจังหวัดที่ไปถึงรวมกัน' })}</Body>

        {made === null ? (
          <Button
            label={busy ? 'Starting…' : 'Start a group'}
            thai="สร้างกลุ่ม"
            onPress={start}
            disabled={busy}
            height={48}
            style={{ marginTop: 16 }}
          />
        ) : (
          <View
            style={{
              marginTop: 16, paddingVertical: 18, alignItems: 'center',
              borderWidth: layout.ruleStrong, borderColor: color.brand,
              borderRadius: radius.md, backgroundColor: color.surface,
            }}
          >
            <Label size={10} tracking={0.12} colour={color.neutral600}>SHARE THIS CODE</Label>
            <Heading size={32} colour={color.brandDeep} tracking={5} style={{ marginTop: 6 }}>
              {made}
            </Heading>
            <Thai size={10} style={{ marginTop: 6 }}>ให้เพื่อนกรอกรหัสนี้</Thai>
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: gutter, paddingTop: 26 }}>
        <Label size={10} tracking={0.14}>{t({ en: 'Have a code?', th: 'มีรหัสอยู่แล้ว?' })}</Label>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={code}
            onChangeText={setCode}
            onSubmitEditing={join}
            returnKeyType="go"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            placeholder="K7M2QP"
            placeholderTextColor={color.neutral500}
            accessibilityLabel="Group code"
            style={{
              flex: 1, minHeight: 48, paddingHorizontal: 14,
              borderWidth: 1, borderColor: color.neutral400, borderRadius: radius.sm,
              color: color.text, fontSize: 18, letterSpacing: 3,
            }}
          />
          <Pressable
            onPress={join}
            disabled={busy || code.trim().length === 0}
            accessibilityRole="button"
            accessibilityLabel="Join that group"
            style={{
              minWidth: 76, minHeight: 48, alignItems: 'center', justifyContent: 'center',
              borderRadius: radius.sm,
              backgroundColor: code.trim().length === 0 ? color.neutral300 : color.cta,
            }}
          >
            <Heading size={14} colour={code.trim().length === 0 ? color.neutral600 : onFill.cta}>
              Join
            </Heading>
          </Pressable>
        </View>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Together
// ---------------------------------------------------------------------------

function Together({ name, summary }: { name: string; summary: PartySummary }) {
  const next = nextTogether(summary, OPEN_PROVINCES);

  return (
    <View
      style={{ margin: gutter, padding: 20, borderRadius: radius.md, backgroundColor: color.paper }}
    >
      <Label size={10} tracking={0.16} colour={color.brandSoft}>
        {`${t(PARTY_KIND_LABEL[summary.kind]).toUpperCase()} · ${summary.size}`}
      </Label>
      <Heading size={26} colour={color.surface} tracking={-0.5} style={{ marginTop: 8 }}>
        {name}
      </Heading>

      {/*
        Provinces first, and biggest. It is the only figure on this screen that
        is genuinely more than the sum of its parts — the others are additions
        anybody could do in their head, and leading with a total would suggest
        the group has a shared pot, which is the one thing it does not have.
      */}
      <View style={{ flexDirection: 'row', gap: 22, marginTop: 18 }}>
        <Figure value={summary.provincesTogether} en="Provinces between you" th="จังหวัดรวมกัน" lead />
        <Figure value={summary.missionsVerified} en="Missions verified" th="ภารกิจที่ผ่านการตรวจ" />
      </View>

      {next ? (
        <>
          <Body size={13} colour={color.brandSoft} style={{ marginTop: 16 }}>{t(next)}</Body>
        </>
      ) : null}
    </View>
  );
}

function Figure({
  value, en, th, lead = false,
}: { value: number; en: string; th: string; lead?: boolean }) {
  return (
    <View>
      <Heading size={lead ? 40 : 26} colour={color.surface} tracking={-0.8}>{value}</Heading>
      <Label size={9} tracking={0.08} colour={color.brandSoft} style={{ marginTop: 2 }}>{t({ en, th })}</Label>
    </View>
  );
}

function Members({ summary }: { summary: PartySummary }) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 8 }}>
      <Label size={10} tracking={0.14}>{t({ en: 'Who is here', th: 'ใครอยู่ในกลุ่ม' })}</Label>

      {summary.members.map((m, i) => (
        <View
          key={m.userId}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
            borderBottomWidth: i < summary.members.length - 1 ? 1 : 0,
            borderBottomColor: color.neutral300,
          }}
        >
          <View style={{ flex: 1 }}>
            <Heading size={15}>{m.displayName}</Heading>
            <Label size={9} tracking={0.04} colour={color.neutral600} style={{ marginTop: 3, textTransform: 'none' }}>
              {`${m.provinces.length} province${m.provinces.length === 1 ? '' : 's'}`}
            </Label>
          </View>

          {m.you ? <Label size={9} tracking={0.1} colour={color.brand}>YOU</Label> : null}

          {/*
            What they EARNED, never what they hold. Earned is an achievement and
            already public on the host standing; a balance would also reveal
            what somebody has spent, and joining a trip is not consent to show
            your friends your wallet.
          */}
          <View style={{ alignItems: 'flex-end', minWidth: 66 }}>
            <Heading size={15} colour={m.greenEarned > 0 ? color.accent700 : color.neutral500}>
              {m.missionsVerified}
            </Heading>
            <Label size={9} tracking={0.06} colour={color.neutral600}>VERIFIED</Label>
          </View>
        </View>
      ))}
    </View>
  );
}

function DoesNot({ items }: { items: Bilingual[] }) {
  return (
    <View
      style={{
        marginHorizontal: gutter, marginTop: 24, padding: 16,
        borderRadius: radius.md, backgroundColor: color.neutral100,
        borderWidth: 1, borderColor: color.neutral300,
      }}
    >
      <Label size={10} tracking={0.14} colour={color.neutral700}>
        WHAT A GROUP DOES NOT DO · สิ่งที่กลุ่มไม่ได้ทำ
      </Label>
      {items.map((d) => (
        <View key={t(d)} style={{ marginTop: 10 }}>
          <Body size={13} colour={color.neutral800}>{t(d)}</Body>
        </View>
      ))}
    </View>
  );
}

function Leave({
  onChanged, onToast,
}: { onChanged: () => void; onToast: (msg: string) => void }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
      <Button
        label="Leave this group"
        thai="ออกจากกลุ่ม"
        variant="secondary"
        height={48}
        onPress={async () => {
          if (busy) return;
          setBusy(true);
          const res = await api.leaveParty();
          setBusy(false);
          onToast(res.ok ? 'You are travelling on your own again.' : res.error);
          if (res.ok) onChanged();
        }}
      />
      {/*
        Said before they tap, not in a confirmation afterwards. Leaving costs
        nothing — every point, stamp and companion was always theirs — and a
        scary modal would imply otherwise.
      */}
      <Label size={9} tracking={0.04} colour={color.neutral600} style={{ marginTop: 8, textTransform: 'none' }}>
        Your points, stamps and companions stay with you. They always were yours.
      </Label>
    </View>
  );
}
