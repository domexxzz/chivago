/**
 * Booking and services at a university: one way in to what it already runs.
 *
 * Rooms are booked in the university's system, on its own page, with its own
 * password. This screen knows which page is which building's, repeats the rules
 * before anybody goes there, and keeps a note afterwards. It never shows a room
 * as free or taken, because it does not know.
 */

import React from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { BookOpen, CalendarCheck, ChevronDown, ExternalLink, Phone } from 'lucide-react-native';
import {
  campusServicesFor, campusShuttlePage, isCampusLink, type CampusService, type CampusServices,
} from '@chivago/core';
import { Button } from '../components/Button.tsx';
import { RoomNotes } from '../components/RoomNotes.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { StudentPanel } from '../components/StudentPanel.tsx';
import { Body, Heading, Label } from '../components/Type.tsx';
import { useArea } from '../state/area.ts';
import { color, gutter, onFill, shadow } from '../theme/index.ts';
import { t } from '../i18n/locale.ts';
import { formatDate } from '../i18n/format.ts';

const SHOWN_AT_FIRST = 2;
/** `radius.lg` is the capsule; a card is this, as on the quest page. */
const CARD = 24;

export function CampusServicesScreen({ onBack, onOpenQuests, onToast }: {
  onBack: () => void;
  onOpenQuests: () => void;
  onToast: (m: string) => void;
}) {
  const area = useArea();
  const services = campusServicesFor(area.key);
  const title = t({ en: 'Booking and services', th: 'จองและบริการ', zh: '预订与服务' });

  if (!services) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <PushHeader context={title} onBack={onBack} />
        <Body size={14} colour={color.neutral700} style={{ padding: gutter }}>
          {t({ en: 'Nothing has been read about this campus yet.', th: 'ยังไม่มีข้อมูลบริการของที่นี่', zh: '暂无该校区的服务信息。' })}
        </Body>
      </View>
    );
  }

  // Checked again at the tap: a row edited by hand must not become a way out.
  const open = (url: string) => {
    if (isCampusLink(services, url)) void Linking.openURL(url);
  };
  const call = (dial: string) => { if (/^\d{9,10}$/.test(dial)) void Linking.openURL(`tel:${dial}`); };
  const shuttle = campusShuttlePage(area.key);
  const everyday = services.services.filter((s) => !s.private);
  const health = services.services.filter((s) => s.private);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} keyboardShouldPersistTaps="handled">
      <PushHeader context={title} onBack={onBack} />
      <View style={{ paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        <Heading size={26} tracking={-0.4}>{t(area.name)}</Heading>
        <Body size={14} colour={color.neutral700} style={{ marginTop: 6 }}>
          {t({
            en: 'Everything below belongs to the university and is done on its own pages.',
            th: 'ทุกอย่างด้านล่างเป็นของมหาวิทยาลัย และทำในหน้าของมหาวิทยาลัย',
            zh: '以下均为校方服务，请在校方页面办理。',
          })}
        </Body>

        <Rooms services={services} onOpen={open} onToast={onToast} />

        <SectionTitle>{t({ en: 'Getting about and taking part', th: 'เดินทางและกิจกรรม', zh: '出行与活动' })}</SectionTitle>
        {shuttle ? (
          <Button
            label={t({ en: 'University bus page', th: 'หน้ารถของมหาวิทยาลัย', zh: '校方班车页面' })}
            onPress={() => open(shuttle)}
            variant="secondary"
            icon={<ExternalLink size={16} color={color.brand} strokeWidth={2} />}
            height={48}
            style={{ marginTop: 10 }}
          />
        ) : null}
        <Button
          label={t({ en: 'Campus activities', th: 'กิจกรรมในวิทยาเขต', zh: '校园活动' })}
          onPress={onOpenQuests}
          variant="secondary"
          icon={<CalendarCheck size={16} color={color.brand} strokeWidth={2} />}
          height={48}
          style={{ marginTop: 10 }}
        />

        <SectionTitle>{t({ en: 'Student services', th: 'บริการนักศึกษา', zh: '学生服务' })}</SectionTitle>
        {everyday.map((s) => <ServiceRow key={s.key} service={s} onOpen={open} onCall={call} />)}

        <SectionTitle>{t({ en: 'Health', th: 'สุขภาพ', zh: '健康' })}</SectionTitle>
        <Body size={13} colour={color.neutral700}>
          {t({
            en: 'Opening these is not recorded and earns nothing.',
            th: 'การเปิดดูส่วนนี้ไม่ถูกบันทึก และไม่มีแต้ม',
            zh: '查看此部分不会被记录，也不计积分。',
          })}
        </Body>
        {health.map((s) => <ServiceRow key={s.key} service={s} onOpen={open} onCall={call} />)}

        <StudentPanel areaKey={area.key} onToast={onToast} />

        <Body size={13} colour={color.neutral600} style={{ marginTop: 24 }}>
          {t({
            en: `Read from the university’s site on ${formatDate(services.readOn)}. Not confirmed by any office, and not a partnership.`,
            th: `อ่านจากเว็บไซต์ของมหาวิทยาลัยเมื่อ ${formatDate(services.readOn)} ยังไม่ได้ยืนยันกับหน่วยงาน และไม่ใช่ความร่วมมือ`,
            zh: `信息于 ${formatDate(services.readOn)} 读自校方网站，未经任何部门确认，亦非合作关系。`,
          })}
        </Body>
      </View>
    </ScrollView>
  );
}

const SectionTitle = ({ children }: { children: string }) => (
  <Heading size={19} style={{ marginTop: 28, marginBottom: 4 }}>{children}</Heading>
);

