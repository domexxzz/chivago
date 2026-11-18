/**
 * Solution Connect — partner solutions, beside the local picks.
 *
 * WHAT IT IS, SAID PLAINLY. This is the surface the revenue model calls
 * Connect: a partner pays to be shown here, with a link to their own site.
 * It is an ADVERTISING SURFACE, not an editorial recommendation and not a
 * technical integration, and the difference is the whole reason this file
 * reads the way it does.
 *
 * WHY THE DISCLOSURE IS NOT DECORATION. ChivarGo's entire claim is that its
 * numbers are evidence - a host verified this check-in, this air reading came
 * from a sensor, this quest paid what it said it would. A paid placement
 * dropped into a screen of local recommendations borrows that credibility
 * without earning it, and the traveller cannot tell the difference unless the
 * screen tells them. So it says so, twice: once for the section, and once per
 * card for where the words came from.
 *
 * The repository already decided this twice. `org_sponsorships` separates a
 * `basis` of 'declared' from 'signed' rather than printing a relationship it
 * cannot prove; `docs/61` says a licence is shown as stated and never
 * verified, and that nothing on a listing is invented. The same rule here:
 * every word about the partner below is the partner's own, from their own
 * site, and is labelled as theirs.
 *
 * NOT RANKED, DELIBERATELY. `apps/mobile/test/home.test.ts` carries the rule
 * on `questOrder` - "ranking by payout would be the app recommending whatever
 * it most wants done and calling it a suggestion". A paid list sorted by what
 * was paid is that same thing. While Connect holds one partner the question
 * is moot; when it holds several, the order must come from something other
 * than money, and this comment is where the next person finds that out.
 */
import React from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { AlertTriangle, ArrowUpRight, Leaf, ShieldCheck } from 'lucide-react-native';

