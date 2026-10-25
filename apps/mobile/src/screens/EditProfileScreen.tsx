import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ChevronLeft, Check, Lock, Store } from 'lucide-react-native';
import { api } from '../api/client.ts';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';

export function EditProfileScreen({ onBack, onSaved }: { onBack: () => void; onSaved?: () => void }) {
  const [account, setAccount] = React.useState<{ username: string; fullName: string | null; email: string | null; phone: string | null; accountType: 'traveller' | 'operator' } | null>(null);
  const [fullName, setFullName] = React.useState('');
  const [businessName, setBusinessName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [photoUri, setPhotoUri] = React.useState<string | null>(null);

  const loadAccount = React.useCallback(async () => {
    setLoading(true); setMessage(null);
    const res = await api.account();
    if (res.ok) { setAccount(res.data); setFullName(res.data.fullName ?? ''); setBusinessName(res.data.businessName ?? ''); setEmail(res.data.email ?? ''); setPhone(res.data.phone ?? ''); setBio(res.data.bio ?? ''); setPhotoUri(res.data.profilePhotoUrl ?? null); }
    else setMessage(res.error || 'ไม่สามารถโหลดข้อมูลบัญชีได้');
    setLoading(false);
  }, []);
  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setMessage('กรุณาอนุญาตให้เข้าถึงรูปภาพก่อน'); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    setSaving(true); setMessage(null);
    const asset = picked.assets[0];
    let upload;
    try { upload = await api.uploadProfilePhoto(asset.uri, asset.mimeType ?? 'image/jpeg'); }
    catch { setSaving(false); setMessage('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่'); return; }
    setSaving(false);
    if (!upload.ok) { setMessage(upload.error || 'อัปโหลดรูปไม่สำเร็จ'); return; }
    setPhotoUri(upload.data.profilePhotoUrl);
    setMessage('อัปโหลดรูปสำเร็จ');
  };
  React.useEffect(() => { void loadAccount(); }, [loadAccount]);
  const save = async () => {
    setMessage(null); setSaving(true);
    const res = await api.updateAccountProfile({ fullName, businessName: account?.accountType === 'operator' ? businessName : undefined, email, phone, bio });
    setSaving(false);
    if (!res.ok) { setMessage(res.error); return; }
    setMessage('บันทึกข้อมูลสำเร็จ'); onSaved?.();
  };
  return <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable onPress={onBack} style={styles.circle}><ChevronLeft color="#fff" size={20} /></Pressable><Heading size={20} colour="#fff">แก้ไขโปรไฟล์</Heading><View style={{ width: 40 }} /></View>
    <Pressable onPress={() => void choosePhoto()} disabled={saving} style={styles.photoArea}><View style={styles.avatar}>{photoUri ? <Image source={{ uri: photoUri }} style={styles.avatarImage} /> : account?.accountType === 'operator' ? <Store size={42} color="#079BD0" /> : <Text style={{ fontSize: 38 }}>👩🏻‍🌾</Text>}<View style={styles.camera}><Camera size={15} color="#fff" /></View></View><Body size={14} colour="#183B56">{account?.accountType === 'operator' ? 'เปลี่ยนโลโก้ร้านค้า' : 'เปลี่ยนรูปโปรไฟล์'}</Body></Pressable>
    {loading ? <View style={styles.loading}><ActivityIndicator color="#079BD0" /><Body size={14} colour="#64748B">กำลังโหลดข้อมูลบัญชี...</Body></View> : null}
    {!loading && account ? <View style={styles.form}>
      {account.accountType === 'operator' ? <Field label="ชื่อธุรกิจ / BUSINESS NAME" value={businessName} onChangeText={setBusinessName} /> : <Field label="ชื่อ / NAME" value={fullName} onChangeText={setFullName} />}
      <LockedField label="ชื่อผู้ใช้งาน / USERNAME (ใช้สำหรับ Login เท่านั้น)" value={account?.username ?? ''} />
      <Field label="ประเภทผู้ใช้งาน (USER PROFILE)" value={account?.accountType === 'operator' ? 'ผู้ประกอบการ (OPERATOR)' : 'นักท่องเที่ยว (TRAVELLER)'} editable={false} />
      {account.accountType === 'operator' ? <Field label="ชื่อผู้รับผิดชอบ / CONTACT PERSON" value={fullName} onChangeText={setFullName} /> : null}
      <Field label={account.accountType === 'operator' ? 'เบอร์โทรศัพท์ร้านค้า / PHONE NUMBER' : 'เบอร์โทรศัพท์ / PHONE NUMBER'} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="อีเมล / EMAIL" value={email} onChangeText={setEmail} keyboardType="email-address" />
      <Text style={styles.label}>{account.accountType === 'operator' ? 'แนะนำร้านค้า / BUSINESS BIO' : 'แนะนำตัวเอง / BIO'}</Text><TextInput multiline value={bio} onChangeText={setBio} placeholder={account.accountType === 'operator' ? 'เขียนแนะนำร้านค้าและบริการ' : 'เขียนแนะนำตัวเอง'} style={[styles.input, { height: 92, textAlignVertical: 'top' }]} />
      {message ? <Label size={11} colour={message.includes('สำเร็จ') ? '#15803D' : '#DC2626'} style={{ marginTop: 10 }}>{message}</Label> : null}
      <Pressable onPress={save} disabled={saving} style={styles.save}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>บันทึกการแก้ไข</Text>}</Pressable>
    </View> : null}
    {!loading && !account ? <View style={styles.errorBox}><Text style={styles.errorText}>{message ?? 'ไม่พบข้อมูลบัญชี'}</Text><Pressable onPress={() => void loadAccount()} style={styles.retry}><Text style={styles.retryText}>ลองใหม่</Text></Pressable></View> : null}
  </ScrollView>;
}

