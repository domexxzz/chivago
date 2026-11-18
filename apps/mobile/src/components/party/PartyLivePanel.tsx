import React from 'react';
import * as Location from 'expo-location';
import { Alert, Image, Platform, Pressable, ScrollView, Switch, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Compass, MapPin, MessageCircle, Navigation, Radio, Route, ShieldCheck, Users, Waves } from 'lucide-react-native';
import { inArea, type CoastalIntelligence, type CoastalSurveyZone, type PartyItineraryItem, type PartyLiveMember, type PartyMessage, type PartyPingKind, type PartyTripSummary, type ScoredPlace } from '@chivago/core';
import { api } from '../../api/client.ts';
import { useHere } from '../../state/here.ts';
import { requestPartyBackgroundPermission, startPartyBackgroundLocation, stopPartyBackgroundLocation } from '../../location/party-background.ts';
import { t } from '../../i18n/locale.ts';
import { color, gutter, radius, shadow } from '../../theme/index.ts';
import { Body, Heading, Label } from '../Type.tsx';
import { Button } from '../Button.tsx';
import { SamuiMap } from '../SamuiMap.tsx';
import { useArea } from '../../state/area.ts';
import coastalWatchHero from '../../../assets/coastal-watch-party-hero-v1.png';

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
  const [coastal, setCoastal] = React.useState<CoastalIntelligence | null>(null);
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
    if (area.key !== 'koh-sichang') { setCoastal(null); return; }
    void api.coastalIntelligence().then((result) => { if (result.ok) setCoastal(result.data); });
  }, [area.key]);

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
      {area.key === 'koh-sichang' ? <CoastalFieldPanel intelligence={coastal} owner={owner} onToast={onToast} onMeeting={setMeeting} /> : null}
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

