/**
 * ChivarGo Registration Screen
 *
 * Designed to reproduce the visual identity of the ChivarGo mobile design reference:
 * - Brand palette: Deep teal (#006A83), Primary teal (#009DB7), Cyan accent (#26B6D8), Action blue (#168BE0)
 * - Header with back button, official ChivarGo logo, tagline "GO FURTHER TOGETHER",
 *   heading "สมัครสมาชิก", and subtitle "เริ่มต้นการเดินทางไปด้วยกันกับ ChivarGo"
 * - Five input fields with two-line layout:
 *     1. ชื่อ-นามสกุล (Full Name)
 *     2. อีเมล (Email)
 *     3. เบอร์โทรศัพท์ (Phone Number)
 *     4. รหัสผ่าน (Password, min 8 chars, independent eye toggle)
 *     5. ยืนยันรหัสผ่าน (Confirm Password, independent eye toggle)
 * - Terms & Privacy Policy consent checkbox with clickable links
 * - Full-width action button "สมัครสมาชิก" with trailing arrow icon
 * - Social registration with official Google and LINE branding
 * - Navigation link "มีบัญชีอยู่แล้ว? เข้าสู่ระบบ"
 * - Responsive layout supporting viewports from 320px to desktop width
 * - Decorative landscape wave footer matching ChivarGo visual identity
 */

import React from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronLeft,
  Compass,
  Eye,
  EyeOff,
  FileText,
  Lock,
  Mail,
  Shield,
  Smartphone,
  Store,
  UserRound,
  X,
} from 'lucide-react-native';

import chivagoColorLogo from '../../assets/chivago-color-logo.png';
import authTropicalFooter from '../../assets/auth-tropical-footer-v1.png';
import authIslandHero from '../../assets/auth-island-hero.png';
import { api } from '../api/client.ts';
import { finishLineSignIn, lineSignInAvailable, startLineSignIn } from '../api/line-signin.ts';
import { adoptKey, ensureAccount } from '../api/account.ts';
import { setLoggedIn } from '../state/auth.ts';
import { CONSENT_VERSION } from '../state/store.tsx';
import { color, font, radius, shadow } from '../theme/index.ts';
import { t } from '../i18n/locale.ts';

// Official 4-color Google G mark
function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <Path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <Path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <Path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </Svg>
  );
}

// Official green LINE speech bubble mark
function LineIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        fill="#06C755"
        d="M24 10.3c0-4.86-4.98-8.8-11.1-8.8S1.8 5.44 1.8 10.3c0 4.36 3.88 8 9.12 8.66.36.08.84.24.96.54.11.28.07.7-.04 1.1-.15.65-.65 2.53-.74 2.89-.12.48-.06.77.22.86.28.09.6-.04.99-.34.42-.32 4.67-3.17 6.46-5.46 3.42-1.9 5.23-4.57 5.23-7.25z"
      />
      <Path
        fill="#FFFFFF"
        d="M7.74 8.78h-.94c-.23 0-.42.19-.42.42v3.7c0 .23.19.42.42.42h.94c.23 0 .42-.19.42-.42V9.2c0-.23-.19-.42-.42-.42zm2.84 0h-.94c-.23 0-.42.19-.42.42v3.7c0 .23.19.42.42.42h.94c.23 0 .42-.19.42-.42V9.2c0-.23-.19-.42-.42-.42zm6.2 3.26h-1.88V9.2c0-.23-.19-.42-.42-.42h-.94c-.23 0-.42.19-.42.42v3.7c0 .23.19.42.42.42h3.24c.23 0 .42-.19.42-.42v-.44c0-.23-.19-.42-.42-.42zm-3.66-3.26h-.94c-.23 0-.42.19-.42.42v2.22l-1.94-2.48c-.08-.1-.2-.16-.33-.16h-.14c-.23 0-.42.19-.42.42v3.7c0 .23.19.42.42.42h.94c.23 0 .42-.19.42-.42v-2.22l1.94 2.48c.08.1.2.16.33.16h.14c.23 0 .42-.19.42-.42V9.2c0-.23-.19-.42-.42-.42z"
      />
    </Svg>
  );
}

export interface RegisterScreenProps {
  onRegisterSuccess?: (accountType?: 'traveller' | 'operator') => void;
  onLogin?: (accountType?: 'traveller' | 'operator') => void;
  onBack?: () => void;
  initialAccountType?: 'traveller' | 'operator';
}

