/**
 * Profile.
 *
 * One screen for the traveller's own record: the name the account was
 * registered with, the level and the rank, how far to the next one, where
 * they stand among the people whose work a host has checked, the companions
 * their visits grew, and the two figures that follow them everywhere -
 * verified points and provinces. Reached from the button at the top of Home.
 *
 * Nothing here is new data. Every figure is already on the wallet, the
 * passport or the standing; this is the one place they sit together, which
 * is what a profile is for.
 *
 * What it refuses to do, on purpose:
 *
 *  - invent a name or a face. The name is the display name the account was
 *    registered with ("Traveller" unless the phone said otherwise) and the
 *    picture is the companion the traveller actually grew - an egg, if that
 *    is as far as it got, and nobody's stock portrait.
 *  - draw a podium for one person. A position is shown only when the island
 *    has enough participants for a ranking to mean anything (`isRankable`),
 *    and the basis of the ranking is printed under it either way.
 */

import React from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import {
  Building2, CheckCircle2, ChevronLeft, ChevronRight, Compass, Crown, Footprints, Leaf, LogOut, Mail, MapPinned, Phone, Settings, ShieldCheck, Sprout, Store, TreePalm, UserRound,
} from 'lucide-react-native';
// On its own line: the test stub generator reads the braces above for names.
import type { LucideIcon } from 'lucide-react-native';
import {
  MIN_FOR_RANKING, expAtLevel, isRankable, levelProgressPct, passportProgress, strings,
  type Bilingual, type Companion, type MedalState, type MedalsView, type RankKey, type TravellerStanding, type Wallet,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync, type Async } from '../state/store.tsx';
import { bar, color, gutter, layout, onFill, radius, shadow } from '../theme/index.ts';
import { tint } from '@chivago/tokens';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button, IconButton } from '../components/Button.tsx';
import { Creature } from '../components/Creature.tsx';
import { MedalMark } from '../components/MedalMark.tsx';
import { TravelHeroBackdrop } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { STAGE_LABEL } from './CompanionHome.tsx';
import { LOCALES, LOCALE_NAMES, setLocale, t, useLocale } from '../i18n/locale.ts';
import { formatInteger } from '../i18n/format.ts';

type Icon = LucideIcon;

/**
 * One drawn mark per rank. The wallet's ladder keeps its numerals; the
 * profile is the one screen where the ranks are the subject rather than a
 * footnote, and five identical squares do not read as a path.
 */
const RANK_ICON: Record<RankKey, Icon> = {
  newcomer: Sprout,
  wanderer: Footprints,
  islandExplorer: Compass,
  samuiInsider: TreePalm,
  chivaLegend: Crown,
};

interface StandingView {
  you: TravellerStanding | null;
  participants: number;
  position: number | null;
  rankedBy: Bilingual;
}

interface CompanionsView {
  companions: Companion[];
  summary: { found: number; total: number; grown: number };
}

const STAGE_ORDER: Record<Companion['stage'], number> = { grown: 2, hatchling: 1, egg: 0 };

/** The companion that stands for the traveller: the most grown, or the first egg. */
export function leadCompanion(list: Companion[]): Companion | null {
  return [...list].sort((a, b) => STAGE_ORDER[b.stage] - STAGE_ORDER[a.stage])[0] ?? null;
}

const companionName = (c: Companion): string =>
  c.stage === 'egg' ? t(c.species.eggName) : t(c.species.name);

/** Guest profile: language is a local preference; personal records and tools need an account. */
export function GuestProfileScreen({
  onBack, onSignIn, onRegister,
}: { onBack: () => void; onSignIn: () => void; onRegister: () => void }) {
  const locale = useLocale();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ minHeight: 230, padding: 18, paddingTop: 14, backgroundColor: '#028090', borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' }}>
        <TravelHeroBackdrop compact focalPoint="right" />
        <IconButton inverted onPress={onBack} accessibilityLabel={t(strings.common.back)}>
          <ChevronLeft size={18} color="#FFFFFF" />
        </IconButton>
        <View style={{ alignItems: 'center', paddingTop: 18 }}>
          <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 2, borderColor: '#BCEEF7', alignItems: 'center', justifyContent: 'center' }}>
            <UserRound size={32} color="#FFFFFF" />
          </View>
          <Heading size={22} colour="#FFFFFF" style={{ marginTop: 8 }}>{t({ en: 'Profile', th: 'โปรไฟล์', zh: '个人资料' })}</Heading>
          <Label size={10} colour="#E0F7FA" style={{ marginTop: 4 }}>{t({ en: 'Browsing as a guest', th: 'เข้าชมแบบผู้เยี่ยมชม', zh: '以访客身份浏览' })}</Label>
        </View>
      </View>

      <View style={{ margin: gutter, marginTop: -20, padding: 18, gap: 14, backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: '#DCEFF5', ...shadow.card }}>
        <View>
          <Heading size={17}>{t({ en: 'Language', th: 'ภาษา', zh: '语言' })}</Heading>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 4 }}>{t({ en: 'Choose the language used throughout the app.', th: 'เลือกภาษาที่ใช้แสดงในแอป', zh: '选择整个应用使用的语言。' })}</Body>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {LOCALES.map((option) => {
            const selected = option === locale;
            return (
              <Pressable
                key={option}
                onPress={() => setLocale(option)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={LOCALE_NAMES[option]}
                style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 2, borderColor: selected ? color.brand : color.neutral300, backgroundColor: selected ? color.brand : color.surface }}
              >
                <Heading size={15} colour={selected ? onFill.brand : color.text}>{LOCALE_NAMES[option]}</Heading>
              </Pressable>
            );
          })}
        </View>
        <View style={{ padding: 12, borderRadius: radius.sm, backgroundColor: '#F0F9FD' }}>
          <Body size={13} colour={color.neutral700}>{t({ en: 'Sign in or create an account to view your profile details and use account actions.', th: 'เข้าสู่ระบบหรือสมัครสมาชิกเพื่อดูข้อมูลโปรไฟล์และใช้งานต่างๆ ในบัญชี', zh: '登录或注册账号，即可查看你的资料详情并使用账号功能。' })}</Body>
        </View>
        <Button label="Sign in" thai="เข้าสู่ระบบ" chinese="登录" onPress={onSignIn} />
        <Button label="Create an account" thai="สมัครสมาชิก" chinese="创建账户" variant="secondary" onPress={onRegister} />
      </View>
    </ScrollView>
  );
}

