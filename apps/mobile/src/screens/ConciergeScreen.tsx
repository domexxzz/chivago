/**
 * The concierge, on screen.
 *
 * Answers come from `@chivago/core`, which reads the same places the map reads
 * and nothing else. See the header of `concierge.ts` for why this is not a
 * language model; the short version is that the demo has no server, the app is
 * used on a beach with one bar, and a component that can invent a beach would
 * be the only thing in the product allowed to.
 *
 * Two things this screen does that a chat usually does not:
 *
 * It OPENS with real questions. An empty box makes the user guess what the
 * thing is for, and they guess something it cannot do, and then they stop.
 *
 * It renders answers as CONTROLS, not prose. A recommendation is a card you
 * can open; an emergency is a number you can press. A chat that describes what
 * you could do next, in a paragraph, has made you read a menu instead of
 * handing you one.
 */

import React from 'react';
import { Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Send, Phone } from 'lucide-react-native';
import { OPENERS, answer, type Reply } from '@chivago/core';
import type { ScoredPlace } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, radius } from '../theme/index.ts';
import { Body, Heading, Label, Thai } from '../components/Type.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';

interface Turn {
  /** Null for the concierge's own opening line. */
  asked: string | null;
  reply: Reply;
}

export function ConciergeScreen({
  onOpenPlace, onAction,
}: {
  onOpenPlace: (placeId: string) => void;
  onAction: (action: NonNullable<Reply['action']>) => void;
}) {
  const places = useAsync(() => api.places(), []);
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [draft, setDraft] = React.useState('');
  const scroller = React.useRef<ScrollView>(null);

  const ask = React.useCallback((text: string) => {
    const question = text.trim();
    if (question.length === 0) return;
    const ctx = { places: (places.data ?? []) as ScoredPlace[], quests: [] };
    setTurns((prev) => [...prev, { asked: question, reply: answer(question, ctx) }]);
    setDraft('');
    // A reply that lands below the fold reads as no reply at all.
    requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
  }, [places.data]);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <View style={{ paddingHorizontal: gutter, paddingTop: 18, paddingBottom: 12 }}>
        <Label size={10} tracking={0.16}>Concierge · ผู้ช่วยแนะนำ</Label>
        <Heading size={24} tracking={-0.48} style={{ marginTop: 6 }}>Ask me where to go</Heading>
        <Thai size={11} style={{ marginTop: 4 }}>ถามได้ทั้งภาษาไทยและอังกฤษ</Thai>
      </View>

      {places.loading ? <LoadingState /> : null}
      {places.error ? <ErrorState message={places.error} onRetry={places.reload} /> : null}

      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {turns.length === 0 ? <Openers onPick={ask} /> : null}

        {turns.map((turn, i) => (
          <View key={`${i}-${turn.asked ?? ''}`}>
            {turn.asked ? <Asked text={turn.asked} /> : null}
            <Answered reply={turn.reply} onOpenPlace={onOpenPlace} onAction={onAction} />
          </View>
        ))}
      </ScrollView>

      <Composer value={draft} onChange={setDraft} onSend={() => ask(draft)} />
    </View>
  );
}

/**
 * What to ask, before anything has been asked.
 *
 * Every one of these is covered by a test asserting it does not land on "I
 * don't understand" - an opening chip the app suggested and cannot answer is
 * worse than no chip at all.
 */
