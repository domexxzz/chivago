import React from 'react';
import * as Location from 'expo-location';
import { Alert, Image, Platform, Pressable, ScrollView, Switch, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { MapPin, MessageCircle, Navigation, Radio, Route, Users } from 'lucide-react-native';
import { inArea, type PartyItineraryItem, type PartyLiveMember, type PartyMessage, type PartyPingKind, type PartyTripSummary, type ScoredPlace } from '@chivago/core';
import { api } from '../../api/client.ts';
import { useHere } from '../../state/here.ts';
import { requestPartyBackgroundPermission, startPartyBackgroundLocation, stopPartyBackgroundLocation } from '../../location/party-background.ts';
import { t } from '../../i18n/locale.ts';
import { color, gutter, radius, shadow } from '../../theme/index.ts';
import { Body, Heading, Label } from '../Type.tsx';
import { Button } from '../Button.tsx';
import { SamuiMap } from '../SamuiMap.tsx';
import { useArea } from '../../state/area.ts';

const panel: StyleProp<ViewStyle> = [shadow.card, { marginHorizontal: gutter, marginTop: 14, padding: 16, borderRadius: 20, backgroundColor: color.surface }];

function Avatar({ member }: { member: PartyLiveMember }) {
  if (member.profilePhotoUrl) return <Image source={{ uri: member.profilePhotoUrl }} style={{ width: 42, height: 42, borderRadius: 21 }} />;
  return <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#D8F2F5', alignItems: 'center', justifyContent: 'center' }}><Heading size={16} colour={color.brandDeep}>{member.displayName.slice(0, 1).toUpperCase()}</Heading></View>;
}

export function PartyLivePanel({ owner, onToast, onFinished }: { owner: boolean; onToast: (message: string) => void; onFinished: (summary: PartyTripSummary) => void }) {
  const here = useHere({ watch: true });
  const area = useArea();
  const [members, setMembers] = React.useState<PartyLiveMember[]>([]);
  const [places, setPlaces] = React.useState<ScoredPlace[]>([]);
  const [meeting, setMeeting] = React.useState<{ label: string; latitude: number; longitude: number } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [tab, setTab] = React.useState<'map' | 'activity' | 'chat' | 'members'>('map');
  const me = members.find((member) => member.you);

  const refresh = React.useCallback(async () => {
    const result = await api.partyLive();
    if (result.ok) { setMembers(result.data.members); setMeeting(result.data.meetingPoint); }
  }, []);

  React.useEffect(() => {
    void refresh(); const timer = setInterval(() => void refresh(), 5_000); return () => clearInterval(timer);
  }, [refresh]);
  React.useEffect(() => { void api.places().then((result) => { if (result.ok) setPlaces(result.data.filter((place) => inArea(area, place))); }); }, [area.key]);

  React.useEffect(() => {
    if (!me?.sharingEnabled || !here) return;
    void api.updatePartyLocation({ latitude: here.lat, longitude: here.lng, accuracy: here.accuracyM });
  }, [here?.lat, here?.lng, me?.sharingEnabled]);

  const toggleSharing = async (enabled: boolean) => {
    if (busy) return; setBusy(true);
    if (enabled) {
      const permission = await Location.requestForegroundPermissionsAsync().catch(() => null);
      if (!permission?.granted) { onToast(t({ en: 'Location permission was not granted.', th: 'ยังไม่ได้อนุญาตให้เข้าถึงตำแหน่ง', zh: '未授予位置权限。' })); setBusy(false); return; }
    } else await stopPartyBackgroundLocation();
    const result = await api.setPartyLocationSharing(enabled);
    if (!result.ok) onToast(result.error);
    await refresh(); setBusy(false);
  };

  const enableBackground = async () => {
    if (!me) return;
    const permission = await requestPartyBackgroundPermission();
    if (permission !== 'available') { onToast(t({ en: 'Background location is unavailable or was declined.', th: 'ไม่สามารถเปิดตำแหน่งเบื้องหลัง หรือไม่ได้รับอนุญาต', zh: '后台定位不可用或被拒绝。' })); return; }
    const result = await startPartyBackgroundLocation(me.userId);
    onToast(result === 'active' ? t({ en: 'Background sharing is on.', th: 'เปิดแชร์ตำแหน่งเบื้องหลังแล้ว', zh: '后台位置共享已开启。' }) : t({ en: 'This build cannot run background location.', th: 'บิลด์นี้ยังไม่รองรับตำแหน่งเบื้องหลัง', zh: '此版本无法运行后台定位。' }));
  };

  const setMeetingHere = async () => {
    if (!here) { onToast(t({ en: 'A location fix is not available yet.', th: 'ยังอ่านตำแหน่งปัจจุบันไม่ได้', zh: '暂时无法获取当前位置。' })); return; }
    const result = await api.setPartyMeetingPoint({ latitude: here.lat, longitude: here.lng, label: t({ en: 'Meet here', th: 'นัดพบตรงนี้', zh: '在这里集合' }) });
    if (!result.ok) onToast(result.error); else { setMeeting(result.data.meetingPoint); onToast(t({ en: 'Meeting point updated.', th: 'อัปเดตจุดนัดพบแล้ว', zh: '集合点已更新。' })); }
  };

  const finish = () => Alert.alert(
    t({ en: 'End this trip?', th: 'จบทริปนี้?', zh: '结束这次旅行？' }),
    t({ en: 'Live location sharing will stop for everyone and a trip summary will be saved.', th: 'การแชร์ตำแหน่งของทุกคนจะหยุด และระบบจะบันทึกสรุปทริป', zh: '所有人的位置共享将停止，并保存旅行总结。' }),
    [{ text: t({ en: 'Cancel', th: 'ยกเลิก', zh: '取消' }), style: 'cancel' }, { text: t({ en: 'End trip', th: 'จบทริป', zh: '结束旅行' }), style: 'destructive', onPress: async () => {
      const result = await api.finishPartyTrip(); if (!result.ok) onToast(result.error); else { await stopPartyBackgroundLocation(); onFinished(result.data.summary); }
    } }],
  );

  return <>
    <PartyLiveTabs value={tab} onChange={setTab} />

    {tab === 'map' ? <>
      <View style={[shadow.card, { marginHorizontal: gutter, marginTop: 12, borderRadius: 22, overflow: 'hidden', backgroundColor: color.surface, borderWidth: 1, borderColor: '#CFE7F0' }]}>
        <SamuiMap area={area} height={320} places={places} onSelect={() => undefined} here={here} partyMembers={members.filter((member) => member.latitude !== null && member.longitude !== null).map((member) => ({ userId: member.userId, displayName: member.displayName, profilePhotoUrl: member.profilePhotoUrl, lat: member.latitude!, lng: member.longitude!, you: member.you }))} meetingPoint={meeting ? { lat: meeting.latitude, lng: meeting.longitude, label: meeting.label } : null} />
      </View>
      <View style={panel}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Radio size={22} color={color.brand} /><View style={{ flex: 1 }}><Heading size={17}>{t({ en: 'Live location', th: 'แชร์ตำแหน่ง', zh: '实时位置' })}</Heading><Body size={13} colour={color.neutral600}>{t({ en: 'Only this party can see a recent fix.', th: 'เฉพาะสมาชิกกลุ่มนี้เท่านั้นที่เห็นตำแหน่งล่าสุด', zh: '只有本队成员能看到最近的位置。' })}</Body></View><Switch value={Boolean(me?.sharingEnabled)} disabled={busy} onValueChange={toggleSharing} /></View>
        {me?.sharingEnabled && Platform.OS !== 'web' ? <Button label="Keep sharing in background" thai="แชร์ต่อเมื่อปิดหน้าจอ" chinese="在后台继续共享" variant="secondary" height={42} style={{ marginTop: 12 }} onPress={enableBackground} /> : null}
      </View>
      <View style={panel}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><MapPin size={21} color={color.brand} /><Heading size={17}>{t({ en: 'Meeting point', th: 'จุดนัดพบ', zh: '集合点' })}</Heading></View>
        <Body size={13} colour={color.neutral700} style={{ marginTop: 7 }}>{meeting ? `${meeting.label} · ${meeting.latitude.toFixed(5)}, ${meeting.longitude.toFixed(5)}` : t({ en: 'No meeting point yet.', th: 'ยังไม่มีจุดนัดพบ', zh: '尚未设置集合点。' })}</Body>
        <Button label="Pin my current location" thai="ปักตำแหน่งปัจจุบัน" chinese="标记我的当前位置" variant="secondary" height={42} style={{ marginTop: 10 }} onPress={setMeetingHere} />
      </View>
    </> : null}

    {tab === 'activity' ? <>
      <PartyItinerary onToast={onToast} />
      {owner ? <View style={panel}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Navigation size={21} color={color.brand} /><Heading size={17}>{t({ en: 'Finish and summarize', th: 'จบทริปและดูสรุป', zh: '结束并总结' })}</Heading></View><Body size={13} colour={color.neutral600} style={{ marginTop: 6 }}>{t({ en: 'Saves the shared plan, activity counts and aggregate distance—never a raw GPS trail.', th: 'บันทึกแผนร่วม จำนวนกิจกรรม และระยะทางรวม โดยไม่เก็บเส้นทาง GPS ดิบ', zh: '保存共享计划、活动数量和总距离，不保存原始 GPS 轨迹。' })}</Body><Button label="End trip" thai="จบทริป" chinese="结束旅行" variant="secondary" height={44} style={{ marginTop: 12 }} onPress={finish} /></View> : null}
    </> : null}

    {tab === 'chat' ? <PartyChat onToast={onToast} /> : null}

    {tab === 'members' ? <View style={panel}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Users size={21} color={color.brand} /><View style={{ flex: 1 }}><Heading size={17}>{t({ en: 'Party members', th: 'สมาชิกปาร์ตี้', zh: '队伍成员' })}</Heading><Body size={13} colour={color.neutral600}>{t({ en: 'Location appears only when each member opts in.', th: 'ตำแหน่งจะแสดงเมื่อสมาชิกแต่ละคนเปิดแชร์เท่านั้น', zh: '仅在成员主动开启共享时显示位置。' })}</Body></View></View>
      <View style={{ marginTop: 12, gap: 9 }}>{members.map((member) => <View key={member.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 14, backgroundColor: '#F5FAFC' }}><Avatar member={member} /><View style={{ flex: 1 }}><Heading size={14}>{member.displayName}{member.you ? ` · ${t({ en: 'You', th: 'คุณ', zh: '你' })}` : ''}</Heading><Label size={9} colour={member.presence === 'online' ? color.accent700 : color.neutral600}>{member.presence.replaceAll('_', ' ').toUpperCase()}</Label></View>{member.latitude !== null ? <MapPin size={17} color={color.brand} /> : null}</View>)}</View>
    </View> : null}
  </>;
}