export function ProfileScreen({
  onBack, onOpenAccount, onOpenEditProfile, onOpenShops, onOpenWallet, onOpenPassport, onOpenMedals, onOpenCompanion, onLogout, accountTypeOverride, refreshKey = 0,
}: {
  onBack: () => void;
  onOpenAccount: () => void;
  onOpenEditProfile?: () => void;
  onOpenShops?: () => void;
  onOpenWallet: () => void;
  onOpenPassport: () => void;
  onOpenMedals: () => void;
  onOpenCompanion: (c: Companion) => void;
  onLogout?: () => void;
  accountTypeOverride?: 'traveller' | 'operator';
  refreshKey?: number;
}) {
  const { width } = useWindowDimensions();
  const [logoutModalVisible, setLogoutModalVisible] = React.useState(false);
  const wallet = useAsync(() => api.wallet(), []);
  const standing = useAsync(() => api.standing(), []);
  const passport = useAsync(() => api.passport(), []);
  const companions = useAsync(() => api.companions(), []);
  const medals = useAsync(() => api.medals(), []);
  const account = useAsync(() => api.account(), [refreshKey]);

  const lead = companions.data ? leadCompanion(companions.data.companions) : null;
  const name = standing.data?.you?.displayName ?? account.data?.fullName ?? null;
  const accountType = account.data?.accountType ?? accountTypeOverride ?? 'traveller';
  const businessName = account.data?.businessName ?? null;
  const email = account.data?.email ?? null;
  const phone = account.data?.phone ?? null;
  const bio = account.data?.bio ?? null;
  const profilePhotoUrl = account.data?.profilePhotoUrl ?? null;

  // Role is strictly fixed to the account registration — one or the other.
  const isOperator = accountType === 'operator';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <ProfileHero width={width} onBack={onBack} onOpenAccount={onOpenAccount} onOpenEditProfile={onOpenEditProfile} name={name} businessName={businessName} lead={lead} wallet={wallet.data} isOperator={isOperator} profilePhotoUrl={profilePhotoUrl} />

      {wallet.error ? <ErrorState message={wallet.error} onRetry={wallet.reload} /> : null}
      {wallet.loading && !wallet.data ? <LoadingState /> : null}
      {wallet.data ? (
        <>
          <RoleStatusCard
            accountType={accountType}
            businessName={businessName}
            name={name}
            email={email}
            phone={phone}
            bio={bio}
          />

          {isOperator ? (
            <OperatorTools onOpenAccount={onOpenAccount} onOpenEditProfile={onOpenEditProfile} onOpenShops={onOpenShops} />
          ) : (
            <>
              <TravellerTools
                onOpenEditProfile={onOpenEditProfile}
                onOpenPassport={onOpenPassport}
                onOpenWallet={onOpenWallet}
                onOpenMedals={onOpenMedals}
                onOpenAccount={onOpenAccount}
              />
              <Experience wallet={wallet.data} />
              <RankPath wallet={wallet.data} />
            </>
          )}
        </>
      ) : null}

      {!isOperator ? (
        <>
          <StandingBlock standing={standing} />
          <MedalsBlock medals={medals} onSeeAll={onOpenMedals} />
          <CompanionsBlock companions={companions} onOpenCompanion={onOpenCompanion} onSeeAll={onOpenWallet} />
        </>
      ) : null}

      {!isOperator ? <Figures wallet={wallet} passport={passport} onOpenWallet={onOpenWallet} onOpenPassport={onOpenPassport} /> : null}

      {onLogout ? (
        <View style={{ marginHorizontal: gutter, marginTop: 20 }}>
          <Pressable
            onPress={() => setLogoutModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t({ en: 'Log out', th: 'ออกจากระบบ', zh: '退出登录' })}
            style={({ pressed }) => [
              shadow.card,
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 14,
                paddingHorizontal: 20,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#FED7D7',
                borderRadius: radius.md,
              },
              pressed && { backgroundColor: '#FFF5F5', transform: [{ scale: 0.99 }] },
            ]}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: '#FEE2E2',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LogOut size={15} color="#DC2626" strokeWidth={2.2} />
            </View>
            <Label size={11} tracking={0.08} colour="#DC2626">
              {t({ en: 'Log Out', th: 'ออกจากระบบ', zh: '退出登录' })}
            </Label>
          </Pressable>
        </View>
      ) : null}

      <View style={{ height: 32 }} />

      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(2, 43, 66, 0.6)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            style={[
              shadow.card,
              {
                width: '100%',
                maxWidth: 360,
                backgroundColor: '#FFFFFF',
                borderRadius: 24,
                padding: 24,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#E2E8F0',
              },
            ]}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: '#FEE2E2',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <LogOut size={26} color="#DC2626" strokeWidth={2.2} />
            </View>

            <Heading size={18} colour={color.neutral900} style={{ textAlign: 'center', marginBottom: 8 }}>
              {t({ en: 'Log Out', th: 'ยืนยันการออกจากระบบ', zh: '退出登录' })}
            </Heading>

            <Body size={13} colour={color.neutral600} style={{ textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
              {t({
                en: 'Are you sure you want to log out of your ChivarGo account on this device?',
                th: 'คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบบัญชี ChivarGo บนอุปกรณ์นี้?',
                zh: '确定要在这台设备上退出你的 ChivarGo 账号吗？',
              })}
            </Body>

            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <Pressable
                onPress={() => setLogoutModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={t({ en: 'Cancel', th: 'ยกเลิก', zh: '取消' })}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 12,
                    backgroundColor: '#F1F5F9',
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                  },
                  pressed && { backgroundColor: '#E2E8F0' },
                ]}
              >
                <Label size={11} tracking={0.06} colour={color.neutral700}>
                  {t({ en: 'Cancel', th: 'ยกเลิก', zh: '取消' })}
                </Label>
              </Pressable>

              <Pressable
                onPress={() => {
                  setLogoutModalVisible(false);
                  onLogout?.();
                }}
                accessibilityRole="button"
                accessibilityLabel={t({ en: 'Confirm Log Out', th: 'ยืนยันออกจากระบบ', zh: '确认退出登录' })}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 12,
                    backgroundColor: '#DC2626',
                  },
                  pressed && { backgroundColor: '#B91C1C' },
                ]}
              >
                <Label size={11} tracking={0.06} colour="#FFFFFF">
                  {t({ en: 'Log Out', th: 'ออกจากระบบ', zh: '退出登录' })}
                </Label>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={[shadow.card, {
        marginHorizontal: gutter, marginTop: 12, padding: 16,
        backgroundColor: color.surface, borderRadius: radius.md,
        borderWidth: 1, borderColor: '#DCEFF5',
      }]}
    >
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Who: the name, the picture, the rank and the level
// ---------------------------------------------------------------------------