import { color, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';
import sentiaraMark from '../../assets/sentiara-mark.png';

/**
 * A partner, as the partner describes themselves.
 *
 * `blurb` is lifted from Sentiara's own site rather than written here, which
 * is the point: ChivarGo does not characterise a partner's product, because
 * characterising it is a claim, and a claim here is one nobody checked.
 */
type Partner = {
  name: string;
  blurb: string;
  url: string;
  mark: number;
  accent: string;
  pale: string;
  border: string;
};

/** Sentiara's own purple, from their mark, so the card is theirs and reads as theirs. */
const SENTIARA_ACCENT = '#7B4BFF';

const partners = (): Partner[] => [
  {
    name: 'Sentiara AI',
    blurb: t({
      en: 'Connects camera data and incident reports to support environmental care, safety and area management.',
      th: 'เชื่อมข้อมูลกล้องและการแจ้งเหตุ เพื่อสนับสนุนการดูแลสิ่งแวดล้อม ความปลอดภัย และการจัดการพื้นที่',
      zh: '连接摄像头数据与事件报告，支持环境维护、安全与区域管理。',
    }),
    /*
      Their own domain, given by the owner on 15 November. It serves the same
      site as the workers.dev address it replaces - checked, byte for byte -
      so only the link changed and the description above still says what the
      site says. A partner's link is the one thing on this card that must not
      rot: a dead link on a paid placement is the one failure the partner
      notices first.
    */
    url: 'https://sentiaratech.com/',
    mark: sentiaraMark,
    accent: SENTIARA_ACCENT,
    pale: '#F3EDFF',
    border: '#E2D6FF',
  },
];

export function SolutionConnect({ compact = false }: { compact?: boolean }) {
  const list = partners();
  return (
    <View
      accessibilityRole="summary"
      style={[shadow.card, {
        width: '100%',
        padding: compact ? 16 : 18,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: '#DED1FF',
        backgroundColor: '#F5F0FF',
        gap: 10,
      }]}
    >
      {list.map((partner) => (
        <PartnerCard key={partner.name} partner={partner} compact={compact} />
      ))}
      <Label size={9} tracking={0.03} colour={color.neutral700} style={{ textAlign: 'center', textTransform: 'none' }}>
        {t({
          en: 'Solution Connect · Paid partner placement — not a ChivarGo recommendation.',
          th: 'Solution Connect · พื้นที่พาร์ตเนอร์แบบชำระเงิน ไม่ใช่คำแนะนำจาก ChivarGo',
          zh: 'Solution Connect · 付费合作伙伴展示，并非 ChivarGo 推荐。',
        })}
      </Label>
    </View>
  );
}

function PartnerCard({ partner, compact }: { partner: Partner; compact: boolean }) {
  return (
    <Pressable
      onPress={() => { void Linking.openURL(partner.url); }}
      accessibilityRole="link"
      accessibilityLabel={partner.name}
      accessibilityHint={t({
        en: `Open the ${partner.name} website`,
        th: `เปิดเว็บไซต์ ${partner.name}`,
        zh: `打开 ${partner.name} 网站`,
      })}
      style={({ pressed }) => ({
        padding: compact ? 2 : 4,
        borderRadius: 18,
        flexDirection: compact ? 'column' : 'row',
        alignItems: compact ? 'stretch' : 'center',
        gap: compact ? 14 : 22,
        opacity: pressed ? 0.88 : 1,
        transform: [{ scale: pressed ? 0.995 : 1 }],
      })}
    >
      <View style={{ minWidth: compact ? 0 : 270, flexDirection: 'row', alignItems: 'center', gap: 14, paddingRight: compact ? 0 : 20, borderRightWidth: compact ? 0 : 1, borderRightColor: '#BDA9FF' }}>
        <Image source={partner.mark} accessibilityLabel={partner.name} resizeMode="cover" style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: color.surface }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Heading size={22} colour={color.text}>{partner.name}</Heading>
          <View style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: '#E4D8FF' }}><Label size={9} colour="#6A39D8">{t({ en: 'TECHNOLOGY PARTNER', th: 'เทคโนโลยีพาร์ตเนอร์', zh: '技术合作伙伴' })}</Label></View>
        </View>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Heading size={18} colour={color.text}>{t({ en: 'Smart island management', th: 'ระบบบริหารเกาะอัจฉริยะ', zh: '智慧岛屿管理系统' })}</Heading>
        <Body size={13} colour={color.neutral700} style={{ marginTop: 3 }}>{partner.blurb}</Body>
        <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          <FeatureChip Icon={Leaf} label={t({ en: 'Environment', th: 'สิ่งแวดล้อม', zh: '环境' })} color="#00A77A" />
          <FeatureChip Icon={ShieldCheck} label={t({ en: 'Safety', th: 'ความปลอดภัย', zh: '安全' })} color="#7047E8" />
          <FeatureChip Icon={AlertTriangle} label={t({ en: 'Incident management', th: 'จัดการเหตุ', zh: '事件管理' })} color="#F27C78" />
        </View>
      </View>

      <View style={{ minWidth: compact ? 0 : 235, alignItems: 'stretch', gap: 6 }}>
        <View style={{ minHeight: 46, paddingHorizontal: 18, borderRadius: 15, backgroundColor: '#6E16ED', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <Heading size={14} colour="#FFFFFF">{t({ en: 'Visit Sentiara website', th: 'เข้าสู่เว็บไซต์ Sentiara', zh: '访问 Sentiara 网站' })}</Heading>
          <ArrowUpRight size={18} color="#FFFFFF" strokeWidth={2.5} />
        </View>
        <Body size={13} colour={color.neutral700} style={{ textAlign: 'center' }}>{t({ en: 'Opens an external website', th: 'เปิดเว็บไซต์ภายนอก', zh: '打开外部网站' })}</Body>
      </View>
    </Pressable>
  );
}

function FeatureChip({ Icon, label, color: ink }: { Icon: typeof Leaf; label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 6, ...shadow.sm }}>
      <Icon size={16} color={ink} />
      <Label size={9} tracking={0.02} colour={color.text}>{label}</Label>
    </View>
  );
}