export function RegisterScreen({
  onRegisterSuccess,
  onLogin,
  onBack,
  initialAccountType = 'traveller',
}: RegisterScreenProps) {
  const { width, height } = useWindowDimensions();
  const isNarrow = width < 380;
  const isSmallMobile = width < 360;
  const isShort = height < 700;
  const isLandscape = width > height && height < 600;
  const isWide = width >= 768 && !isLandscape;
  const isDesktop = width >= 1024;

  // Role / Account Type (นักท่องเที่ยว หรือ ผู้ประกอบการ)
  const [accountType, setAccountType] = React.useState<'traveller' | 'operator'>(
    initialAccountType,
  );

  React.useEffect(() => {
    if (initialAccountType) {
      setAccountType(initialAccountType);
    }
  }, [initialAccountType]);

  const [businessName, setBusinessName] = React.useState('');

  // Form fields
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');

  // Password visibility controls
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  // Consent checkbox
  const [consentAgreed, setConsentAgreed] = React.useState(false);

  // Form states
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [focusedField, setFocusedField] = React.useState<string | null>(null);

  // Modals
  const [termsModalOpen, setTermsModalOpen] = React.useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = React.useState(false);
  const [oauthModalOpen, setOauthModalOpen] = React.useState(false);
  const [oauthProvider, setOauthProvider] = React.useState<'Google' | 'LINE'>('Google');

  const completionValues = [
    ...(accountType === 'operator' ? [businessName.trim()] : []),
    fullName.trim(), email.trim(), phone.trim(), password, confirmPassword,
    consentAgreed ? 'accepted' : '',
  ];
  const completedFields = completionValues.filter(Boolean).length;
  const requiredFields = completionValues.length;
  const completionPercent = Math.round((completedFields / requiredFields) * 100);

  React.useEffect(() => {
    let live = true;
    void finishLineSignIn().then(async (result) => {
      if (!live || result.kind === 'none') return;
      if (result.kind === 'signed-in') {
        await setLoggedIn(true);
        onRegisterSuccess?.('traveller');
        return;
      }
      setErrorMessage(t(result.kind === 'cancelled'
        ? { en: 'LINE registration was cancelled.', th: 'ยกเลิกการสมัครด้วย LINE แล้ว', zh: '已取消使用 LINE 注册。' }
        : { en: 'LINE registration could not be completed.', th: 'สมัครสมาชิกด้วย LINE ไม่สำเร็จ กรุณาลองใหม่', zh: '无法完成 LINE 注册。' }));
    });
    return () => { live = false; };
  }, [onRegisterSuccess]);

  const validate = (): boolean => {
    if (accountType === 'operator') {
      const trimmedBusiness = businessName.trim();
      if (!trimmedBusiness) {
        setErrorMessage(t({ en: 'Enter your business name.', th: 'กรุณากรอกชื่อธุรกิจหรือสถานประกอบการ', zh: '请输入您的商家名称。' }));
        return false;
      }
      if (trimmedBusiness.length < 2) {
        setErrorMessage(t({ en: 'Business name must be at least 2 characters.', th: 'ชื่อธุรกิจหรือสถานประกอบการต้องมีความยาวอย่างน้อย 2 ตัวอักษร', zh: '商家名称至少需要 2 个字符。' }));
        return false;
      }
    }

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setErrorMessage(t({ en: 'Enter your full name.', th: 'กรุณากรอกชื่อ-นามสกุล', zh: '请输入您的姓名。' }));
      return false;
    }
    if (trimmedName.length < 2) {
      setErrorMessage(t({ en: 'Name must be at least 2 characters.', th: 'ชื่อ-นามสกุลต้องมีความยาวอย่างน้อย 2 ตัวอักษร', zh: '姓名至少需要 2 个字符。' }));
      return false;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage(t({ en: 'Enter your email address.', th: 'กรุณากรอกอีเมล', zh: '请输入您的邮箱地址。' }));
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMessage(t({ en: 'Enter a valid email address.', th: 'รูปแบบอีเมลไม่ถูกต้อง', zh: '邮箱地址格式不正确。' }));
      return false;
    }

    const trimmedPhone = phone.trim().replace(/[-\s]/g, '');
    if (!trimmedPhone) {
      setErrorMessage(t({ en: 'Enter your phone number.', th: 'กรุณากรอกเบอร์โทรศัพท์', zh: '请输入您的手机号。' }));
      return false;
    }
    const phoneRegex = /^(\+?[0-9]{8,15})$/;
    if (!phoneRegex.test(trimmedPhone)) {
      setErrorMessage(t({ en: 'Enter a valid phone number.', th: 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง', zh: '手机号格式不正确。' }));
      return false;
    }

    if (!password) {
      setErrorMessage(t({ en: 'Enter a password.', th: 'กรุณากรอกรหัสผ่าน', zh: '请输入密码。' }));
      return false;
    }
    if (password.length < 8) {
      setErrorMessage(t({ en: 'Password must be at least 8 characters.', th: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร', zh: '密码至少需要 8 个字符。' }));
      return false;
    }

    if (!confirmPassword) {
      setErrorMessage(t({ en: 'Confirm your password.', th: 'กรุณากรอกยืนยันรหัสผ่าน', zh: '请确认您的密码。' }));
      return false;
    }
    if (password !== confirmPassword) {
      setErrorMessage(t({ en: 'Passwords do not match.', th: 'รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน', zh: '两次输入的密码不一致。' }));
      return false;
    }

    if (!consentAgreed) {
      setErrorMessage(t({ en: 'Accept the Terms of Service and Privacy Policy to continue.', th: 'กรุณายอมรับข้อตกลงการให้บริการและนโยบายความเป็นส่วนตัว', zh: '请接受服务条款和隐私政策后继续。' }));
      return false;
    }

    setErrorMessage(null);
    return true;
  };

  const registerLock = React.useRef(false);
  const handleRegister = async () => {
    if (registerLock.current || !validate() || loading) return;
    registerLock.current = true;

    setLoading(true);
    setErrorMessage(null);

    try {
      const regRes = await api.registerAccount({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        accountType,
        businessName: accountType === 'operator' ? businessName.trim() : undefined,
      });

      if (!regRes.ok) {
        // The server's own words first, the generic line only as a fallback -
        // the same order LoginScreen uses. "This email is already in use" is
        // the difference between fixing the form and retrying it unchanged.
        setErrorMessage(regRes.error || t({ en: 'Registration failed. Please try again.', th: 'การลงทะเบียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', zh: '注册失败。请重试。' }));
        setLoading(false);
        return;
      }

      await adoptKey(regRes.data.deviceKey);

      // Record PDPA consent version
      try {
        await api.saveProfile({ consentVersion: CONSENT_VERSION });
      } catch {
        // Non-fatal if offline/demo
      }

      await setLoggedIn(true);
      setLoading(false);
      onRegisterSuccess?.(regRes.data.accountType);
    } catch {
      setErrorMessage(t({ en: 'Registration failed. Check your details and try again.', th: 'การลงทะเบียนไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง', zh: '注册失败。请检查您的信息后重试。' }));
      setLoading(false);
    } finally { registerLock.current = false; }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesktop]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Photo hero shared by authentication screens. */}
        <View style={[styles.topSection, isShort && styles.topSectionShort, isLandscape && styles.topSectionLandscape, isWide && styles.topSectionWide, isDesktop && styles.topSectionDesktop]}>
          <Image source={authIslandHero} resizeMode="cover" style={styles.heroImage} />
          <View style={styles.heroShade} />

          {/* Top Bar with Back Button */}
          <View style={styles.topBar}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel={t({ en: 'Go back', th: 'กลับไปยังหน้าก่อนหน้า', zh: '返回上一页' })}
                style={styles.backButton}
              >
                <ChevronLeft size={22} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.backButtonText}>{t({ en: 'Back', th: 'กลับ', zh: '返回' })}</Text>
              </Pressable>
            ) : (
              <View style={{ width: 60 }} />
            )}
          </View>

          {/* Brand Logo & Tagline */}
          <View style={styles.brandingContainer}>
            <Image
              source={chivagoColorLogo}
              style={[
                styles.logoImage,
                isSmallMobile && styles.logoImageSmall,
                isShort && styles.logoImageShort,
                isWide && styles.logoImageWide,
              ]}
              resizeMode="contain"
              accessibilityLabel="ChivarGo"
            />
            <Text style={styles.taglineText}>{t({ en: 'GO FURTHER TOGETHER', th: 'เดินทางไปด้วยกันให้ไกลกว่าเดิม', zh: '同行致远' })}</Text>
          </View>

        </View>

        {/* Center Registration Card */}
        <View
          style={[
            styles.cardWrapper,
            isSmallMobile && styles.cardWrapperSmall,
            isLandscape && styles.cardWrapperLandscape,
            isWide && styles.cardWrapperWide,
            isDesktop && styles.cardWrapperDesktop,
          ]}
        >
          <View
            style={[
              styles.card,
              isSmallMobile && styles.cardSmall,
              isShort && styles.cardShort,
              isWide && styles.cardWide,
              isDesktop && styles.cardDesktop,
            ]}
          >
            {!isDesktop ? <Svg style={styles.organicCurve} width="100%" height="64" viewBox="0 0 400 64" preserveAspectRatio="none" pointerEvents="none">
              <Path d="M0 43 C72 67 252 5 400 17 L400 64 L0 64 Z" fill="#FFFFFF" />
            </Svg> : null}
            <View style={styles.cardHeadingContainer}>
              <Text style={[styles.cardHeadingTitle, isSmallMobile && styles.headingTitleSmall]}>
                {t({ en: 'Create a ChivarGo account', th: 'สร้างบัญชี ChivarGo', zh: '创建 ChivarGo 账户' })}
              </Text>
              <Text style={[styles.cardHeadingSubtitle, isSmallMobile && styles.headingSubtitleSmall]}>
                {t({ en: 'Start collecting experiences across Thailand', th: 'เริ่มสะสมประสบการณ์ทั่วไทย', zh: '开始收集泰国各地的体验' })}
              </Text>
              <View style={styles.travelStamp} pointerEvents="none">
                <Compass size={24} color="#397A8D" strokeWidth={1.8} />
                <Text style={styles.travelStampText}>{t({ en: 'THAILAND\nTRAVEL', th: 'เที่ยว\nไทย', zh: '泰国\n旅行' })}</Text>
              </View>
              <View style={styles.coralSpark} pointerEvents="none"><View style={styles.coralRayTall} /><View style={styles.coralRayShort} /><View style={styles.coralDot} /></View>
              <View style={styles.stepPill}><Text style={styles.stepPillText}>{`${completedFields} / ${requiredFields}`}</Text></View>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${completionPercent}%` }]} /></View>
            </View>
            {/* Error Message Notice */}
            {errorMessage ? (
              <View style={styles.errorNotice} accessibilityLiveRegion="polite">
                <AlertCircle size={16} color="#DC2626" strokeWidth={2.2} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Account Type Selector (นักท่องเที่ยว vs ผู้ประกอบการ) */}
            <View style={styles.roleSelectorContainer}>
              <View
                style={{
                  marginBottom: 10,
                  padding: 10,
                  borderRadius: 12,
                  backgroundColor: '#ECFAFA',
                  borderWidth: 1,
                  borderColor: '#BCE7E5',
                }}
              >
                <Text
                  style={{
                    fontFamily: font.heading,
                    fontSize: 11.5,
                    color: '#087F7C',
                    fontWeight: '700',
                    marginBottom: 2,
                  }}
                >
                  {t({ en: 'Choose your account type', th: 'เลือกประเภทบัญชีของคุณ', zh: '选择您的账户类型' })}
                </Text>
                <Text
                  style={{
                    fontFamily: font.thai,
                    fontSize: 11,
                    color: '#426B72',
                    lineHeight: 16,
                  }}
                >
                  {t({ en: 'Traveller and business accounts have different features and cannot be switched later.', th: 'บัญชีนักท่องเที่ยวและผู้ประกอบการมีฟังก์ชันและหน้าตาการใช้งานแยกจากกันอย่างสิ้นเชิง และไม่สามารถสลับเปลี่ยนประเภทได้ในภายหลัง', zh: '旅行者账户与商家账户的功能不同，注册之后无法再切换类型。' })}
                </Text>
              </View>

              <Text style={styles.roleSectionLabel}>{t({ en: 'Register as', th: 'ลงทะเบียนในฐานะ', zh: '注册身份' })}</Text>
              <View style={styles.roleTabs}>
                <Pressable
                  onPress={() => {
                    setAccountType('traveller');
                    if (errorMessage) setErrorMessage(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: accountType === 'traveller' }}
                  accessibilityLabel={t({ en: 'Traveller', th: 'นักท่องเที่ยว คนเข้ามาเที่ยว', zh: '旅行者' })}
                  style={[
                    styles.roleTab,
                    isSmallMobile && styles.roleTabSmall,
                    accountType === 'traveller' && styles.roleTabActive,
                  ]}
                >
                  <Compass
                    size={isSmallMobile ? 16 : 18}
                    color={accountType === 'traveller' ? '#009DB7' : '#66869D'}
                    strokeWidth={accountType === 'traveller' ? 2.4 : 2}
                  />
                  <Text
                    style={[
                      styles.roleTabText,
                      isSmallMobile && styles.roleTabTextSmall,
                      accountType === 'traveller' && styles.roleTabTextActive,
                    ]}
                  >
                    {t({ en: 'Traveller', th: 'นักท่องเที่ยว', zh: '旅行者' })}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setAccountType('operator');
                    if (errorMessage) setErrorMessage(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: accountType === 'operator' }}
                  accessibilityLabel={t({ en: 'Business operator', th: 'ผู้ประกอบการ ร้านค้า ที่พัก ทัวร์', zh: '商家' })}
                  style={[
                    styles.roleTab,
                    isSmallMobile && styles.roleTabSmall,
                    accountType === 'operator' && styles.roleTabActive,
                  ]}
                >
                  <Store
                    size={isSmallMobile ? 16 : 18}
                    color={accountType === 'operator' ? '#009DB7' : '#66869D'}
                    strokeWidth={accountType === 'operator' ? 2.4 : 2}
                  />
                  <Text
                    style={[
                      styles.roleTabText,
                      isSmallMobile && styles.roleTabTextSmall,
                      accountType === 'operator' && styles.roleTabTextActive,
                    ]}
                  >
                    {t({ en: 'Business operator', th: 'ผู้ประกอบการ', zh: '商家' })}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.roleHintText}>
                {accountType === 'traveller'
                  ? t({ en: 'Explore, join community activities, track your trips, and earn wellness points.', th: 'สัมผัสการเดินทาง กิจกรรมชุมชน บันทึกการเดินทาง และรับคะแนนสุขภาพ', zh: '探索海岛、参与社区活动、记录您的行程，并赚取健康积分。' })
                  : t({ en: 'For accommodation, restaurants, car rental, tours, and other island services.', th: 'สำหรับเจ้าของที่พัก ร้านอาหาร รถเช่า เรือนำเที่ยว หรือบริการบนเกาะ', zh: '适用于住宿、餐厅、租车、旅游团以及其他岛上服务。' })}
              </Text>
            </View>

            {/* Field ผู้ประกอบการ: ชื่อธุรกิจ / สถานประกอบการ (แสดงเฉพาะเมื่อเลือกผู้ประกอบการ) */}
            {accountType === 'operator' ? (
              <View
                style={[
                  styles.fieldContainer,
                  isSmallMobile && styles.fieldContainerSmall,
                  isWide && styles.fieldContainerWide,
                  { marginBottom: 12 },
                  focusedField === 'businessName' && styles.fieldContainerFocused,
                ]}
              >
                <View style={styles.leadingIconSlot}>
                  <Store size={20} color="#009DB7" strokeWidth={2} />
                </View>
                <View style={styles.inputStack}>
                  <Text style={[styles.fieldLabel, isSmallMobile && styles.fieldLabelSmall]}>
                    {t({ en: 'Business name', th: 'ชื่อธุรกิจ / สถานประกอบการ', zh: '商家名称' })}
                  </Text>
                  <TextInput
                    style={[styles.textInput, isSmallMobile && styles.textInputSmall]}
                    placeholder={t({ en: 'e.g. Baan Suan Sichang, Sichang Speedboat Tours', th: 'เช่น บ้านสวนสีชัง, สีชัง สปีดโบ๊ท ทัวร์', zh: '例如：Baan Suan Sichang、Sichang Speedboat Tours' })}
                    placeholderTextColor="#8AA3B5"
                    autoCapitalize="words"
                    autoCorrect={false}
                    value={businessName}
                    onChangeText={(text) => {
                      setBusinessName(text);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    onFocus={() => setFocusedField('businessName')}
                    onBlur={() => setFocusedField(null)}
                    accessibilityLabel={t({ en: 'Business name', th: 'ชื่อธุรกิจหรือสถานประกอบการ', zh: '商家名称' })}
                  />
                </View>
              </View>
            ) : null}

            {/* Field 1: ชื่อ-นามสกุล */}
            <View
              style={[
                styles.fieldContainer,
                isSmallMobile && styles.fieldContainerSmall,
                isWide && styles.fieldContainerWide,
                focusedField === 'fullName' && styles.fieldContainerFocused,
              ]}
            >
              <View style={styles.leadingIconSlot}>
                <UserRound size={20} color="#009DB7" strokeWidth={2} />
              </View>
              <View style={styles.inputStack}>
                <Text style={[styles.fieldLabel, isSmallMobile && styles.fieldLabelSmall]}>
                  {t({ en: 'Full name', th: 'ชื่อ-นามสกุล', zh: '姓名' })}
                </Text>
                <TextInput
                  style={[styles.textInput, isSmallMobile && styles.textInputSmall]}
                  placeholder={t({ en: 'Enter your full name', th: 'กรอกชื่อ-นามสกุลของคุณ', zh: '输入您的姓名' })}
                  placeholderTextColor="#8AA3B5"
                  autoCapitalize="words"
                  autoCorrect={false}
                  value={fullName}
                  onChangeText={(text) => {
                    setFullName(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onFocus={() => setFocusedField('fullName')}
                  onBlur={() => setFocusedField(null)}
                  accessibilityLabel={t({ en: 'Full name', th: 'ชื่อ-นามสกุล', zh: '姓名' })}
                />
              </View>
            </View>

            {/* Field 2: อีเมล */}
            <View
              style={[
                styles.fieldContainer,
                isSmallMobile && styles.fieldContainerSmall,
                isWide && styles.fieldContainerWide,
                { marginTop: 12 },
                focusedField === 'email' && styles.fieldContainerFocused,
              ]}
            >
              <View style={styles.leadingIconSlot}>
                <Mail size={20} color="#009DB7" strokeWidth={2} />
              </View>
              <View style={styles.inputStack}>
                <Text style={[styles.fieldLabel, isSmallMobile && styles.fieldLabelSmall]}>
                  {t({ en: 'Email', th: 'อีเมล', zh: '邮箱' })}
                </Text>
                <TextInput
                  style={[styles.textInput, isSmallMobile && styles.textInputSmall]}
                  placeholder={t({ en: 'Enter your email address', th: 'กรอกอีเมลของคุณ', zh: '输入您的邮箱地址' })}
                  placeholderTextColor="#8AA3B5"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  accessibilityLabel={t({ en: 'Email', th: 'อีเมล', zh: '邮箱' })}
                />
              </View>
            </View>

            {/* Field 3: เบอร์โทรศัพท์ */}
            <View
              style={[
                styles.fieldContainer,
                isSmallMobile && styles.fieldContainerSmall,
                isWide && styles.fieldContainerWide,
                { marginTop: 12 },
                focusedField === 'phone' && styles.fieldContainerFocused,
              ]}
            >
              <View style={styles.leadingIconSlot}>
                <Smartphone size={20} color="#009DB7" strokeWidth={2} />
              </View>
              <View style={styles.inputStack}>
                <Text style={[styles.fieldLabel, isSmallMobile && styles.fieldLabelSmall]}>
                  {t({ en: 'Phone number', th: 'เบอร์โทรศัพท์', zh: '手机号' })}
                </Text>
                <TextInput
                  style={[styles.textInput, isSmallMobile && styles.textInputSmall]}
                  placeholder={t({ en: 'Enter your phone number', th: 'กรอกเบอร์โทรศัพท์ของคุณ', zh: '输入您的手机号' })}
                  placeholderTextColor="#8AA3B5"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onFocus={() => setFocusedField('phone')}
                  onBlur={() => setFocusedField(null)}
                  accessibilityLabel={t({ en: 'Phone number', th: 'เบอร์โทรศัพท์', zh: '手机号' })}
                />
              </View>
            </View>

            {/* Field 4: รหัสผ่าน */}
            <View
              style={[
                styles.fieldContainer,
                isSmallMobile && styles.fieldContainerSmall,
                isWide && styles.fieldContainerWide,
                { marginTop: 12 },
                focusedField === 'password' && styles.fieldContainerFocused,
              ]}
            >
              <View style={styles.leadingIconSlot}>
                <Lock size={20} color="#009DB7" strokeWidth={2} />
              </View>
              <View style={styles.inputStack}>
                <Text style={[styles.fieldLabel, isSmallMobile && styles.fieldLabelSmall]}>
                  {t({ en: 'Password', th: 'รหัสผ่าน', zh: '密码' })}
                </Text>
                <TextInput
                  style={[styles.textInput, isSmallMobile && styles.textInputSmall]}
                  placeholder={t({ en: 'At least 8 characters', th: 'อย่างน้อย 8 ตัวอักษร', zh: '至少 8 个字符' })}
                  placeholderTextColor="#8AA3B5"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  accessibilityLabel={t({ en: 'Password', th: 'รหัสผ่าน', zh: '密码' })}
                />
              </View>
              <Pressable
                onPress={() => setShowPassword((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? t({ en: 'Hide password', th: 'ซ่อนรหัสผ่าน', zh: '隐藏密码' }) : t({ en: 'Show password', th: 'แสดงรหัสผ่าน', zh: '显示密码' })}
                style={styles.eyeButton}
              >
                {showPassword ? (
                  <EyeOff size={19} color="#66869D" strokeWidth={2} />
                ) : (
                  <Eye size={19} color="#66869D" strokeWidth={2} />
                )}
              </Pressable>
            </View>

            {/* Field 5: ยืนยันรหัสผ่าน */}
            <View
              style={[
                styles.fieldContainer,
                isSmallMobile && styles.fieldContainerSmall,
                isWide && styles.fieldContainerWide,
                { marginTop: 12 },
                focusedField === 'confirmPassword' && styles.fieldContainerFocused,
              ]}
            >
              <View style={styles.leadingIconSlot}>
                <Lock size={20} color="#009DB7" strokeWidth={2} />
              </View>
              <View style={styles.inputStack}>
                <Text style={[styles.fieldLabel, isSmallMobile && styles.fieldLabelSmall]}>
                  {t({ en: 'Confirm password', th: 'ยืนยันรหัสผ่าน', zh: '确认密码' })}
                </Text>
                <TextInput
                  style={[styles.textInput, isSmallMobile && styles.textInputSmall]}
                  placeholder={t({ en: 'Enter your password again', th: 'กรอกยืนยันรหัสผ่านอีกครั้ง', zh: '再次输入您的密码' })}
                  placeholderTextColor="#8AA3B5"
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onFocus={() => setFocusedField('confirmPassword')}
                  onBlur={() => setFocusedField(null)}
                  accessibilityLabel={t({ en: 'Confirm password', th: 'ยืนยันรหัสผ่าน', zh: '确认密码' })}
                />
              </View>
              <Pressable
                onPress={() => setShowConfirmPassword((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={showConfirmPassword ? t({ en: 'Hide confirm password', th: 'ซ่อนยืนยันรหัสผ่าน', zh: '隐藏确认密码' }) : t({ en: 'Show confirm password', th: 'แสดงยืนยันรหัสผ่าน', zh: '显示确认密码' })}
                style={styles.eyeButton}
              >
                {showConfirmPassword ? (
                  <EyeOff size={19} color="#66869D" strokeWidth={2} />
                ) : (
                  <Eye size={19} color="#66869D" strokeWidth={2} />
                )}
              </Pressable>
            </View>

            {/* Terms and Privacy Consent */}
            <View style={styles.consentRow}>
              <Pressable
                onPress={() => {
                  setConsentAgreed((prev) => !prev);
                  if (errorMessage) setErrorMessage(null);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consentAgreed }}
                accessibilityLabel={t({ en: 'I accept the Terms of Service and Privacy Policy', th: 'ฉันยอมรับ ข้อตกลงการให้บริการ และ นโยบายความเป็นส่วนตัว', zh: '我接受服务条款和隐私政策' })}
                style={styles.checkboxTouch}
              >
                <View
                  style={[
                    styles.checkboxCircle,
                    consentAgreed && styles.checkboxCircleChecked,
                  ]}
                >
                  {consentAgreed ? <Check size={11} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
              </Pressable>
              <Text style={styles.consentText}>
                {t({ en: 'I accept the ', th: 'ฉันยอมรับ ', zh: '我接受' })}
                <Text
                  style={styles.consentLink}
                  onPress={() => setTermsModalOpen(true)}
                  accessibilityRole="link"
                >
                  {t({ en: 'Terms of Service', th: 'ข้อตกลงการให้บริการ', zh: '服务条款' })}
                </Text>
                {t({ en: ' and ', th: ' และ ', zh: '和' })}
                <Text
                  style={styles.consentLink}
                  onPress={() => setPrivacyModalOpen(true)}
                  accessibilityRole="link"
                >
                  {t({ en: 'Privacy Policy', th: 'นโยบายความเป็นส่วนตัว', zh: '隐私政策' })}
                </Text>
              </Text>
            </View>

            {/* Primary Submit Button */}
            <Pressable
              onPress={handleRegister}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Create account', th: 'สมัครสมาชิก', zh: '创建账户' })}
              style={({ pressed }) => [
                styles.registerButton,
                pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
                loading && { opacity: 0.75 },
              ]}
            >
              <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
                <Defs>
                  <LinearGradient id="btnGrad" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0%" stopColor="#168BE0" />
                    <Stop offset="100%" stopColor="#009DB7" />
                  </LinearGradient>
                </Defs>
                <Path d="M0 0 H1000 V100 H0 Z" fill="url(#btnGrad)" />
              </Svg>

              <View style={styles.registerButtonContent}>
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.registerButtonText}>
                      {accountType === 'operator'
                        ? t({ en: 'Register as a business', th: 'สมัครสมาชิกผู้ประกอบการ', zh: '注册为商家' })
                        : t({ en: 'Register as a traveller', th: 'สมัครสมาชิกนักท่องเที่ยว', zh: '注册为旅行者' })}
                    </Text>
                    <ArrowRight size={19} color="#FFFFFF" strokeWidth={2.4} />
                  </>
                )}
              </View>
            </Pressable>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t({ en: 'or sign up with', th: 'หรือสมัครด้วย', zh: '或使用以下方式注册' })}</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Registration Buttons */}
            <View
              style={[
                styles.socialButtonsContainer,
                isNarrow && { flexDirection: 'column' },
              ]}
            >
              <Pressable
                onPress={() => {
                  setOauthProvider('Google');
                  setOauthModalOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={t({ en: 'Sign up with Google', th: 'สมัครด้วย Google', zh: '使用 Google 注册' })}
                style={({ pressed }) => [
                  styles.socialButton,
                  isNarrow && { minWidth: '100%' },
                  isSmallMobile && styles.socialButtonSmall,
                  pressed && styles.socialButtonPressed,
                ]}
              >
                <GoogleIcon size={19} />
                <Text style={[styles.socialButtonText, isSmallMobile && { fontSize: 12 }]}>
                  {t({ en: 'Sign up with Google', th: 'สมัครด้วย Google', zh: '使用 Google 注册' })}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (accountType === 'traveller' && lineSignInAvailable()) startLineSignIn();
                  else { setOauthProvider('LINE'); setOauthModalOpen(true); }
                }}
                accessibilityRole="button"
                accessibilityLabel={t({ en: 'Sign up with LINE', th: 'สมัครด้วย LINE', zh: '使用 LINE 注册' })}
                style={({ pressed }) => [
                  styles.socialButton,
                  isNarrow && { minWidth: '100%' },
                  isSmallMobile && styles.socialButtonSmall,
                  pressed && styles.socialButtonPressed,
                ]}
              >
                <LineIcon size={20} />
                <Text style={[styles.socialButtonText, isSmallMobile && { fontSize: 12 }]}>
                  {t({ en: 'Sign up with LINE', th: 'สมัครด้วย LINE', zh: '使用 LINE 注册' })}
                </Text>
              </Pressable>
            </View>

            {/* Login Navigation Link */}
            <View style={styles.loginRow}>
              <Text style={styles.loginNoticeText}>{t({ en: 'Already have an account? ', th: 'มีบัญชีอยู่แล้ว? ', zh: '已有账户？' })}</Text>
              <Pressable
                onPress={() => onLogin?.(accountType)}
                accessibilityRole="link"
                accessibilityLabel={
                  accountType === 'operator'
                    ? t({ en: 'Sign in as a business', th: 'เข้าสู่ระบบผู้ประกอบการ', zh: '以商家身份登录' })
                    : t({ en: 'Sign in as a traveller', th: 'เข้าสู่ระบบนักท่องเที่ยว', zh: '以旅行者身份登录' })
                }
                hitSlop={10}
              >
                <Text style={styles.loginLinkText}>
                  {accountType === 'operator'
                    ? t({ en: 'Sign in as a business', th: 'เข้าสู่ระบบผู้ประกอบการ', zh: '以商家身份登录' })
                    : t({ en: 'Sign in as a traveller', th: 'เข้าสู่ระบบนักท่องเที่ยว', zh: '以旅行者身份登录' })}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Decorative Wave Footer with Silhouettes */}
        <View
          style={[
            styles.footerSection,
            isSmallMobile && styles.footerSectionSmall,
            isWide && styles.footerSectionWide,
            isDesktop && styles.desktopDecorationHidden,
          ]}
          pointerEvents="none"
          aria-hidden={true}
        >
          <Image
            source={authTropicalFooter}
            style={[
              styles.footerWaveImage,
              isSmallMobile && styles.footerWaveImageSmall,
              isWide && styles.footerWaveImageWide,
            ]}
            resizeMode="contain"
          />
        </View>
      </ScrollView>

      {/* Terms of Service Modal */}
      <Modal
        visible={termsModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTermsModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <FileText size={22} color="#009DB7" strokeWidth={2.2} />
                <Text style={styles.modalTitle}>{t({ en: 'Terms of Service', th: 'ข้อตกลงการให้บริการ', zh: '服务条款' })}</Text>
              </View>
              <Pressable
                onPress={() => setTermsModalOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t({ en: 'Close', th: 'ปิด', zh: '关闭' })}
                style={styles.closeModalButton}
              >
                <X size={20} color="#66869D" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator>
              <Text style={styles.modalParagraph}>
                {t({ en: 'Welcome to ', th: 'ยินดีต้อนรับสู่ ', zh: '欢迎使用 ' })}<Text style={{ fontFamily: font.heading, color: '#009DB7' }}>ChivarGo</Text>{t({ en: ', a travel and activities platform supporting wellness and local communities.', th: ' แพลตฟอร์มการเดินทางและกิจกรรมเพื่อการดูแลสุขภาวะและชุมชน', zh: '，这是一个支持健康生活与本地社区的旅行与活动平台。' })}
              </Text>
              <Text style={styles.modalSubheading}>{t({ en: '1. Accounts and navigation', th: '1. การใช้งานบัญชีและระบบนำทาง', zh: '1. 账户与导航' })}</Text>
              <Text style={styles.modalParagraph}>
                {t({ en: 'You agree to provide accurate registration details and keep your device credentials secure. Participation in quests must follow safety rules and support constructive community engagement.', th: 'ผู้ใช้บริการตกลงให้ข้อมูลที่ถูกต้องในการลงทะเบียน และรักษาข้อมูลประจำเครื่องอย่างปลอดภัย การเข้าร่วมกิจกรรมภารกิจ (Quests) จะต้องปฏิบัติตามกฎความปลอดภัยและการมีส่วนร่วมอย่างสร้างสรรค์', zh: '您同意提供准确的注册信息，并妥善保管设备凭证。参与任务时必须遵守安全规则，并以建设性的方式参与社区。' })}
              </Text>
              <Text style={styles.modalSubheading}>{t({ en: '2. Wellness scores and safety', th: '2. คะแนนสุขภาพและความปลอดภัย', zh: '2. 健康评分与安全' })}</Text>
              <Text style={styles.modalParagraph}>
                {t({ en: 'Healthy Scores and air or environmental indicators are based on measured data to support travel decisions. Always assess your own condition and follow safety advisories.', th: 'คะแนน Healthy Score และดัชนีอากาศ/สิ่งแวดล้อมประมวลผลจากข้อมูลการตรวจวัดจริงเพื่อสนับสนุนการตัดสินใจในการเดินทาง ผู้ใช้งานควรประเมินสภาพร่างกายและปฏิบัติตามคำเตือนด้านความปลอดภัยเสมอ', zh: '健康评分以及空气或环境指标均基于实测数据，用于辅助您的出行决策。请始终评估自身状况，并遵守安全提示。' })}
              </Text>
            </ScrollView>

            <Pressable
              onPress={() => setTermsModalOpen(false)}
              style={styles.modalPrimaryButton}
            >
              <Text style={styles.modalPrimaryButtonText}>{t({ en: 'I understand and agree', th: 'เข้าใจและยอมรับ', zh: '我已了解并同意' })}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Privacy Policy Modal */}
      <Modal
        visible={privacyModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPrivacyModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Shield size={22} color="#009DB7" strokeWidth={2.2} />
                <Text style={styles.modalTitle}>{t({ en: 'Privacy Policy', th: 'นโยบายความเป็นส่วนตัว', zh: '隐私政策' })}</Text>
              </View>
              <Pressable
                onPress={() => setPrivacyModalOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t({ en: 'Close', th: 'ปิด', zh: '关闭' })}
                style={styles.closeModalButton}
              >
                <X size={20} color="#66869D" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator>
              <Text style={styles.modalParagraph}>
                {t({ en: 'ChivarGo values your privacy and handles personal data in accordance with applicable data protection law (PDPA).', th: 'ChivarGo ให้ความสำคัญสูงสุดกับความเป็นส่วนตัวตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA)', zh: 'ChivarGo 重视您的隐私，并依照适用的个人资料保护法（PDPA）处理个人数据。' })}
              </Text>
              <Text style={styles.modalSubheading}>{t({ en: 'Storage and security (SecureStore)', th: 'การจัดเก็บและรักษาความปลอดภัย (SecureStore)', zh: '存储与安全（SecureStore）' })}</Text>
              <Text style={styles.modalParagraph}>
                {t({ en: 'Credentials and device keys are stored securely in the device Keychain/Keystore. Passwords are not stored as plain text.', th: 'ข้อมูลประจำตัวและกุญแจอุปกรณ์ (Device Key) ถูกจัดเก็บอย่างปลอดภัยในฮาร์ดแวร์ Keychain/Keystore ของอุปกรณ์ ไม่มีการจัดเก็บรหัสผ่านในลักษณะข้อความธรรมดา (Plaintext)', zh: '凭证和设备密钥安全地存储在设备的 Keychain/Keystore 中。密码不会以明文形式保存。' })}
              </Text>
              <Text style={styles.modalSubheading}>{t({ en: 'Location use and your data rights', th: 'การใช้ตำแหน่งและสิทธิของเจ้าของข้อมูล', zh: '位置信息的使用与您的数据权利' })}</Text>
              <Text style={styles.modalParagraph}>
                {t({ en: 'Location data helps show nearby quests and wellness scores. You can request access, correction, or deletion of your account data under your PDPA rights.', th: 'ข้อมูลพิกัดถูกใช้เพื่อระบุตำแหน่งภารกิจและคะแนนสุขภาวะรอบตัวท่านเท่านั้น ท่านมีสิทธิในการเข้าถึง แก้ไข หรือขอลบข้อมูลบัญชีของตนเองได้ตลอดเวลาตามสิทธิ PDPA', zh: '位置数据用于显示附近的任务和健康评分。根据 PDPA 赋予您的权利，您可以随时要求访问、更正或删除您的账户数据。' })}
              </Text>
            </ScrollView>

            <Pressable
              onPress={() => setPrivacyModalOpen(false)}
              style={styles.modalPrimaryButton}
            >
              <Text style={styles.modalPrimaryButtonText}>{t({ en: 'Got it', th: 'รับทราบ', zh: '知道了' })}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* OAuth Notice Modal */}
      <Modal
        visible={oauthModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setOauthModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {oauthProvider === 'Google' ? <GoogleIcon size={22} /> : <LineIcon size={24} />}
                <Text style={styles.modalTitle}>{t({ en: `Sign up with ${oauthProvider}`, th: `สมัครด้วย ${oauthProvider}`, zh: `使用 ${oauthProvider} 注册` })}</Text>
              </View>
              <Pressable
                onPress={() => setOauthModalOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t({ en: 'Close', th: 'ปิด', zh: '关闭' })}
                style={styles.closeModalButton}
              >
                <X size={20} color="#66869D" />
              </Pressable>
            </View>

            <Text style={styles.modalParagraph}>
              {oauthProvider === 'Google'
                ? t({ en: 'Google registration is not enabled on this server.', th: 'เซิร์ฟเวอร์นี้ยังไม่ได้เปิดใช้งานการสมัครด้วย Google', zh: '此服务器尚未启用 Google 注册。' })
                : accountType === 'operator'
                  ? t({ en: 'LINE registration currently creates traveller accounts only. Use the form above to create a business account.', th: 'การสมัครด้วย LINE รองรับบัญชีนักท่องเที่ยวเท่านั้น กรุณาใช้แบบฟอร์มด้านบนเพื่อสร้างบัญชีผู้ประกอบการ', zh: 'LINE 注册目前仅支持旅行者账户。请使用上方表单创建商家账户。' })
                  : t({ en: 'LINE registration is available on the web version when LINE OAuth is configured on the server.', th: 'การสมัครด้วย LINE ใช้งานได้บนเว็บเมื่อเซิร์ฟเวอร์ตั้งค่า LINE OAuth แล้ว', zh: '服务器配置 LINE OAuth 后，可在网页版使用 LINE 注册。' })}
            </Text>
            <Text style={[styles.modalParagraph, { marginTop: 8 }]}>
              {t({ en: 'You can register securely using the form above.', th: 'ท่านสามารถสมัครสมาชิกได้อย่างปลอดภัยโดยใช้แบบฟอร์มลงทะเบียนด้านบนได้ทันที', zh: '您可以使用上方的表单安全地完成注册。' })}
            </Text>

            <Pressable
              onPress={() => setOauthModalOpen(false)}
              style={styles.modalPrimaryButton}
            >
              <Text style={styles.modalPrimaryButtonText}>{t({ en: 'OK', th: 'ตกลง', zh: '确定' })}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#E6F4FA',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  scrollContentDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: '100%',
    backgroundColor: '#F3F9FC',
  },
  topSection: {
    position: 'relative',
    paddingTop: Platform.OS === 'ios' ? 34 : 22,
    paddingBottom: 28,
    minHeight: 242,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(1, 49, 72, 0.42)',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  topBar: {
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  backButtonText: {
    fontFamily: font.thaiSemi,
    fontSize: 14,
    color: '#FFFFFF',
    marginLeft: 2,
  },
  brandingContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  logoImage: {
    width: 122,
    height: 64,
  },
  taglineText: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 2,
    color: 'rgba(255, 255, 255, 0.92)',
    marginTop: 4,
    fontWeight: '600',
  },
  headingContainer: {
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 24,
  },
  headingTitle: {
    fontFamily: font.heading,
    fontSize: 27,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  headingSubtitle: {
    fontFamily: font.thai,
    fontSize: 13.5,
    color: '#C7EEF9',
    textAlign: 'center',
    marginTop: 4,
  },
  cardWrapper: {
    paddingHorizontal: 0,
    marginTop: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 30,
    paddingTop: 28,
    paddingBottom: 24,
    ...shadow.card,
  },
  organicCurve: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -62,
  },
  cardHeadingContainer: {
    marginBottom: 18,
    alignItems: 'flex-start',
    position: 'relative',
    paddingRight: 90,
  },
  cardHeadingTitle: {
    fontFamily: font.heading,
    fontSize: 28,
    lineHeight: 36,
    color: '#123B64',
    letterSpacing: -0.45,
  },
  cardHeadingSubtitle: {
    fontFamily: font.thai,
    fontSize: 14.5,
    color: '#446476',
    marginTop: 2,
  },
  travelStamp: {
    position: 'absolute',
    right: -4,
    top: -16,
    width: 76,
    height: 76,
    borderWidth: 2,
    borderColor: '#70AEBB',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '8deg' }],
    backgroundColor: '#F8FFFF',
  },
  travelStampText: {
    fontFamily: font.mono,
    color: '#397A8D',
    fontSize: 8,
    lineHeight: 9,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 2,
  },
  coralSpark: {
    position: 'absolute',
    right: 72,
    top: -2,
    width: 30,
    height: 30,
  },
  coralRayTall: {
    position: 'absolute', width: 4, height: 14, borderRadius: 2,
    backgroundColor: '#FF7866', transform: [{ rotate: '-24deg' }], left: 12, top: 0,
  },
  coralRayShort: {
    position: 'absolute', width: 4, height: 10, borderRadius: 2,
    backgroundColor: '#FF7866', transform: [{ rotate: '44deg' }], left: 23, top: 8,
  },
  coralDot: {
    position: 'absolute', width: 5, height: 5, borderRadius: 3,
    backgroundColor: '#FF9A78', left: 3, top: 14,
  },
  stepPill: {
    alignSelf: 'center',
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#E4F6F5',
  },
  stepPillText: {
    fontFamily: font.heading,
    color: '#123B64',
    fontSize: 13,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D8EEEF',
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    width: '50%',
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#21ADA7',
  },
  errorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    fontFamily: font.thai,
    fontSize: 12.5,
    color: '#B91C1C',
    flex: 1,
  },
  roleSelectorContainer: {
    marginBottom: 16,
  },
  roleSectionLabel: {
    fontFamily: font.thai,
    fontSize: 13,
    fontWeight: '700',
    color: '#183B56',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  roleTabs: {
    flexDirection: 'row',
    gap: 10,
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: '#F5FBFC',
    borderWidth: 1.5,
    borderColor: '#D8EDF7',
  },
  roleTabActive: {
    backgroundColor: '#E5F8F6',
    borderColor: '#079B98',
    shadowColor: '#079B98',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  roleTabText: {
    fontFamily: font.thai,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#66869D',
  },
  roleTabTextActive: {
    color: '#006A83',
    fontWeight: '700',
  },
  roleHintText: {
    fontFamily: font.thai,
    fontSize: 11.5,
    color: '#66869D',
    marginTop: 6,
    lineHeight: 16,
    paddingHorizontal: 2,
  },
  fieldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 68,
    backgroundColor: '#F5FBFC',
    borderWidth: 1,
    borderColor: '#D8EDF7',
    borderRadius: 22,
    paddingHorizontal: 15,
  },
  fieldContainerFocused: {
    borderColor: '#009DB7',
    backgroundColor: '#FFFFFF',
    shadowColor: '#009DB7',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  leadingIconSlot: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputStack: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },
  fieldLabel: {
    fontFamily: font.heading,
    fontSize: 11,
    color: '#266282',
    marginBottom: 2,
  },
  textInput: {
    fontFamily: font.thai,
    fontSize: 14.5,
    color: '#183B56',
    padding: 0,
    margin: 0,
    height: 24,
  },
  eyeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    paddingHorizontal: 2,
  },
  checkboxTouch: {
    paddingTop: 1,
    paddingRight: 8,
  },
  checkboxCircle: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#66869D',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxCircleChecked: {
    backgroundColor: '#009DB7',
    borderColor: '#009DB7',
  },
  consentText: {
    flex: 1,
    fontFamily: font.thai,
    fontSize: 12.5,
    color: '#183B56',
    lineHeight: 19,
  },
  consentLink: {
    fontFamily: font.thaiSemi,
    color: '#168BE0',
    textDecorationLine: 'underline',
  },
  registerButton: {
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    marginTop: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#168BE0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  registerButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  registerButtonText: {
    fontFamily: font.heading,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
    paddingHorizontal: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#D8EDF7',
  },
  dividerText: {
    fontFamily: font.thai,
    fontSize: 12,
    color: '#8AA3B5',
    marginHorizontal: 12,
  },
  socialButtonsContainer: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  socialButton: {
    flex: 1,
    minWidth: 140,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8EDF7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  socialButtonPressed: {
    backgroundColor: '#F0F9FD',
    borderColor: '#009DB7',
  },
  socialButtonText: {
    fontFamily: font.thaiSemi,
    fontSize: 12.5,
    color: '#183B56',
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  loginNoticeText: {
    fontFamily: font.thai,
    fontSize: 13,
    color: '#66869D',
  },
  loginLinkText: {
    fontFamily: font.heading,
    fontSize: 13.5,
    color: '#168BE0',
  },
  footerSection: {
    width: '100%',
    height: 180,
    marginTop: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  footerWaveImage: {
    width: '100%',
    height: 180,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 43, 66, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    ...shadow.card,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontFamily: font.heading,
    fontSize: 17,
    color: '#183B56',
  },
  closeModalButton: {
    padding: 6,
    borderRadius: 14,
    backgroundColor: '#F0F9FD',
  },
  modalScrollView: {
    maxHeight: 280,
    marginBottom: 16,
  },
  modalSubheading: {
    fontFamily: font.heading,
    fontSize: 13,
    color: '#183B56',
    marginTop: 10,
    marginBottom: 3,
  },
  modalParagraph: {
    fontFamily: font.thai,
    fontSize: 12.5,
    color: '#486581',
    lineHeight: 18,
  },
  modalPrimaryButton: {
    height: 44,
    borderRadius: 22,
    backgroundColor: '#009DB7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryButtonText: {
    fontFamily: font.heading,
    fontSize: 14,
    color: '#FFFFFF',
  },
  // Responsive screen variants
  topSectionWide: {
    paddingTop: 44,
    paddingBottom: 40,
    minHeight: 285,
  },
  topSectionDesktop: {
    width: '44%',
    minHeight: 980,
    paddingTop: 64,
    justifyContent: 'flex-start',
  },
  topSectionShort: {
    minHeight: 210,
    paddingTop: 18,
    paddingBottom: 22,
  },
  topSectionLandscape: {
    minHeight: 178,
    paddingTop: 12,
    paddingBottom: 16,
  },
  logoImageSmall: {
    width: 118,
    height: 60,
  },
  logoImageWide: {
    width: 165,
    height: 84,
  },
  logoImageShort: {
    width: 106,
    height: 56,
  },
  headingTitleSmall: {
    fontSize: 23,
  },
  headingTitleWide: {
    fontSize: 34,
  },
  headingSubtitleSmall: {
    fontSize: 12,
  },
  headingSubtitleWide: {
    fontSize: 15,
  },
  cardWrapperSmall: {
    paddingHorizontal: 0,
  },
  cardWrapperWide: {
    paddingHorizontal: 24,
  },
  cardWrapperDesktop: {
    width: '56%',
    maxWidth: 9999,
    paddingHorizontal: 52,
    paddingVertical: 44,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  cardWrapperLandscape: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  cardSmall: {
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  cardWide: {
    maxWidth: 520,
    paddingHorizontal: 28,
    paddingVertical: 28,
    borderRadius: 28,
  },
  cardDesktop: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    borderRadius: 30,
    paddingHorizontal: 40,
    paddingVertical: 34,
  },
  desktopDecorationHidden: {
    display: 'none',
  },
  cardShort: {
    paddingTop: 22,
    paddingBottom: 18,
  },
  roleTabSmall: {
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 5,
  },
  roleTabTextSmall: {
    fontSize: 12,
  },
  fieldContainerSmall: {
    height: 60,
    paddingHorizontal: 11,
    borderRadius: 16,
  },
  fieldContainerWide: {
    height: 70,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  fieldLabelSmall: {
    fontSize: 10.5,
  },
  textInputSmall: {
    fontSize: 13,
  },
  socialButtonSmall: {
    height: 44,
  },
  footerSectionSmall: {
    height: 110,
  },
  footerSectionWide: {
    height: 170,
    maxWidth: 1600,
    alignSelf: 'center',
  },
  footerWaveImageSmall: {
    height: 110,
  },
  footerWaveImageWide: {
    height: 170,
  },
});