function Identity({
  wallet, name, lead, accountType, businessName,
}: {
  wallet: Wallet;
  name: string | null;
  lead: Companion | null;
  accountType?: 'traveller' | 'operator';
  businessName?: string | null;
}) {
  const p = wallet.progression;
  const isOperator = accountType === 'operator';

  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 8 }}>
      {/* The band is the app speaking (brand); the card overlaps it, as the conditions card does on Home. */}
      <View style={{ height: 64, backgroundColor: isOperator ? '#016592' : '#028090', borderRadius: radius.md, overflow: 'hidden' }}>
        <TravelHeroBackdrop compact focalPoint="right" />
      </View>
      <View
        style={[shadow.card, {
          marginTop: -32, marginHorizontal: 10, padding: 16,
          backgroundColor: color.surface, borderRadius: radius.md,
          borderWidth: 1.5, borderColor: isOperator ? '#009DB7' : '#DCEFF5',
          flexDirection: 'row', alignItems: 'center', gap: 14,
        }]}
      >
        <Avatar lead={lead} isOperator={isOperator} />
        <View style={{ flex: 1 }}>
          {/* Distinct Role Badge */}
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: radius.sm,
              backgroundColor: isOperator ? '#E0F5F9' : '#F0F9FD',
              borderWidth: 1,
              borderColor: isOperator ? '#009DB7' : '#BEE3F8',
              marginBottom: 5,
            }}
          >
            {isOperator ? (
              <Store size={12} color="#006A83" strokeWidth={2.4} />
            ) : (
              <Compass size={12} color="#028090" strokeWidth={2.4} />
            )}
            <Label size={10} tracking={0.08} colour={isOperator ? '#006A83' : '#028090'}>
              {isOperator
                ? t({ en: 'Business operator · Partner host', th: 'ผู้ประกอบการ / ร้านค้า', zh: '商家 · 合作主办方' })
                : t({ en: 'Traveller', th: 'นักท่องเที่ยว', zh: '旅行者' })}
            </Label>
          </View>

          {isOperator && businessName ? (
            <>
              <Heading size={18} tracking={-0.3}>{businessName}</Heading>
              <Body size={13} colour={color.neutral700} style={{ marginTop: 2 }}>
                {t({ en: `Owner · Host: ${name ?? 'Business operator'}`, th: `เจ้าของ / ผู้ดูแล: ${name ?? 'ผู้ประกอบการ'}`, zh: `业主 · 主办方：${name ?? 'Business operator'}` })}
              </Body>
            </>
          ) : (
            <>
              <Heading size={20} tracking={-0.3}>{name ?? t(strings.profile.traveller)}</Heading>
              <Body size={13} colour={color.neutral700} style={{ marginTop: 2 }}>{t(p.rank.label)}</Body>
            </>
          )}

          {/* Gold: the level is the game layer, earned by activity, never a host's word. */}
          <View
            style={{
              alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4, paddingHorizontal: 10,
              borderRadius: radius.lg, backgroundColor: color.goldSoft, borderWidth: 1, borderColor: color.gold,
            }}
          >
            <Label size={9} tracking={0.12} colour={color.goldDeep}>
              {t(strings.profile.levelChip(p.level, p.exp))}
            </Label>
          </View>
        </View>
      </View>
    </View>
  );
}

