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
import { ArrowUpRight } from 'lucide-react-native';

import { color, radius, shadow } from '../theme/index.ts';
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
      en: 'Privacy-first, on-premise AI for homes, elderly care and businesses.',
      th: 'ระบบ AI ดูแลบ้าน ผู้สูงอายุ และธุรกิจ แบบ Privacy-First ประมวลผลภายในสถานที่',
      zh: '隐私优先的本地部署 AI，守护住家、长者与商家。',
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
        padding: compact ? 16 : 20,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: '#D8E6EE',
        backgroundColor: color.surface,
        gap: 14,
      }]}
    >
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SENTIARA_ACCENT }} />
          <Label size={10} tracking={0.12} colour={color.neutral700}>
            {t({ en: 'SOLUTION CONNECT', th: 'SOLUTION CONNECT', zh: 'SOLUTION CONNECT' })}
          </Label>
        </View>
        <Heading size={18} tracking={-0.2}>
          {t({
            en: 'Solutions from our partners',
            th: 'โซลูชันจากพาร์ตเนอร์',
            zh: '来自合作伙伴的解决方案',
          })}
        </Heading>
        {/*
          The sentence that keeps this honest. It is first, before any partner,
          because somebody who reads one line should read this one.
        */}
        <Body size={13} colour={color.neutral700}>
          {t({
            en: 'Partners who joined the programme. A place here is paid for — it is not a ChivarGo recommendation.',
            th: 'พาร์ตเนอร์ที่ร่วมโครงการ พื้นที่ตรงนี้เป็นการลงพื้นที่โฆษณา ไม่ใช่คำแนะนำจาก ChivarGo',
            zh: '已加入计划的合作伙伴。此处为付费展示，并非 ChivarGo 的推荐。',
          })}
        </Body>
      </View>

      {list.map((partner) => (
        <PartnerCard key={partner.name} partner={partner} />
      ))}
    </View>
  );
}

function PartnerCard({ partner }: { partner: Partner }) {
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
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: partner.border,
        backgroundColor: partner.pale,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: pressed ? 0.88 : 1,
        transform: [{ scale: pressed ? 0.995 : 1 }],
      })}
    >
      <Image
        source={partner.mark}
        accessibilityLabel={partner.name}
        resizeMode="cover"
        style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: color.surface }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Heading size={16} colour={color.text}>{partner.name}</Heading>
        <Body size={13} colour={color.neutral700} style={{ marginTop: 3 }}>{partner.blurb}</Body>
        {/*
          Where the words came from, per card. `org_sponsorships` draws the
          same line between what was declared and what was signed: the app may
          repeat a partner's description, but it may not adopt it.
        */}
        <Label size={9} tracking={0.08} colour={color.neutral600} style={{ marginTop: 6 }}>
          {t({
            en: 'STATED BY THE PROVIDER',
            th: 'ข้อมูลจากผู้ให้บริการ',
            zh: '由服务方提供的信息',
          })}
        </Label>
      </View>
      <View style={{
        width: 34, height: 34, borderRadius: 17, backgroundColor: partner.accent,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <ArrowUpRight size={17} color="#FFFFFF" strokeWidth={2.5} />
      </View>
    </Pressable>
  );
}
