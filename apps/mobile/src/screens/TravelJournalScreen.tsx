import React from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import {
  ArrowLeft, BookOpenCheck, Camera, Check, Eye, LockKeyhole, MapPinned, PawPrint, Plus, Save, Trash2,
} from 'lucide-react-native';
import type { TravelJournalEntry, TravelTrip } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { t } from '../i18n/locale.ts';
import { formatDateTime } from '../i18n/format.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx';
import { gutter, shadow } from '../theme/index.ts';
import { useAuthedImage } from '../api/authed-image.ts';
import { enqueueJournalChange } from '../state/outbox.ts';
import { deviceOutbox } from '../state/outbox-device.ts';

const entryTitle = (entry: TravelJournalEntry): string => {
  if (entry.kind === 'story_unlock') return t({ en: 'Story unlocked', th: 'ปลดล็อกเรื่องราว', zh: '故事已解锁' });
  if (entry.kind === 'verified_quest') return t({ en: 'Verified quest', th: 'ภารกิจที่ยืนยันแล้ว', zh: '已验证任务' });
  return t({ en: 'Verified visit', th: 'การเดินทางที่ยืนยันแล้ว', zh: '已验证到访' });
};

export function TravelJournalScreen({
  onBack, onToast,
}: {
  onBack: () => void;
  onToast: (message: string) => void;
}) {
  const journal = useAsync(() => api.travelJournal(100), []);
  const memories = useAsync(() => api.petMemories(), []);
  const trips = useAsync(() => api.travelTrips(), []);
  const [tripName, setTripName] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [creatingTrip, setCreatingTrip] = React.useState(false);
  const { width } = useWindowDimensions();
  const wide = width >= 860;

  if (journal.loading && !journal.data) return <LoadingState />;
  if (journal.error) return <ErrorState message={journal.error} onRetry={journal.reload} />;

  const entries = journal.data?.entries ?? [];
  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t({ en: 'Back', th: 'ย้อนกลับ', zh: '返回' })} onPress={onBack} style={styles.back}>
          <ArrowLeft size={23} color="#06395B" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Label size={10} tracking={0.12} colour="#078B9D">TRAVEL JOURNAL</Label>
          <Heading size={25}>{t({ en: 'My trip journal', th: 'สมุดบันทึกทริปของฉัน', zh: '我的旅行手账' })}</Heading>
        </View>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroIcon}><BookOpenCheck size={34} color="#FFFFFF" /></View>
        <View style={{ flex: 1 }}>
          <Heading size={22} colour="#FFFFFF">{t({ en: 'Real journeys, kept with care', th: 'เก็บทุกการเดินทางจริงอย่างตั้งใจ', zh: '用心珍藏真实旅程' })}</Heading>
          <Body size={13} colour="#DDFBFF" style={{ marginTop: 5 }}>{t({ en: 'Entries come from verified check-ins and quests. Your notes are private until you choose to share them.', th: 'รายการมาจากเช็กอินและภารกิจที่ตรวจสอบแล้ว บันทึกเป็นส่วนตัวจนกว่าคุณจะเลือกแชร์', zh: '记录来自已验证的签到和任务。除非你选择分享，否则笔记默认私密。' })}</Body>
        </View>
        <View style={styles.count}><Text style={styles.countValue}>{entries.length}</Text><Text style={styles.countLabel}>{t({ en: 'entries', th: 'รายการ', zh: '条记录' })}</Text></View>
      </View>

      <View style={styles.tripSection}>
        <View style={styles.tripHeader}>
          <View style={{ flex: 1 }}>
            <Heading size={20}>{t({ en: 'My trips', th: 'ทริปของฉัน', zh: '我的旅程' })}</Heading>
            <Body size={13} colour="#667F8E">{t({ en: 'Group verified entries into separate journeys.', th: 'จัดรายการที่ยืนยันแล้วเป็นการเดินทางแต่ละครั้ง', zh: '将已验证记录整理为不同旅程。' })}</Body>
          </View>
          <Label size={10} colour="#078B9D">{`${trips.data?.trips.length ?? 0} ${t({ en: 'TRIPS', th: 'ทริป', zh: '次旅程' })}`}</Label>
        </View>
        {trips.error ? <ErrorState message={trips.error} onRetry={trips.reload} /> : null}
        {(trips.data?.trips.length ?? 0) > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 10 }}>
            {trips.data!.trips.map((trip) => <TripCard key={trip.id} trip={trip} onChanged={trips.reload} onToast={onToast} />)}
          </ScrollView>
        ) : null}
        <TextInput
          value={tripName}
          onChangeText={setTripName}
          maxLength={100}
          placeholder={t({ en: 'Name this trip…', th: 'ตั้งชื่อทริปนี้…', zh: '为旅程命名…' })}
          placeholderTextColor="#8399A5"
          style={styles.tripName}
        />
        <Body size={13} colour="#667F8E">{t({ en: 'Choose the entries that belong to this trip:', th: 'เลือกรายการที่อยู่ในทริปนี้:', zh: '选择属于这次旅程的记录：' })}</Body>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 9 }}>
          {entries.filter((entry) => !(trips.data?.trips ?? []).some((trip) => trip.entries.some((item) => item.id === entry.id))).map((entry) => {
            const on = selected.has(entry.id);
            return <Pressable key={entry.id} onPress={() => setSelected((current) => { const next = new Set(current); on ? next.delete(entry.id) : next.add(entry.id); return next; })} style={[styles.entryChip, on && styles.entryChipOn]}><Check size={14} color={on ? '#FFFFFF' : '#078B9D'} /><Text style={[styles.entryChipText, on && { color: '#FFFFFF' }]} numberOfLines={1}>{entry.place ? t(entry.place.name) : entryTitle(entry)}</Text></Pressable>;
          })}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          disabled={creatingTrip || tripName.trim().length === 0 || selected.size === 0}
          onPress={async () => {
            setCreatingTrip(true);
            const result = await api.createTravelTrip(tripName, [...selected]);
            setCreatingTrip(false);
            if (!result.ok) { onToast(result.error); return; }
            setTripName(''); setSelected(new Set()); trips.reload();
            onToast(t({ en: 'Trip created', th: 'สร้างทริปแล้ว', zh: '旅程已创建' }));
          }}
          style={({ pressed }) => [styles.createTrip, (pressed || creatingTrip || !tripName.trim() || selected.size === 0) && { opacity: 0.55 }]}
        ><Plus size={18} color="#FFFFFF" /><Text style={styles.saveText}>{creatingTrip ? t({ en: 'Creating…', th: 'กำลังสร้าง…', zh: '创建中…' }) : t({ en: 'Create trip', th: 'สร้างทริป', zh: '创建旅程' })}</Text></Pressable>
      </View>

      {!memories.loading && (memories.data?.memories.length ?? 0) > 0 ? (
        <View style={styles.memoryBand}>
          <PawPrint size={25} color="#087C9B" />
          <View style={{ flex: 1 }}><Text style={styles.memoryTitle}>{t({ en: 'Companion memories', th: 'ความทรงจำของเพื่อนร่วมทาง', zh: '伙伴记忆' })}</Text><Text style={styles.memoryText}>{t({ en: `${memories.data!.memories.length} verified memories from your travels`, th: `${memories.data!.memories.length} ความทรงจำที่ยืนยันแล้วจากการเดินทาง`, zh: `${memories.data!.memories.length} 条经过验证的旅行记忆` })}</Text></View>
          <Check size={20} color="#16A56F" />
        </View>
      ) : null}

      {entries.length === 0 ? (
        <View style={styles.emptyCard}>
          <EmptyState en="Your first verified check-in will begin this journal." th="เช็กอินที่ตรวจสอบแล้วครั้งแรกจะเริ่มสมุดบันทึกเล่มนี้" zh="首次经过验证的签到将开启这本旅行手账。" />
        </View>
      ) : (
        <View style={[styles.grid, wide && styles.gridWide]}>
          {entries.map((entry) => (
            <JournalCard key={entry.id} entry={entry} onSaved={() => journal.reload()} onToast={onToast} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function TripCard({ trip, onChanged, onToast }: { trip: TravelTrip; onChanged: () => void; onToast: (message: string) => void }) {
  const cover = trip.photos.find((photo) => photo.id === trip.coverPhotoId) ?? trip.photos[0];
  const source = useAuthedImage(cover?.url);
  const [busy, setBusy] = React.useState(false);
  const addPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { onToast(t({ en: 'Photo permission is required', th: 'ต้องอนุญาตให้เข้าถึงรูปภาพ', zh: '需要照片权限' })); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy(true);
    const result = await api.uploadTravelTripPhoto(trip.id, picked.assets[0]);
    setBusy(false);
    if (!result.ok) { onToast(result.error); return; }
    onChanged();
  };
  return (
    <View style={styles.tripCard}>
      {source ? <Image source={source} style={styles.tripCover} resizeMode="cover" /> : <View style={[styles.tripCover, styles.photoFallback]}><BookOpenCheck size={28} color="#0A9BAD" /></View>}
      <Heading size={17}>{trip.name}</Heading>
      <Text style={styles.date}>{trip.startAt ? formatDateTime(trip.startAt) : ''}</Text>
      <Body size={13}>{t({ en: `${trip.summary.places} places · ${trip.summary.stories} stories · ${trip.summary.petMemories} memories`, th: `${trip.summary.places} สถานที่ · ${trip.summary.stories} เรื่องราว · ${trip.summary.petMemories} ความทรงจำ`, zh: `${trip.summary.places} 个地点 · ${trip.summary.stories} 个故事 · ${trip.summary.petMemories} 条记忆` })}</Body>
      <View style={styles.actions}>
        <Pressable onPress={async () => { const result = await api.updateTravelTrip(trip.id, { visibility: trip.visibility === 'private' ? 'shared' : 'private' }); if (result.ok) onChanged(); else onToast(result.error); }} style={styles.visibility}>{trip.visibility === 'private' ? <LockKeyhole size={16} color="#31596E" /> : <Eye size={16} color="#087C9B" />}<Text style={styles.visibilityText}>{trip.visibility === 'private' ? t({ en: 'Private', th: 'ส่วนตัว', zh: '私密' }) : t({ en: 'Shared', th: 'แชร์', zh: '已分享' })}</Text></Pressable>
        <Pressable disabled={busy} onPress={addPhoto} style={styles.photoButton}><Camera size={17} color="#FFFFFF" /></Pressable>
        {cover ? <Pressable onPress={async () => { const result = await api.deleteTravelTripPhoto(cover.id); if (result.ok) onChanged(); else onToast(result.error); }} style={styles.deletePhoto}><Trash2 size={17} color="#B14545" /></Pressable> : null}
      </View>
    </View>
  );
}

function JournalCard({
  entry, onSaved, onToast,
}: {
  entry: TravelJournalEntry;
  onSaved: () => void;
  onToast: (message: string) => void;
}) {
  const [note, setNote] = React.useState(entry.note ?? '');
  const [visibility, setVisibility] = React.useState(entry.visibility);
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    const patch = { note, visibility, expectedUpdatedAt: entry.updatedAt };
    const result = await api.updateTravelJournalEntry(entry.id, patch);
    setBusy(false);
    if (!result.ok) {
      if (result.code === 'NETWORK' || result.code === 'TIMEOUT') {
        await enqueueJournalChange(deviceOutbox(), entry.id, { note, visibility }, entry.updatedAt);
        onToast(t({ en: 'Saved offline · waiting to sync', th: 'บันทึกออฟไลน์แล้ว · รอซิงก์', zh: '已离线保存 · 等待同步' }));
        return;
      }
      onToast(result.error); return;
    }
    onToast(t({ en: 'Journal entry saved', th: 'บันทึกสมุดทริปแล้ว', zh: '旅行手账已保存' }));
    onSaved();
  };
  return (
    <View style={styles.card}>
      {entry.place?.photoUrl ? (
        <Image source={{ uri: entry.place.photoUrl }} resizeMode="cover" style={styles.photo} accessibilityLabel={t(entry.place.name)} />
      ) : (
        <View style={styles.photoFallback}><MapPinned size={36} color="#0A9BAD" /></View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardHeading}>
          <View style={{ flex: 1 }}>
            <Label size={10} tracking={0.1} colour="#078B9D">{entryTitle(entry).toUpperCase()}</Label>
            <Heading size={18} style={{ marginTop: 4 }}>{entry.place ? t(entry.place.name) : entryTitle(entry)}</Heading>
          </View>
          <View style={styles.verified}><Check size={14} color="#FFFFFF" /></View>
        </View>
        <Text style={styles.date}>{formatDateTime(entry.event.occurredAt)}</Text>
        <TextInput
          accessibilityLabel={t({ en: 'Personal note', th: 'บันทึกส่วนตัว', zh: '个人笔记' })}
          multiline
          value={note}
          onChangeText={setNote}
          placeholder={t({ en: 'Write what you want to remember…', th: 'เขียนสิ่งที่คุณอยากจดจำ…', zh: '写下你想记住的事情…' })}
          placeholderTextColor="#8399A5"
          maxLength={1000}
          style={styles.note}
        />
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => setVisibility(visibility === 'private' ? 'shared' : 'private')} style={styles.visibility}>
            {visibility === 'private' ? <LockKeyhole size={17} color="#31596E" /> : <Eye size={17} color="#087C9B" />}
            <Text style={styles.visibilityText}>{visibility === 'private' ? t({ en: 'Private', th: 'ส่วนตัว', zh: '私密' }) : t({ en: 'Shared', th: 'แชร์', zh: '已分享' })}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={save} style={({ pressed }) => [styles.save, (pressed || busy) && { opacity: 0.7 }]}>
            <Save size={17} color="#FFFFFF" /><Text style={styles.saveText}>{busy ? t({ en: 'Saving…', th: 'กำลังบันทึก…', zh: '保存中…' }) : t({ en: 'Save', th: 'บันทึก', zh: '保存' })}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: gutter, paddingTop: 14, paddingBottom: 56, backgroundColor: '#EFFBFE' },
  topBar: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 12 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBEAF2', alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  hero: { minHeight: 126, borderRadius: 26, padding: 20, backgroundColor: '#087F9E', flexDirection: 'row', alignItems: 'center', gap: 15, ...shadow.card },
  heroIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: '#08AEB8', alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 68, padding: 10, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.16)', alignItems: 'center' },
  countValue: { color: '#FFFFFF', fontSize: 25, fontWeight: '900' },
  countLabel: { color: '#DDFBFF', fontSize: 11, marginTop: 2 },
  memoryBand: { marginTop: 12, minHeight: 72, padding: 14, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CDE9F1', flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.sm },
  tripSection: { marginTop: 12, padding: 15, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CDE9F1', ...shadow.sm },
  tripHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tripName: { minHeight: 46, marginTop: 8, marginBottom: 8, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1, borderColor: '#C9E3EA', color: '#143D58', fontSize: 14 },
  entryChip: { maxWidth: 190, minHeight: 38, borderRadius: 19, paddingHorizontal: 11, borderWidth: 1, borderColor: '#A9DCE6', flexDirection: 'row', alignItems: 'center', gap: 5 },
  entryChipOn: { backgroundColor: '#08A7B5', borderColor: '#08A7B5' },
  entryChipText: { maxWidth: 145, color: '#31596E', fontSize: 12, fontWeight: '700' },
  createTrip: { minHeight: 44, borderRadius: 14, backgroundColor: '#08A7B5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  tripCard: { width: 280, minHeight: 220, padding: 12, borderRadius: 18, backgroundColor: '#F8FCFD', borderWidth: 1, borderColor: '#D3E8ED' },
  tripCover: { width: '100%', height: 105, borderRadius: 13, marginBottom: 9 },
  photoButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#08A7B5', alignItems: 'center', justifyContent: 'center' },
  deletePhoto: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFF2F2', borderWidth: 1, borderColor: '#F2CACA', alignItems: 'center', justifyContent: 'center' },
  memoryTitle: { color: '#143D58', fontSize: 15, fontWeight: '800' },
  memoryText: { color: '#667F8E', fontSize: 12, marginTop: 3 },
  emptyCard: { marginTop: 16, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D4EBF1' },
  grid: { marginTop: 16, gap: 14 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  card: { flexGrow: 1, flexBasis: 380, overflow: 'hidden', borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CDE8EF', ...shadow.card },
  photo: { width: '100%', height: 180 },
  photoFallback: { width: '100%', height: 120, backgroundColor: '#DFF7FA', alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 16 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  verified: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#16A56F', alignItems: 'center', justifyContent: 'center' },
  date: { color: '#758B98', fontSize: 12, marginTop: 5 },
  note: { minHeight: 88, marginTop: 13, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: '#D3E6EB', backgroundColor: '#F8FCFD', color: '#143D58', fontSize: 14, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 9, marginTop: 12 },
  visibility: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: '#C9E3EA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  visibilityText: { color: '#31596E', fontSize: 13, fontWeight: '800' },
  save: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#08A7B5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  saveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