function ProfileHero({ width, onBack, onOpenAccount, onOpenEditProfile, name, businessName, lead, wallet, isOperator, profilePhotoUrl }: {
  width: number; onBack: () => void; onOpenAccount: () => void; onOpenEditProfile?: () => void; name: string | null; businessName: string | null;
  lead: Companion | null; wallet: Wallet | null; isOperator: boolean; profilePhotoUrl: string | null;
}) {
  const p = wallet?.progression;
  return (
    <View style={{ height: width >= 768 ? 304 : 316, marginHorizontal: width >= 768 ? gutter : 0, marginTop: width >= 768 ? gutter : 0, borderRadius: width >= 768 ? 28 : 0, backgroundColor: '#079bd0', overflow: 'hidden', zIndex: 2 }}>
      <TravelHeroBackdrop compact focalPoint="right" />
      <View style={{ position: 'absolute', top: 12, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton inverted onPress={onBack} accessibilityLabel={t({ en: 'Back', th: 'ย้อนกลับ', zh: '返回' })}><ChevronLeft size={18} color="#FFFFFF" /></IconButton>
        <Label size={11} colour="#FFFFFF" style={{ fontSize: 16, letterSpacing: 0 }}>{t({ en: 'Profile', th: 'โปรไฟล์', zh: '个人资料' })}</Label>
        <IconButton inverted onPress={onOpenAccount} accessibilityLabel={t({ en: 'Account and devices', th: 'บัญชีและอุปกรณ์', zh: '账户与设备' })}><Settings size={18} color="#FFFFFF" /></IconButton>
      </View>
      <View style={{ position: 'absolute', top: width >= 768 ? 62 : 66, left: 24, right: 24, alignItems: 'center' }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, padding: 4, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: '#22D3EE' }}>
          <Avatar lead={lead} isOperator={isOperator} profilePhotoUrl={profilePhotoUrl} />
        </View>
        <Heading size={22} colour="#FFFFFF" style={{ marginTop: 8, textAlign: 'center' }}>{isOperator ? (businessName ?? name ?? t({ en: 'Business operator', th: 'ผู้ประกอบการ', zh: '商家' })) : (name ?? t({ en: 'Traveller', th: 'นักท่องเที่ยว', zh: '旅行者' }))}</Heading>
        {!isOperator && p ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 5 }}>
              <View style={{ backgroundColor: isOperator ? '#F59E0B' : 'rgba(255,255,255,0.2)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Label size={11} colour="#FFFFFF">{isOperator ? t({ en: '♛ PARTNER', th: '♛ พาร์ทเนอร์', zh: '♛ 合作伙伴' }) : t(p.rank.label)}</Label>
              </View>
              <View style={{ backgroundColor: 'rgba(249,115,22,0.75)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Label size={11} colour="#FFFFFF">⚡ {t({ en: 'LEVEL', th: 'เลเวล', zh: '等级' })} {p.level}</Label>
              </View>
            </View>
            <Body size={13} colour="#E0F2FE" style={{ marginTop: 5, fontSize: 12 }}>{t({ en: `Level ${formatInteger(p.level)}`, th: `เลเวล ${formatInteger(p.level)}`, zh: `等级 ${formatInteger(p.level)}` })} · {formatInteger(p.exp)} EXP</Body>
          </>
        ) : null}
        {isOperator ? <View style={{ marginTop: 8, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)' }}><Label size={10} tracking={0.1} colour="#FFFFFF">{t({ en: 'BUSINESS OPERATOR', th: 'บัญชีผู้ประกอบการ', zh: '商家账号' })}</Label></View> : null}
        <Pressable onPress={onOpenEditProfile} accessibilityRole="button" accessibilityLabel={t({ en: 'Edit profile', th: 'แก้ไขโปรไฟล์', zh: '编辑资料' })} style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#123B64', borderWidth: 1.5, borderColor: '#E6C76A', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 8 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>✎ {t({ en: 'Edit profile', th: 'แก้ไขโปรไฟล์', zh: '编辑资料' })}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RoleStatusCard({
  accountType, businessName, name, email, phone, bio,
}: {
  accountType: 'traveller' | 'operator';
  businessName: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  bio?: string | null;
}) {
  const isOperator = accountType === 'operator';

  return (
    <Card>
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{
            width: 34, height: 34, borderRadius: 17,
            backgroundColor: isOperator ? '#E0F5F9' : '#F0F9FD',
            alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {isOperator ? (
              <Store size={18} color="#006A83" strokeWidth={2.2} />
            ) : (
              <Compass size={18} color="#009DB7" strokeWidth={2.2} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Label size={9} tracking={0.06} colour={isOperator ? '#006A83' : '#009DB7'} style={{ flexShrink: 1 }}>
              {isOperator ? t({ en: 'Business profile', th: 'โปรไฟล์ผู้ประกอบการ', zh: '商家资料' }) : t({ en: 'Traveller profile', th: 'โปรไฟล์นักท่องเที่ยว', zh: '旅行者资料' })}
            </Label>
            <Heading size={15} tracking={-0.2} style={{ flexShrink: 1, marginTop: 2 }}>
              {isOperator ? (businessName ?? t({ en: 'Business operator', th: 'ผู้ประกอบการ', zh: '商家' })) : (name ?? t({ en: 'Traveller', th: 'นักท่องเที่ยว', zh: '旅行者' }))}
            </Heading>
          </View>
        </View>

        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 4,
          alignSelf: 'flex-start', marginTop: 7, marginLeft: 42,
          paddingVertical: 3, paddingHorizontal: 8,
          borderRadius: radius.sm,
          backgroundColor: isOperator ? '#ECFDF5' : '#F0F9FD',
          borderWidth: 1,
          borderColor: isOperator ? '#A7F3D0' : '#BAE6FD',
        }}>
          {isOperator ? (
            <ShieldCheck size={12} color="#059669" strokeWidth={2.4} />
          ) : (
            <CheckCircle2 size={12} color="#0284C7" strokeWidth={2.4} />
          )}
          <Label size={9} tracking={0.06} colour={isOperator ? '#047857' : '#0369A1'}>
            {isOperator ? t({ en: 'Registered', th: 'ลงทะเบียนแล้ว', zh: '已注册' }) : t({ en: 'Traveller', th: 'นักท่องเที่ยว', zh: '旅行者' })}
          </Label>
        </View>
      </View>

      <View style={{
        marginTop: 12, padding: 12, borderRadius: radius.sm,
        backgroundColor: '#F8FCFD', borderWidth: 1, borderColor: '#DCEFF5', gap: 7,
      }}>
        {isOperator && businessName ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Building2 size={15} color="#009DB7" strokeWidth={2} />
            <Body size={13} colour={color.neutral800} style={{ flex: 1, fontWeight: '600' }}>
              {t({ en: `Business name: ${businessName}`, th: `ชื่อธุรกิจ: ${businessName}`, zh: `商家名称：${businessName}` })}
            </Body>
          </View>
        ) : null}
        {name ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <UserRound size={15} color="#66869D" strokeWidth={2} />
            <Body size={13} colour={color.neutral700} style={{ flex: 1 }}>
              {isOperator ? t({ en: `Contact person: ${name}`, th: `ผู้รับผิดชอบ: ${name}`, zh: `联系人：${name}` }) : t({ en: `Name: ${name}`, th: `ชื่อ: ${name}`, zh: `姓名：${name}` })}
            </Body>
          </View>
        ) : null}
        {phone ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Phone size={15} color="#66869D" strokeWidth={2} />
            <Body size={13} colour={color.neutral700} style={{ flex: 1 }}>{isOperator ? t({ en: `Business phone: ${phone}`, th: `เบอร์โทรศัพท์ร้านค้า: ${phone}`, zh: `商家电话：${phone}` }) : t({ en: `Phone: ${phone}`, th: `เบอร์โทรศัพท์: ${phone}`, zh: `电话：${phone}` })}</Body>
          </View>
        ) : null}
        {email ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Mail size={15} color="#66869D" strokeWidth={2} />
            <Body size={13} colour={color.neutral700} style={{ flex: 1 }}>{isOperator ? t({ en: `Business email: ${email}`, th: `อีเมลร้านค้า: ${email}`, zh: `商家邮箱：${email}` }) : t({ en: `Email: ${email}`, th: `อีเมล: ${email}`, zh: `邮箱：${email}` })}</Body>
          </View>
        ) : null}
      </View>

      {bio ? (
        <View style={{ marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.sm, backgroundColor: '#F0F9FD' }}>
          <Body size={13} colour="#02637A" style={{ lineHeight: 19 }}>{bio}</Body>
        </View>
      ) : null}
    </Card>
  );
}

function ProfileAction({ Mark, title, note, onPress, tone = '#0077B6', soft = '#E8F7FA' }: {
  Mark: Icon; title: string; note?: string; onPress?: () => void; tone?: string; soft?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => ({
        minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14,
        backgroundColor: pressed ? '#F1F7F9' : '#FFFFFF',
        borderWidth: 1, borderColor: '#DCE8ED', opacity: onPress ? 1 : 0.55,
      })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: soft }}>
        <Mark size={19} color={tone} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1 }}>
        <Heading size={14}>{title}</Heading>
        {note ? <Body size={13} colour={color.neutral600} style={{ marginTop: 2 }}>{note}</Body> : null}
      </View>
      <ChevronRight size={18} color={color.neutral500} />
    </Pressable>
  );
}