function Openers({ onPick }: { onPick: (text: string) => void }) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 6 }}>
      <Label size={9} tracking={0.14} colour={color.neutral600}>Try asking</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {OPENERS.map((o) => (
          <Pressable
            key={o.en}
            onPress={() => onPick(o.en)}
            accessibilityRole="button"
            accessibilityLabel={`${o.en}. ${o.th}`}
            style={{
              minHeight: 44,
              justifyContent: 'center',
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: color.neutral400,
              borderRadius: radius.sm,
            }}
          >
            <Body size={13}>{o.en}</Body>
            <Thai size={10} colour={color.neutral600}>{o.th}</Thai>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Asked({ text }: { text: string }) {
  return (
    <View style={{ paddingHorizontal: gutter, marginTop: 18, alignItems: 'flex-end' }}>
      <View
        style={{
          maxWidth: '84%',
          paddingVertical: 10,
          paddingHorizontal: 14,
          backgroundColor: color.accent,
          borderRadius: radius.md,
        }}
      >
        <Body size={14} colour={color.bg}>{text}</Body>
      </View>
    </View>
  );
}

function Answered({
  reply, onOpenPlace, onAction,
}: {
  reply: Reply;
  onOpenPlace: (placeId: string) => void;
  onAction: (action: NonNullable<Reply['action']>) => void;
}) {
  const urgent = reply.intent === 'emergency';
  return (
    <View style={{ paddingHorizontal: gutter, marginTop: 12 }}>
      <View
        style={{
          maxWidth: '92%',
          paddingVertical: 12,
          paddingHorizontal: 14,
          backgroundColor: color.surface,
          borderRadius: radius.md,
          // An emergency answer does not look like a suggestion.
          borderWidth: urgent ? layout.ruleStrong : 1,
          borderColor: urgent ? color.accent2 : color.neutral300,
        }}
      >
        <Body size={14}>{reply.text}</Body>
      </View>

      {/* An emergency is a number you press, not a number you read out. */}
      {reply.dial.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {reply.dial.map((n) => (
            <Pressable
              key={n.dial}
              onPress={() => void Linking.openURL(`tel:${n.dial}`)}
              accessibilityRole="button"
              accessibilityLabel={`${n.name.en}. ${n.name.th}. ${n.printed}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                minHeight: 44,
                paddingHorizontal: 14,
                borderWidth: layout.ruleStrong,
                borderColor: color.accent2,
                borderRadius: radius.sm,
              }}
            >
              <Phone size={15} color={color.accent2} strokeWidth={2} />
              <Heading size={15} colour={color.accent2}>{n.printed}</Heading>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Each suggestion carries the measurement it was chosen on. */}
      {reply.suggestions.map((s) => (
        <Pressable
          key={s.placeId}
          onPress={() => onOpenPlace(s.placeId)}
          accessibilityRole="button"
          accessibilityLabel={`${s.name.en}. ${s.because.en}. Healthy Score ${s.healthyScore}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            marginTop: 8,
            padding: 12,
            borderWidth: 1,
            borderColor: color.neutral400,
            borderRadius: radius.md,
          }}
        >
          <View style={{ flex: 1 }}>
            <Heading size={15}>{s.name.en}</Heading>
            <Thai size={10} style={{ marginTop: 1 }}>{s.name.th}</Thai>
            <Label
              size={9}
              tracking={0.04}
              colour={color.neutral600}
              style={{ marginTop: 6, textTransform: 'none' }}
            >
              {s.because.en}
            </Label>
          </View>
          <Heading size={20} colour={color.accent}>{s.healthyScore}</Heading>
        </Pressable>
      ))}

      {reply.action ? (
        <Pressable
          onPress={() => onAction(reply.action!)}
          accessibilityRole="button"
          accessibilityLabel={ACTION_LABEL[reply.action]}
          style={{
            alignSelf: 'flex-start',
            minHeight: 44,
            justifyContent: 'center',
            marginTop: 10,
            paddingHorizontal: 16,
            borderWidth: layout.ruleStrong,
            borderColor: color.accent,
            borderRadius: radius.sm,
          }}
        >
          <Heading size={14} colour={color.accent}>{ACTION_LABEL[reply.action]}</Heading>
        </Pressable>
      ) : null}
    </View>
  );
}

const ACTION_LABEL: Record<NonNullable<Reply['action']>, string> = {
  plan: 'Plan my day',
  route: 'Open the router',
  price: 'See the price band',
  wallet: 'Open my wallet',
  safety: 'Open Safety',
};

function Composer({
  value, onChange, onSend,
}: { value: string; onChange: (v: string) => void; onSend: () => void }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: gutter,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: color.neutral300,
        backgroundColor: color.bg,
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSend}
        returnKeyType="send"
        placeholder="Ask in Thai or English…"
        placeholderTextColor={color.neutral500}
        accessibilityLabel="Ask the concierge"
        style={{
          flex: 1,
          minHeight: 44,
          paddingHorizontal: 14,
          borderWidth: 1,
          borderColor: color.neutral400,
          borderRadius: radius.sm,
          color: color.text,
          fontSize: 14,
        }}
      />
      <Pressable
        onPress={onSend}
        disabled={value.trim().length === 0}
        accessibilityRole="button"
        accessibilityLabel="Send"
        style={{
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.sm,
          backgroundColor: value.trim().length === 0 ? color.neutral300 : color.accent,
        }}
      >
        <Send
          size={17}
          color={value.trim().length === 0 ? color.neutral600 : color.bg}
          strokeWidth={2}
        />
      </Pressable>
    </View>
  );
}
