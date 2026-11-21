/**
 * A companion's home. The room you visit it in.
 *
 * Modelled on the pet-keeper screens people already know - one creature, large
 * and alive, in its own room, with meters and things to do. That shape is
 * borrowed on purpose: it is legible before anybody reads a word of it.
 *
 * WHAT IS NOT BORROWED IS THE ENGINE. In those games the meters fall because
 * time passed, and you refill them by tapping. Nothing outside the app is
 * being described. Put that here and it would be the first thing in ChivarGo
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
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronLeft, ChevronRight, Lock, Sparkles } from 'lucide-react-native';
import {
  PET_GESTURES, crowdLabel, type Companion, type PetGesture, type ScoredPlace,
  type PetMemory, type PetProgression,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { CreatureScene, type PetGestureAction } from '../components/CreatureScene.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { IconButton } from '../components/Button.tsx';
import { OceanBackdrop } from '../components/Shell.tsx';
import { Plate, Tray, TrayLine } from '../components/Game.tsx';
import { gameRadius, gameShadow } from '@chivago/tokens';
import { t } from '../i18n/locale.ts';

/** The three stages, named. Exported: the wallet lists the same creatures. */
export const STAGE_LABEL: Record<Companion['stage'], { en: string; th: string; zh?: string }> = {
  egg: { en: 'Egg', th: 'ไข่', zh: '蛋' },
  hatchling: { en: 'Hatchling', th: 'ลูกอ่อน', zh: '幼崽' },
  grown: { en: 'Grown', th: 'โตเต็มวัย', zh: '成年' },
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
  const pet = useAsync(() => api.petProgression(companion.species.key), [companion.species.key]);
  const [gestureAction, setGestureAction] = React.useState<PetGestureAction | undefined>();
  const [gestureBusy, setGestureBusy] = React.useState<PetGesture | null>(null);
  const [gestureError, setGestureError] = React.useState<string | null>(null);

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
          paddingHorizontal: gutter, paddingTop: 14, paddingBottom: 14, marginBottom: 12,
          backgroundColor: '#028090',
          borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
          overflow: 'hidden',
        }}
      >
        <OceanBackdrop compact />
        <IconButton inverted onPress={onBack} accessibilityLabel={t({ en: 'Back to the collection', th: 'กลับไปที่คอลเลกชัน', zh: '返回收藏' })}>
          <ChevronLeft size={16} color="#FFFFFF" strokeWidth={2} />
        </IconButton>
        <Label size={10} tracking={0.16} colour="#D5F6FF">{`${t(species.habitat)}`}</Label>
      </View>

      {/*
        The room. Deliberately the tallest thing on the screen: the creature is
        why anybody opened this, and a card would make it an item in a list
        again, which is what this screen exists to stop being.

        On the web it is a real room - the animal in three dimensions on the
        ground it lives on, lit by the island's clock (CreatureScene). It
        looks at your finger and answers a tap. It does not want anything:
        the meters below are the habitat's measured condition, as before.
      */}
      <View
        style={[
          {
            marginHorizontal: gutter,
            alignItems: 'stretch',
            overflow: 'hidden',
            backgroundColor: grown ? color.accent100 : color.surface,
            // Rounder and deeper than an evidence card, which is the whole of
            // what the game surface changes here.
            borderRadius: gameRadius.panel,
          },
          gameShadow.deep,
        ]}
      >
        {/*
          NO PAINTED SKY HERE, and that was a real mistake caught by opening the
          screen. `CreatureScene` already renders a room: ground, trees, rocks,
          the animal, lit by the island's clock. A gradient behind it replaced
          something better with something flatter.

          So the game surface on this screen is the CHROME — the plate, the chip,
          the tray — and the room is left alone. `GameScene` still earns its
          keep on screens that have no room of their own.
        */}
        <CreatureScene
          species={species.key}
          stage={stage}
          label={`${stage === 'egg' ? t(species.eggName) : t(species.name)}, ${t(STAGE_LABEL[stage])}. ${t({ en: 'Tap to say hello', th: 'แตะเพื่อทักทาย', zh: '轻点打招呼' })}`}
          gestureAction={gestureAction}
        />

        {/*
          The name sits OVER the room, the way the reference designs put it.

          Below the room it is a caption on a picture; over it, it is a label on
          a thing. Same words, and the plate is opaque because type with nothing
          under it is unreadable against a sky that moves with the clock.
        */}
        <View
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center',
          }}
          pointerEvents="none"
        >
          <Plate
            title={stage === 'egg' ? t(species.eggName) : t(species.name)}
            sub={t(STAGE_LABEL[stage])}
          />
        </View>
      </View>

      <PetProgressCard
        data={pet.data}
        loading={pet.loading}
        error={pet.error ?? gestureError}
        busy={gestureBusy}
        onRetry={pet.reload}
        onGesture={(gesture) => {
          setGestureBusy(gesture);
          setGestureError(null);
          void api.selectPetGesture(species.key, gesture).then((result) => {
            setGestureBusy(null);
            if (!result.ok) { setGestureError(result.error); return; }
            setGestureAction({ gesture, nonce: Date.now() });
            pet.reload();
          });
        }}
      />

      {/* What would move it on. An egg that does not say this is a locked box. */}
      {nextStep ? (
        <Tray
          style={{
            marginTop: 12, marginHorizontal: gutter, borderRadius: gameRadius.panel,
          }}
        >
          <Label size={9} tracking={0.14} colour={color.gold}>{t({ en: 'Next', th: 'ต่อไป', zh: '接下来' })}</Label>
          {/* An instruction, not a receipt: "do this next" has not happened yet. */}
          <TrayLine>{t(nextStep)}</TrayLine>
        </Tray>
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
            chinese={`前往 ${habitat.name.zh ?? habitat.name.en}`}
            detail={t({
              en: `${t(habitat.name)} · ${evidence.visitDays} ${evidence.visitDays === 1 ? 'day' : 'days'} so far`,
              th: `${t(habitat.name)} · ${evidence.visitDays} วันแล้ว`,
              zh: `${t(habitat.name)} · 已去过 ${evidence.visitDays} 天`,
            })}
            onPress={() => onOpenPlace(habitat.id)}
          />
        ) : null}
        <Action
          label="Find a quest here"
          thai="หาภารกิจในพื้นที่นี้"
          chinese="在这里找任务"
          detail={
            grown
              ? t({
                en: 'Already grown — a verified quest still adds Green Points',
                th: 'โตเต็มวัยแล้ว — ภารกิจที่ผ่านการตรวจยังได้แต้มสีเขียวเพิ่ม',
                zh: '已经长大了 — 已验证的任务仍会增加绿色积分',
              })
              : t({
                en: 'A host-verified quest is the only thing that grows a companion',
                th: 'มีเพียงภารกิจที่ผู้จัดตรวจแล้วเท่านั้นที่ทำให้เพื่อนร่วมทางโตขึ้น',
                zh: '只有经主办方验证的任务才能让伙伴成长',
              })
          }
          onPress={onFindQuest}
        />
      </View>
    </ScrollView>
  );
}