function TravellerTools({ onOpenEditProfile, onOpenPassport, onOpenWallet, onOpenMedals, onOpenAccount }: {
  onOpenEditProfile?: () => void; onOpenPassport: () => void; onOpenWallet: () => void; onOpenMedals: () => void; onOpenAccount: () => void;
}) {
  return (
    <Card>
      <Label size={10} tracking={0.12} colour={color.brand} style={{ marginBottom: 12 }}>{t({ en: 'My profile', th: 'เมนูของฉัน', zh: '我的资料' })}</Label>
      <View style={{ gap: 9 }}>
        <ProfileAction Mark={UserRound} title={t({ en: 'Edit personal details', th: 'แก้ไขข้อมูลส่วนตัว', zh: '编辑个人资料' })} onPress={onOpenEditProfile} />
        <ProfileAction Mark={MapPinned} title={t({ en: 'Digital passport', th: 'พาสปอร์ตดิจิทัล', zh: '数字护照' })} onPress={onOpenPassport} />
        <ProfileAction Mark={Leaf} title={t({ en: 'Points and wallet', th: 'คะแนนและกระเป๋าของฉัน', zh: '积分与钱包' })} onPress={onOpenWallet} />
        <ProfileAction Mark={Crown} title={t({ en: 'Medals', th: 'เหรียญรางวัล', zh: '奖章' })} onPress={onOpenMedals} />
        <ProfileAction Mark={Settings} title={t({ en: 'Account and devices', th: 'บัญชีและอุปกรณ์', zh: '账号与设备' })} onPress={onOpenAccount} />
      </View>
    </Card>
  );
}

