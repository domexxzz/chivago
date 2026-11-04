/**
 * Chivargo Login Page - Production-Ready Implementation
 *
 * Implements the Chivargo branded authentication interface based on the
 * design specification:
 * - Upper teal-to-deep-blue ocean gradient background
 * - Centered ChivaGo colorful brand logo & "GO FURTHER TOGETHER" tagline
 * - Welcome Back header & Thai subtitle
 * - Clean white card with rounded pill input fields (User & Lock icons)
 * - Password visibility toggle (Eye / EyeOff)
 * - Remember me checkbox & Forgot password recovery link
 * - Primary vibrant blue gradient login button with ArrowRight
 * - Alternative authentication buttons: Google (official 4-color) & LINE (official green)
 * - Registration link ("ยังไม่มีบัญชี? สมัครสมาชิก")
 * - Decorative landscape wave footer with temple stupas, trees, and scooter rider
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
import Svg, { Path } from 'react-native-svg';
import {
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  Compass,
  Eye,
  EyeOff,
  Lock,
  Leaf,
  Mail,
  X,
} from 'lucide-react-native';

import { finishLineSignIn, lineSignInAvailable, startLineSignIn } from '../api/line-signin.ts';
import chivagoColorLogo from '../../assets/chivago-color-logo.png';
import authTropicalFooter from '../../assets/auth-tropical-footer-v1.png';
import authIslandHero from '../../assets/auth-island-hero.png';
import { api } from '../api/client.ts';
import { adoptKey, ensureAccount } from '../api/account.ts';
import { setLoggedIn } from '../state/auth.ts';
import { color, font, radius, shadow } from '../theme/index.ts';
import { t } from '../i18n/locale.ts';

// Vector Google Brand Icon (Official 4-color G mark)
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

// Vector LINE Brand Icon (Official green speech bubble with LINE text)
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

export interface LoginScreenProps {
  onLoginSuccess?: (accountType?: 'traveller' | 'operator') => void;
  onRegister?: () => void;
  onBack?: () => void;
  /** Look around without an account. The link is hidden when absent. */
  onGuest?: () => void;
}

