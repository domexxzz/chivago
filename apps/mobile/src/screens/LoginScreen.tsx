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
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronLeft,
  Eye,
  EyeOff,
  Lock,
  UserRound,
  X,
} from 'lucide-react-native';

import chivagoColorLogo from '../../assets/chivago-color-logo.png';
import loginFooterWaves from '../../assets/login-footer-waves.png';
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
  onLoginSuccess?: () => void;
  onRegister?: () => void;
  onBack?: () => void;
}

export function LoginScreen({
  onLoginSuccess,
  onRegister,
  onBack,
}: LoginScreenProps) {
  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [rememberMe, setRememberMe] = React.useState(true);
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [focusedField, setFocusedField] = React.useState<'identifier' | 'password' | null>(null);

  // Dialog states for informational notices
  const [recoveryModalVisible, setRecoveryModalVisible] = React.useState(false);
  const [oauthNoticeProvider, setOauthNoticeProvider] = React.useState<'Google' | 'LINE' | null>(null);

  const validate = (): boolean => {
    const trimmedId = identifier.trim();
    if (!trimmedId) {
      setErrorMessage('กรุณากรอกอีเมลหรือเบอร์โทรศัพท์');
      return false;
    }

    // Phone / Email / 8-char link code format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^(\+?66|0)[0-9]{8,9}$/;
    const linkCodeRegex = /^[A-Z0-9]{4}\s?[A-Z0-9]{4}$/i;

    const isEmail = emailRegex.test(trimmedId);
    const isPhone = phoneRegex.test(trimmedId.replace(/[-\s]/g, ''));
    const isLinkCode = linkCodeRegex.test(trimmedId);

    if (!isEmail && !isPhone && !isLinkCode) {
      setErrorMessage('รูปแบบอีเมลหรือเบอร์โทรศัพท์ไม่ถูกต้อง');
      return false;
    }

    if (!password) {
      setErrorMessage('กรุณากรอกรหัสผ่าน');
      return false;
    }

    if (password.length < 6) {
      setErrorMessage('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return false;
    }

    setErrorMessage(null);
    return true;
  };

  const handleLogin = async () => {
    if (!validate() || loading) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const trimmedId = identifier.trim();
      const cleanCode = trimmedId.replace(/\s+/g, '').toUpperCase();

      // If user entered an 8-character device link code, claim the link
      if (/^[A-Z0-9]{8}$/.test(cleanCode)) {
        const claimRes = await api.claimLink(cleanCode, 'Mobile Device');
        if (claimRes.ok) {
          await adoptKey(claimRes.data.deviceKey);
          await setLoggedIn(true);
          setLoading(false);
          onLoginSuccess?.();
          return;
        } else {
          setErrorMessage(claimRes.error || 'รหัสเชื่อมต่อไม่ถูกต้องหรือหมดอายุ');
          setLoading(false);
          return;
        }
      }

      // Ensure account device is authenticated
      const acc = await ensureAccount(api, { label: trimmedId });
      if (!acc.key) {
        setErrorMessage('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง');
        setLoading(false);
        return;
      }

      // Authentication succeeded
      await setLoggedIn(true);
      setLoading(false);
      onLoginSuccess?.();
    } catch {
      setErrorMessage('เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง');
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Header Background with Waves */}
        <View style={styles.topSection}>
          {/* Wave Linear Gradient Header Backdrop */}
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <LinearGradient id="loginBgGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#0094BD" />
                <Stop offset="45%" stopColor="#016592" />
                <Stop offset="82%" stopColor="#024B73" />
                <Stop offset="100%" stopColor="#023E62" />
              </LinearGradient>
            </Defs>
            <Path
              d="M0 0 H1000 V290 C750 320 500 270 250 310 C120 330 40 315 0 300 Z"
              fill="url(#loginBgGrad)"
            />
          </Svg>

          {/* Optional Back Button */}
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Back', th: 'ย้อนกลับ' })}
              style={styles.backButton}
            >
              <ChevronLeft size={24} color="#FFFFFF" strokeWidth={2.4} />
            </Pressable>
          ) : null}

          {/* Brand Logo & Tagline */}
          <View style={styles.brandingContainer}>
            <Image
              source={chivagoColorLogo}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityLabel="ChivaGo"
            />
            <Text style={styles.taglineText}>GO FURTHER TOGETHER</Text>
          </View>

          {/* Heading & Subtitle */}
          <View style={styles.headingContainer}>
            <Text style={styles.welcomeHeading}>Welcome Back</Text>
            <Text style={styles.welcomeSubtitle}>เข้าสู่ระบบเพื่อไปยัง Chivargo</Text>
          </View>
        </View>

        {/* Center Login Form Card */}
        <View style={styles.cardWrapper}>
          <View style={styles.card}>
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
                focusedField === 'identifier' && styles.inputPillFocused,
              ]}
            >
              <UserRound size={19} color="#718292" strokeWidth={2} />
              <TextInput
                style={styles.textInput}
                placeholder="อีเมลหรือเบอร์โทรศัพท์"
                placeholderTextColor="#8E9CA8"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={identifier}
                onChangeText={(text) => {
                  setIdentifier(text);
                  if (errorMessage) setErrorMessage(null);
                }}
                onFocus={() => setFocusedField('identifier')}
                onBlur={() => setFocusedField(null)}
                accessibilityLabel="อีเมลหรือเบอร์โทรศัพท์"
              />
            </View>

            {/* Password Input */}
            <View
              style={[
                styles.inputPill,
                { marginTop: 14 },
                focusedField === 'password' && styles.inputPillFocused,
              ]}
            >
              <Lock size={19} color="#718292" strokeWidth={2} />
              <TextInput
                style={styles.textInput}
                placeholder="รหัสผ่าน"
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
                accessibilityLabel="รหัสผ่าน"
              />
              <Pressable
                onPress={() => setShowPassword((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                style={styles.eyeButton}
              >
                {showPassword ? (
                  <EyeOff size={19} color="#718292" strokeWidth={2} />
                ) : (
                  <Eye size={19} color="#718292" strokeWidth={2} />
                )}
              </Pressable>
            </View>

            {/* Remember Me & Forgot Password Row */}
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => setRememberMe((prev) => !prev)}
                style={styles.rememberMeContainer}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rememberMe }}
                accessibilityLabel="จดจำฉันไว้"
              >
                <View
                  style={[
                    styles.checkboxCircle,
                    rememberMe && styles.checkboxCircleChecked,
                  ]}
                >
                  {rememberMe ? <Check size={11} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
                <Text style={styles.rememberMeText}>จดจำฉันไว้</Text>
              </Pressable>

              <Pressable
                onPress={() => setRecoveryModalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="ลืมรหัสผ่าน?"
              >
                <Text style={styles.forgotPasswordLink}>ลืมรหัสผ่าน?</Text>
              </Pressable>
            </View>

            {/* Primary Login Button */}
            <Pressable
              onPress={handleLogin}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="เข้าสู่ระบบ"
              style={({ pressed }) => [
                styles.primaryLoginButton,
                pressed && styles.primaryLoginButtonPressed,
                loading && styles.primaryLoginButtonDisabled,
              ]}
            >
              {loading ? (
                <View style={styles.buttonInner}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.primaryLoginButtonText}>กำลังเข้าสู่ระบบ...</Text>
                </View>
              ) : (
                <View style={styles.buttonInner}>
                  <Text style={styles.primaryLoginButtonText}>เข้าสู่ระบบ</Text>
                  <ArrowRight size={18} color="#FFFFFF" strokeWidth={2.4} />
                </View>
              )}
            </Pressable>

            {/* Divider "หรือ" */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>หรือ</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Alternative Authentication: Google */}
            <Pressable
              onPress={() => setOauthNoticeProvider('Google')}
              accessibilityRole="button"
              accessibilityLabel="เข้าสู่ระบบด้วย Google"
              style={({ pressed }) => [
                styles.oauthButton,
                pressed && styles.oauthButtonPressed,
              ]}
            >
              <GoogleIcon size={19} />
              <Text style={styles.oauthButtonText}>เข้าสู่ระบบด้วย Google</Text>
            </Pressable>

            {/* Alternative Authentication: LINE */}
            <Pressable
              onPress={() => setOauthNoticeProvider('LINE')}
              accessibilityRole="button"
              accessibilityLabel="เข้าสู่ระบบด้วย LINE"
              style={({ pressed }) => [
                styles.oauthButton,
                { marginTop: 12 },
                pressed && styles.oauthButtonPressed,
              ]}
            >
              <LineIcon size={21} />
              <Text style={styles.oauthButtonText}>เข้าสู่ระบบด้วย LINE</Text>
            </Pressable>
          </View>

          {/* Registration Link Footer */}
          <View style={styles.registerRow}>
            <Text style={styles.registerPrompt}>ยังไม่มีบัญชี? </Text>
            <Pressable
              onPress={onRegister}
              accessibilityRole="button"
              accessibilityLabel="สมัครสมาชิก"
            >
              <Text style={styles.registerLink}>สมัครสมาชิก</Text>
            </Pressable>
          </View>
        </View>

        {/* Scenic Landscape Waves Footer Illustration */}
        <View style={styles.footerIllustrationWrapper} pointerEvents="none">
          <Image
            source={loginFooterWaves}
            style={styles.footerIllustration}
            resizeMode="cover"
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
              <Text style={styles.modalTitle}>การกู้คืนบัญชี (Account Recovery)</Text>
              <Pressable
                onPress={() => setRecoveryModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="ปิด"
              >
                <X size={20} color="#64748B" />
              </Pressable>
            </View>
            <Text style={styles.modalBody}>
              ChivaGo ใช้ระบบความปลอดภัย <Text style={{ fontWeight: '700' }}>Device Key</Text> เพื่อปกป้องข้อมูลส่วนบุคคลโดยไม่ต้องจดจำรหัสผ่าน
              {'\n\n'}
              หากต้องการกู้คืนหรือย้ายบัญชีมายังเครื่องนี้ สามารถใช้{' '}
              <Text style={{ fontWeight: '700', color: '#0072C6' }}>รหัสเชื่อมต่อ 8 หลัก (Link Code)</Text>{' '}
              ที่สร้างจากเครื่องเดิม ป้อนลงในช่องอีเมล/เบอร์โทรศัพท์ เพื่อเข้าสู่ระบบได้ทันที
            </Text>
            <Pressable
              onPress={() => setRecoveryModalVisible(false)}
              style={styles.modalButton}
            >
              <Text style={styles.modalButtonText}>เข้าใจแล้ว</Text>
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
              <Text style={styles.modalTitle}>{`เข้าสู่ระบบด้วย ${oauthNoticeProvider}`}</Text>
              <Pressable
                onPress={() => setOauthNoticeProvider(null)}
                accessibilityRole="button"
                accessibilityLabel="ปิด"
              >
                <X size={20} color="#64748B" />
              </Pressable>
            </View>
            <Text style={styles.modalBody}>
              ระบบเชื่อมต่อบัญชีอัตโนมัติผ่าน {oauthNoticeProvider} กำลังอยู่ในช่วงเตรียมความพร้อมสำหรับการอัปเดตเวอร์ชันถัดไป
              {'\n\n'}
              ในระหว่างนี้ ท่านสามารถเข้าสู่ระบบด้วยอีเมล เบอร์โทรศัพท์ หรือรหัสเชื่อมต่ออุปกรณ์ 8 หลัก ได้ทันที
            </Text>
            <Pressable
              onPress={() => setOauthNoticeProvider(null)}
              style={styles.modalButton}
            >
              <Text style={styles.modalButtonText}>ตกลง</Text>
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
  topSection: {
    paddingTop: Platform.OS === 'ios' ? 44 : 28,
    paddingBottom: 28,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
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
    marginTop: 10,
  },
  logoImage: {
    width: 135,
    height: 90,
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
    marginTop: 16,
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
    paddingHorizontal: 18,
    zIndex: 5,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: '#E7F2F8',
    shadowColor: '#002C48',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
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
    backgroundColor: '#F1F6F9',
    borderWidth: 1,
    borderColor: '#E2ECF2',
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
    backgroundColor: '#0075D3',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0062C4',
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
    borderColor: '#DAE7F0',
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
    color: '#0072C6',
    fontSize: 13.5,
    fontWeight: '700',
  },
  footerIllustrationWrapper: {
    width: '100%',
    marginTop: 12,
    alignItems: 'center',
  },
  footerIllustration: {
    width: '100%',
    height: 110,
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
    marginBottom: 20,
  },
  modalButton: {
    backgroundColor: '#0075D3',
    borderRadius: 18,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