function OperatorTools({ onOpenAccount, onOpenEditProfile, onOpenShops }: { onOpenAccount: () => void; onOpenEditProfile?: () => void; onOpenShops?: () => void }) {
  return (
    <Card>
      <Label size={10} tracking={0.12} colour="#009DB7" style={{ marginBottom: 12 }}>
        {t({ en: 'Business tools', th: 'เครื่องมือสำหรับผู้ประกอบการ', zh: '商家工具' })}
      </Label>
      <View style={{ gap: 9 }}>
        <ProfileAction Mark={Store} title={t({ en: 'Manage my businesses', th: 'จัดการร้านค้าของฉัน', zh: '管理我的店铺' })} note={t({ en: 'Business details, photos, services, and reviews', th: 'ข้อมูลร้าน รูปภาพ บริการ และรีวิว', zh: '店铺资料、照片、服务和评价' })} onPress={onOpenShops} />
        <ProfileAction Mark={UserRound} title={t({ en: 'Edit operator details', th: 'แก้ไขข้อมูลผู้ประกอบการ', zh: '编辑商家资料' })} onPress={onOpenEditProfile} tone="#7C3AED" soft="#F3E8FF" />
        <ProfileAction Mark={Settings} title={t({ en: 'Account and devices', th: 'บัญชีและอุปกรณ์', zh: '账号与设备' })} onPress={onOpenAccount} tone="#475569" soft="#F1F5F9" />
      </View>
    </Card>
  );
}

