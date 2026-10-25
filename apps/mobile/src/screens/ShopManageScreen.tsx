import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AREAS, type AreaKey } from '@chivago/core';
import { ArrowLeft, Camera, MapPin, Plus, Store } from 'lucide-react-native';
import { api } from '../api/client.ts';
import { SHOP_CATEGORIES, shopImageUri, type Shop, type ShopInput } from '../api/shops.ts';
import { useAsync } from '../state/store.tsx';
import { useHere } from '../state/here.ts';
import { t } from '../i18n/locale.ts';

const blue = '#0077B6';
type ShopManageForm = ShopInput & Pick<Shop, 'guideStatus' | 'hasGuideDocument'>;
const blank = (areaKey: AreaKey = 'samui'): ShopManageForm => ({ name: '', category: '', areaKey, description: '', address: '', lat: Number.NaN,
  lng: Number.NaN, phone: '', email: '', openingHours: '', amenities: [], active: true, serviceType: 'business', guideLanguages: [], guideSkills: [], guideMeetingPoint: '', guideStatus: 'not_required', hasGuideDocument: false });
const inputStyle = { borderWidth: 1, borderColor: '#CDE3EA', borderRadius: 12, backgroundColor: '#F7FBFC', padding: 11, fontSize: 15, color: '#123B64' } as const;
const button = { backgroundColor: blue, borderRadius: 16, paddingVertical: 13, alignItems: 'center' as const, marginTop: 12 };

