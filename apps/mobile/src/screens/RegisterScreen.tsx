/**
 * Chivargo Registration Screen
 *
 * Designed to reproduce the visual identity of the Chivargo mobile design reference:
 * - Brand palette: Deep teal (#006A83), Primary teal (#009DB7), Cyan accent (#26B6D8), Action blue (#168BE0)
 * - Header with back button, official Chivargo logo, tagline "GO FURTHER TOGETHER",
 *   heading "สมัครสมาชิก", and subtitle "เริ่มต้นการเดินทางไปด้วยกันกับ Chivargo"
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
 * - Decorative landscape wave footer matching Chivargo visual identity
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
import loginFooterWaves from '../../assets/login-footer-waves.png';
import { api } from '../api/client.ts';
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
  onRegisterSuccess?: () => void;
  onLogin?: () => void;
  onBack?: () => void;
}

export function RegisterScreen({
  onRegisterSuccess,
  onLogin,
  onBack,
}: RegisterScreenProps) {
  // Role / Account Type (นักท่องเที่ยว หรือ ผู้ประกอบการ)
  const [accountType, setAccountType] = React.useState<'traveller' | 'operator'>('traveller');
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

  const validate = (): boolean => {
    if (accountType === 'operator') {
      const trimmedBusiness = businessName.trim();
      if (!trimmedBusiness) {
        setErrorMessage('กรุณากรอกชื่อธุรกิจหรือสถานประกอบการ');
        return false;
      }
      if (trimmedBusiness.length < 2) {
        setErrorMessage('ชื่อธุรกิจหรือสถานประกอบการต้องมีความยาวอย่างน้อย 2 ตัวอักษร');
        return false;
      }
    }

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setErrorMessage('กรุณากรอกชื่อ-นามสกุล');
      return false;
    }
    if (trimmedName.length < 2) {
      setErrorMessage('ชื่อ-นามสกุลต้องมีความยาวอย่างน้อย 2 ตัวอักษร');
      return false;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('กรุณากรอกอีเมล');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMessage('รูปแบบอีเมลไม่ถูกต้อง');
      return false;
    }

    const trimmedPhone = phone.trim().replace(/[-\s]/g, '');
    if (!trimmedPhone) {
      setErrorMessage('กรุณากรอกเบอร์โทรศัพท์');
      return false;
    }
    const phoneRegex = /^(\+?[0-9]{8,15})$/;
    if (!phoneRegex.test(trimmedPhone)) {
      setErrorMessage('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง');
      return false;
    }

    if (!password) {
      setErrorMessage('กรุณากรอกรหัสผ่าน');
      return false;
    }
    if (password.length < 8) {
      setErrorMessage('รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
      return false;
    }

    if (!confirmPassword) {
      setErrorMessage('กรุณากรอกยืนยันรหัสผ่าน');
      return false;
    }
    if (password !== confirmPassword) {
      setErrorMessage('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
      return false;
    }

    if (!consentAgreed) {
      setErrorMessage('กรุณายอมรับข้อตกลงการให้บริการและนโยบายความเป็นส่วนตัว');
      return false;
    }

    setErrorMessage(null);
    return true;
  };

  const handleRegister = async () => {
    if (!validate() || loading) return;

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
        setErrorMessage(regRes.error || 'การลงทะเบียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
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
      onRegisterSuccess?.();
    } catch {
      setErrorMessage('การลงทะเบียนไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง');
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
        {/* Top Header Section with Waves */}
        <View style={styles.topSection}>
          {/* Wave Linear Gradient Header Backdrop */}
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <LinearGradient id="regBgGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#0094BD" />
                <Stop offset="45%" stopColor="#016592" />
                <Stop offset="82%" stopColor="#024B73" />
                <Stop offset="100%" stopColor="#023E62" />
              </LinearGradient>
            </Defs>
            <Path
              d="M0 0 H1000 V270 C750 310 500 260 250 295 C120 315 40 305 0 285 Z"
              fill="url(#regBgGrad)"
            />
          </Svg>

          {/* Top Bar with Back Button */}
          <View style={styles.topBar}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel="กลับไปยังหน้าก่อนหน้า"
                style={styles.backButton}
              >
                <ChevronLeft size={22} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.backButtonText}>กลับ</Text>
              </Pressable>
            ) : (
              <View style={{ width: 60 }} />
            )}
          </View>

          {/* Brand Logo & Tagline */}
          <View style={styles.brandingContainer}>
            <Image
              source={chivagoColorLogo}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityLabel="Chivargo"
            />
            <Text style={styles.taglineText}>GO FURTHER TOGETHER</Text>
          </View>

          {/* Heading & Subtitle */}
          <View style={styles.headingContainer}>
            <Text style={styles.headingTitle}>สมัครสมาชิก</Text>
            <Text style={styles.headingSubtitle}>เริ่มต้นการเดินทางไปด้วยกันกับ Chivargo</Text>
          </View>
        </View>

        {/* Center Registration Card */}
        <View style={styles.cardWrapper}>
          <View style={styles.card}>
            {/* Error Message Notice */}
            {errorMessage ? (
              <View style={styles.errorNotice} accessibilityLiveRegion="polite">
                <AlertCircle size={16} color="#DC2626" strokeWidth={2.2} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Account Type Selector (นักท่องเที่ยว vs ผู้ประกอบการ) */}
            <View style={styles.roleSelectorContainer}>
              <Text style={styles.roleSectionLabel}>ลงทะเบียนในฐานะ</Text>
              <View style={styles.roleTabs}>
                <Pressable
                  onPress={() => {
                    setAccountType('traveller');
                    if (errorMessage) setErrorMessage(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: accountType === 'traveller' }}
                  accessibilityLabel="นักท่องเที่ยว คนเข้ามาเที่ยว"
                  style={[
                    styles.roleTab,
                    accountType === 'traveller' && styles.roleTabActive,
                  ]}
                >
                  <Compass
                    size={18}
                    color={accountType === 'traveller' ? '#009DB7' : '#66869D'}
                    strokeWidth={accountType === 'traveller' ? 2.4 : 2}
                  />
                  <Text
                    style={[
                      styles.roleTabText,
                      accountType === 'traveller' && styles.roleTabTextActive,
                    ]}
                  >
                    นักท่องเที่ยว
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setAccountType('operator');
                    if (errorMessage) setErrorMessage(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: accountType === 'operator' }}
                  accessibilityLabel="ผู้ประกอบการ ร้านค้า ที่พัก ทัวร์"
                  style={[
                    styles.roleTab,
                    accountType === 'operator' && styles.roleTabActive,
                  ]}
                >
                  <Store
                    size={18}
                    color={accountType === 'operator' ? '#009DB7' : '#66869D'}
                    strokeWidth={accountType === 'operator' ? 2.4 : 2}
                  />
                  <Text
                    style={[
                      styles.roleTabText,
                      accountType === 'operator' && styles.roleTabTextActive,
                    ]}
                  >
                    ผู้ประกอบการ
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.roleHintText}>
                {accountType === 'traveller'
                  ? 'สัมผัสการเดินทาง กิจกรรมชุมชน บันทึกการเดินทาง และรับคะแนนสุขภาพ'
                  : 'สำหรับเจ้าของที่พัก ร้านอาหาร รถเช่า เรือนำเที่ยว หรือบริการบนเกาะ'}
              </Text>
            </View>

            {/* Field ผู้ประกอบการ: ชื่อธุรกิจ / สถานประกอบการ (แสดงเฉพาะเมื่อเลือกผู้ประกอบการ) */}
            {accountType === 'operator' ? (
              <View
                style={[
                  styles.fieldContainer,
                  { marginBottom: 12 },
                  focusedField === 'businessName' && styles.fieldContainerFocused,
                ]}
              >
                <View style={styles.leadingIconSlot}>
                  <Store size={20} color="#009DB7" strokeWidth={2} />
                </View>
                <View style={styles.inputStack}>
                  <Text style={styles.fieldLabel}>ชื่อธุรกิจ / สถานประกอบการ</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="เช่น บ้านสวนสีชัง, สีชัง สปีดโบ๊ท ทัวร์"
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
                    accessibilityLabel="ชื่อธุรกิจหรือสถานประกอบการ"
                  />
                </View>
              </View>
            ) : null}

            {/* Field 1: ชื่อ-นามสกุล */}
            <View
              style={[
                styles.fieldContainer,
                focusedField === 'fullName' && styles.fieldContainerFocused,
              ]}
            >
              <View style={styles.leadingIconSlot}>
                <UserRound size={20} color="#009DB7" strokeWidth={2} />
              </View>
              <View style={styles.inputStack}>
                <Text style={styles.fieldLabel}>ชื่อ-นามสกุล</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="กรอกชื่อ-นามสกุลของคุณ"
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
                  accessibilityLabel="ชื่อ-นามสกุล"
                />
              </View>
            </View>

            {/* Field 2: อีเมล */}
            <View
              style={[
                styles.fieldContainer,
                { marginTop: 12 },
                focusedField === 'email' && styles.fieldContainerFocused,
              ]}
            >
              <View style={styles.leadingIconSlot}>
                <Mail size={20} color="#009DB7" strokeWidth={2} />
              </View>
              <View style={styles.inputStack}>
                <Text style={styles.fieldLabel}>อีเมล</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="กรอกอีเมลของคุณ"
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
                  accessibilityLabel="อีเมล"
                />
              </View>
            </View>

            {/* Field 3: เบอร์โทรศัพท์ */}
            <View
              style={[
                styles.fieldContainer,
                { marginTop: 12 },
                focusedField === 'phone' && styles.fieldContainerFocused,
              ]}
            >
              <View style={styles.leadingIconSlot}>
                <Smartphone size={20} color="#009DB7" strokeWidth={2} />
              </View>
              <View style={styles.inputStack}>
                <Text style={styles.fieldLabel}>เบอร์โทรศัพท์</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="กรอกเบอร์โทรศัพท์ของคุณ"
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
                  accessibilityLabel="เบอร์โทรศัพท์"
                />
              </View>
            </View>

            {/* Field 4: รหัสผ่าน */}
            <View
              style={[
                styles.fieldContainer,
                { marginTop: 12 },
                focusedField === 'password' && styles.fieldContainerFocused,
              ]}
            >
              <View style={styles.leadingIconSlot}>
                <Lock size={20} color="#009DB7" strokeWidth={2} />
              </View>
              <View style={styles.inputStack}>
                <Text style={styles.fieldLabel}>รหัสผ่าน</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="อย่างน้อย 8 ตัวอักษร"
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
                  accessibilityLabel="รหัสผ่าน"
                />
              </View>
              <Pressable
                onPress={() => setShowPassword((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
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
                { marginTop: 12 },
                focusedField === 'confirmPassword' && styles.fieldContainerFocused,
              ]}
            >
              <View style={styles.leadingIconSlot}>
                <Lock size={20} color="#009DB7" strokeWidth={2} />
              </View>
              <View style={styles.inputStack}>
                <Text style={styles.fieldLabel}>ยืนยันรหัสผ่าน</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="กรอกยืนยันรหัสผ่านอีกครั้ง"
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
                  accessibilityLabel="ยืนยันรหัสผ่าน"
                />
              </View>
              <Pressable
                onPress={() => setShowConfirmPassword((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={showConfirmPassword ? 'ซ่อนยืนยันรหัสผ่าน' : 'แสดงยืนยันรหัสผ่าน'}
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
                accessibilityLabel="ฉันยอมรับ ข้อตกลงการให้บริการ และ นโยบายความเป็นส่วนตัว"
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
                ฉันยอมรับ{' '}
                <Text
                  style={styles.consentLink}
                  onPress={() => setTermsModalOpen(true)}
                  accessibilityRole="link"
                >
                  ข้อตกลงการให้บริการ
                </Text>
                {' และ '}
                <Text
                  style={styles.consentLink}
                  onPress={() => setPrivacyModalOpen(true)}
                  accessibilityRole="link"
                >
                  นโยบายความเป็นส่วนตัว
                </Text>
              </Text>
            </View>

            {/* Primary Submit Button */}
            <Pressable
              onPress={handleRegister}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="สมัครสมาชิก"
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
                    <Text style={styles.registerButtonText}>สมัครสมาชิก</Text>
                    <ArrowRight size={19} color="#FFFFFF" strokeWidth={2.4} />
                  </>
                )}
              </View>
            </Pressable>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>หรือสมัครด้วย</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Registration Buttons */}
            <View style={styles.socialButtonsContainer}>
              <Pressable
                onPress={() => {
                  setOauthProvider('Google');
                  setOauthModalOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="สมัครด้วย Google"
                style={({ pressed }) => [
                  styles.socialButton,
                  pressed && styles.socialButtonPressed,
                ]}
              >
                <GoogleIcon size={19} />
                <Text style={styles.socialButtonText}>สมัครด้วย Google</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setOauthProvider('LINE');
                  setOauthModalOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="สมัครด้วย LINE"
                style={({ pressed }) => [
                  styles.socialButton,
                  pressed && styles.socialButtonPressed,
                ]}
              >
                <LineIcon size={20} />
                <Text style={styles.socialButtonText}>สมัครด้วย LINE</Text>
              </Pressable>
            </View>

            {/* Login Navigation Link */}
            <View style={styles.loginRow}>
              <Text style={styles.loginNoticeText}>มีบัญชีอยู่แล้ว? </Text>
              <Pressable
                onPress={onLogin}
                accessibilityRole="link"
                accessibilityLabel="เข้าสู่ระบบ"
                hitSlop={10}
              >
                <Text style={styles.loginLinkText}>เข้าสู่ระบบ</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Decorative Wave Footer with Silhouettes */}
        <View style={styles.footerSection} pointerEvents="none" aria-hidden={true}>
          <Image
            source={loginFooterWaves}
            style={styles.footerWaveImage}
            resizeMode="cover"
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
                <Text style={styles.modalTitle}>ข้อตกลงการให้บริการ</Text>
              </View>
              <Pressable
                onPress={() => setTermsModalOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="ปิด"
                style={styles.closeModalButton}
              >
                <X size={20} color="#66869D" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator>
              <Text style={styles.modalParagraph}>
                ยินดีต้อนรับสู่ <Text style={{ fontFamily: font.heading, color: '#009DB7' }}>Chivargo</Text> แพลตฟอร์มการเดินทางและกิจกรรมเพื่อการดูแลสุขภาวะและชุมชน
              </Text>
              <Text style={styles.modalSubheading}>1. การใช้งานบัญชีและระบบนำทาง</Text>
              <Text style={styles.modalParagraph}>
                ผู้ใช้บริการตกลงให้ข้อมูลที่ถูกต้องในการลงทะเบียน และรักษาข้อมูลประจำเครื่องอย่างปลอดภัย การเข้าร่วมกิจกรรมภารกิจ (Quests) จะต้องปฏิบัติตามกฎความปลอดภัยและการมีส่วนร่วมอย่างสร้างสรรค์
              </Text>
              <Text style={styles.modalSubheading}>2. คะแนนสุขภาพและความปลอดภัย</Text>
              <Text style={styles.modalParagraph}>
                คะแนน Healthy Score และดัชนีอากาศ/สิ่งแวดล้อมประมวลผลจากข้อมูลการตรวจวัดจริงเพื่อสนับสนุนการตัดสินใจในการเดินทาง ผู้ใช้งานควรประเมินสภาพร่างกายและปฏิบัติตามคำเตือนด้านความปลอดภัยเสมอ
              </Text>
            </ScrollView>

            <Pressable
              onPress={() => setTermsModalOpen(false)}
              style={styles.modalPrimaryButton}
            >
              <Text style={styles.modalPrimaryButtonText}>เข้าใจและยอมรับ</Text>
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
                <Text style={styles.modalTitle}>นโยบายความเป็นส่วนตัว</Text>
              </View>
              <Pressable
                onPress={() => setPrivacyModalOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="ปิด"
                style={styles.closeModalButton}
              >
                <X size={20} color="#66869D" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator>
              <Text style={styles.modalParagraph}>
                Chivargo ให้ความสำคัญสูงสุดกับความเป็นส่วนตัวตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA)
              </Text>
              <Text style={styles.modalSubheading}>การจัดเก็บและรักษาความปลอดภัย (SecureStore)</Text>
              <Text style={styles.modalParagraph}>
                ข้อมูลประจำตัวและกุญแจอุปกรณ์ (Device Key) ถูกจัดเก็บอย่างปลอดภัยในฮาร์ดแวร์ Keychain/Keystore ของอุปกรณ์ ไม่มีการจัดเก็บรหัสผ่านในลักษณะข้อความธรรมดา (Plaintext)
              </Text>
              <Text style={styles.modalSubheading}>การใช้ตำแหน่งและสิทธิของเจ้าของข้อมูล</Text>
              <Text style={styles.modalParagraph}>
                ข้อมูลพิกัดถูกใช้เพื่อระบุตำแหน่งภารกิจและคะแนนสุขภาวะรอบตัวท่านเท่านั้น ท่านมีสิทธิในการเข้าถึง แก้ไข หรือขอลบข้อมูลบัญชีของตนเองได้ตลอดเวลาตามสิทธิ PDPA
              </Text>
            </ScrollView>

            <Pressable
              onPress={() => setPrivacyModalOpen(false)}
              style={styles.modalPrimaryButton}
            >
              <Text style={styles.modalPrimaryButtonText}>รับทราบ</Text>
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
                <Text style={styles.modalTitle}>สมัครด้วย {oauthProvider}</Text>
              </View>
              <Pressable
                onPress={() => setOauthModalOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="ปิด"
                style={styles.closeModalButton}
              >
                <X size={20} color="#66869D" />
              </Pressable>
            </View>

            <Text style={styles.modalParagraph}>
              ระบบเชื่อมต่อการสมัครสมาชิกผ่านบัญชี <Text style={{ fontFamily: font.heading, color: '#183B56' }}>{oauthProvider}</Text> กำลังอยู่ในช่วงเตรียมความพร้อมสำหรับการอัปเดตเวอร์ชันถัดไป
            </Text>
            <Text style={[styles.modalParagraph, { marginTop: 8 }]}>
              ท่านสามารถสมัครสมาชิกได้อย่างปลอดภัยโดยใช้แบบฟอร์มลงทะเบียนด้านบนได้ทันที
            </Text>

            <Pressable
              onPress={() => setOauthModalOpen(false)}
              style={styles.modalPrimaryButton}
            >
              <Text style={styles.modalPrimaryButtonText}>ตกลง</Text>
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
  topSection: {
    position: 'relative',
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingBottom: 32,
    alignItems: 'center',
    overflow: 'hidden',
  },
  topBar: {
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 8,
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
    marginTop: 4,
  },
  logoImage: {
    width: 140,
    height: 72,
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
    marginTop: 14,
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
    paddingHorizontal: 16,
    marginTop: -8,
    alignItems: 'center',
    zIndex: 10,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 24,
    ...shadow.card,
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
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#F0F8FD',
    borderWidth: 1.5,
    borderColor: '#D8EDF7',
  },
  roleTabActive: {
    backgroundColor: '#E0F5F9',
    borderColor: '#009DB7',
    shadowColor: '#009DB7',
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
    backgroundColor: '#F0F8FD',
    borderWidth: 1,
    borderColor: '#D8EDF7',
    borderRadius: 20,
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
    height: 140,
    marginTop: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  footerWaveImage: {
    width: '100%',
    height: 140,
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
});