function CoastalFieldPanel({ intelligence, owner, onToast, onMeeting }: {
  intelligence: CoastalIntelligence | null;
  owner: boolean;
  onToast: (message: string) => void;
  onMeeting: (meeting: { label: string; latitude: number; longitude: number }) => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const choose = async (zone: CoastalSurveyZone) => {
    if (!owner || busy) return;
    setBusy(zone.id);
    const label = t(zone.name);
    const result = await api.setPartyMeetingPoint({ latitude: zone.lat, longitude: zone.lng, label });
    setBusy(null);
    if (!result.ok) { onToast(result.error); return; }
    onMeeting(result.data.meetingPoint);
    onToast(t({ en: `${label} is now the team meeting point.`, th: `ตั้ง ${label} เป็นจุดนัดพบของทีมแล้ว`, zh: `${label} 已设为队伍集合点。` }));
  };
  const live = intelligence?.status === 'live';
  return <View style={[shadow.card, { marginHorizontal: gutter, marginTop: 12, borderRadius: 22, overflow: 'hidden', backgroundColor: '#073E5B', borderWidth: 1, borderColor: '#39C9D1' }]}>
    <View style={{ height: 132, position: 'relative', overflow: 'hidden' }}>
      <Image source={coastalWatchHero} resizeMode="cover" accessible={false} style={{ width: '100%', height: '100%' }} />
      <View style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(2,42,63,0.18)' }} />
      <View style={{ position: 'absolute', left: 14, bottom: 13, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(2,43,66,0.82)', borderWidth: 1, borderColor: 'rgba(143,245,240,0.46)' }}>
        <Label size={9} tracking={0.11} colour="#8FF5F0">{t({ en: 'ECO PARTY · FIELD MISSION', th: 'อีโคปาร์ตี้ · ภารกิจภาคสนาม', zh: '环保队伍 · 实地任务' })}</Label>
        <Body size={13} colour="#FFFFFF" style={{ marginTop: 2 }}>{t({ en: 'Explore the coast together', th: 'ออกสำรวจชายฝั่งด้วยกัน', zh: '一起探索海岸' })}</Body>
      </View>
    </View>
    <View style={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' }}><Waves size={26} color="#8FF5F0" /></View>
        <View style={{ flex: 1 }}><Label size={9} tracking={0.11} colour="#8FF5F0">{t({ en: 'COASTAL WATCH', th: 'เฝ้าระวังชายฝั่ง', zh: '海岸监测' })}</Label><Heading size={18} colour="#FFFFFF" style={{ marginTop: 2 }}>{t({ en: 'Eco Party field briefing', th: 'แผนลงพื้นที่ของอีโคปาร์ตี้', zh: '环保队伍现场简报' })}</Heading></View>
        <View style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: live ? 'rgba(77,240,160,0.16)' : 'rgba(255,216,90,0.16)', flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: live ? '#4DF0A0' : '#FFD85A' }} /><Label size={9} colour={live ? '#B9FFD9' : '#FFF0B1'}>{live ? t({ en: 'LIVE', th: 'สด', zh: '实时' }) : intelligence ? t({ en: 'UNAVAILABLE', th: 'ไม่พร้อมใช้งาน', zh: '不可用' }) : t({ en: 'LOADING', th: 'กำลังโหลด', zh: '加载中' })}</Label></View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <View style={{ flex: 1, padding: 11, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', gap: 9 }}><Waves size={20} color="#8FF5F0" /><View><Heading size={17} colour="#FFFFFF">{typeof intelligence?.current.speedKmh === 'number' ? `${intelligence.current.speedKmh.toFixed(1)} ${t({ en: 'km/h', th: 'กม./ชม.', zh: '公里/小时' })}` : '—'}</Heading><Label size={9} colour="#BFEAF2">{t({ en: 'CURRENT SPEED', th: 'ความเร็วกระแสน้ำ', zh: '海流速度' })}</Label></View></View>
        <View style={{ flex: 1, padding: 11, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', gap: 9 }}><Compass size={20} color="#8FF5F0" /><View style={{ flex: 1 }}><Heading size={15} colour="#FFFFFF">{intelligence?.current.directionLabel ? t(intelligence.current.directionLabel) : '—'}</Heading><Label size={9} colour="#BFEAF2">{typeof intelligence?.current.directionDeg === 'number' ? `${Math.round(intelligence.current.directionDeg)}°` : t({ en: 'DIRECTION', th: 'ทิศทาง', zh: '方向' })}</Label></View></View>
      </View>

      <Body size={13} colour="#D6F7FB" style={{ marginTop: 11 }}>{t({ en: 'Choose a verified shoreline checkpoint to move the existing Party meeting marker. This does not report debris or award points.', th: 'เลือกจุดสำรวจชายฝั่งที่มีพิกัดอ้างอิงเพื่อย้ายหมุดนัดพบของปาร์ตี้ การเลือกจุดไม่ถือว่าพบขยะและไม่ให้แต้ม', zh: '选择有参考坐标的海岸检查点，移动现有队伍集合标记；选择地点不代表发现垃圾，也不会发放奖励。' })}</Body>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingTop: 12, paddingBottom: 2 }}>
        {(intelligence?.zones ?? []).map((zone, index) => <View key={zone.id} style={{ width: 218, padding: 12, borderRadius: 17, backgroundColor: '#FFFFFF' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><View style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: index === 0 ? '#DDF8E8' : '#E4F4FB', alignItems: 'center', justifyContent: 'center' }}><MapPin size={16} color={index === 0 ? '#16875C' : color.brand} /></View><Label size={9} colour={color.neutral600}>{t({ en: `SEGMENT ${zone.segmentId}`, th: `ช่วงชายฝั่ง ${zone.segmentId}`, zh: `岸段 ${zone.segmentId}` })}</Label></View>
          <Heading size={14} style={{ marginTop: 8 }}>{t(zone.name)}</Heading>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 4 }}>{t(zone.purpose)}</Body>
          <Pressable disabled={!owner || Boolean(busy)} onPress={() => choose(zone)} accessibilityRole="button" accessibilityLabel={t({ en: `Set ${t(zone.name)} as meeting point`, th: `ตั้ง ${t(zone.name)} เป็นจุดนัดพบ`, zh: `将${t(zone.name)}设为集合点` })} style={({ pressed }) => ({ marginTop: 10, minHeight: 38, borderRadius: 12, backgroundColor: owner ? (pressed ? '#00769C' : color.brand) : '#E7EEF1', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: busy && busy !== zone.id ? 0.55 : 1 })}><MapPin size={15} color={owner ? '#FFFFFF' : color.neutral600} /><Label size={9} colour={owner ? '#FFFFFF' : color.neutral600}>{busy === zone.id ? t({ en: 'SETTING…', th: 'กำลังตั้ง…', zh: '设置中…' }) : owner ? t({ en: 'MEET HERE', th: 'นัดทีมตรงนี้', zh: '在此集合' }) : t({ en: 'OWNER SETS POINT', th: 'หัวหน้าปาร์ตี้เป็นผู้ตั้ง', zh: '由队长设置' })}</Label></Pressable>
        </View>)}
      </ScrollView>
    </View>
    <View style={{ paddingHorizontal: 16, paddingVertical: 9, backgroundColor: 'rgba(0,18,35,0.33)', flexDirection: 'row', gap: 7, alignItems: 'center' }}><ShieldCheck size={15} color="#FFD85A" /><Body size={13} colour="#D7ECF3" style={{ flex: 1 }}>{intelligence ? t(intelligence.model.notice) : t({ en: 'Loading marine source…', th: 'กำลังโหลดแหล่งข้อมูลทะเล…', zh: '正在加载海洋数据源…' })}</Body></View>
  </View>;
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