function Avatar({ lead, isOperator, profilePhotoUrl }: { lead: Companion | null; isOperator?: boolean; profilePhotoUrl?: string | null }) {
  const said = lead
    ? `${companionName(lead)}, ${t(STAGE_LABEL[lead.stage])}`
    : isOperator
      ? 'ผู้ประกอบการ'
      : t(strings.profile.traveller);
  return (
    <View
      accessibilityLabel={said}
      style={[shadow.card, {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: lead?.stage === 'grown' ? color.accent100 : isOperator ? '#E0F5F9' : color.neutral100,
        borderWidth: 3, borderColor: color.surface,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }]}
    >
      {profilePhotoUrl ? <Image source={{ uri: profilePhotoUrl }} style={{ width: '100%', height: '100%' }} /> : lead ? (
        <Creature species={lead.species.key} stage={lead.stage} size={56} />
      ) : isOperator ? (
        <Store size={30} color="#009DB7" strokeWidth={2} />
      ) : (
        <UserRound size={30} color={color.neutral600} strokeWidth={1.8} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// How far: lifetime EXP, the level bar, the distance to the next rank
// ---------------------------------------------------------------------------

function Experience({ wallet }: { wallet: Wallet }) {
  const p = wallet.progression;
  const pct = levelProgressPct(p.exp);
  const toRank = p.nextRankAtLevel === null ? null : Math.max(0, expAtLevel(p.nextRankAtLevel) - p.exp);
  const b = bar(pct, color.gold, 10);
  return (
    <Card>
      <Label size={10} tracking={0.14}>{t(strings.profile.experience)}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
        <Heading size={34} tracking={-0.7}>{formatInteger(p.exp)}</Heading>
        <Label size={11} tracking={0.1} colour={color.goldDeep}>EXP</Label>
        <View style={{ flex: 1 }} />
        <Label size={11} tracking={0} colour={color.goldDeep} style={{ textTransform: 'none' }}>{`${pct}%`}</Label>
      </View>
      <View style={[b.track, { marginTop: 8 }]}><View style={b.fill} /></View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
        <Label size={9} tracking={0.06} colour={color.neutral700} style={{ textTransform: 'none' }}>
          {t(strings.wallet.levelBar(p.intoLevel, p.levelSpan))}
        </Label>
        <Label size={9} tracking={0.06} colour={color.neutral700} style={{ textTransform: 'none', flexShrink: 1, textAlign: 'right' }}>
          {p.nextRank && toRank !== null
            ? t(strings.profile.expToRank(toRank, t(p.nextRank.label)))
            : t(strings.wallet.topRank)}
        </Label>
      </View>
      <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 6 }}>
        {t(strings.wallet.expNote)}
      </Label>
    </Card>
  );
}

/** The five ranks as a path: earned marks filled, the current one ringed, the rest to come. */
function RankPath({ wallet }: { wallet: Wallet }) {
  const p = wallet.progression;
  const n = p.ladder.length;
  const current = Math.max(0, p.ladder.findIndex((r) => r.key === p.rank.key));
  // Centres sit at (2i + 1) / 2n of the row; the line runs centre to centre.
  const edge = 100 / (2 * n);
  const reached = (current * 100) / n;
  return (
    <Card>
      <Label size={10} tracking={0.14}>{t(strings.profile.ranks)}</Label>
      <View style={{ marginTop: 14 }}>
        <View style={{ position: 'absolute', top: 19, height: 2, left: `${edge}%` as `${number}%`, right: `${edge}%` as `${number}%`, backgroundColor: color.neutral300 }} />
        <View style={{ position: 'absolute', top: 19, height: 2, left: `${edge}%` as `${number}%`, width: `${reached}%` as `${number}%`, backgroundColor: color.gold }} />
        <View style={{ flexDirection: 'row' }}>
          {p.ladder.map((rank) => <RankMark key={rank.key} rank={rank} current={rank.key === p.rank.key} />)}
        </View>
      </View>
    </Card>
  );
}

function RankMark({ rank, current }: { rank: Wallet['progression']['ladder'][number]; current: boolean }) {
  const Mark = RANK_ICON[rank.key];
  const state = rank.earned ? t(strings.profile.reached) : t(strings.profile.lockedUntil(rank.fromLevel));
  return (
    <View accessibilityLabel={`${t(rank.label)}, ${state}`} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
          backgroundColor: rank.earned ? color.gold : color.surface,
          borderWidth: current ? 3 : layout.ruleStrong,
          borderColor: rank.earned ? (current ? color.goldDeep : color.gold) : color.neutral400,
        }}
      >
        <Mark size={18} color={rank.earned ? onFill.gold : color.neutral500} strokeWidth={2} />
      </View>
      <Label
        size={9}
        tracking={0.04}
        colour={current ? color.goldDeep : rank.earned ? color.text : color.neutral500}
        style={{ textAlign: 'center', textTransform: 'none' }}
      >
        {t(rank.label)}
      </Label>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Where they stand: the only ranking this product draws, and its basis
// ---------------------------------------------------------------------------

function StandingBlock({ standing }: { standing: Async<StandingView> }) {
  return (
    <Card>
      <Label size={10} tracking={0.14}>{t(strings.profile.standing)}</Label>
      {standing.error ? <ErrorState message={standing.error} onRetry={standing.reload} /> : null}
      {standing.loading && !standing.data ? <LoadingState /> : null}
      {standing.data ? <StandingBody data={standing.data} /> : null}
    </Card>
  );
}

function StandingBody({ data }: { data: StandingView }) {
  const { you, participants, position } = data;
  const ranked = position !== null && isRankable(participants);
  return (
    <>
      {ranked ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <Heading size={34} tracking={-0.7} colour={color.accent700}>{`#${position}`}</Heading>
          <Body size={14} colour={color.neutral700}>{t(strings.profile.of(participants))}</Body>
        </View>
      ) : (
        <Body size={14} colour={color.neutral800} style={{ marginTop: 6 }}>
          {position === null
            ? t(strings.profile.noVerifiedYet)
            : t(strings.profile.notRankable(participants, MIN_FOR_RANKING))}
        </Body>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Stat value={formatInteger(you?.greenVerified ?? 0)} unit="G" label={t(strings.profile.verifiedPoints)} tone={color.accent700} />
        <Stat value={String(you?.missionsVerified ?? 0)} unit="" label={t(strings.profile.missionsVerified)} tone={color.text} />
      </View>
      {/* The basis, on the screen rather than assumed - the reading this ranking most needs to prevent is "points". */}
      <Label size={9} tracking={0.04} colour={color.neutral600} style={{ marginTop: 10, textTransform: 'none' }}>
        {t(data.rankedBy)}
      </Label>
    </>
  );
}

function Stat({ value, unit, label, tone }: { value: string; unit: string; label: string; tone: string }) {
  return (
    <View style={{ flex: 1, padding: 12, backgroundColor: color.neutral100, borderRadius: radius.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Heading size={20} colour={tone}>{value}</Heading>
        {unit ? <Label size={9} tracking={0.08} colour={color.neutral600}>{unit}</Label> : null}
      </View>
      <Label size={9} tracking={0.06} colour={color.neutral700} style={{ marginTop: 4, textTransform: 'none' }}>{label}</Label>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Medals: for going to places
// ---------------------------------------------------------------------------

/** How many medals the profile shows before "see all" takes over. */
const MEDALS_ON_PROFILE = 6;

/**
 * Earned first, then the nearest to being earned, then the catalogue's
 * order - so the six on the profile are the six with something to say.
 */
export function medalsToShow(medals: readonly MedalState[], limit = MEDALS_ON_PROFILE): MedalState[] {
  const ratio = (m: MedalState) => (m.progress.total > 0 ? m.progress.done / m.progress.total : 0);
  return medals
    .map((m, i) => ({ m, i }))
    .sort((a, b) => Number(b.m.earned) - Number(a.m.earned) || ratio(b.m) - ratio(a.m) || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.m);
}

const medalStatus = (m: MedalState): string => {
  if (m.earned) return t(strings.medals.earned);
  return m.progress.unit === 'areas'
    ? t(strings.medals.areas(m.progress.done, m.progress.total))
    : t(strings.medals.places(m.progress.done, m.progress.total));
};

function MedalsBlock({ medals, onSeeAll }: { medals: Async<MedalsView>; onSeeAll: () => void }) {
  const data = medals.data;
  const title = t(strings.medals.context);
  return (
    <View style={{ paddingTop: 18 }}>
      <View style={{ paddingHorizontal: gutter, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Heading size={16}>{title}</Heading>
        <Pressable
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`${t(strings.common.seeAll)}: ${title}`}
          style={{ minHeight: 28, justifyContent: 'center' }}
        >
          <Label size={10} tracking={0.1} colour={color.brand}>
            {data ? `${data.earned}/${data.total} · ${t(strings.common.seeAll)}` : t(strings.common.seeAll)}
          </Label>
        </Pressable>
      </View>
      {medals.error ? <ErrorState message={medals.error} onRetry={medals.reload} /> : null}
      {data ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: gutter, marginTop: 8 }}>
          {medalsToShow(data.medals).map((m) => (
            <Pressable
              key={m.key}
              onPress={onSeeAll}
              accessibilityRole="button"
              accessibilityLabel={`${t(m.name)}, ${medalStatus(m)}`}
              style={[shadow.card, {
                flexBasis: '30%', flexGrow: 1, alignItems: 'center', padding: 12,
                backgroundColor: color.surface, borderRadius: radius.md,
                borderWidth: m.earned ? layout.ruleStrong : 1, borderColor: m.earned ? color.gold : color.neutral300,
              }]}
            >
              <MedalMark mark={m.mark} earned={m.earned} size={60} />
              <Heading size={13} style={{ marginTop: 8, textAlign: 'center' }}>{t(m.name)}</Heading>
              <Label size={9} tracking={0.1} colour={m.earned ? color.goldDeep : color.neutral600} style={{ marginTop: 2, textTransform: 'none' }}>
                {medalStatus(m)}
              </Label>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// What their visits grew
// ---------------------------------------------------------------------------

function CompanionsBlock({
  companions, onOpenCompanion, onSeeAll,
}: {
  companions: Async<CompanionsView>;
  onOpenCompanion: (c: Companion) => void;
  onSeeAll: () => void;
}) {
  const data = companions.data;
  const title = t(strings.profile.companions);
  return (
    <View style={{ paddingTop: 18 }}>
      <View style={{ paddingHorizontal: gutter, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Heading size={16}>{title}</Heading>
        <Pressable
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`${t(strings.common.seeAll)}: ${title}`}
          style={{ minHeight: 28, justifyContent: 'center' }}
        >
          <Label size={10} tracking={0.1} colour={color.brand}>
            {data ? `${data.summary.found}/${data.summary.total} · ${t(strings.common.seeAll)}` : t(strings.common.seeAll)}
          </Label>
        </Pressable>
      </View>

      {companions.error ? <ErrorState message={companions.error} onRetry={companions.reload} /> : null}
      {data && data.companions.length === 0 ? (
        // Not five locked slots: an empty collection with a lever you cannot see is the shape of a slot machine.
        <Body size={13} colour={color.neutral700} style={{ paddingHorizontal: gutter, marginTop: 8 }}>
          {t(strings.profile.companionsEmpty)}
        </Body>
      ) : null}
      {data && data.companions.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: gutter, marginTop: 8 }}>
          {data.companions.map((c) => (
            <CompanionTile key={c.species.key} companion={c} onPress={() => onOpenCompanion(c)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CompanionTile({ companion: c, onPress }: { companion: Companion; onPress: () => void }) {
  const name = companionName(c);
  const grown = c.stage === 'grown';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${t(STAGE_LABEL[c.stage])}`}
      style={[shadow.card, {
        flexBasis: '30%', flexGrow: 1, alignItems: 'center', padding: 12,
        backgroundColor: color.surface, borderRadius: radius.md,
        borderWidth: grown ? layout.ruleStrong : 1, borderColor: grown ? color.accent : color.neutral300,
      }]}
    >
      <View
        style={{
          width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
          backgroundColor: grown ? color.accent100 : color.neutral100,
        }}
      >
        <Creature species={c.species.key} stage={c.stage} size={48} />
      </View>
      <Heading size={13} style={{ marginTop: 8, textAlign: 'center' }}>{name}</Heading>
      <Label size={9} tracking={0.1} colour={grown ? color.accent700 : color.neutral600} style={{ marginTop: 2 }}>
        {t(STAGE_LABEL[c.stage])}
      </Label>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// What follows them everywhere: the verified purse and the passport
// ---------------------------------------------------------------------------

function Figures({
  wallet, passport, onOpenWallet, onOpenPassport,
}: {
  wallet: Async<Wallet>;
  passport: Async<{ visited: string[] }>;
  onOpenWallet: () => void;
  onOpenPassport: () => void;
}) {
  const green = wallet.data?.balances.green ?? null;
  const stamps = passport.data ? passportProgress(passport.data.visited) : null;
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: gutter, marginTop: 18 }}>
      <Tile
        Mark={Leaf}
        tone={color.accent700}
        soft={color.accent100}
        value={green === null ? '—' : formatInteger(green)}
        unit="G"
        label={t(strings.common.greenPoints)}
        note={t(strings.common.greenPointsNote)}
        onPress={onOpenWallet}
      />
      <Tile
        Mark={MapPinned}
        // The passport's colour wherever it appears: Collect's door is lilac.
        tone={tint.lilac.ink}
        soft={tint.lilac.fill}
        value={stamps ? String(stamps.visited) : '—'}
        unit={stamps ? `/ ${stamps.total}` : ''}
        label={t(strings.profile.passport)}
        note={t(strings.profile.provinces)}
        onPress={onOpenPassport}
      />
    </View>
  );
}

/** One figure in a tappable card. `—` when unknown, which is not the same as 0. */
function Tile({
  Mark, tone, soft, value, unit, label, note, onPress,
}: {
  Mark: Icon; tone: string; soft: string; value: string; unit: string; label: string; note: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value} ${unit}`.trim()}
      style={[shadow.card, { flex: 1, minHeight: 44, padding: 14, backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: '#DCEFF5' }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: soft }}>
          <Mark size={16} color={tone} strokeWidth={2} />
        </View>
        <Label size={9} tracking={0.08} colour={color.neutral700} style={{ flex: 1 }}>{label}</Label>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 10 }}>
        <Heading size={24} colour={tone}>{value}</Heading>
        {unit ? <Label size={10} tracking={0.08} colour={color.neutral600}>{unit}</Label> : null}
      </View>
      <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 4, textTransform: 'none' }}>{note}</Label>
    </Pressable>
  );
}