function Field({ label, value, onChangeText, editable = true, keyboardType }: { label: string; value: string; onChangeText?: (v: string) => void; editable?: boolean; keyboardType?: 'phone-pad' | 'email-address' }) {
  return <View style={{ marginBottom: 18 }}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} editable={editable} keyboardType={keyboardType} style={[styles.input, !editable && styles.disabled]} /></View>;
}
function LockedField({ label, value }: { label: string; value: string }) {
  return <View style={{ marginBottom: 18 }}><Text style={styles.label}>{label}</Text><View style={styles.lockedInput}><Lock size={16} color="#64748B" /><Text style={styles.lockedText}>{value || 'ยังไม่มี Username'}</Text></View><Text style={styles.lockedHint}>🔒 ไม่สามารถแก้ไขได้</Text></View>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#F0F9FF' }, content: { paddingBottom: 32 }, header: { height: 72, paddingHorizontal: 16, backgroundColor: '#079BD0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }, circle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' }, update: { backgroundColor: 'rgba(255,255,255,.18)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 }, updateText: { color: '#fff', fontWeight: '700', flexDirection: 'row' }, photoArea: { alignItems: 'center', paddingVertical: 18 }, avatar: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#FFF7D6', borderWidth: 5, borderColor: '#E6C76A', alignItems: 'center', justifyContent: 'center', marginBottom: 8, overflow: 'visible' }, avatarImage: { width: '100%', height: '100%', borderRadius: 56 }, camera: { position: 'absolute', right: -2, bottom: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: '#123B64', alignItems: 'center', justifyContent: 'center' }, loading: { margin: gutter, padding: 32, alignItems: 'center', gap: 10 }, errorBox: { margin: gutter, padding: 20, backgroundColor: '#FFF1F2', borderRadius: 16, alignItems: 'center', gap: 12 }, errorText: { color: '#B91C1C', textAlign: 'center' }, retry: { backgroundColor: '#079BD0', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 9 }, retryText: { color: '#fff', fontWeight: '700' }, form: { marginHorizontal: gutter, backgroundColor: '#fff', borderRadius: 20, padding: 18, ...shadow.card }, label: { color: '#172B3A', fontSize: 15, fontWeight: '600', marginBottom: 7 }, input: { borderWidth: 1, borderColor: '#D6E4E8', backgroundColor: '#F5FAFB', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, color: '#172B3A' }, disabled: { color: '#334155' }, lockedInput: { minHeight: 45, borderWidth: 1, borderColor: '#94A3B8', backgroundColor: '#CBD5E1', borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }, lockedText: { color: '#334155', fontSize: 16 }, lockedHint: { color: '#64748B', fontSize: 11, marginTop: 4 }, save: { marginTop: 18, backgroundColor: '#079BD0', borderRadius: 24, paddingVertical: 14, alignItems: 'center' }, saveText: { color: '#fff', fontSize: 17, fontWeight: '700' }, });