export function ShopManageScreen({ initialShopId, onBack, onOpenShop }: { initialShopId?: string | null; onBack: () => void; onOpenShop: (id: string) => void }) {
  const mine = useAsync(() => api.shops({ owner: 'me' }), []);
  const [editing, setEditing] = React.useState<string | 'new' | null>(initialShopId ?? null);
  const [form, setForm] = React.useState<ShopManageForm>(blank());
  const [lat, setLat] = React.useState('');
  const [lng, setLng] = React.useState('');
  const [amenities, setAmenities] = React.useState('');
  const [guideLanguages, setGuideLanguages] = React.useState('');
  const [skillDraft, setSkillDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  React.useEffect(() => setConfirmDelete(false), [editing]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [images, setImages] = React.useState<{ id: string; kind: string; url: string }[]>([]);
  const here = useHere();
  React.useEffect(() => {
    if (!editing || editing === 'new') return;
    const shop = mine.data?.find((s) => s.id === editing);
    if (shop) { setForm(shop); setLat(shop.lat === null ? '' : String(shop.lat)); setLng(shop.lng === null ? '' : String(shop.lng)); setAmenities(shop.amenities.join(', ')); setGuideLanguages(shop.guideLanguages.join(', ')); }
  }, [editing, mine.data]);
  const reloadImages = React.useCallback(async (id: string) => {
    const result = await api.shop(id);
    if (result.ok) setImages(result.data.images);
  }, []);
  React.useEffect(() => { if (editing && editing !== 'new') void reloadImages(editing); else setImages([]); }, [editing, reloadImages]);
  const update = (key: keyof ShopManageForm, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));
  const openNew = () => { const next = blank(); setForm(next); setLat(''); setLng(''); setAmenities(''); setGuideLanguages(''); setSkillDraft(''); setMessage(null); setConfirmDelete(false); setEditing('new'); };
  const save = async () => {
    setBusy(true); setMessage(null);
    const data = { ...form, serviceType: form.category === 'ไกด์นำเที่ยว' ? 'guide' as const : 'business' as const,
      guideLanguages: guideLanguages.split(',').map((v) => v.trim()).filter(Boolean),
      lat: form.category === 'ไกด์นำเที่ยว' ? null : lat.trim() ? Number(lat) : Number.NaN,
      lng: form.category === 'ไกด์นำเที่ยว' ? null : lng.trim() ? Number(lng) : Number.NaN,
      amenities: amenities.split(',').map((v) => v.trim()).filter(Boolean) };
    const result = editing === 'new' ? await api.createShop(data) : await api.updateShop(editing!, data);
    setBusy(false);
    if (!result.ok) { setMessage(result.error); return; }
    mine.reload(); setEditing(result.data.id); setMessage(t(result.data.serviceType === 'guide'
      ? { en: 'Guide profile saved. Upload the license image for review.', th: 'บันทึกโปรไฟล์ไกด์แล้ว กรุณาอัปโหลดใบอนุญาตเพื่อตรวจสอบ' }
      : { en: 'Business saved.', th: 'บันทึกร้านค้าแล้ว' }));
    void reloadImages(result.data.id);
  };
  const uploadPhoto = async (kind: 'cover' | 'interior') => {
    if (!editing || editing === 'new') { setMessage('บันทึกร้านค้าก่อนเพิ่มรูป'); return; }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setMessage('กรุณาอนุญาตเข้าถึงรูปภาพ'); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy(true); setMessage(null);
    try {
      const result = await api.uploadShopImage(editing, kind, picked.assets[0].uri, picked.assets[0].mimeType ?? 'image/jpeg');
      setMessage(result.ok ? 'อัปโหลดรูปแล้ว' : result.error);
      if (result.ok) { mine.reload(); void reloadImages(editing); }
    } catch { setMessage('อัปโหลดรูปไม่สำเร็จ'); }
    setBusy(false);
  };
  const uploadGuideLicense = async () => {
    if (!editing || editing === 'new') { setMessage(t({ en: 'Save the guide profile before uploading a license.', th: 'บันทึกโปรไฟล์ไกด์ก่อนอัปโหลดใบอนุญาต' })); return; }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setMessage(t({ en: 'Allow photo library access to choose the license image.', th: 'กรุณาอนุญาตเข้าถึงรูปภาพเพื่อเลือกภาพใบอนุญาต' })); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy(true); setMessage(null);
    try {
      const result = await api.uploadGuideDocument(editing, picked.assets[0].uri, picked.assets[0].mimeType ?? 'image/jpeg');
      setMessage(result.ok ? t({ en: 'License submitted. Your profile is pending admin review.', th: 'ส่งใบอนุญาตแล้ว โปรไฟล์กำลังรอแอดมินตรวจสอบ' }) : result.error);
      if (result.ok) mine.reload();
    } catch { setMessage(t({ en: 'Could not upload the license image.', th: 'อัปโหลดภาพใบอนุญาตไม่สำเร็จ' })); }
    setBusy(false);
  };
  const remove = async () => {
    if (!editing || editing === 'new') return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setBusy(true);
    const result = await api.deleteShop(editing);
    setBusy(false);
    if (!result.ok) { setMessage(result.error); return; }
    setEditing(null); setConfirmDelete(false); mine.reload();
  };
  const removeImage = async (imageId: string) => {
    if (!editing || editing === 'new') return;
    setBusy(true);
    const result = await api.deleteShopImage(editing, imageId);
    setBusy(false);
    if (result.ok) { mine.reload(); void reloadImages(editing); }
    else setMessage(result.error);
  };
  const selectArea = (areaKey: AreaKey) => { update('areaKey', areaKey); setLat(''); setLng(''); };
  const addGuideSkill = () => {
    const value = skillDraft.trim();
    if (!value || form.guideSkills.some((skill) => skill.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    update('guideSkills', [...form.guideSkills, value]); setSkillDraft('');
  };
  const field = (label: string, key: keyof ShopInput, placeholder = '', multiline = false) => <View style={{ marginBottom: 12 }}><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{label}</Text><TextInput value={String(form[key] ?? '')} onChangeText={(v) => update(key, v)} placeholder={placeholder} multiline={multiline} style={[inputStyle, multiline && { minHeight: 85, textAlignVertical: 'top' }]} /></View>;

  return <ScrollView style={{ flex: 1, backgroundColor: '#EAF7FB' }} contentContainerStyle={{ paddingBottom: 80 }}>
    <View style={{ backgroundColor: '#007B9B', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Pressable onPress={editing ? () => setEditing(null) : onBack} accessibilityLabel={t({ en: 'Back', th: 'กลับ' })}><ArrowLeft color="#fff" /></Pressable><Text style={{ color: '#fff', fontWeight: '700', fontSize: 19 }}>{t({ en: 'Manage my services', th: 'จัดการบริการของฉัน' })}</Text></View>
    <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16 }}>
      {!editing ? <>
        <Pressable onPress={openNew} style={[button, { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 20 }]}><Plus color="#fff" size={18} /><Text style={{ color: '#fff', fontWeight: '700' }}>{t({ en: 'Add a service', th: 'เพิ่มร้านค้าหรือไกด์' })}</Text></Pressable>
        {mine.loading && !mine.data ? <ActivityIndicator color={blue} /> : null}
        {mine.error ? <Pressable onPress={mine.reload}><Text style={{ color: '#B91C1C' }}>{mine.error} · ลองใหม่</Text></Pressable> : null}
        {!mine.loading && mine.data?.length === 0 ? <Text style={{ color: '#64748B' }}>{t({ en: 'You have no services yet. Add your first one.', th: 'ยังไม่มีร้านค้าหรือโปรไฟล์ไกด์ เพิ่มรายการแรกของคุณได้เลย' })}</Text> : null}
        {mine.data?.map((shop) => <View key={shop.id} style={{ backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 12, flexDirection: 'row', gap: 12 }}>
          {shop.coverUrl ? <Image source={{ uri: shopImageUri(shop.coverUrl) }} style={{ width: 70, height: 70, borderRadius: 12 }} /> : <Store size={45} color={blue} />}
          <View style={{ flex: 1 }}><Text style={{ color: '#123B64', fontWeight: '700', fontSize: 16 }}>{shop.name}</Text><Text style={{ color: '#64748B' }}>{t({ en: shop.category === 'ไกด์นำเที่ยว' ? 'Tour guide' : shop.category, th: shop.category })} · {t(AREAS.find((a) => a.key === shop.areaKey)?.name ?? { en: shop.areaKey, th: shop.areaKey })} · {shop.serviceType === 'guide' ? t(shop.guideStatus === 'approved' ? { en: 'Verified guide', th: 'ไกด์ผ่านการตรวจสอบ' } : shop.guideStatus === 'rejected' ? { en: 'Changes required', th: 'ต้องแก้ไขข้อมูล' } : { en: 'Pending review', th: 'รอการตรวจสอบ' }) : t(shop.active ? { en: 'Visible on map', th: 'แสดงบนแผนที่' } : { en: 'Hidden', th: 'ซ่อนอยู่' })}</Text><View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}><Pressable onPress={() => setEditing(shop.id)}><Text style={{ color: blue }}>{t({ en: 'Edit', th: 'แก้ไข' })}</Text></Pressable>{shop.serviceType !== 'guide' || shop.guideStatus === 'approved' ? <Pressable onPress={() => onOpenShop(shop.id)}><Text style={{ color: blue }}>{t({ en: 'View profile', th: 'ดูโปรไฟล์' })}</Text></Pressable> : null}</View></View>
        </View>)}
      </> : editing !== 'new' && !mine.data?.some((shop) => shop.id === editing) ? <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18 }}><Text style={{ color: '#123B64' }}>{mine.loading ? 'กำลังโหลดร้านค้า...' : mine.error ?? 'ไม่พบร้านค้านี้ในบัญชีของคุณ'}</Text><Pressable onPress={mine.reload} style={{ paddingTop: 10 }}><Text style={{ color: blue }}>ลองใหม่</Text></Pressable></View> : <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#123B64', marginBottom: 16 }}>{editing === 'new' ? t({ en: 'Add a service profile', th: 'เพิ่มโปรไฟล์บริการ' }) : t({ en: 'Edit service profile', th: 'แก้ไขโปรไฟล์บริการ' })}</Text>
        {field(form.category === 'ไกด์นำเที่ยว' ? t({ en: 'Guide name', th: 'ชื่อไกด์' }) : t({ en: 'Business name', th: 'ชื่อร้าน' }), 'name', t({ en: 'Enter a name', th: 'กรอกชื่อร้านหรือชื่อไกด์' }))}
        <Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{t({ en: 'Service type', th: 'ประเภทบริการ' })}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 10 }}>
          {SHOP_CATEGORIES.map((category) => <Pressable key={category} onPress={() => { update('category', category); update('serviceType', category === 'ไกด์นำเที่ยว' ? 'guide' : 'business'); }} style={{ backgroundColor: form.category === category ? blue : '#E9F6FA', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 }}><Text style={{ color: form.category === category ? '#fff' : '#123B64' }}>{t({ en: category === 'ไกด์นำเที่ยว' ? 'Tour guide' : category === 'ที่พัก' ? 'Accommodation' : category === 'ร้านอาหาร' ? 'Restaurant' : category === 'ร้านขายของ' ? 'Souvenirs & shopping' : category === 'เช่ารถ' ? 'Car rental' : category === 'เสริมสวย' ? 'Beauty' : category === 'ตัดผม' ? 'Haircut' : 'Other', th: category })}</Text></Pressable>)}
        </ScrollView>
        <Text style={{ color: '#123B64', fontWeight: '700' }}>{t({ en: 'Service area', th: 'พื้นที่ให้บริการ' })}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 10 }}>{AREAS.map((area) => <Pressable key={area.key} onPress={() => selectArea(area.key)} style={{ backgroundColor: form.areaKey === area.key ? blue : '#E9F6FA', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 }}><Text style={{ color: form.areaKey === area.key ? '#fff' : '#123B64' }}>{t(area.name)}</Text></Pressable>)}</ScrollView>
        {form.category === 'ไกด์นำเที่ยว' ? <>
          {field(t({ en: 'Guide profile / experience', th: 'ประวัติและประสบการณ์ไกด์' }), 'description', t({ en: 'Describe your guiding experience and areas of expertise', th: 'เล่าประสบการณ์และความเชี่ยวชาญในการนำเที่ยว' }), true)}
          <View style={{ marginBottom: 12 }}><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{t({ en: 'Languages', th: 'ภาษาที่สื่อสารได้' })}</Text><TextInput value={guideLanguages} onChangeText={setGuideLanguages} placeholder={t({ en: 'e.g. Thai, English', th: 'เช่น ไทย, อังกฤษ' })} style={inputStyle} /></View>
          <View style={{ marginBottom: 12 }}><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{t({ en: 'Guide skills', th: 'ความสามารถของไกด์' })}</Text><View style={{ flexDirection: 'row', gap: 8 }}><TextInput value={skillDraft} onChangeText={setSkillDraft} onSubmitEditing={addGuideSkill} returnKeyType="done" placeholder={t({ en: 'Add one skill at a time', th: 'กรอกความสามารถทีละข้อ' })} style={[inputStyle, { flex: 1 }]} /><Pressable onPress={addGuideSkill} style={{ backgroundColor: blue, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '700' }}>{t({ en: 'Add', th: 'เพิ่ม' })}</Text></Pressable></View><View style={{ gap: 6, marginTop: 8 }}>{form.guideSkills.map((skill, index) => <View key={`${skill}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F0F9FD', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ color: '#123B64', flex: 1 }}>• {skill}</Text><Pressable onPress={() => update('guideSkills', form.guideSkills.filter((_, i) => i !== index))} accessibilityLabel={t({ en: `Remove ${skill}`, th: `ลบ${skill}` })}><Text style={{ color: '#B91C1C', fontSize: 18 }}>×</Text></Pressable></View>)}</View></View>
          {field(t({ en: 'Main meeting point', th: 'จุดนัดพบหลัก' }), 'guideMeetingPoint', t({ en: 'Name or address of the meeting point', th: 'ชื่อสถานที่หรือที่อยู่จุดนัดพบ' }))}
          <View style={{ backgroundColor: '#F0F9FD', borderRadius: 12, padding: 12, marginBottom: 12 }}><Text style={{ color: '#123B64', fontWeight: '700' }}>{t({ en: 'Verification', th: 'การตรวจสอบ' })}: {t(form.guideStatus === 'approved' ? { en: 'Approved · Verified Guide', th: 'อนุมัติแล้ว · Verified Guide' } : form.guideStatus === 'rejected' ? { en: 'Changes required', th: 'ต้องแก้ไขข้อมูลก่อนส่งตรวจใหม่' } : { en: 'Pending admin approval', th: 'รอแอดมินตรวจสอบ' })}</Text><Text style={{ color: '#52748A', marginTop: 4 }}>{t({ en: 'Your license image is private and only moderators can view it. The profile appears publicly after approval.', th: 'ภาพใบอนุญาตเป็นข้อมูลส่วนตัว ผู้ดูแลเท่านั้นที่ดูได้ และโปรไฟล์จะแสดงหลังได้รับอนุมัติ' })}</Text>{editing !== 'new' ? <Pressable onPress={() => void uploadGuideLicense()} disabled={busy} style={[button, { marginTop: 8 }]}><Text style={{ color: '#fff', fontWeight: '700' }}>{t(form.hasGuideDocument ? { en: 'Replace license image', th: 'เปลี่ยนภาพใบอนุญาต' } : { en: 'Upload license image', th: 'อัปโหลดภาพใบอนุญาต' })}</Text></Pressable> : <Text style={{ color: '#64748B', marginTop: 7 }}>{t({ en: 'Save this profile first to upload the license image.', th: 'บันทึกโปรไฟล์ก่อนจึงจะอัปโหลดภาพใบอนุญาตได้' })}</Text>}</View>
        </> : <>
          {field(t({ en: 'Business details', th: 'รายละเอียดร้าน' }), 'description', t({ en: 'Describe products and services', th: 'อธิบายสินค้าและบริการ' }), true)}
          {field(t({ en: 'Address', th: 'ที่อยู่' }), 'address', t({ en: 'Street, subdistrict, district', th: 'บ้านเลขที่ ถนน ตำบล' }))}
        </>}
        {form.category !== 'ไกด์นำเที่ยว' ? <><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{t({ en: 'Business coordinates', th: 'พิกัดร้านค้า' })}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}><TextInput value={lat} onChangeText={setLat} keyboardType="decimal-pad" placeholder="Latitude" style={[inputStyle, { flex: 1 }]} /><TextInput value={lng} onChangeText={setLng} keyboardType="decimal-pad" placeholder="Longitude" style={[inputStyle, { flex: 1 }]} /></View>
        <Pressable onPress={() => { if (here) { setLat(String(here.lat)); setLng(String(here.lng)); } else setMessage(t({ en: 'Could not get the device location.', th: 'ยังไม่ได้รับตำแหน่งจากอุปกรณ์' })); }} style={{ flexDirection: 'row', gap: 5, paddingVertical: 12 }}><MapPin size={16} color={blue} /><Text style={{ color: blue }}>{t({ en: 'Use current location', th: 'ใช้ตำแหน่งปัจจุบัน' })}</Text></Pressable></> : null}
        {field(t({ en: 'Contact phone', th: 'เบอร์ติดต่อ' }), 'phone')}{field(t({ en: 'Email', th: 'อีเมล' }), 'email')}{form.category !== 'ไกด์นำเที่ยว' ? field(t({ en: 'Opening hours', th: 'เวลาเปิด–ปิด' }), 'openingHours', '09:00-18:00') : null}
        {form.category !== 'ไกด์นำเที่ยว' ? <><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{t({ en: 'Amenities (comma-separated)', th: 'สิ่งอำนวยความสะดวก (คั่นด้วยจุลภาค)' })}</Text><TextInput value={amenities} onChangeText={setAmenities} style={inputStyle} placeholder="Wi-Fi" /></> : null}
        <Pressable onPress={() => update('active', !form.active)} style={{ paddingVertical: 14 }}><Text style={{ color: blue }}>{form.active ? t({ en: '☑ Show profile publicly', th: '☑ แสดงโปรไฟล์' }) : t({ en: '□ Hide profile', th: '□ ซ่อนโปรไฟล์' })}</Text></Pressable>
        <Pressable onPress={() => void save()} disabled={busy} style={button}><Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? t({ en: 'Saving…', th: 'กำลังบันทึก...' }) : t({ en: 'Save profile', th: 'บันทึกโปรไฟล์' })}</Text></Pressable>
        {editing !== 'new' ? <><View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}><Pressable onPress={() => void uploadPhoto('cover')} disabled={busy} style={{ flex: 1, padding: 12, backgroundColor: '#E9F6FA', borderRadius: 12, alignItems: 'center' }}><Camera size={18} color={blue} /><Text style={{ color: blue }}>{t({ en: 'Cover photo', th: 'รูปหน้าปก' })}</Text></Pressable>{form.category !== 'ไกด์นำเที่ยว' ? <Pressable onPress={() => void uploadPhoto('interior')} disabled={busy} style={{ flex: 1, padding: 12, backgroundColor: '#E9F6FA', borderRadius: 12, alignItems: 'center' }}><Camera size={18} color={blue} /><Text style={{ color: blue }}>{t({ en: 'Interior photo', th: 'รูปภายใน' })}</Text></Pressable> : null}</View><ScrollView horizontal contentContainerStyle={{ gap: 8, marginTop: 10 }}>{images.map((img) => <View key={img.id}><Image source={{ uri: shopImageUri(img.url) }} style={{ width: 110, height: 88, borderRadius: 10 }} /><Pressable onPress={() => void removeImage(img.id)}><Text style={{ color: '#B91C1C', textAlign: 'center' }}>{t({ en: 'Remove', th: 'ลบ' })} {img.kind === 'cover' ? t({ en: 'cover', th: 'หน้าปก' }) : t({ en: 'photo', th: 'รูป' })}</Text></Pressable></View>)}</ScrollView><Pressable onPress={() => void remove()} disabled={busy} style={{ padding: 14 }}><Text style={{ color: '#B91C1C', textAlign: 'center' }}>{confirmDelete ? t({ en: 'Confirm deleting this profile and all reviews', th: 'ยืนยันลบร้านค้าและรีวิวทั้งหมด' }) : t({ en: 'Delete this profile', th: 'ลบโปรไฟล์นี้' })}</Text></Pressable></> : null}
        {message ? <Text style={{ color: /failed|could not|invalid|required|ไม่สำเร็จ|ไม่พบ|กรุณา|ต้องมี|ไม่ตรง/i.test(message) ? '#B91C1C' : '#15803D', marginTop: 8 }}>{message}</Text> : null}
      </View>}
    </View>
  </ScrollView>;
}
