import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AREAS, type AreaKey } from '@chivago/core';
import { ArrowLeft, Camera, ChevronDown, MapPin, Plus, Store, UserRound } from 'lucide-react-native';
import { api } from '../api/client.ts';
import { SHOP_CATEGORIES, shopImageUri, type Shop, type ShopInput } from '../api/shops.ts';
import { useAsync } from '../state/store.tsx';
import { useHere } from '../state/here.ts';
import { t } from '../i18n/locale.ts';
import { GuideLanguageFlag, guideLanguageLabel } from '../components/GuideLanguageFlag.tsx';

const blue = '#0077B6';
type ShopManageForm = ShopInput & Pick<Shop, 'guideStatus' | 'hasGuideDocument' | 'guideProfilePhotoUrl'>;
const blank = (areaKey: AreaKey = 'samui'): ShopManageForm => ({ name: '', category: '', areaKey, description: '', address: '', lat: Number.NaN,
  lng: Number.NaN, phone: '', email: '', openingHours: '', amenities: [], active: true, serviceType: 'business', guideLanguages: [], guideSkills: [], guideTourStyles: [], guideLineId: '', guideStatus: 'not_required', hasGuideDocument: false, guideProfilePhotoUrl: null });
const inputStyle = { borderWidth: 1, borderColor: '#CDE3EA', borderRadius: 12, backgroundColor: '#F7FBFC', padding: 11, fontSize: 15, color: '#123B64' } as const;
const button = { backgroundColor: blue, borderRadius: 16, paddingVertical: 13, alignItems: 'center' as const, marginTop: 12 };

/** Stored as names so existing guide profiles remain compatible; flags are presentation only. */
const GUIDE_LANGUAGE_OPTIONS = [
  { name: 'ไทย', search: 'thai thailand ไทย' },
  { name: 'English', search: 'english อังกฤษ uk usa' },
  { name: '中文', search: 'chinese china mandarin 中文 จีน' },
  { name: '日本語', search: 'japanese japan 日本語 ญี่ปุ่น' },
  { name: '한국어', search: 'korean korea 한국어 เกาหลี' },
  { name: 'Français', search: 'french france français ฝรั่งเศส' },
  { name: 'Deutsch', search: 'german germany deutsch เยอรมัน' },
  { name: 'Español', search: 'spanish spain español สเปน' },
  { name: 'Русский', search: 'russian russia русский รัสเซีย' },
  { name: 'العربية', search: 'arabic العربية อาหรับ' },
] as const;
const GUIDE_TOUR_STYLES = [
  { en: 'Nature', th: 'ทัวร์ธรรมชาติ' }, { en: 'Snorkelling', th: 'ดำน้ำ' },
  { en: 'Hiking', th: 'เดินป่า' }, { en: 'Culture & temples', th: 'วัฒนธรรม/วัด' },
  { en: 'Local food', th: 'อาหารท้องถิ่น' }, { en: 'Island hopping', th: 'เที่ยวเกาะ' },
] as const;

