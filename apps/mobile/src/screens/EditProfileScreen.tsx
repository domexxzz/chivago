import React from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Building2, Camera, ChevronLeft, Lock, Mail, Phone, Store, UserRound } from 'lucide-react-native';
import { api } from '../api/client.ts';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { TravelHeroBackdrop } from '../components/Shell.tsx';
import { t } from '../i18n/locale.ts';

export function EditProfileScreen({ onBack, onSaved }: { onBack: () => void; onSaved?: () => void }) {
  const [account, setAccount] = React.useState<{ username: string; fullName: string | null; email: string | null; phone: string | null; accountType: 'traveller' | 'operator' } | null>(null);
  const [fullName, setFullName] = React.useState('');
  const [businessName, setBusinessName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  /**
   * The banner carries whether it is good news, rather than the screen
   * guessing from the words.
   *
   * It used to colour the line green when the text contained "สำเร็จ". That
   * was wrong in English from the day it was written - "Changes saved." has
   * no Thai in it, so a successful save has always shown red - and adding
   * Chinese made it wrong in a third language. A banner knows its own tone at
   * the point it is raised; nothing downstream should have to infer it.
   */
  const [message, setMessage] = React.useState<{ text: string; ok: boolean } | null>(null);
  const fail = (text: string) => setMessage({ text, ok: false });
  const done = (text: string) => setMessage({ text, ok: true });
  const [loading, setLoading] = React.useState(true);
  const [photoUri, setPhotoUri] = React.useState<string | null>(null);
  const [leavePrompt, setLeavePrompt] = React.useState(false);
  const initial = React.useRef({ fullName: '', businessName: '', email: '', phone: '', bio: '', photoUri: null as string | null });

  const loadAccount = React.useCallback(async () => {
    setLoading(true); setMessage(null);
    const res = await api.account();
    if (res.ok) {
      const values = { fullName: res.data.fullName ?? '', businessName: res.data.businessName ?? '', email: res.data.email ?? '', phone: res.data.phone ?? '', bio: res.data.bio ?? '', photoUri: res.data.profilePhotoUrl ?? null };
      initial.current = values;
      setAccount(res.data); setFullName(values.fullName); setBusinessName(values.businessName); setEmail(values.email); setPhone(values.phone); setBio(values.bio); setPhotoUri(values.photoUri);
    }
    else fail(t({ en: 'Could not load account details.', th: 'ไม่สามารถโหลดข้อมูลบัญชีได้', zh: '无法加载账户信息。' }));
    setLoading(false);
  }, []);
  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { fail(t({ en: 'Allow photo library access to choose a picture.', th: 'กรุณาอนุญาตให้เข้าถึงรูปภาพก่อน', zh: '请允许访问相册以选择图片。' })); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    setSaving(true); setMessage(null);
    const asset = picked.assets[0];
    let upload;
    try { upload = await api.uploadProfilePhoto(asset.uri, asset.mimeType ?? 'image/jpeg'); }
    catch { setSaving(false); fail(t({ en: 'Photo upload failed. Please try again.', th: 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่', zh: '照片上传失败，请重试。' })); return; }
    setSaving(false);
    if (!upload.ok) { fail(t({ en: 'Photo upload failed.', th: 'อัปโหลดรูปไม่สำเร็จ', zh: '照片上传失败。' })); return; }
    setPhotoUri(upload.data.profilePhotoUrl);
    done(t({ en: 'Photo selected. Save changes to update it.', th: 'เลือกรูปแล้ว กดบันทึกเพื่ออัปเดตข้อมูล', zh: '已选择照片，请保存修改以更新。' }));
  };
  React.useEffect(() => { void loadAccount(); }, [loadAccount]);
  const dirty = !loading && account !== null && (
    fullName !== initial.current.fullName || businessName !== initial.current.businessName ||
    email !== initial.current.email || phone !== initial.current.phone ||
    bio !== initial.current.bio || photoUri !== initial.current.photoUri
  );
  const requestBack = () => { if (dirty) setLeavePrompt(true); else onBack(); };
  const save = async (): Promise<boolean> => {
    const cleanName = fullName.trim();
    const cleanBusiness = businessName.trim();
    const cleanEmail = email.trim();
    const cleanPhone = phone.trim();
    if (!cleanName) { fail(t({ en: 'Enter your name.', th: 'กรุณากรอกชื่อผู้รับผิดชอบ', zh: '请输入姓名。' })); return false; }
    if (account?.accountType === 'operator' && !cleanBusiness) { fail(t({ en: 'Enter the business name.', th: 'กรุณากรอกชื่อธุรกิจ', zh: '请输入商家名称。' })); return false; }
    if (cleanEmail && !/^\S+@\S+\.\S+$/.test(cleanEmail)) { fail(t({ en: 'Check the email address.', th: 'กรุณาตรวจสอบอีเมล', zh: '请检查邮箱地址。' })); return false; }
    setMessage(null); setSaving(true);
    const cleanBio = bio.trim();
    const res = await api.updateAccountProfile({ fullName: cleanName, businessName: account?.accountType === 'operator' ? cleanBusiness : undefined, email: cleanEmail, phone: cleanPhone, bio: cleanBio, profilePhotoUrl: photoUri });
    setSaving(false);
    if (!res.ok) { fail(t({ en: 'Could not save your changes. Please try again.', th: 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่', zh: '保存失败，请重试。' })); return false; }
    initial.current = { fullName: cleanName, businessName: cleanBusiness, email: cleanEmail, phone: cleanPhone, bio: cleanBio, photoUri };
    done(t({ en: 'Changes saved.', th: 'บันทึกข้อมูลสำเร็จ', zh: '修改已保存。' })); onSaved?.(); return true;
  };
  const isOperator = account?.accountType === 'operator';
  return <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}>
      <TravelHeroBackdrop compact focalPoint="right" />
      <Pressable onPress={requestBack} style={styles.circle} accessibilityRole="button" accessibilityLabel={t({ en: 'Back', th: 'ย้อนกลับ', zh: '返回' })}><ChevronLeft color="#fff" size={20} /></Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Heading size={18} colour="#fff">{isOperator ? t({ en: 'Edit business profile', th: 'แก้ไขโปรไฟล์ผู้ประกอบการ', zh: '编辑商家资料' }) : t({ en: 'Edit traveller profile', th: 'แก้ไขโปรไฟล์นักท่องเที่ยว', zh: '编辑旅行者资料' })}</Heading>
      </View>
      <View style={{ width: 40 }} />
    </View>
    <Pressable onPress={() => void choosePhoto()} disabled={saving || loading} style={styles.photoArea}>
      <View style={styles.avatar}>
        {photoUri ? <Image source={{ uri: photoUri }} style={styles.avatarImage} /> : isOperator ? <Store size={38} color="#079BD0" /> : <UserRound size={38} color="#52748A" />}
        <View style={styles.camera}><Camera size={15} color="#fff" /></View>
      </View>
      <Heading size={15}>{isOperator ? (businessName || t({ en: 'Business operator', th: 'ผู้ประกอบการ', zh: '商家' })) : (fullName || t({ en: 'Traveller', th: 'นักท่องเที่ยว', zh: '旅行者' }))}</Heading>
      <Label size={9} tracking={0.08} colour="#079BD0" style={{ marginTop: 5 }}>{isOperator ? t({ en: 'CHANGE BUSINESS PHOTO', th: 'เปลี่ยนรูปธุรกิจ', zh: '更换商家照片' }) : t({ en: 'CHANGE PROFILE PHOTO', th: 'เปลี่ยนรูปโปรไฟล์', zh: '更换头像' })}</Label>
    </Pressable>
    {loading ? <View style={styles.loading}><ActivityIndicator color="#079BD0" /><Body size={14} colour="#64748B">{t({ en: 'Loading account details…', th: 'กำลังโหลดข้อมูลบัญชี...', zh: '正在加载账户信息…' })}</Body></View> : null}
    {!loading && account ? <View style={styles.form}>
      <SectionTitle title={isOperator ? t({ en: 'Business details', th: 'ข้อมูลธุรกิจ', zh: '商家信息' }) : t({ en: 'Personal details', th: 'ข้อมูลส่วนตัว', zh: '个人信息' })} />
      {isOperator ? <Field Mark={Building2} label={t({ en: 'Business name', th: 'ชื่อธุรกิจ', zh: '商家名称' })} value={businessName} onChangeText={setBusinessName} /> : null}
      <Field Mark={UserRound} label={isOperator ? t({ en: 'Contact person', th: 'ชื่อผู้รับผิดชอบ', zh: '联系人' }) : t({ en: 'Display name', th: 'ชื่อที่แสดง', zh: '显示名称' })} value={fullName} onChangeText={setFullName} />
      <LockedField label={t({ en: 'Username', th: 'ชื่อผู้ใช้สำหรับเข้าสู่ระบบ', zh: '用户名' })} value={account.username ?? ''} />

      <SectionTitle title={t({ en: 'Contact details', th: 'ข้อมูลติดต่อ', zh: '联系方式' })} />
      <Field Mark={Phone} label={isOperator ? t({ en: 'Business phone', th: 'เบอร์โทรศัพท์ธุรกิจ', zh: '店铺电话' }) : t({ en: 'Phone number', th: 'เบอร์โทรศัพท์', zh: '电话号码' })} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field Mark={Mail} label={t({ en: 'Email', th: 'อีเมล', zh: '邮箱' })} value={email} onChangeText={setEmail} keyboardType="email-address" />

      <SectionTitle title={isOperator ? t({ en: 'About the business', th: 'รายละเอียดธุรกิจ', zh: '商家简介' }) : t({ en: 'About you', th: 'เกี่ยวกับคุณ', zh: '个人简介' })} />
      <TextInput accessibilityLabel={isOperator ? t({ en: 'Business description', th: 'รายละเอียดธุรกิจ', zh: '商家简介' }) : t({ en: 'About you', th: 'เกี่ยวกับคุณ', zh: '个人简介' })} multiline value={bio} onChangeText={setBio} placeholder={isOperator ? t({ en: 'Describe your business and services', th: 'แนะนำธุรกิจ สินค้า หรือบริการ', zh: '介绍您的店铺与服务' }) : t({ en: 'Tell people about yourself', th: 'เขียนแนะนำตัวเองสั้นๆ', zh: '介绍一下您自己' })} placeholderTextColor="#8AA0AF" style={[styles.input, styles.bioInput]} />
      {message ? <Label size={11} colour={message.ok ? '#15803D' : '#DC2626'} style={{ marginTop: 10 }}>{message.text}</Label> : null}
      <Pressable onPress={() => void save()} disabled={saving || !dirty} style={[styles.save, !dirty && styles.saveDisabled]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t({ en: 'Save changes', th: 'บันทึกการแก้ไข', zh: '保存修改' })}</Text>}</Pressable>
    </View> : null}
    {!loading && !account ? <View style={styles.errorBox}><Text style={styles.errorText}>{message?.text ?? t({ en: 'Account details were not found.', th: 'ไม่พบข้อมูลบัญชี', zh: '未找到账户信息。' })}</Text><Pressable onPress={() => void loadAccount()} style={styles.retry}><Text style={styles.retryText}>{t({ en: 'Try again', th: 'ลองใหม่', zh: '重试' })}</Text></Pressable></View> : null}
    <Modal visible={leavePrompt} transparent animationType="fade" onRequestClose={() => setLeavePrompt(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalIcon}><Lock size={22} color="#D97706" /></View>
          <Heading size={18} style={{ textAlign: 'center' }}>{t({ en: 'Unsaved changes', th: 'ยังไม่ได้บันทึกข้อมูล', zh: '更改尚未保存' })}</Heading>
          <Body size={13} colour="#64748B" style={{ textAlign: 'center', marginTop: 8, lineHeight: 20 }}>{t({ en: 'Would you like to save your changes before leaving this page?', th: 'ต้องการบันทึกข้อมูลก่อนออกจากหน้านี้หรือไม่?', zh: '离开此页面前是否保存更改？' })}</Body>
          <Pressable disabled={saving} onPress={() => { void (async () => { const saved = await save(); if (saved) setLeavePrompt(false); })(); }} style={styles.modalSave}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalSaveText}>{t({ en: 'Save changes', th: 'บันทึกข้อมูล', zh: '保存更改' })}</Text>}</Pressable>
          <Pressable onPress={() => { setLeavePrompt(false); onBack(); }} style={styles.modalDiscard}><Text style={styles.modalDiscardText}>{t({ en: 'Leave without saving', th: 'ไม่บันทึกข้อมูล', zh: '不保存并离开' })}</Text></Pressable>
          <Pressable onPress={() => setLeavePrompt(false)} style={styles.modalCancel}><Text style={styles.modalCancelText}>{t({ en: 'Continue editing', th: 'แก้ไขข้อมูลต่อ', zh: '继续编辑' })}</Text></Pressable>
        </View>
      </View>
    </Modal>
  </ScrollView>;
}

function SectionTitle({ title }: { title: string }) {
  return <Label size={10} tracking={0.12} colour="#079BD0" style={styles.sectionTitle}>{title}</Label>;
}
function Field({ Mark, label, value, onChangeText, editable = true, keyboardType }: { Mark?: typeof UserRound; label: string; value: string; onChangeText?: (v: string) => void; editable?: boolean; keyboardType?: 'phone-pad' | 'email-address' }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={[styles.inputShell, !editable && styles.disabled]}>{Mark ? <Mark size={17} color="#66869D" /> : null}<TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} editable={editable} keyboardType={keyboardType} style={styles.textInput} /></View></View>;
}
function LockedField({ label, value }: { label: string; value: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={styles.lockedInput}><Lock size={16} color="#64748B" /><Text style={styles.lockedText}>{value || t({ en: 'No username set', th: 'ยังไม่มีชื่อผู้ใช้งาน', zh: '尚未设置用户名' })}</Text></View><Text style={styles.lockedHint}>{t({ en: 'Used for sign-in and cannot be changed', th: 'ใช้เข้าสู่ระบบและไม่สามารถแก้ไขได้', zh: '用于登录且无法修改' })}</Text></View>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#F3FAFC' }, content: { paddingBottom: 40 }, header: { height: 82, paddingHorizontal: 16, backgroundColor: '#079BD0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden' }, circle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' }, photoArea: { alignItems: 'center', paddingTop: 20, paddingBottom: 18 }, avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: '#63D5E8', alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'visible', ...shadow.card }, avatarImage: { width: '100%', height: '100%', borderRadius: 48 }, camera: { position: 'absolute', right: -2, bottom: 2, width: 32, height: 32, borderRadius: 16, backgroundColor: '#123B64', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, loading: { margin: gutter, padding: 32, alignItems: 'center', gap: 10 }, errorBox: { margin: gutter, padding: 20, backgroundColor: '#FFF1F2', borderRadius: 16, alignItems: 'center', gap: 12 }, errorText: { color: '#B91C1C', textAlign: 'center' }, retry: { backgroundColor: '#079BD0', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 9 }, retryText: { color: '#fff', fontWeight: '700' }, form: { marginHorizontal: gutter, backgroundColor: '#fff', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 20, borderWidth: 1, borderColor: '#DCEFF5', ...shadow.card }, sectionTitle: { marginTop: 4, marginBottom: 13 }, field: { marginBottom: 16 }, label: { color: '#172B3A', fontSize: 14, fontWeight: '600', marginBottom: 7 }, inputShell: { minHeight: 48, borderWidth: 1, borderColor: '#CBDDE4', backgroundColor: '#F8FCFD', borderRadius: 14, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 }, textInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: '#172B3A' }, input: { borderWidth: 1, borderColor: '#CBDDE4', backgroundColor: '#F8FCFD', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#172B3A' }, bioInput: { minHeight: 104, textAlignVertical: 'top', marginBottom: 2 }, disabled: { backgroundColor: '#EEF3F5' }, lockedInput: { minHeight: 48, borderWidth: 1, borderColor: '#D5DEE3', backgroundColor: '#EEF3F5', borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }, lockedText: { color: '#526879', fontSize: 15 }, lockedHint: { color: '#7A8F9D', fontSize: 11, marginTop: 6, marginLeft: 2 }, save: { marginTop: 22, minHeight: 50, backgroundColor: '#079BD0', borderRadius: 25, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', shadowColor: '#0077A5', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 4 }, saveDisabled: { backgroundColor: '#9BBCC8', shadowOpacity: 0 }, saveText: { color: '#fff', fontSize: 16, fontWeight: '700' }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(2,43,66,0.58)', alignItems: 'center', justifyContent: 'center', padding: 24 }, modalCard: { width: '100%', maxWidth: 360, padding: 22, backgroundColor: '#FFFFFF', borderRadius: 24, alignItems: 'center', ...shadow.card }, modalIcon: { width: 50, height: 50, borderRadius: 25, marginBottom: 14, backgroundColor: '#FFF7E6', alignItems: 'center', justifyContent: 'center' }, modalSave: { width: '100%', minHeight: 46, marginTop: 22, borderRadius: 23, backgroundColor: '#079BD0', alignItems: 'center', justifyContent: 'center' }, modalSaveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' }, modalDiscard: { width: '100%', minHeight: 44, marginTop: 9, borderRadius: 22, borderWidth: 1, borderColor: '#F1B7B7', backgroundColor: '#FFF7F7', alignItems: 'center', justifyContent: 'center' }, modalDiscardText: { color: '#C24141', fontSize: 14, fontWeight: '700' }, modalCancel: { minHeight: 40, marginTop: 7, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' }, modalCancelText: { color: '#526879', fontSize: 13, fontWeight: '600' } });