export function LoginScreen({
  onLoginSuccess,
  onRegister,
  onBack,
  onGuest,
}: LoginScreenProps) {
  const { width, height } = useWindowDimensions();
  const isNarrow = width < 380;
  const isSmallMobile = width < 360;
  const isShort = height < 700;
  const isLandscape = width > height && height < 600;
  const isWide = width >= 768 && !isLandscape;
  const isDesktop = width >= 1024;

  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [focusedField, setFocusedField] = React.useState<'identifier' | 'password' | null>(null);

  // Dialog states for informational notices
  const [recoveryModalVisible, setRecoveryModalVisible] = React.useState(false);
  const [oauthNoticeProvider, setOauthNoticeProvider] = React.useState<'Google' | 'LINE' | null>(null);

  /*
    Coming back from LINE. The callback left a single-use link code in the URL
    fragment; this claims it, stores the device key and lets the screen move
    on. A clash is the one case that cannot be resolved here: two travellers
    both have a history, and merging wallets is not something a login screen
    may decide, so it says so and leaves both accounts alone.
  */
  React.useEffect(() => {
    let live = true;
    void finishLineSignIn().then((r) => {
      if (!live || r.kind === 'none') return;
      if (r.kind === 'signed-in') { onLoginSuccess?.('traveller'); return; }
      setErrorMessage(t(
        r.kind === 'clash'
          ? {
            en: 'That LINE account already belongs to another ChivaGo account, and this phone has points of its own. Signing in would have to merge them, which is not possible yet — so nothing was changed.',
            th: 'บัญชี LINE นี้ผูกกับบัญชี ChivaGo อื่นอยู่แล้ว และเครื่องนี้ก็มีแต้มของตัวเอง การเข้าสู่ระบบจะต้องรวมสองบัญชี ซึ่งยังทำไม่ได้ — จึงยังไม่มีอะไรเปลี่ยน',
            zh: '该 LINE 账户已绑定另一个 ChivaGo 账户，而本机也有自己的积分。登录需要合并两个账户，目前尚不支持，因此未做任何更改。',
          }
          : r.kind === 'cancelled'
            ? { en: 'LINE sign-in was cancelled.', th: 'ยกเลิกการเข้าสู่ระบบด้วย LINE แล้ว', zh: '已取消 LINE 登录。' }
            : { en: 'LINE sign-in did not finish. Please try again.', th: 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่', zh: 'LINE 登录未完成，请重试。' },
      ));
    });
    return () => { live = false; };
  }, []);

  const validate = (): boolean => {
    const trimmedId = identifier.trim();
    if (!trimmedId) {
      setErrorMessage(t({ en: 'Enter your username, email or phone number.', th: 'กรุณากรอกชื่อผู้ใช้ อีเมล หรือเบอร์โทรศัพท์', zh: '请输入用户名、邮箱或手机号。' }));
      return false;
    }

    if (!password) {
      setErrorMessage(t({ en: 'Enter your password.', th: 'กรุณากรอกรหัสผ่าน', zh: '请输入您的密码。' }));
      return false;
    }

    if (password.length < 6) {
      setErrorMessage(t({ en: 'Password must be at least 6 characters.', th: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร', zh: '密码至少需要 6 个字符。' }));
      return false;
    }

    setErrorMessage(null);
    return true;
  };

  const loginLock = React.useRef(false);
  const handleLogin = async () => {
    if (loginLock.current || !validate() || loading) return;
    loginLock.current = true;

    setLoading(true);
    setErrorMessage(null);

    try {
      const trimmedId = identifier.trim();
      // The server identifies the account role from the credentials.
      const loginRes = await api.loginAccount({
        identifier: trimmedId,
        password,
      });
      if (loginRes.ok) {
        await adoptKey(loginRes.data.deviceKey);
        await setLoggedIn(true);
        setLoading(false);
        onLoginSuccess?.(loginRes.data.accountType);
        return;
      } else {
        setErrorMessage(loginRes.error || t({ en: 'Sign in failed. Check your details and try again.', th: 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง', zh: '登录失败。请检查您的信息后重试。' }));
        setLoading(false);
        return;
      }
    } catch {
      setErrorMessage(t({ en: 'Sign in failed. Check your details and try again.', th: 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง', zh: '登录失败。请检查您的信息后重试。' }));
      setLoading(false);
    } finally { loginLock.current = false; }
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

          {/* Optional Back Button */}
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Back', th: 'ย้อนกลับ', zh: '返回' })}
              style={styles.backButton}
            >
              <ChevronLeft size={24} color="#FFFFFF" strokeWidth={2.4} />
            </Pressable>
          ) : null}

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
              accessibilityLabel="ChivaGo"
            />
            <Text style={styles.taglineText}>{t({ en: 'GO FURTHER TOGETHER', th: 'เดินทางไปด้วยกันให้ไกลกว่าเดิม', zh: '同行致远' })}</Text>
          </View>

        </View>

        {/* Center Login Form Card */}
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
              <Text style={[styles.cardWelcomeHeading, isSmallMobile && styles.welcomeHeadingSmall]}>
                {t({ en: 'Welcome back', th: 'ยินดีต้อนรับกลับ', zh: '欢迎回来' })}
              </Text>
              <Text style={[styles.cardWelcomeSubtitle, isSmallMobile && styles.welcomeSubtitleSmall]}>
                {t({ en: 'Sign in to continue your journey', th: 'เข้าสู่ระบบเพื่อเดินทางต่อ', zh: '登录以继续旅程' })}
              </Text>
              <View style={styles.travelStamp} pointerEvents="none">
                <Compass size={24} color="#397A8D" strokeWidth={1.8} />
                <Text style={styles.travelStampText}>THAILAND{`\n`}TRAVEL</Text>
              </View>
              <View style={styles.coralSpark} pointerEvents="none"><View style={styles.coralRayTall} /><View style={styles.coralRayShort} /><View style={styles.coralDot} /></View>
            </View>
            {/* Error Message Notice */}
            {errorMessage ? (
              <View style={styles.errorNotice} accessibilityLiveRegion="polite">
                <AlertCircle size={16} color="#DC2626" strokeWidth={2.2} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Email or Phone Input */}
            <View
              style={[
                styles.inputPill,
                isSmallMobile && styles.inputPillSmall,
                focusedField === 'identifier' && styles.inputPillFocused,
              ]}
            >
              <Mail size={19} color="#31536A" strokeWidth={2} />
              <TextInput
                style={[styles.textInput, isSmallMobile && styles.textInputSmall]}
                placeholder={t({ en: 'Email or phone number', th: 'อีเมลหรือเบอร์โทรศัพท์', zh: '邮箱或手机号' })}
                placeholderTextColor="#8E9CA8"
                keyboardType="default"
                autoCapitalize="none"
                autoCorrect={false}
                value={identifier}
                onChangeText={(text) => {
                  setIdentifier(text);
                  if (errorMessage) setErrorMessage(null);
                }}
                onFocus={() => setFocusedField('identifier')}
                onBlur={() => setFocusedField(null)}
                accessibilityLabel={t({ en: 'Email or phone number', th: 'อีเมลหรือเบอร์โทรศัพท์', zh: '邮箱或手机号' })}
              />
            </View>

            {/* Password Input */}
            <View
              style={[
                styles.inputPill,
                { marginTop: 14 },
                isSmallMobile && styles.inputPillSmall,
                focusedField === 'password' && styles.inputPillFocused,
              ]}
            >
              <Lock size={19} color="#718292" strokeWidth={2} />
              <TextInput
                style={[styles.textInput, isSmallMobile && styles.textInputSmall]}
                placeholder={t({ en: 'Password', th: 'รหัสผ่าน', zh: '密码' })}
                placeholderTextColor="#8E9CA8"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (errorMessage) setErrorMessage(null);
                }}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                accessibilityLabel={t({ en: 'Password', th: 'รหัสผ่าน', zh: '密码' })}
              />
              <Pressable
                onPress={() => setShowPassword((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? t({ en: 'Hide password', th: 'ซ่อนรหัสผ่าน', zh: '隐藏密码' }) : t({ en: 'Show password', th: 'แสดงรหัสผ่าน', zh: '显示密码' })}
                style={styles.eyeButton}
              >
                {showPassword ? (
                  <EyeOff size={19} color="#718292" strokeWidth={2} />
                ) : (
                  <Eye size={19} color="#718292" strokeWidth={2} />
                )}
              </Pressable>
            </View>

            <View style={[styles.actionRow, { justifyContent: 'flex-end' }]}>
              <Pressable
                onPress={() => setRecoveryModalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t({ en: 'Forgot password?', th: 'ลืมรหัสผ่าน?', zh: '忘记密码？' })}
              >
                <Text style={[styles.forgotPasswordLink, isSmallMobile && { fontSize: 12 }]}>
                  {t({ en: 'Forgot password?', th: 'ลืมรหัสผ่าน?', zh: '忘记密码？' })}
                </Text>
              </Pressable>
            </View>

            {/* Primary Login Button */}
            <Pressable
              onPress={handleLogin}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Sign in', th: 'เข้าสู่ระบบ', zh: '登录' })}
              style={({ pressed }) => [
                styles.primaryLoginButton,
                isSmallMobile && styles.primaryLoginButtonSmall,
                pressed && styles.primaryLoginButtonPressed,
                loading && styles.primaryLoginButtonDisabled,
              ]}
            >
              {loading ? (
                <View style={styles.buttonInner}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.primaryLoginButtonText}>{t({ en: 'Signing in…', th: 'กำลังเข้าสู่ระบบ...', zh: '正在登录…' })}</Text>
                </View>
              ) : (
                <View style={styles.buttonInner}>
                  <Text style={styles.primaryLoginButtonText}>
                    {t({ en: 'Sign in', th: 'เข้าสู่ระบบ', zh: '登录' })}
                  </Text>
                  <ArrowRight size={18} color="#FFFFFF" strokeWidth={2.4} />
                </View>
              )}
            </Pressable>

            {/* Divider "หรือ" */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t({ en: 'or', th: 'หรือ', zh: '或' })}</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Alternative Authentication: Google */}
            <Pressable
              onPress={() => setOauthNoticeProvider('Google')}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Sign in with Google', th: 'เข้าสู่ระบบด้วย Google', zh: '使用 Google 登录' })}
              style={({ pressed }) => [
                styles.oauthButton,
                isSmallMobile && styles.oauthButtonSmall,
                pressed && styles.oauthButtonPressed,
              ]}
            >
              <GoogleIcon size={19} />
              <Text style={styles.oauthButtonText}>{t({ en: 'Sign in with Google', th: 'เข้าสู่ระบบด้วย Google', zh: '使用 Google 登录' })}</Text>
            </Pressable>

            {/* Alternative Authentication: LINE */}
            <Pressable
              onPress={() => {
                // On the web build this is a real sign-in; on native the
                // redirect flow is not wired, so the notice still stands.
                if (lineSignInAvailable()) startLineSignIn();
                else setOauthNoticeProvider('LINE');
              }}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Sign in with LINE', th: 'เข้าสู่ระบบด้วย LINE', zh: '使用 LINE 登录' })}
              style={({ pressed }) => [
                styles.oauthButton,
                { marginTop: 12 },
                isSmallMobile && styles.oauthButtonSmall,
                pressed && styles.oauthButtonPressed,
              ]}
            >
              <LineIcon size={21} />
              <Text style={styles.oauthButtonText}>{t({ en: 'Sign in with LINE', th: 'เข้าสู่ระบบด้วย LINE', zh: '使用 LINE 登录' })}</Text>
            </Pressable>
          </View>

          {/* Registration Link Footer */}
          <View style={styles.registerRow}>
            <Text style={styles.registerPrompt}>{t({ en: 'New to Chivargo? ', th: 'ยังไม่มีบัญชี? ', zh: '还没有 ChivaGo 账户？' })}</Text>
            <Pressable
              onPress={() => onRegister?.()}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Create an account', th: 'สมัครสมาชิก', zh: '创建账户' })}
            >
              <Text style={styles.registerLink}>{t({ en: 'Create an account', th: 'สมัครสมาชิก', zh: '创建账户' })}</Text>
            </Pressable>
          </View>

          {/* Guest mode: look around without an account */}
          {onGuest ? (
            <Pressable
              onPress={onGuest}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Browse as a guest', th: 'เข้าชมแบบผู้เยี่ยมชม', zh: '以访客身份浏览' })}
              style={({ pressed }) => [styles.guestButton, pressed && { opacity: 0.6 }]}
            >
              <View style={styles.guestIconWrap}>
                <Compass size={20} color="#0077B6" strokeWidth={2.2} />
              </View>
              <View style={styles.guestTextWrap}>
                <Text style={styles.guestButtonText}>{t({ en: 'Continue as a guest', th: 'เข้าชมแบบผู้เยี่ยมชม', zh: '以访客身份继续' })}</Text>
                <Text style={styles.guestButtonHint}>{t({ en: 'Explore before creating an account', th: 'ลองสำรวจแอปก่อนสมัครสมาชิก', zh: '先体验，再创建账户' })}</Text>
              </View>
              <ArrowRight size={18} color="#0077B6" strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.responsibleBadge, isDesktop && styles.desktopDecorationHidden]} pointerEvents="none">
          <Leaf size={21} color="#4F9A48" fill="#77B85D" strokeWidth={1.8} />
          <Text style={styles.responsibleBadgeText}>{t({ en: 'Travel Thailand responsibly', th: 'เที่ยวไทยอย่างรับผิดชอบ', zh: '负责任地畅游泰国' })}</Text>
          <View style={styles.badgeCoralSpark}><View style={styles.coralRayTall} /><View style={styles.coralRayShort} /></View>
        </View>

        {/* Scenic Landscape Waves Footer Illustration */}
        <View style={[styles.footerIllustrationWrapper, isDesktop && styles.desktopDecorationHidden]} pointerEvents="none">
          <Image
            source={authTropicalFooter}
            style={[
              styles.footerIllustration,
              isSmallMobile && styles.footerIllustrationSmall,
              isShort && styles.footerIllustrationShort,
              isWide && styles.footerIllustrationWide,
            ]}
            resizeMode="contain"
            accessibilityLabel="ChivaGo scenic landscape decoration"
          />
        </View>
      </ScrollView>

      {/* Forgot Password / Account Recovery Notice Modal */}
      <Modal
        visible={recoveryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRecoveryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t({ en: 'Account recovery', th: 'การกู้คืนบัญชี', zh: '账户找回' })}</Text>
              <Pressable
                onPress={() => setRecoveryModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={t({ en: 'Close', th: 'ปิด', zh: '关闭' })}
              >
                <X size={20} color="#64748B" />
              </Pressable>
            </View>
            <Text style={styles.modalBody}>
              {t({ en: 'Enter your username, email or phone number to identify your account. Automatic password reset is not available yet, so contact the ChivaGo team for account verification. Never share your password with anyone.', th: 'แจ้งชื่อผู้ใช้ อีเมล หรือเบอร์โทรศัพท์ที่ใช้กับบัญชี ขณะนี้ยังไม่มีระบบรีเซ็ตรหัสผ่านอัตโนมัติ กรุณาติดต่อทีม ChivaGo เพื่อตรวจสอบบัญชี และอย่าส่งรหัสผ่านให้ผู้อื่น', zh: '请提供账户使用的用户名、邮箱或手机号。目前尚不支持自动重置密码，请联系 ChivaGo 团队核实账户。请勿向任何人透露密码。' })}
            </Text>
            <Pressable
              onPress={() => setRecoveryModalVisible(false)}
              style={styles.modalButton}
            >
              <Text style={styles.modalButtonText}>{t({ en: 'Got it', th: 'เข้าใจแล้ว', zh: '知道了' })}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* OAuth Provider Availability Modal */}
      <Modal
        visible={oauthNoticeProvider !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOauthNoticeProvider(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t({ en: `Sign in with ${oauthNoticeProvider}`, th: `เข้าสู่ระบบด้วย ${oauthNoticeProvider}`, zh: `使用 ${oauthNoticeProvider} 登录` })}</Text>
              <Pressable
                onPress={() => setOauthNoticeProvider(null)}
                accessibilityRole="button"
                accessibilityLabel={t({ en: 'Close', th: 'ปิด', zh: '关闭' })}
              >
                <X size={20} color="#64748B" />
              </Pressable>
            </View>
            <Text style={styles.modalBody}>
              {oauthNoticeProvider === 'Google'
                ? t({ en: 'Google sign-in is not enabled on this server.', th: 'เซิร์ฟเวอร์นี้ยังไม่ได้เปิดใช้งานการเข้าสู่ระบบด้วย Google', zh: '此服务器尚未启用 Google 登录。' })
                : t({ en: 'LINE sign-in is available on the web version when LINE OAuth is configured on the server.', th: 'การเข้าสู่ระบบด้วย LINE ใช้งานได้บนเว็บเมื่อเซิร์ฟเวอร์ตั้งค่า LINE OAuth แล้ว', zh: '服务器配置 LINE OAuth 后，可在网页版使用 LINE 登录。' })}
              {'\n\n'}
              {t({ en: 'Sign in with your username, email or phone number and password.', th: 'เข้าสู่ระบบด้วยชื่อผู้ใช้ อีเมล หรือเบอร์โทรศัพท์และรหัสผ่าน', zh: '请使用用户名、邮箱或手机号和密码登录。' })}
            </Text>
            <Pressable
              onPress={() => setOauthNoticeProvider(null)}
              style={styles.modalButton}
            >
              <Text style={styles.modalButtonText}>{t({ en: 'OK', th: 'ตกลง', zh: '确定' })}</Text>
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
    backgroundColor: '#F3F9FC',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  scrollContentDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: '100%',
    backgroundColor: '#F3F9FC',
  },
  topSection: {
    paddingTop: Platform.OS === 'ios' ? 34 : 22,
    paddingBottom: 28,
    minHeight: 242,
    alignItems: 'center',
    position: 'relative',
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
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 48 : 28,
    left: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  brandingContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  logoImage: {
    width: 122,
    height: 72,
  },
  taglineText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    marginTop: 2,
    opacity: 0.95,
  },
  headingContainer: {
    alignItems: 'center',
    marginTop: 24,
  },
  welcomeHeading: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  welcomeSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#E0F5FC',
    marginTop: 5,
  },
  cardWrapper: {
    width: '100%',
    maxWidth: 428,
    alignSelf: 'center',
    paddingHorizontal: 0,
    marginTop: 0,
    zIndex: 5,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 30,
    paddingTop: 28,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(210,235,242,0.9)',
    shadowColor: '#002C48',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  organicCurve: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -62,
  },
  cardHeadingContainer: {
    marginBottom: 20,
    alignItems: 'flex-start',
    position: 'relative',
    paddingRight: 92,
  },
  cardWelcomeHeading: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    color: '#123B64',
    letterSpacing: -0.5,
  },
  cardWelcomeSubtitle: {
    fontSize: 15,
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
    position: 'absolute',
    width: 4,
    height: 14,
    borderRadius: 2,
    backgroundColor: '#FF7866',
    transform: [{ rotate: '-24deg' }],
    left: 12,
    top: 0,
  },
  coralRayShort: {
    position: 'absolute',
    width: 4,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#FF7866',
    transform: [{ rotate: '44deg' }],
    left: 23,
    top: 8,
  },
  coralDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FF9A78',
    left: 3,
    top: 14,
  },
  responsibleBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 20,
    marginBottom: -24,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFF1BD',
    transform: [{ rotate: '-1deg' }],
    zIndex: 2,
  },
  responsibleBadgeText: {
    color: '#123B64',
    fontSize: 14,
    fontWeight: '800',
  },
  badgeCoralSpark: {
    position: 'absolute',
    right: -22,
    top: -9,
    width: 32,
    height: 30,
  },
  errorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F5FBFC',
    borderWidth: 1,
    borderColor: '#D5E9EE',
    paddingHorizontal: 16,
  },
  inputPillFocused: {
    borderColor: '#0077D4',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0077D4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 2,
  },
  textInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#1E293B',
    height: '100%',
  },
  eyeButton: {
    padding: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingHorizontal: 4,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  checkboxCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxCircleChecked: {
    borderColor: '#0077CC',
    backgroundColor: '#0077CC',
  },
  rememberMeText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  forgotPasswordLink: {
    fontSize: 13,
    color: '#0072C6',
    fontWeight: '600',
  },
  primaryLoginButton: {
    marginTop: 20,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#079B98',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#079B98',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryLoginButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  primaryLoginButtonDisabled: {
    opacity: 0.75,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryLoginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E4ECF2',
  },
  dividerText: {
    color: '#7B8E9E',
    fontSize: 12.5,
    fontWeight: '500',
    marginHorizontal: 12,
  },
  oauthButton: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D5E9EE',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#002C48',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  oauthButtonPressed: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  oauthButtonText: {
    color: '#243746',
    fontSize: 14,
    fontWeight: '600',
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 6,
  },
  registerPrompt: {
    color: '#475569',
    fontSize: 13.5,
    fontWeight: '500',
  },
  registerLink: {
    color: '#078F8C',
    fontSize: 13.5,
    fontWeight: '700',
  },
  guestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    minHeight: 68,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#F0FAFD',
    borderWidth: 1.5,
    borderColor: '#81D4E5',
    borderRadius: 18,
  },
  guestButtonText: {
    color: '#075985',
    fontSize: 15,
    fontWeight: '700',
  },
  guestTextWrap: {
    flex: 1,
    gap: 3,
  },
  guestButtonHint: {
    color: '#52748A',
    fontSize: 11.5,
  },
  guestIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D9F3FA',
  },
  footerIllustrationWrapper: {
    width: '100%',
    marginTop: 2,
    alignItems: 'center',
  },
  footerIllustration: {
    width: '100%',
    height: 118,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 20, 35, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalBody: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#475569',
    marginTop: 8,
    marginBottom: 18,
    textAlign: 'center',
  },
  modalButton: {
    backgroundColor: '#0075D3',
    borderRadius: 15,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  // Responsive screen variants
  topSectionWide: {
    paddingTop: 42,
    paddingBottom: 36,
    minHeight: 285,
  },
  topSectionDesktop: {
    width: '45%',
    minHeight: 760,
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
    width: 115,
    height: 76,
  },
  logoImageWide: {
    width: 155,
    height: 102,
  },
  logoImageShort: {
    width: 106,
    height: 62,
  },
  welcomeHeadingSmall: {
    fontSize: 24,
  },
  welcomeHeadingWide: {
    fontSize: 34,
  },
  welcomeSubtitleSmall: {
    fontSize: 12.5,
  },
  welcomeSubtitleWide: {
    fontSize: 15,
  },
  cardWrapperSmall: {
    paddingHorizontal: 0,
  },
  cardWrapperWide: {
    maxWidth: 460,
    paddingHorizontal: 24,
  },
  cardWrapperDesktop: {
    width: '55%',
    maxWidth: 9999,
    paddingHorizontal: 56,
    paddingVertical: 48,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  cardWrapperLandscape: {
    maxWidth: 540,
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
    paddingHorizontal: 28,
    paddingVertical: 28,
    borderRadius: 28,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
  cardDesktop: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderRadius: 30,
    paddingHorizontal: 38,
    paddingVertical: 34,
  },
  desktopDecorationHidden: {
    display: 'none',
  },
  cardShort: {
    paddingTop: 22,
    paddingBottom: 16,
  },
  inputPillSmall: {
    height: 48,
    paddingHorizontal: 13,
  },
  textInputSmall: {
    fontSize: 13,
  },
  primaryLoginButtonSmall: {
    height: 46,
  },
  oauthButtonSmall: {
    height: 44,
  },
  footerIllustrationSmall: {
    height: 104,
  },
  footerIllustrationShort: {
    height: 92,
  },
  footerIllustrationWide: {
    height: 210,
    maxWidth: 1600,
  },
});
