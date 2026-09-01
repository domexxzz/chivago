/**
 * Your account, and the honest cost of having no password.
 *
 * There is nothing to sign in to. A phone holds a key, and moving the account
 * to a second phone means reading eight characters off the first. That buys a
 * traveller a great deal — no password to forget, no email to hand over, no
 * Thai phone number required — and it costs exactly one thing, which this
 * screen says out loud rather than burying:
 *
 *   LOSE THE ONLY PHONE AND THE ACCOUNT IS GONE.
 *
 * Every product that collects a recovery email is buying its way out of that
 * sentence with the traveller's personal data. This one does not, so the
 * sentence has to be on the screen — and it has to be on the screen BEFORE
 * anything goes wrong, next to the button that prevents it, rather than in a
 * help page somebody reads afterwards.
 */

import React from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { api } from '../api/client.ts';
import { adoptKey } from '../api/account.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, onFill, radius } from '../theme/index.ts';
import { Body, Heading, Label, Thai } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';

/** `RHW6FXT7` reads as two words. Eight unbroken characters do not. */
export const groupCode = (code: string): string =>
  code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;

/** `9:47`. Seconds matter here — the whole window is ten minutes. */
export function countdown(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function AccountScreen({
  onBack, onToast,
}: { onBack: () => void; onToast: (msg: string) => void }) {
  const account = useAsync(() => api.account(), []);
  const [refresh, setRefresh] = React.useState(0);
  const reload = () => { account.reload(); setRefresh((n) => n + 1); };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <PushHeader context="Your account · บัญชีของคุณ" onBack={onBack} />

      {account.error ? <ErrorState message={account.error} onRetry={account.reload} /> : null}
      {account.loading && !account.data ? <LoadingState /> : null}

      {account.data ? (
        <>
          <Summary count={account.data.devices.length} />
          <ShowCode onToast={onToast} />
          <EnterCode onLinked={reload} onToast={onToast} />
          <Phones
            devices={account.data.devices}
            onRevoked={reload}
            onToast={onToast}
            key={refresh}
          />
          <NoRecovery />
        </>
      ) : null}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

function Summary({ count }: { count: number }) {
  return (
    <View
      style={{
        margin: gutter, padding: 20,
        borderRadius: radius.md, backgroundColor: color.paper,
      }}
    >
      <Label size={10} tracking={0.16} colour={color.brandSoft}>SIGNED IN ON THIS PHONE</Label>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
        <Heading size={34} colour={color.surface} tracking={-0.8}>{count}</Heading>
        <Body size={14} colour={color.brandSoft}>
          {count === 1 ? 'phone on this account' : 'phones on this account'}
        </Body>
      </View>
      <Thai size={11} colour={color.brandSoft} style={{ marginTop: 4 }}>
        {`บัญชีนี้ใช้อยู่บน ${count} เครื่อง`}
      </Thai>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Phone one: show a code
// ---------------------------------------------------------------------------

function ShowCode({ onToast }: { onToast: (msg: string) => void }) {
  const [code, setCode] = React.useState<string | null>(null);
  const [expiresAt, setExpiresAt] = React.useState(0);
  const [left, setLeft] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  /*
    The countdown is not decoration. A code that looks live but expired two
    minutes ago sends somebody to type it and get an error they cannot explain;
    a visible clock turns that into "ask for a new one", which is the action
    they need. It ticks to zero and then clears the code itself.
  */
  React.useEffect(() => {
    if (code === null) return;
    const tick = () => {
      const remaining = expiresAt - Date.now();
      setLeft(remaining);
      if (remaining <= 0) setCode(null);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [code, expiresAt]);

  const ask = async () => {
    // Guarded in the HANDLER, not only by the button's `disabled` prop. That
    // prop is presentation: a fast double-tap fires this twice before React
    // has re-rendered, and two codes in flight means the second silently kills
    // the first while somebody is still reading it off the screen.
    if (busy) return;
    setBusy(true);
    const res = await api.linkCode();
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    setExpiresAt(Date.now() + res.data.expiresInMs);
    setCode(res.data.code);
  };

  return (
    <Section en="Add another phone" th="เพิ่มเครื่องที่สอง">
      {code === null ? (
        <>
          <Body size={13} colour={color.neutral700}>
            Your points, passport and companions move with you. The other phone
            keeps its own key — nothing is copied across.
          </Body>
          <Thai size={11} style={{ marginTop: 4 }}>
            แต้ม พาสปอร์ต และเพื่อนร่วมทางจะย้ายตามไปด้วย
          </Thai>
          <Button
            label={busy ? 'Asking…' : 'Show a code'}
            thai="ขอรหัส"
            onPress={ask}
            disabled={busy}
            height={48}
            style={{ marginTop: 14 }}
          />
        </>
      ) : (
        <>
          <View
            style={{
              paddingVertical: 18, alignItems: 'center',
              borderWidth: layout.ruleStrong, borderColor: color.brand,
              borderRadius: radius.md, backgroundColor: color.surface,
            }}
          >
            {/*
              Mono and spaced out, because this is read aloud or copied by eye.
              The alphabet already excludes 0/O and 1/I/L; the tracking is the
              other half of the same job.
            */}
            <Heading size={34} colour={color.brandDeep} tracking={4}>
              {groupCode(code)}
            </Heading>
            <Label size={10} tracking={0.12} colour={color.neutral600} style={{ marginTop: 8 }}>
              {`EXPIRES IN ${countdown(left)}`}
            </Label>
          </View>

          <Body size={13} colour={color.neutral700} style={{ marginTop: 12 }}>
            Type this on the other phone. It works once, and only for ten minutes.
          </Body>
          <Thai size={11} style={{ marginTop: 4 }}>
            พิมพ์รหัสนี้ในเครื่องอีกเครื่อง ใช้ได้ครั้งเดียว ภายในสิบนาที
          </Thai>
          <Button
            label="Show a different code"
            thai="ขอรหัสใหม่"
            variant="secondary"
            height={44}
            onPress={ask}
            style={{ marginTop: 12 }}
          />
        </>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Phone two: enter a code
// ---------------------------------------------------------------------------

function EnterCode({
  onLinked, onToast,
}: { onLinked: () => void; onToast: (msg: string) => void }) {
  const [value, setValue] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const join = async () => {
    // Same reason as above, plus the empty case: `disabled` stops the tap
    // being drawn as available, it does not stop the handler running. An
    // empty code reaching the server would come back "not one of ours", which
    // reads as though the traveller mistyped something they never typed.
    if (busy || value.trim().length === 0) return;
    setBusy(true);
    const res = await api.claimLink(value.trim());
    setBusy(false);
    if (!res.ok) {
      // The server distinguishes unknown / expired / used, and each one needs
      // a different action from the reader. Passing its sentence through is
      // more useful than one generic "that did not work".
      onToast(res.error);
      return;
    }
    // Adopt the new key BEFORE reloading: the next request has to carry it, or
    // the screen would refetch as the phone's old account and look unchanged.
    await adoptKey(res.data.deviceKey);
    setValue('');
    onToast('This phone is now on that account.');
    onLinked();
  };

  return (
    <Section en="Already have a code?" th="มีรหัสอยู่แล้ว?">
      <Body size={13} colour={color.neutral700}>
        Enter the code from your other phone. This phone will join that account
        and leave whatever it had behind.
      </Body>
      <Thai size={11} style={{ marginTop: 4 }}>
        เครื่องนี้จะย้ายไปบัญชีนั้น และทิ้งข้อมูลเดิมของเครื่องนี้ไว้
      </Thai>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <TextInput
          value={value}
          onChangeText={setValue}
          onSubmitEditing={join}
          returnKeyType="go"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          placeholder="RHW6 FXT7"
          placeholderTextColor={color.neutral500}
          accessibilityLabel="Code from your other phone"
          style={{
            flex: 1, minHeight: 48, paddingHorizontal: 14,
            borderWidth: 1, borderColor: color.neutral400, borderRadius: radius.sm,
            color: color.text, fontSize: 18, letterSpacing: 2,
          }}
        />
        <Pressable
          onPress={join}
          disabled={busy || value.trim().length === 0}
          accessibilityRole="button"
          accessibilityLabel="Join that account"
          style={{
            minWidth: 76, minHeight: 48, alignItems: 'center', justifyContent: 'center',
            borderRadius: radius.sm,
            backgroundColor: value.trim().length === 0 ? color.neutral300 : color.cta,
          }}
        >
          <Heading
            size={14}
            colour={value.trim().length === 0 ? color.neutral600 : onFill.cta}
          >
            {busy ? '…' : 'Join'}
          </Heading>
        </Pressable>
      </View>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// The phones on this account
// ---------------------------------------------------------------------------

interface Device {
  label: string | null; createdAt: string; lastSeenAt: string | null; current: boolean;
}

function Phones({
  devices, onRevoked, onToast,
}: { devices: Device[]; onRevoked: () => void; onToast: (msg: string) => void }) {
  return (
    <Section en="Phones on this account" th="เครื่องที่ใช้บัญชีนี้">
      {devices.map((d, i) => (
        <View
          key={`${d.label ?? 'unnamed'}-${i}`}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingVertical: 12,
            borderBottomWidth: i < devices.length - 1 ? 1 : 0,
            borderBottomColor: color.neutral300,
          }}
        >
          <View style={{ flex: 1 }}>
            <Heading size={15}>{d.label ?? 'Unnamed phone'}</Heading>
            <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 3, textTransform: 'none' }}>
              {d.current
                ? 'This phone'
                : d.lastSeenAt
                  ? `Last used ${d.lastSeenAt.slice(0, 10)}`
                  : `Added ${d.createdAt.slice(0, 10)}`}
            </Label>
          </View>

          {/*
            A phone cannot remove itself from this screen. Tapping Remove on the
            device you are holding logs you out of an account you may have no
            other way back into — which is the one irreversible action here, and
            not one to offer next to a list of other people's phones.
          */}
          {d.current ? (
            <Label size={9} tracking={0.1} colour={color.brand}>IN USE</Label>
          ) : (
            <Pressable
              onPress={async () => {
                const res = await api.revokeDevice(d.label ?? '');
                onToast(res.ok ? 'That phone was removed.' : res.error);
                if (res.ok) onRevoked();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${d.label ?? 'this phone'} from the account`}
              style={{
                minHeight: 44, paddingHorizontal: 12, justifyContent: 'center',
                borderWidth: 1, borderColor: color.accent2, borderRadius: radius.sm,
              }}
            >
              <Label size={10} tracking={0.08} colour={color.accent2}>REMOVE</Label>
            </Pressable>
          )}
        </View>
      ))}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// The cost of collecting nothing
// ---------------------------------------------------------------------------

function NoRecovery() {
  return (
    <View
      style={{
        marginHorizontal: gutter, marginTop: 26, padding: 16,
        borderRadius: radius.md, backgroundColor: color.neutral100,
        borderWidth: 1, borderColor: color.neutral300,
      }}
    >
      <Label size={10} tracking={0.14} colour={color.neutral700}>
        WHAT WE DO NOT KEEP · สิ่งที่เราไม่เก็บ
      </Label>
      <Body size={13} colour={color.neutral800} style={{ marginTop: 8 }}>
        No password, no email, no phone number. There is nothing about you here
        that could leak, because none of it was ever collected.
      </Body>
      <Thai size={11} style={{ marginTop: 4 }}>
        ไม่มีรหัสผ่าน ไม่มีอีเมล ไม่มีเบอร์โทร
      </Thai>

      {/*
        The consequence, said plainly and on the same card as the benefit. A
        product that collects a recovery email is buying its way out of this
        sentence with the reader's data; this one does not, so the reader is
        owed the sentence — beside the button that prevents it, not in a help
        page they reach afterwards.
      */}
      <Body size={13} colour={color.coralDeep} style={{ marginTop: 12 }}>
        The trade: if this is your only phone and you lose it, the account goes
        with it. Add a second phone before that matters.
      </Body>
      <Thai size={11} colour={color.coralDeep} style={{ marginTop: 4 }}>
        ข้อแลกเปลี่ยน: ถ้ามีเครื่องเดียวแล้วหาย บัญชีจะหายไปด้วย
      </Thai>
    </View>
  );
}

function Section({
  en, th, children,
}: { en: string; th: string; children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
      <Label size={10} tracking={0.14}>{en}</Label>
      <Thai size={11} style={{ marginTop: 1, marginBottom: 12 }}>{th}</Thai>
      {children}
    </View>
  );
}