function Rooms({ services, onOpen, onToast }: {
  services: CampusServices; onOpen: (url: string) => void; onToast: (m: string) => void;
}) {
  const { rooms } = services;
  const [all, setAll] = React.useState(false);
  const shown = all ? rooms.buildings : rooms.buildings.slice(0, SHOWN_AT_FIRST);
  const [lead, ...rest] = shown;
  return (
    <View>
      <SectionTitle>{t({ en: 'Book a room', th: 'จองห้อง', zh: '预订房间' })}</SectionTitle>
      <View style={[shadow.card, { marginTop: 8, padding: 18, borderRadius: CARD, backgroundColor: color.text }]}>
        <Label size={10} tracking={0.12} colour={onFill.text}>{rooms.systemName}</Label>
        <Heading size={22} colour={onFill.text} style={{ marginTop: 4 }}>{t(lead!.name)}</Heading>
        {lead!.groupRooms ? (
          <Body size={14} colour={onFill.text} style={{ marginTop: 2 }}>
            {t({ en: `${lead!.groupRooms} group rooms`, th: `ห้องกลุ่ม ${lead!.groupRooms} ห้อง`, zh: `${lead!.groupRooms} 间小组讨论室` })}
          </Body>
        ) : null}
        <View style={{ marginTop: 12, gap: 6 }}>
          {rooms.rules.lines.map((line) => (
            <View key={line.en} style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 8, backgroundColor: onFill.text }} />
              <Body size={14} colour={onFill.text} style={{ flex: 1 }}>{t(line)}</Body>
            </View>
          ))}
        </View>
        <Label size={9} tracking={0.06} colour={onFill.text} style={{ marginTop: 10, textTransform: 'none' }}>
          {t({
            en: `Library notice, ${formatDate(rooms.rules.publishedOn)}`,
            th: `ประกาศหอสมุด ${formatDate(rooms.rules.publishedOn)}`,
            zh: `图书馆公告，${formatDate(rooms.rules.publishedOn)}`,
          })}
        </Label>
        <Button
          label={t({ en: 'Open the library’s table', th: 'เปิดตารางหอสมุด', zh: '打开图书馆预订表' })}
          onPress={() => onOpen(lead!.url)}
          inverted
          icon={<ExternalLink size={16} color={color.text} strokeWidth={2} />}
          height={48}
          style={{ marginTop: 14 }}
        />
      </View>
      {rest.map((b) => (
        <Pressable
          key={b.id}
          onPress={() => onOpen(b.url)}
          accessibilityRole="link"
          accessibilityLabel={t(b.name)}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10,
            borderBottomWidth: 1, borderBottomColor: color.neutral300, opacity: pressed ? 0.6 : 1,
          })}
        >
          <View style={{ flex: 1 }}>
            <Body size={14} colour={color.text}>{t(b.name)}</Body>
            {b.groupRooms ? (
              <Body size={13} colour={color.neutral700}>
                {t({ en: `${b.groupRooms} group rooms`, th: `ห้องกลุ่ม ${b.groupRooms} ห้อง`, zh: `${b.groupRooms} 间小组讨论室` })}
              </Body>
            ) : null}
          </View>
          <ExternalLink size={16} color={color.brand} strokeWidth={2} />
        </Pressable>
      ))}
      {!all ? (
        <Button
          label={t({ en: `All ${rooms.buildings.length} buildings`, th: `ดูทั้ง ${rooms.buildings.length} แห่ง`, zh: `查看全部 ${rooms.buildings.length} 处` })}
          onPress={() => setAll(true)}
          variant="secondary"
          icon={<ChevronDown size={16} color={color.brand} strokeWidth={2} />}
          height={44}
          style={{ marginTop: 10 }}
        />
      ) : null}
      <Body size={13} colour={color.neutral700} style={{ marginTop: 6 }}>
        {t({
          en: 'This app does not know which rooms are free. Sign in there with your university internet account; never type that password here.',
          th: 'แอปไม่รู้ว่าห้องไหนว่าง เข้าสู่ระบบที่หน้านั้นด้วยรหัสอินเทอร์เน็ตของมหาวิทยาลัย อย่าพิมพ์รหัสนั้นในแอปนี้',
          zh: '本应用不知道哪些房间空闲。请在该页面用校园网账号登录，切勿在本应用中输入该密码。',
        })}
      </Body>
      <RoomNotes booking={rooms} onToast={onToast} />
    </View>
  );
}

function ServiceRow({ service, onOpen, onCall }: {
  service: CampusService; onOpen: (url: string) => void; onCall: (dial: string) => void;
}) {
  return (
    <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.neutral300 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <BookOpen size={16} color={color.brand} strokeWidth={2} />
        <Heading size={16} style={{ flex: 1 }}>{t(service.title)}</Heading>
      </View>
      <Body size={14} colour={color.neutral700} style={{ marginTop: 4 }}>{t(service.about)}</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
        <Button
          label={t(service.link.label)}
          onPress={() => onOpen(service.link.url)}
          variant="secondary"
          icon={<ExternalLink size={15} color={color.brand} strokeWidth={2} />}
          height={44}
        />
        {service.phone ? (
          <Button
            label={service.phone.printed}
            accessibilityLabel={`${t({ en: 'Call', th: 'โทร', zh: '拨打' })} ${t(service.title)} ${service.phone.printed}`}
            onPress={() => onCall(service.phone!.dial)}
            variant="secondary"
            icon={<Phone size={15} color={color.brand} strokeWidth={2} />}
            height={44}
          />
        ) : null}
      </View>
    </View>
  );
}