function PartyLiveTabs({ value, onChange }: { value: 'map' | 'activity' | 'chat' | 'members'; onChange: (tab: 'map' | 'activity' | 'chat' | 'members') => void }) {
  const tabs = [
    ['map', <MapPin size={17} color={value === 'map' ? '#FFFFFF' : color.brand} />, t({ en: 'Map', th: 'แผนที่', zh: '地图' })],
    ['activity', <Route size={17} color={value === 'activity' ? '#FFFFFF' : color.brand} />, t({ en: 'Activity', th: 'กิจกรรม', zh: '活动' })],
    ['chat', <MessageCircle size={17} color={value === 'chat' ? '#FFFFFF' : color.brand} />, t({ en: 'Chat', th: 'แชท', zh: '聊天' })],
    ['members', <Users size={17} color={value === 'members' ? '#FFFFFF' : color.brand} />, t({ en: 'Members', th: 'สมาชิก', zh: '成员' })],
  ] as const;
  return <View accessibilityRole="tablist" style={[shadow.card, { marginHorizontal: gutter, marginTop: 12, padding: 5, borderRadius: 18, backgroundColor: '#FFFFFF', flexDirection: 'row', gap: 4 }]}>{tabs.map(([key, icon, label]) => <Pressable key={key} onPress={() => onChange(key)} accessibilityRole="tab" accessibilityState={{ selected: value === key }} accessibilityLabel={label} style={{ flex: 1, minHeight: 43, borderRadius: 14, backgroundColor: value === key ? color.brand : '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 2 }}>{icon}<Label size={9} colour={value === key ? '#FFFFFF' : color.brand}>{label}</Label></Pressable>)}</View>;
}

function PartyChat({ onToast }: { onToast: (message: string) => void }) {
  const [messages, setMessages] = React.useState<PartyMessage[]>([]); const [text, setText] = React.useState('');
  const refresh = React.useCallback(async () => { const result = await api.partyMessages(); if (result.ok) setMessages([...result.data.messages].reverse()); }, []);
  React.useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 4_000); return () => clearInterval(timer); }, [refresh]);
  const send = async () => { if (!text.trim()) return; const value = text; setText(''); const result = await api.sendPartyMessage(value); if (!result.ok) onToast(result.error); else void refresh(); };
  const ping = async (pingKind: PartyPingKind, body: string) => { const result = await api.sendPartyPing(pingKind, body); if (!result.ok) onToast(result.error); else void refresh(); };
  return <View style={panel}><View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><MessageCircle size={21} color={color.brand} /><Heading size={17}>{t({ en: 'Party chat', th: 'แชทปาร์ตี้', zh: '队伍聊天' })}</Heading></View>
    <ScrollView style={{ maxHeight: 240, marginTop: 10 }}>{messages.length ? messages.map((message) => <View key={message.id} style={{ alignSelf: message.mine ? 'flex-end' : 'flex-start', maxWidth: '86%', marginBottom: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14, backgroundColor: message.kind === 'ping' ? '#FFF1C9' : message.mine ? color.brandSoft : color.neutral200 }}><Label size={9} colour={color.neutral600}>{message.authorName}</Label><Body size={13}>{message.body}</Body></View>) : <Body size={13} colour={color.neutral600}>{t({ en: 'No messages yet.', th: 'ยังไม่มีข้อความ', zh: '还没有消息。' })}</Body>}</ScrollView>
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}><TextInput value={text} onChangeText={setText} onSubmitEditing={send} placeholder={t({ en: 'Message your party…', th: 'พิมพ์ข้อความถึงเพื่อน…', zh: '给队伍发消息…' })} style={{ flex: 1, borderWidth: 1, borderColor: color.neutral300, borderRadius: 12, paddingHorizontal: 12, minHeight: 44 }} /><Pressable onPress={send} style={{ minWidth: 56, borderRadius: 12, backgroundColor: color.cta, alignItems: 'center', justifyContent: 'center' }}><Label size={11} colour="#fff">{t({ en: 'Send', th: 'ส่ง', zh: '发送' })}</Label></Pressable></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>{([
      ['come_here', t({ en: 'Come here', th: 'มาหาตรงนี้', zh: '来这里' })], ['wait', t({ en: 'Wait', th: 'รอก่อน', zh: '等等' })], ['look_here', t({ en: 'Look here', th: 'ดูตรงนี้', zh: '看这里' })],
    ] as [PartyPingKind, string][]).map(([kind, label]) => <Pressable key={kind} onPress={() => ping(kind, label)} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FFF1C9' }}><Label size={10}>{label}</Label></Pressable>)}</View>
  </View>;
}

function PartyItinerary({ onToast }: { onToast: (message: string) => void }) {
  const [items, setItems] = React.useState<PartyItineraryItem[]>([]); const [places, setPlaces] = React.useState<ScoredPlace[]>([]); const [query, setQuery] = React.useState('');
  const refresh = React.useCallback(async () => { const result = await api.partyItinerary(); if (result.ok) setItems(result.data.items); }, []);
  React.useEffect(() => { void refresh(); void api.places().then((result) => { if (result.ok) setPlaces(result.data); }); }, [refresh]);
  const matches = places.filter((place) => !items.some((item) => item.placeId === place.id) && `${place.name.en} ${place.name.th}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, query ? 5 : 3);
  const add = async (placeId: string) => { const result = await api.addPartyItinerary(placeId); if (!result.ok) onToast(result.error); else { setItems(result.data.items); setQuery(''); } };
  const remove = async (placeId: string) => { const result = await api.removePartyItinerary(placeId); if (!result.ok) onToast(result.error); else setItems(result.data.items); };
  return <View style={panel}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Route size={21} color={color.brand} /><Heading size={17}>{t({ en: 'Shared itinerary', th: 'แผนเที่ยวร่วมกัน', zh: '共享行程' })}</Heading></View>
    {items.map((item, index) => <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.neutral200 }}><Label size={11} colour={color.brand}>{index + 1}</Label><Body size={13} style={{ flex: 1 }}>{t(item.placeName)}</Body><Pressable onPress={() => remove(item.placeId)}><Label size={10} colour="#B43B32">{t({ en: 'Remove', th: 'ลบ', zh: '移除' })}</Label></Pressable></View>)}
    <TextInput value={query} onChangeText={setQuery} placeholder={t({ en: 'Search ChivaGo places', th: 'ค้นหาสถานที่ใน ChivaGo', zh: '搜索 ChivaGo 地点' })} style={{ marginTop: 10, borderWidth: 1, borderColor: color.neutral300, borderRadius: 12, minHeight: 43, paddingHorizontal: 12 }} />
    {matches.map((place) => <Pressable key={place.id} onPress={() => add(place.id)} style={{ paddingVertical: 8 }}><Body size={13}>＋ {t(place.name)}</Body></Pressable>)}
  </View>;
}

export function TripSummaryCard({ summary }: { summary: PartyTripSummary }) {
  return <View style={panel}><Heading size={21}>{t({ en: 'Trip summary', th: 'สรุปทริป', zh: '旅行总结' })}</Heading><Body size={14} style={{ marginTop: 7 }}>{summary.partyName}</Body><View style={{ flexDirection: 'row', gap: 18, marginTop: 12 }}><View><Heading size={23} colour={color.brand}>{summary.memberCount}</Heading><Label size={9}>{t({ en: 'MEMBERS', th: 'สมาชิก', zh: '成员' })}</Label></View><View><Heading size={23} colour={color.brand}>{summary.itinerary.length}</Heading><Label size={9}>{t({ en: 'PLACES', th: 'สถานที่', zh: '地点' })}</Label></View><View><Heading size={23} colour={color.brand}>{(summary.distanceTravelledM / 1000).toFixed(1)}</Heading><Label size={9}>{t({ en: 'KM', th: 'กม.', zh: '公里' })}</Label></View></View>{summary.itinerary.map((item, index) => <Body key={item.placeId} size={13} style={{ marginTop: 7 }}>{index + 1}. {t(item.name)}</Body>)}</View>;
}