function PetProgressCard({ data, loading, error, busy, onRetry, onGesture }: {
  data: { progression: PetProgression; memories: PetMemory[]; selectedGesture: PetGesture } | null;
  loading: boolean;
  error: string | null;
  busy: PetGesture | null;
  onRetry: () => void;
  onGesture: (gesture: PetGesture) => void;
}) {
  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={onRetry} />;
  if (!data) return null;
  const { progression, memories, selectedGesture } = data;
  const next = progression.nextLevelExp;
  return (
    <View style={[shadow.card, {
      marginTop: 16, marginHorizontal: gutter, padding: 16, backgroundColor: color.surface,
      borderRadius: radius.lg, borderWidth: 1, borderColor: '#BDE8EF', gap: 12,
    }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Label size={9} tracking={0.14} colour={color.brand}>{t({ en: 'PET BOND', th: 'สายสัมพันธ์ PET', zh: '伙伴羁绊' })}</Label>
          <Heading size={20}>{t({ en: `Level ${progression.level}`, th: `เลเวล ${progression.level}`, zh: `${progression.level} 级` })}</Heading>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Label size={10} colour={color.neutral600}>{t({ en: `Bond ${progression.bondLevel}`, th: `ความผูกพัน ${progression.bondLevel}`, zh: `羁绊 ${progression.bondLevel}` })}</Label>
          <Label size={10} colour={color.neutral600}>{`${progression.exp}${next === null ? '' : ` / ${next}`} EXP`}</Label>
        </View>
      </View>
      <View style={{ height: 9, borderRadius: 9, backgroundColor: '#E4F1F4', overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(progression.levelProgress * 100)}%`, height: 9, backgroundColor: color.brand, borderRadius: 9 }} />
      </View>

      <View>
        <Label size={10} tracking={0.1} colour={color.neutral600}>{t({ en: 'GESTURES', th: 'ท่าทาง', zh: '动作' })}</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8 }}>
          {PET_GESTURES.map((definition) => {
            const unlocked = progression.unlockedGestures.includes(definition.key);
            const active = selectedGesture === definition.key;
            return (
              <Pressable
                key={definition.key}
                accessibilityRole="button"
                accessibilityState={{ disabled: !unlocked || busy !== null, selected: active }}
                disabled={!unlocked || busy !== null}
                onPress={() => onGesture(definition.key)}
                style={({ pressed }) => ({
                  minWidth: 92, minHeight: 68, padding: 10, justifyContent: 'center', alignItems: 'center', gap: 4,
                  borderRadius: 16, borderWidth: 1.5,
                  borderColor: active ? color.brand : '#CFE3E8',
                  backgroundColor: active ? '#DDF8F8' : pressed ? '#EEF9FA' : color.surface,
                  opacity: unlocked ? 1 : 0.55,
                })}
              >
                {unlocked ? <Sparkles size={19} color={color.brand} /> : <Lock size={18} color={color.neutral600} />}
                <Label size={10} colour={unlocked ? color.text : color.neutral600}>{t(definition.name)}</Label>
                {!unlocked ? <Label size={9} colour={color.neutral600}>{t({ en: `Lv. ${definition.unlockLevel}`, th: `เลเวล ${definition.unlockLevel}`, zh: `${definition.unlockLevel} 级` })}</Label> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View>
        <Label size={10} tracking={0.1} colour={color.neutral600}>
          {t({ en: `${memories.length} VERIFIED MEMORIES`, th: `ความทรงจำที่ยืนยันแล้ว ${memories.length} รายการ`, zh: `${memories.length} 条已验证记忆` })}
        </Label>
        {memories.slice(0, 3).map((memory) => (
          <View key={memory.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 9 }}>
            <Sparkles size={16} color={color.gold} />
            <Body size={13}>
              {t({
                en: memory.memoryType === 'verified_visit' ? `Visited ${memory.place ? t(memory.place.name) : 'a new place'}` : memory.memoryType === 'story_unlock' ? 'Unlocked a story' : 'Completed a verified quest',
                th: memory.memoryType === 'verified_visit' ? `ไปเยือน ${memory.place ? t(memory.place.name) : 'สถานที่ใหม่'}` : memory.memoryType === 'story_unlock' ? 'ปลดล็อกเรื่องราว' : 'ทำภารกิจที่ยืนยันแล้วสำเร็จ',
                zh: memory.memoryType === 'verified_visit' ? `到访${memory.place ? t(memory.place.name) : '新地点'}` : memory.memoryType === 'story_unlock' ? '解锁故事' : '完成已验证任务',
              })}
            </Body>
          </View>
        ))}
      </View>
    </View>
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
    <View
      style={[shadow.card, {
        marginTop: 16, marginHorizontal: gutter, padding: 16,
        backgroundColor: color.surface, borderRadius: radius.md,
        borderWidth: 1, borderColor: '#DCEFF5',
      }]}
    >
      <Label size={9} tracking={0.14} colour={color.neutral600}>{t({ en: 'Its home today', th: 'ถิ่นอาศัยวันนี้', zh: '它今天的家园' })}</Label>

      <Meter
        label="Air"
        thai="อากาศ"
        chinese="空气"
        value={air}
        reading={`${habitat.metrics.aqi} AQI`}
      />
      <Meter
        label="Room to move"
        thai="ความพลุกพล่าน"
        chinese="活动空间"
        value={room}
        reading={`${t(crowd)} · ${habitat.metrics.crowdDensity.toFixed(1)} per 100 m²`}
      />

      <Label
        size={9}
        tracking={0.06}
        colour={color.neutral600}
        style={{ marginTop: 10, textTransform: 'none' }}
      >
        {t({
          en: `Measured at ${t(habitat.name)}, not simulated. These values change whether or not you open the app.`,
          th: `วัดจากข้อมูลที่ ${t(habitat.name)} ไม่ใช่การจำลอง ค่านี้เปลี่ยนแปลงไม่ว่าคุณจะเปิดแอปหรือไม่`,
          zh: `数据实测于${t(habitat.name)}，并非模拟。无论你是否打开应用，这些数值都会变化。`,
        })}
      </Label>
    </View>
  );
}

function Meter({
  label, thai, chinese, value, reading,
}: { label: string; thai: string; chinese?: string; value: number; reading: string }) {
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Heading size={13}>{thai ? t({ en: label, th: thai, zh: chinese }) : label}</Heading>
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
  label, thai, chinese, detail, onPress,
}: { label: string; thai: string; chinese?: string; detail: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${thai}. ${detail}`}
      style={[shadow.card, {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        minHeight: 44, paddingVertical: 14, paddingHorizontal: 16,
        backgroundColor: color.surface,
        borderWidth: layout.ruleStrong, borderColor: color.brand, borderRadius: radius.md,
      }]}
    >
      <View style={{ flex: 1 }}>
        <Heading size={15} colour={color.brand}>{thai ? t({ en: label, th: thai, zh: chinese }) : label}</Heading>
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