export function ShopManageScreen({ initialShopId, onBack, onOpenShop }: { initialShopId?: string | null; onBack: () => void; onOpenShop: (id: string) => void }) {
  const mine = useAsync(() => api.shops({ owner: 'me' }), []);
  const [editing, setEditing] = React.useState<string | 'new' | null>(initialShopId ?? null);
  const [form, setForm] = React.useState<ShopManageForm>(blank());
  const [lat, setLat] = React.useState('');
  const [lng, setLng] = React.useState('');
  const [amenities, setAmenities] = React.useState('');
  const [languageQuery, setLanguageQuery] = React.useState('');
  const [openDropdown, setOpenDropdown] = React.useState<'category' | 'area' | 'language' | null>(null);
  const [skillDraft, setSkillDraft] = React.useState('');
  const [pendingGuidePhoto, setPendingGuidePhoto] = React.useState<ImagePicker.ImagePickerAsset | null>(null);
  const [pendingGuideDocument, setPendingGuideDocument] = React.useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  React.useEffect(() => setConfirmDelete(false), [editing]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [images, setImages] = React.useState<{ id: string; kind: string; url: string }[]>([]);
  const here = useHere();
  React.useEffect(() => {
    if (!editing || editing === 'new') return;
    const shop = mine.data?.find((s) => s.id === editing);
    if (shop) { setForm(shop); setLat(shop.lat === null ? '' : String(shop.lat)); setLng(shop.lng === null ? '' : String(shop.lng)); setAmenities(shop.amenities.join(', ')); setLanguageQuery(''); }
  }, [editing, mine.data]);
  const reloadImages = React.useCallback(async (id: string) => {
    const result = await api.shop(id);
    if (result.ok) setImages(result.data.images);
  }, []);
  React.useEffect(() => { if (editing && editing !== 'new') void reloadImages(editing); else setImages([]); }, [editing, reloadImages]);
  const update = (key: keyof ShopManageForm, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));
  const openNew = () => { const next = blank(); setForm(next); setLat(''); setLng(''); setAmenities(''); setLanguageQuery(''); setOpenDropdown(null); setSkillDraft(''); setPendingGuidePhoto(null); setPendingGuideDocument(null); setMessage(null); setConfirmDelete(false); setEditing('new'); };
  const save = async () => {
    setBusy(true); setMessage(null);
    const data = { ...form, serviceType: form.category === 'ไกด์นำเที่ยว' ? 'guide' as const : 'business' as const,
      lat: form.category === 'ไกด์นำเที่ยว' ? null : lat.trim() ? Number(lat) : Number.NaN,
      lng: form.category === 'ไกด์นำเที่ยว' ? null : lng.trim() ? Number(lng) : Number.NaN,
      amenities: amenities.split(',').map((v) => v.trim()).filter(Boolean) };
    const result = editing === 'new' ? await api.createShop(data) : await api.updateShop(editing!, data);
    if (!result.ok) { setBusy(false); setMessage(result.error); return; }
    const submittingDocument = !!pendingGuideDocument || result.data.hasGuideDocument;
    const uploadErrors: string[] = [];
    if (result.data.serviceType === 'guide' && pendingGuidePhoto) {
      try {
        const photo = await api.uploadGuidePhoto(result.data.id, pendingGuidePhoto.uri, pendingGuidePhoto.mimeType ?? 'image/jpeg');
        if (photo.ok) { setPendingGuidePhoto(null); update('guideProfilePhotoUrl', photo.data.url); }
        else uploadErrors.push(photo.error);
      } catch { uploadErrors.push(t({ en: 'Profile photo upload failed', th: 'อัปโหลดรูปโปรไฟล์ไม่สำเร็จ' })); }
    }
    if (result.data.serviceType === 'guide' && pendingGuideDocument) {
      try {
        const document = await api.uploadGuideDocument(result.data.id, pendingGuideDocument.uri, pendingGuideDocument.mimeType ?? 'image/jpeg');
        if (document.ok) setPendingGuideDocument(null);
        else uploadErrors.push(document.error);
      } catch { uploadErrors.push(t({ en: 'Verification document upload failed', th: 'อัปโหลดเอกสารยืนยันไม่สำเร็จ' })); }
    }
    mine.reload(); setEditing(result.data.id); setMessage(uploadErrors.length ? t({ en: 'Profile saved, but some images did not upload: ', th: 'บันทึกโปรไฟล์แล้ว แต่บางรูปอัปโหลดไม่สำเร็จ: ' }) + uploadErrors.join(', ') : t(result.data.serviceType === 'guide'
      ? submittingDocument ? { en: 'Guide profile submitted for review.', th: 'ส่งโปรไฟล์ไกด์ให้ตรวจสอบแล้ว' } : { en: 'Guide profile saved. Add a verification document to submit for review.', th: 'บันทึกโปรไฟล์ไกด์แล้ว เพิ่มเอกสารยืนยันเพื่อส่งตรวจ' }
      : { en: 'Business saved.', th: 'บันทึกร้านค้าแล้ว' }));
    void reloadImages(result.data.id);
    setBusy(false);
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
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setMessage(t({ en: 'Allow photo library access to choose the license image.', th: 'กรุณาอนุญาตเข้าถึงรูปภาพเพื่อเลือกภาพใบอนุญาต' })); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!picked.canceled && picked.assets[0]) setPendingGuideDocument(picked.assets[0]);
  };
  const uploadGuidePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setMessage(t({ en: 'Allow photo library access to choose a profile photo.', th: 'กรุณาอนุญาตเข้าถึงรูปภาพเพื่อเลือกรูปโปรไฟล์' })); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!picked.canceled && picked.assets[0]) setPendingGuidePhoto(picked.assets[0]);
  };
  const removeGuidePhoto = async () => {
    if (!editing || editing === 'new') return;
    setBusy(true); setMessage(null);
    const result = await api.deleteGuidePhoto(editing);
    if (result.ok) { update('guideProfilePhotoUrl', null); mine.reload(); setMessage(t({ en: 'Profile photo removed.', th: 'ลบรูปโปรไฟล์แล้ว' })); }
    else setMessage(result.error);
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
  const toggleGuideLanguage = (language: string) => update('guideLanguages', form.guideLanguages.includes(language)
    ? form.guideLanguages.filter((item) => item !== language)
    : [...form.guideLanguages, language]);
  const visibleLanguages = GUIDE_LANGUAGE_OPTIONS.filter((language) => {
    const query = languageQuery.trim().toLocaleLowerCase();
    return !query || `${language.name} ${language.search}`.toLocaleLowerCase().includes(query);
  });
  const categoryLabel = (category: string) => t({ en: category === 'ไกด์นำเที่ยว' ? 'Tour guide' : category === 'ที่พัก' ? 'Accommodation' : category === 'ร้านอาหาร' ? 'Restaurant' : category === 'ร้านขายของ' ? 'Souvenirs & shopping' : category === 'เช่ารถ' ? 'Car rental' : category === 'เสริมสวย' ? 'Beauty' : category === 'ตัดผม' ? 'Haircut' : 'Other', th: category });
  const sectionTitle = (en: string, th: string) => <Text style={{ color: '#0077B6', fontSize: 15, fontWeight: '800', marginTop: 18, marginBottom: 12 }}>{t({ en, th })}</Text>;
  const dropdownHeader = (label: string, value: React.ReactNode, key: 'category' | 'area' | 'language', accessibilityValue = typeof value === 'string' ? value : '') => <View style={{ marginBottom: 6 }}><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{label}</Text><Pressable onPress={() => setOpenDropdown((current) => current === key ? null : key)} accessibilityRole="button" accessibilityState={{ expanded: openDropdown === key }} accessibilityLabel={`${label}: ${accessibilityValue}`} style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}><View style={{ flex: 1 }}>{typeof value === 'string' ? <Text style={{ color: '#123B64' }} numberOfLines={1}>{value}</Text> : value}</View><ChevronDown size={18} color={blue} /></Pressable></View>;
  const field = (label: string, key: keyof ShopInput, placeholder = '', multiline = false) => <View style={{ marginBottom: 12 }}><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{label}</Text><TextInput value={String(form[key] ?? '')} onChangeText={(v) => update(key, v)} placeholder={placeholder} multiline={multiline} style={[inputStyle, multiline && { minHeight: 85, textAlignVertical: 'top' }]} /></View>;

  return <><ScrollView style={{ flex: 1, backgroundColor: '#EAF7FB' }} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
    <View style={{ backgroundColor: '#007B9B', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Pressable onPress={editing ? () => setEditing(null) : onBack} accessibilityLabel={t({ en: 'Back', th: 'กลับ' })}><ArrowLeft color="#fff" /></Pressable><Text style={{ color: '#fff', fontWeight: '700', fontSize: 19 }}>{t({ en: 'Manage my services', th: 'จัดการบริการของฉัน' })}</Text></View>
    <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16 }}>
      {!editing ? <>
        <Pressable onPress={openNew} style={[button, { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 20 }]}><Plus color="#fff" size={18} /><Text style={{ color: '#fff', fontWeight: '700' }}>{t({ en: 'Add a service', th: 'เพิ่มร้านค้าหรือไกด์' })}</Text></Pressable>
        {mine.loading && !mine.data ? <ActivityIndicator color={blue} /> : null}
        {mine.error ? <Pressable onPress={mine.reload}><Text style={{ color: '#B91C1C' }}>{mine.error} · ลองใหม่</Text></Pressable> : null}
        {!mine.loading && mine.data?.length === 0 ? <Text style={{ color: '#64748B' }}>{t({ en: 'You have no services yet. Add your first one.', th: 'ยังไม่มีร้านค้าหรือโปรไฟล์ไกด์ เพิ่มรายการแรกของคุณได้เลย' })}</Text> : null}
        {mine.data?.map((shop) => <View key={shop.id} style={{ backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 12, flexDirection: 'row', gap: 12 }}>
          {shop.serviceType === 'guide' && shop.guideProfilePhotoUrl ? <Image source={{ uri: shopImageUri(shop.guideProfilePhotoUrl) }} style={{ width: 70, height: 70, borderRadius: 35 }} /> : shop.coverUrl ? <Image source={{ uri: shopImageUri(shop.coverUrl) }} style={{ width: 70, height: 70, borderRadius: 12 }} /> : <Store size={45} color={blue} />}
          <View style={{ flex: 1 }}><Text style={{ color: '#123B64', fontWeight: '700', fontSize: 16 }}>{shop.name}</Text><Text style={{ color: '#64748B' }}>{t({ en: shop.category === 'ไกด์นำเที่ยว' ? 'Tour guide' : shop.category, th: shop.category })} · {t(AREAS.find((a) => a.key === shop.areaKey)?.name ?? { en: shop.areaKey, th: shop.areaKey })} · {shop.serviceType === 'guide' ? t(shop.guideStatus === 'approved' ? { en: 'Verified guide', th: 'ไกด์ผ่านการตรวจสอบ' } : shop.guideStatus === 'rejected' ? { en: 'Changes required', th: 'ต้องแก้ไขข้อมูล' } : shop.hasGuideDocument ? { en: 'Pending review', th: 'รอการตรวจสอบ' } : { en: 'Document needed', th: 'รอส่งเอกสาร' }) : t(shop.active ? { en: 'Visible on map', th: 'แสดงบนแผนที่' } : { en: 'Hidden', th: 'ซ่อนอยู่' })}</Text><View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}><Pressable onPress={() => { setPendingGuidePhoto(null); setPendingGuideDocument(null); setEditing(shop.id); }}><Text style={{ color: blue }}>{t({ en: 'Edit', th: 'แก้ไข' })}</Text></Pressable>{shop.serviceType !== 'guide' || shop.guideStatus === 'approved' ? <Pressable onPress={() => onOpenShop(shop.id)}><Text style={{ color: blue }}>{t({ en: 'View profile', th: 'ดูโปรไฟล์' })}</Text></Pressable> : null}</View></View>
        </View>)}
      </> : editing !== 'new' && !mine.data?.some((shop) => shop.id === editing) ? <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18 }}><Text style={{ color: '#123B64' }}>{mine.loading ? 'กำลังโหลดร้านค้า...' : mine.error ?? 'ไม่พบร้านค้านี้ในบัญชีของคุณ'}</Text><Pressable onPress={mine.reload} style={{ paddingTop: 10 }}><Text style={{ color: blue }}>ลองใหม่</Text></Pressable></View> : <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#123B64', marginBottom: 16 }}>{editing === 'new' ? t({ en: 'Add a service profile', th: 'เพิ่มโปรไฟล์บริการ' }) : t({ en: 'Edit service profile', th: 'แก้ไขโปรไฟล์บริการ' })}</Text>
        {form.category === 'ไกด์นำเที่ยว' ? sectionTitle('Basic information', 'ข้อมูลพื้นฐาน') : null}
        {dropdownHeader(t({ en: 'Service type', th: 'ประเภทบริการ' }), form.category ? categoryLabel(form.category) : t({ en: 'Select service type', th: 'เลือกประเภทบริการ' }), 'category')}
        {openDropdown === 'category' ? <View style={{ backgroundColor: '#F0F9FD', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>{SHOP_CATEGORIES.map((category) => <Pressable key={category} onPress={() => { setForm((prev) => ({ ...prev, category, serviceType: category === 'ไกด์นำเที่ยว' ? 'guide' : 'business' })); setOpenDropdown(null); }} accessibilityRole="button" style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#D7EAF0' }}><Text style={{ color: form.category === category ? blue : '#123B64', fontWeight: form.category === category ? '700' : '400' }}>{categoryLabel(category)}{form.category === category ? ' ✓' : ''}</Text></Pressable>)}</View> : null}
        {form.category === 'ไกด์นำเที่ยว' ? <View style={{ alignItems: 'center', marginVertical: 12 }}><Pressable onPress={() => void uploadGuidePhoto()} disabled={busy} accessibilityRole="button" accessibilityLabel={t({ en: 'Choose guide profile photo', th: 'เลือกรูปโปรไฟล์ไกด์' })} style={{ width: 108, height: 108 }}><View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: '#E9F6FA', borderWidth: 3, borderColor: '#48CAE4', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{pendingGuidePhoto ? <Image source={{ uri: pendingGuidePhoto.uri }} style={{ width: 98, height: 98, borderRadius: 49 }} /> : form.guideProfilePhotoUrl ? <Image source={{ uri: shopImageUri(form.guideProfilePhotoUrl) }} style={{ width: 98, height: 98, borderRadius: 49 }} /> : <UserRound size={48} color={blue} />}</View><View style={{ position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: blue, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}><Camera size={16} color="#fff" /></View></Pressable><Text style={{ color: blue, marginTop: 7 }}>{t({ en: 'Tap to choose a profile photo', th: 'แตะเพื่อเลือกรูปโปรไฟล์' })}</Text>{pendingGuidePhoto ? <Pressable onPress={() => setPendingGuidePhoto(null)} style={{ padding: 6 }}><Text style={{ color: '#B91C1C' }}>{t({ en: 'Remove selected photo', th: 'ยกเลิกรูปที่เลือก' })}</Text></Pressable> : form.guideProfilePhotoUrl && editing !== 'new' ? <Pressable onPress={() => void removeGuidePhoto()} disabled={busy} style={{ padding: 6 }}><Text style={{ color: '#B91C1C' }}>{t({ en: 'Remove profile photo', th: 'ลบรูปโปรไฟล์' })}</Text></Pressable> : null}</View> : null}
        {field(form.category === 'ไกด์นำเที่ยว' ? t({ en: 'Guide name', th: 'ชื่อไกด์' }) : t({ en: 'Business name', th: 'ชื่อร้าน' }), 'name', form.category === 'ไกด์นำเที่ยว' ? t({ en: 'e.g. Guide Somchai or Uncle Ood Tours', th: 'เช่น ไกด์สมชาย หรือ น้าอู๊ด พาทัวร์' }) : t({ en: 'Enter a business name', th: 'กรอกชื่อร้าน' }))}
        {dropdownHeader(t({ en: 'Service area', th: 'พื้นที่ให้บริการ' }), t(AREAS.find((area) => area.key === form.areaKey)?.name ?? { en: 'Select area', th: 'เลือกพื้นที่' }), 'area')}
        {openDropdown === 'area' ? <View style={{ backgroundColor: '#F0F9FD', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>{AREAS.map((area) => <Pressable key={area.key} onPress={() => { selectArea(area.key); setOpenDropdown(null); }} accessibilityRole="button" style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#D7EAF0' }}><Text style={{ color: form.areaKey === area.key ? blue : '#123B64', fontWeight: form.areaKey === area.key ? '700' : '400' }}>{t(area.name)}{form.areaKey === area.key ? ' ✓' : ''}</Text></Pressable>)}</View> : null}
        {form.category === 'ไกด์นำเที่ยว' ? <>
          {sectionTitle('Expertise & skills', 'ความเชี่ยวชาญและความสามารถ')}
          <View style={{ marginBottom: 12 }}>{dropdownHeader(t({ en: 'Languages', th: 'ภาษาที่สื่อสารได้' }), form.guideLanguages.length ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ flexDirection: 'row', gap: 3 }}>{form.guideLanguages.slice(0, 4).map((name) => <GuideLanguageFlag key={name} language={name} size={22} />)}</View><Text style={{ color: '#123B64' }} numberOfLines={1}>{form.guideLanguages.map(guideLanguageLabel).join(', ')}</Text></View> : t({ en: 'Select languages', th: 'เลือกภาษา' }), 'language', form.guideLanguages.map(guideLanguageLabel).join(', '))}{openDropdown === 'language' ? <View style={{ backgroundColor: '#F0F9FD', borderRadius: 12, padding: 10 }}><TextInput value={languageQuery} onChangeText={setLanguageQuery} placeholder={t({ en: 'Search language', th: 'ค้นหาภาษา' })} style={inputStyle} accessibilityLabel={t({ en: 'Search language', th: 'ค้นหาภาษา' })} /><Text style={{ color: '#64748B', fontSize: 12, marginVertical: 8 }}>{t({ en: 'Select one or more languages', th: 'เลือกได้มากกว่า 1 ภาษา' })}</Text><ScrollView nestedScrollEnabled style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">{visibleLanguages.map((language) => { const selected = form.guideLanguages.includes(language.name); return <Pressable key={language.name} onPress={() => toggleGuideLanguage(language.name)} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderRadius: 10, backgroundColor: selected ? '#D8F0F8' : 'transparent' }}><GuideLanguageFlag language={language.name} size={28} /><Text style={{ color: '#123B64', flex: 1 }}>{guideLanguageLabel(language.name)}</Text><Text style={{ color: blue }}>{selected ? '✓' : ''}</Text></Pressable>; })}{visibleLanguages.length === 0 ? <Text style={{ color: '#64748B', padding: 10 }}>{t({ en: 'No matching language', th: 'ไม่พบภาษาที่ค้นหา' })}</Text> : null}</ScrollView><Pressable onPress={() => { setOpenDropdown(null); setLanguageQuery(''); }} style={{ alignSelf: 'flex-end', padding: 10 }}><Text style={{ color: blue, fontWeight: '700' }}>{t({ en: 'Done', th: 'เสร็จสิ้น' })}</Text></Pressable></View> : null}</View>
          {form.guideLanguages.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>{form.guideLanguages.map((name) => <Pressable key={name} onPress={() => toggleGuideLanguage(name)} accessibilityLabel={t({ en: `Remove ${guideLanguageLabel(name)}`, th: `ลบภาษา ${guideLanguageLabel(name)}` })} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 18, backgroundColor: '#DDF4FA', paddingHorizontal: 10, paddingVertical: 6 }}><GuideLanguageFlag language={name} size={20} /><Text style={{ color: '#005D82' }}>{guideLanguageLabel(name)} ×</Text></Pressable>)}</View> : null}
          <Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{t({ en: 'Tour style', th: 'ประเภททัวร์/สไตล์การนำเที่ยว' })}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>{GUIDE_TOUR_STYLES.map((style) => { const selected = form.guideTourStyles.includes(style.th); return <Pressable key={style.th} onPress={() => update('guideTourStyles', selected ? form.guideTourStyles.filter((value) => value !== style.th) : [...form.guideTourStyles, style.th])} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} style={{ borderRadius: 18, backgroundColor: selected ? blue : '#E9F6FA', paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ color: selected ? '#fff' : '#123B64' }}>{selected ? '✓ ' : '+ '}{t(style)}</Text></Pressable>; })}</View>
          <View style={{ marginBottom: 12 }}><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{t({ en: 'Guide skills', th: 'ความสามารถของไกด์' })}</Text><View style={{ flexDirection: 'row', gap: 8 }}><TextInput value={skillDraft} onChangeText={setSkillDraft} onSubmitEditing={addGuideSkill} returnKeyType="done" placeholder={t({ en: 'Add one skill at a time', th: 'กรอกความสามารถทีละข้อ' })} style={[inputStyle, { flex: 1 }]} /><Pressable onPress={addGuideSkill} style={{ backgroundColor: blue, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '700' }}>{t({ en: 'Add', th: 'เพิ่ม' })}</Text></Pressable></View><View style={{ gap: 6, marginTop: 8 }}>{form.guideSkills.map((skill, index) => <View key={`${skill}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F0F9FD', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ color: '#123B64', flex: 1 }}>• {skill}</Text><Pressable onPress={() => update('guideSkills', form.guideSkills.filter((_, i) => i !== index))} accessibilityLabel={t({ en: `Remove ${skill}`, th: `ลบ${skill}` })}><Text style={{ color: '#B91C1C', fontSize: 18 }}>×</Text></Pressable></View>)}</View></View>
          {sectionTitle('About the guide', 'เกี่ยวกับไกด์')}
          {field(t({ en: 'Background & experience', th: 'ประวัติและประสบการณ์' }), 'description', t({ en: 'Tell travellers about your guiding experience', th: 'เล่าประสบการณ์การนำเที่ยวของคุณ' }), true)}
        </> : <>
          {field(t({ en: 'Business details', th: 'รายละเอียดร้าน' }), 'description', t({ en: 'Describe products and services', th: 'อธิบายสินค้าและบริการ' }), true)}
          {field(t({ en: 'Address', th: 'ที่อยู่' }), 'address', t({ en: 'Street, subdistrict, district', th: 'บ้านเลขที่ ถนน ตำบล' }))}
        </>}
        {form.category !== 'ไกด์นำเที่ยว' ? <><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{t({ en: 'Business coordinates', th: 'พิกัดร้านค้า' })}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}><TextInput value={lat} onChangeText={setLat} keyboardType="decimal-pad" placeholder="Latitude" style={[inputStyle, { flex: 1 }]} /><TextInput value={lng} onChangeText={setLng} keyboardType="decimal-pad" placeholder="Longitude" style={[inputStyle, { flex: 1 }]} /></View>
        <Pressable onPress={() => { if (here) { setLat(String(here.lat)); setLng(String(here.lng)); } else setMessage(t({ en: 'Could not get the device location.', th: 'ยังไม่ได้รับตำแหน่งจากอุปกรณ์' })); }} style={{ flexDirection: 'row', gap: 5, paddingVertical: 12 }}><MapPin size={16} color={blue} /><Text style={{ color: blue }}>{t({ en: 'Use current location', th: 'ใช้ตำแหน่งปัจจุบัน' })}</Text></Pressable></> : null}
        {form.category === 'ไกด์นำเที่ยว' ? sectionTitle('Contact information', 'ช่องทางติดต่อ') : null}
        {field(t({ en: 'Contact phone', th: 'เบอร์ติดต่อ' }), 'phone')}
        {form.category === 'ไกด์นำเที่ยว' ? field('LINE ID', 'guideLineId', t({ en: 'Your LINE ID', th: 'LINE ID สำหรับติดต่อ' })) : null}
        {field(t({ en: 'Email', th: 'อีเมล' }), 'email')}{form.category !== 'ไกด์นำเที่ยว' ? field(t({ en: 'Opening hours', th: 'เวลาเปิด–ปิด' }), 'openingHours', '09:00-18:00') : null}
        {form.category === 'ไกด์นำเที่ยว' ? <>{sectionTitle('Verification', 'การยืนยันตัวตน')}<View style={{ backgroundColor: '#F0F9FD', borderRadius: 12, padding: 12, marginBottom: 12 }}><Text style={{ color: '#123B64', fontWeight: '700' }}>{t(form.guideStatus === 'approved' && !pendingGuideDocument && !pendingGuidePhoto ? { en: 'Verified guide', th: 'ยืนยันแล้ว' } : form.guideStatus === 'rejected' ? { en: 'Changes required', th: 'ต้องแก้ไขข้อมูล' } : pendingGuideDocument || form.hasGuideDocument ? { en: 'Pending review', th: 'รอการตรวจสอบ' } : { en: 'Document needed', th: 'รอส่งเอกสาร' })}</Text><Text style={{ color: '#52748A', marginTop: 4 }}>{t({ en: 'Your guide card photo is private and visible only to moderators.', th: 'ภาพบัตรมัคคุเทศก์เป็นข้อมูลส่วนตัว เฉพาะผู้ดูแลเท่านั้นที่เห็น' })}</Text><Pressable onPress={() => void uploadGuideLicense()} disabled={busy} style={[button, { marginTop: 8 }]}><Text style={{ color: '#fff', fontWeight: '700' }}>{t(form.hasGuideDocument || pendingGuideDocument ? { en: 'Replace guide card photo', th: 'เปลี่ยนภาพบัตรมัคคุเทศก์' } : { en: 'Choose guide card photo', th: 'เลือกภาพบัตรมัคคุเทศก์' })}</Text></Pressable>{pendingGuideDocument ? <View style={{ marginTop: 10, alignItems: 'center' }}><Image source={{ uri: pendingGuideDocument.uri }} style={{ width: 160, height: 100, borderRadius: 10 }} resizeMode="contain" /><Text style={{ color: '#047857', marginTop: 4 }}>{t({ en: 'Selected; uploads when you save', th: 'เลือกรูปแล้ว จะอัปโหลดเมื่อบันทึก' })}</Text><Pressable onPress={() => setPendingGuideDocument(null)} style={{ padding: 8 }}><Text style={{ color: '#B91C1C' }}>{t({ en: 'Remove selection', th: 'ยกเลิกรูปที่เลือก' })}</Text></Pressable></View> : form.hasGuideDocument ? <Text style={{ color: '#047857', marginTop: 8 }}>{t({ en: 'Guide card photo on file', th: 'มีภาพบัตรมัคคุเทศก์แล้ว' })}</Text> : null}</View></> : null}
        {form.category !== 'ไกด์นำเที่ยว' ? <><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{t({ en: 'Amenities (comma-separated)', th: 'สิ่งอำนวยความสะดวก (คั่นด้วยจุลภาค)' })}</Text><TextInput value={amenities} onChangeText={setAmenities} style={inputStyle} placeholder="Wi-Fi" /></> : null}
        <Pressable onPress={() => update('active', !form.active)} style={{ paddingVertical: 14 }}><Text style={{ color: blue }}>{form.active ? t({ en: '☑ Show profile publicly', th: '☑ แสดงโปรไฟล์' }) : t({ en: '□ Hide profile', th: '□ ซ่อนโปรไฟล์' })}</Text></Pressable>
        {editing !== 'new' ? <><View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}><Pressable onPress={() => void uploadPhoto('cover')} disabled={busy} style={{ flex: 1, padding: 12, backgroundColor: '#E9F6FA', borderRadius: 12, alignItems: 'center' }}><Camera size={18} color={blue} /><Text style={{ color: blue }}>{t({ en: 'Cover photo', th: 'รูปหน้าปก' })}</Text></Pressable><Pressable onPress={() => void uploadPhoto('interior')} disabled={busy} style={{ flex: 1, padding: 12, backgroundColor: '#E9F6FA', borderRadius: 12, alignItems: 'center' }}><Camera size={18} color={blue} /><Text style={{ color: blue }}>{t({ en: form.category === 'ไกด์นำเที่ยว' ? 'More photos' : 'Interior photo', th: form.category === 'ไกด์นำเที่ยว' ? 'รูปเพิ่มเติม' : 'รูปภายใน' })}</Text></Pressable></View><ScrollView horizontal contentContainerStyle={{ gap: 8, marginTop: 10 }}>{images.map((img) => <View key={img.id}><Image source={{ uri: shopImageUri(img.url) }} style={{ width: 110, height: 88, borderRadius: 10 }} /><Pressable onPress={() => void removeImage(img.id)}><Text style={{ color: '#B91C1C', textAlign: 'center' }}>{t({ en: 'Remove', th: 'ลบ' })} {img.kind === 'cover' ? t({ en: 'cover', th: 'หน้าปก' }) : t({ en: 'photo', th: 'รูป' })}</Text></Pressable></View>)}</ScrollView><Pressable onPress={() => void remove()} disabled={busy} style={{ padding: 14 }}><Text style={{ color: '#B91C1C', textAlign: 'center' }}>{confirmDelete ? t({ en: 'Confirm deleting this profile and all reviews', th: 'ยืนยันลบร้านค้าและรีวิวทั้งหมด' }) : t({ en: 'Delete this profile', th: 'ลบโปรไฟล์นี้' })}</Text></Pressable></> : null}
        {message ? <Text style={{ color: /failed|could not|invalid|required|ไม่สำเร็จ|ไม่พบ|กรุณา|ต้องมี|ไม่ตรง/i.test(message) ? '#B91C1C' : '#15803D', marginTop: 8 }}>{message}</Text> : null}
      </View>}
    </View>
  </ScrollView>{editing ? <View style={{ backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#D7EAF0', paddingHorizontal: 16, paddingBottom: 12, paddingTop: 2 }}><Pressable onPress={() => void save()} disabled={busy} style={[button, { maxWidth: 720, width: '100%', alignSelf: 'center', opacity: busy ? 0.6 : 1 }]}><Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? t({ en: 'Saving…', th: 'กำลังบันทึก...' }) : t(form.category === 'ไกด์นำเที่ยว' && (pendingGuideDocument || form.hasGuideDocument) ? { en: 'Submit guide profile for review', th: 'ส่งโปรไฟล์ไกด์ให้ตรวจสอบ' } : { en: 'Save profile', th: 'บันทึกข้อมูลโปรไฟล์' })}</Text></Pressable></View> : null}</>;
}
