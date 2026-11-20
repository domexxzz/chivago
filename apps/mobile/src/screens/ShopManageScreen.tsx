import React from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AREAS, type AreaKey } from '@chivago/core';
import { ArrowLeft, Camera, ChevronDown, MapPin, Plus, Store, UserRound } from 'lucide-react-native';
import { api } from '../api/client.ts';
import { SHOP_CATEGORIES, shopImageUri, type Shop, type ShopInput } from '../api/shops.ts';
import { useAuthedImage } from '../api/authed-image.ts';
import { PhotoCropper, needsCropper } from '../components/PhotoCropper.tsx';
import { useAsync } from '../state/store.tsx';
import { useHere } from '../state/here.ts';
import { t } from '../i18n/locale.ts';
import { GuideLanguageFlag, guideLanguageLabel } from '../components/GuideLanguageFlag.tsx';
import { SamuiMap } from '../components/SamuiMap.tsx';
import { ShopRewardsPanel } from '../components/ShopRewardsPanel.tsx';

const blue = '#0077B6';
type ShopManageForm = ShopInput & Pick<Shop, 'guideStatus' | 'guideProfilePhotoUrl'>;
const blank = (areaKey: AreaKey = 'samui'): ShopManageForm => ({ name: '', category: '', areaKey, description: '', address: '', lat: Number.NaN,
  lng: Number.NaN, phone: '', email: '', openingHours: '', amenities: [], active: true, serviceType: 'business', guideLanguages: [], guideSkills: [], guideTourStyles: [], guideLineId: '', guideStatus: 'not_required', guideProfilePhotoUrl: null });
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
  { en: 'Nature', th: 'ทัวร์ธรรมชาติ', zh: '自然生态' }, { en: 'Snorkelling', th: 'ดำน้ำ', zh: '浮潜' },
  { en: 'Hiking', th: 'เดินป่า', zh: '徒步' }, { en: 'Culture & temples', th: 'วัฒนธรรม/วัด', zh: '文化与寺庙' },
  { en: 'Local food', th: 'อาหารท้องถิ่น', zh: '当地美食' }, { en: 'Island hopping', th: 'เที่ยวเกาะ', zh: '跳岛游' },
] as const;

export function ShopManageScreen({ initialShopId, onBack, onOpenShop }: { initialShopId?: string | null; onBack: () => void; onOpenShop: (id: string) => void }) {
  const mine = useAsync(() => api.shops({ owner: 'me' }), []);
  const [editing, setEditing] = React.useState<string | 'new' | null>(initialShopId ?? null);
  const [form, setForm] = React.useState<ShopManageForm>(blank());
  const [lat, setLat] = React.useState('');
  const [lng, setLng] = React.useState('');
  const [pickingCoordinates, setPickingCoordinates] = React.useState(false);
  const [pickedCoordinates, setPickedCoordinates] = React.useState<{ lat: number; lng: number } | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [amenities, setAmenities] = React.useState('');
  const [languageQuery, setLanguageQuery] = React.useState('');
  const [openDropdown, setOpenDropdown] = React.useState<'category' | 'area' | 'language' | null>(null);
  const [skillDraft, setSkillDraft] = React.useState('');
  const [pendingGuidePhoto, setPendingGuidePhoto] = React.useState<ImagePicker.ImagePickerAsset | null>(null);
  /**
   * The picked photo while it is being framed, on the platform that has no
   * cropper of its own. Null everywhere else: a phone has already cropped by
   * the time the picker returns.
   */
  const [cropping, setCropping] = React.useState<ImagePicker.ImagePickerAsset | null>(null);
  /**
   * The saved photograph, fetched with the device key.
   *
   * A guide waiting for approval is not public, and `<Image>` cannot send the
   * header that proves this is their own profile - so the plain URL came back
   * 404 and the avatar rendered as an empty circle, which reads as a failed
   * upload rather than as a gate. See api/authed-image.ts.
   */
  const savedGuidePhoto = useAuthedImage(form.guideProfilePhotoUrl);
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  React.useEffect(() => setConfirmDelete(false), [editing]);
  /**
   * The banner carries whether it is good news, rather than the screen
   * sniffing the words for it.
   *
   * This line used to be coloured by a regex of English and Thai failure
   * words - /failed|could not|ไม่สำเร็จ|กรุณา|…/. A Chinese message matches
   * none of them, so every Chinese error, "照片上传失败" included, rendered in
   * the success green. A regex over copy cannot survive a new language; the
   * tone belongs with the message.
   */
  const [message, setMessage] = React.useState<{ text: string; ok: boolean } | null>(null);
  const fail = (text: string) => setMessage({ text, ok: false });
  const done = (text: string) => setMessage({ text, ok: true });
  const [images, setImages] = React.useState<{ id: string; kind: string; url: string }[]>([]);
  const here = useHere();
  const pickerArea = AREAS.find((area) => area.key === form.areaKey)!;
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
  const openNew = () => { const next = blank(); setForm(next); setLat(''); setLng(''); setAmenities(''); setLanguageQuery(''); setOpenDropdown(null); setSkillDraft(''); setPendingGuidePhoto(null); setMessage(null); setConfirmDelete(false); setEditing('new'); };
  const save = async () => {
    setBusy(true); setMessage(null);
    const data = { ...form, serviceType: form.category === 'ไกด์นำเที่ยว' ? 'guide' as const : 'business' as const,
      lat: form.category === 'ไกด์นำเที่ยว' ? null : lat.trim() ? Number(lat) : Number.NaN,
      lng: form.category === 'ไกด์นำเที่ยว' ? null : lng.trim() ? Number(lng) : Number.NaN,
      amenities: amenities.split(',').map((v) => v.trim()).filter(Boolean) };
    const result = editing === 'new' ? await api.createShop(data) : await api.updateShop(editing!, data);
    if (!result.ok) { setBusy(false); fail(result.error); return; }
    const uploadErrors: string[] = [];
    if (result.data.serviceType === 'guide' && pendingGuidePhoto) {
      try {
        const photo = await api.uploadGuidePhoto(result.data.id, pendingGuidePhoto.uri, pendingGuidePhoto.mimeType ?? 'image/jpeg');
        if (photo.ok) { setPendingGuidePhoto(null); update('guideProfilePhotoUrl', photo.data.url); }
        else uploadErrors.push(photo.error);
      } catch { uploadErrors.push(t({ en: 'Profile photo upload failed', th: 'อัปโหลดรูปโปรไฟล์ไม่สำเร็จ', zh: '头像上传失败' })); }
    }
    mine.reload(); setEditing(result.data.id); (uploadErrors.length ? fail : done)(uploadErrors.length ? t({ en: 'Profile saved, but some images did not upload: ', th: 'บันทึกโปรไฟล์แล้ว แต่บางรูปอัปโหลดไม่สำเร็จ: ', zh: '资料已保存，但部分图片未能上传：' }) + uploadErrors.join(', ') : t(result.data.serviceType === 'guide'
      ? { en: 'Guide profile saved and is now public.', th: 'บันทึกโปรไฟล์ไกด์และแสดงบนหน้าแรกแล้ว', zh: '导游资料已保存并公开显示。' }
      : { en: 'Business saved.', th: 'บันทึกร้านค้าแล้ว', zh: '商家资料已保存。' }));
    void reloadImages(result.data.id);
    setBusy(false);
  };
  const uploadPhoto = async (kind: 'cover' | 'interior') => {
    if (!editing || editing === 'new') { fail(t({ en: 'Save the profile before adding photos.', th: 'บันทึกร้านค้าก่อนเพิ่มรูป', zh: '请先保存资料再添加照片。' })); return; }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { fail(t({ en: 'Allow photo library access to choose a picture.', th: 'กรุณาอนุญาตเข้าถึงรูปภาพ', zh: '请允许访问相册以选择图片。' })); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy(true); setMessage(null);
    try {
      const result = await api.uploadShopImage(editing, kind, picked.assets[0].uri, picked.assets[0].mimeType ?? 'image/jpeg');
      result.ok ? done(t({ en: 'Photo uploaded.', th: 'อัปโหลดรูปแล้ว', zh: '照片已上传。' })) : fail(result.error);
      if (result.ok) { mine.reload(); void reloadImages(editing); }
    } catch { fail(t({ en: 'Photo upload failed.', th: 'อัปโหลดรูปไม่สำเร็จ', zh: '照片上传失败。' })); }
    setBusy(false);
  };
  const uploadGuidePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { fail(t({ en: 'Allow photo library access to choose a profile photo.', th: 'กรุณาอนุญาตเข้าถึงรูปภาพเพื่อเลือกรูปโปรไฟล์', zh: '请允许访问相册以选择头像。' })); return; }
    // `allowsEditing` opens the platform's own square cropper on a phone and
    // is ignored on the web, which is why the web hands the picked file to
    // `PhotoCropper` instead of straight to the form.
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    if (needsCropper) setCropping(picked.assets[0]);
    else setPendingGuidePhoto(picked.assets[0]);
  };
  const removeGuidePhoto = async () => {
    if (!editing || editing === 'new') return;
    setBusy(true); setMessage(null);
    const result = await api.deleteGuidePhoto(editing);
    if (result.ok) { update('guideProfilePhotoUrl', null); mine.reload(); done(t({ en: 'Profile photo removed.', th: 'ลบรูปโปรไฟล์แล้ว', zh: '头像已删除。' })); }
    else fail(result.error);
    setBusy(false);
  };
  const remove = async () => {
    if (!editing || editing === 'new') return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setBusy(true);
    const result = await api.deleteShop(editing);
    setBusy(false);
    if (!result.ok) { fail(result.error); return; }
    setEditing(null); setConfirmDelete(false); mine.reload();
  };
  const removeImage = async (imageId: string) => {
    if (!editing || editing === 'new') return;
    setBusy(true);
    const result = await api.deleteShopImage(editing, imageId);
    setBusy(false);
    if (result.ok) { mine.reload(); void reloadImages(editing); }
    else fail(result.error);
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
  const openCoordinatePicker = () => {
    const current = lat.trim() && lng.trim() ? { lat: Number(lat), lng: Number(lng) } : null;
    setPickedCoordinates(current && Number.isFinite(current.lat) && Number.isFinite(current.lng) ? current : null);
    setPickingCoordinates(true);
  };
  const acceptPickedCoordinates = () => {
    if (!pickedCoordinates) return;
    setLat(pickedCoordinates.lat.toFixed(6));
    setLng(pickedCoordinates.lng.toFixed(6));
    setPickingCoordinates(false);
  };
  const visibleLanguages = GUIDE_LANGUAGE_OPTIONS.filter((language) => {
    const query = languageQuery.trim().toLocaleLowerCase();
    return !query || `${language.name} ${language.search}`.toLocaleLowerCase().includes(query);
  });
  const categoryLabel = (category: string) => t({ en: category === 'ไกด์นำเที่ยว' ? 'Tour guide' : category === 'ที่พัก' ? 'Accommodation' : category === 'ร้านอาหาร' ? 'Restaurant' : category === 'ร้านขายของ' ? 'Souvenirs & shopping' : category === 'เช่ารถ' ? 'Car rental' : category === 'เสริมสวย' ? 'Beauty' : category === 'ตัดผม' ? 'Haircut' : 'Other', th: category, zh: category === 'ไกด์นำเที่ยว' ? '导游' : category === 'ที่พัก' ? '住宿' : category === 'ร้านอาหาร' ? '餐厅' : category === 'ร้านขายของ' ? '伴手礼/购物' : category === 'เช่ารถ' ? '租车' : category === 'เสริมสวย' ? '美容' : category === 'ตัดผม' ? '理发' : '其他' });
  const sectionTitle = (en: string, th: string, zh: string) => <Text style={{ color: '#0077B6', fontSize: 15, fontWeight: '800', marginTop: 18, marginBottom: 12 }}>{t({ en, th, zh })}</Text>;
  const dropdownHeader = (label: string, value: React.ReactNode, key: 'category' | 'area' | 'language', accessibilityValue = typeof value === 'string' ? value : '') => <View style={{ marginBottom: 6 }}><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{label}</Text><Pressable onPress={() => setOpenDropdown((current) => current === key ? null : key)} accessibilityRole="button" accessibilityState={{ expanded: openDropdown === key }} accessibilityLabel={`${label}: ${accessibilityValue}`} style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}><View style={{ flex: 1 }}>{typeof value === 'string' ? <Text style={{ color: '#123B64' }} numberOfLines={1}>{value}</Text> : value}</View><ChevronDown size={18} color={blue} /></Pressable></View>;
  const field = (label: string, key: keyof ShopInput, placeholder = '', multiline = false) => <View style={{ marginBottom: 12 }}><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{label}</Text><TextInput value={String(form[key] ?? '')} onChangeText={(v) => update(key, v)} placeholder={placeholder} multiline={multiline} style={[inputStyle, multiline && { minHeight: 85, textAlignVertical: 'top' }]} /></View>;

  return <><ScrollView style={{ flex: 1, backgroundColor: '#EAF7FB' }} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
    <View style={{ backgroundColor: '#007B9B', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Pressable onPress={editing ? () => setEditing(null) : onBack} accessibilityLabel={t({ en: 'Back', th: 'กลับ', zh: '返回' })}><ArrowLeft color="#fff" /></Pressable><Text style={{ color: '#fff', fontWeight: '700', fontSize: 19 }}>{t({ en: 'Manage my services', th: 'จัดการบริการของฉัน', zh: '管理我的服务' })}</Text></View>
    <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16 }}>
      {!editing ? <>
        <Pressable onPress={openNew} style={[button, { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 20 }]}><Plus color="#fff" size={18} /><Text style={{ color: '#fff', fontWeight: '700' }}>{t({ en: 'Add a service', th: 'เพิ่มร้านค้าหรือไกด์', zh: '添加服务' })}</Text></Pressable>
        {mine.loading && !mine.data ? <ActivityIndicator color={blue} /> : null}
        {mine.error ? <Pressable onPress={mine.reload}><Text style={{ color: '#B91C1C' }}>{mine.error} · {t({ en: 'Try again', th: 'ลองใหม่', zh: '重试' })}</Text></Pressable> : null}
        {!mine.loading && mine.data?.length === 0 ? <Text style={{ color: '#64748B' }}>{t({ en: 'You have no services yet. Add your first one.', th: 'ยังไม่มีร้านค้าหรือโปรไฟล์ไกด์ เพิ่มรายการแรกของคุณได้เลย', zh: '您还没有任何服务，先添加第一个吧。' })}</Text> : null}
        {mine.data?.map((shop) => <View key={shop.id} style={{ backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 12, flexDirection: 'row', gap: 12 }}>
          {shop.serviceType === 'guide' && shop.guideProfilePhotoUrl ? <Image source={{ uri: shopImageUri(shop.guideProfilePhotoUrl) }} style={{ width: 70, height: 70, borderRadius: 35 }} /> : shop.coverUrl ? <Image source={{ uri: shopImageUri(shop.coverUrl) }} style={{ width: 70, height: 70, borderRadius: 12 }} /> : <Store size={45} color={blue} />}
          <View style={{ flex: 1 }}><Text style={{ color: '#123B64', fontWeight: '700', fontSize: 16 }}>{shop.name}</Text><Text style={{ color: '#64748B' }}>{t({ en: shop.category === 'ไกด์นำเที่ยว' ? 'Tour guide' : shop.category, th: shop.category, zh: shop.category === 'ไกด์นำเที่ยว' ? '导游' : shop.category })} · {t(AREAS.find((a) => a.key === shop.areaKey)?.name ?? { en: shop.areaKey, th: shop.areaKey, zh: shop.areaKey })} · {t(shop.active ? { en: 'Public profile', th: 'แสดงโปรไฟล์', zh: '公开资料' } : { en: 'Hidden', th: 'ซ่อนโปรไฟล์', zh: '已隐藏' })}</Text><View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}><Pressable onPress={() => { setPendingGuidePhoto(null); setEditing(shop.id); }}><Text style={{ color: blue }}>{t({ en: 'Edit', th: 'แก้ไข', zh: '编辑' })}</Text></Pressable><Pressable onPress={() => onOpenShop(shop.id)}><Text style={{ color: blue }}>{t({ en: 'View profile', th: 'ดูโปรไฟล์', zh: '查看资料' })}</Text></Pressable></View></View>
        </View>)}
      </> : editing !== 'new' && !mine.data?.some((shop) => shop.id === editing) ? <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18 }}><Text style={{ color: '#123B64' }}>{mine.loading ? t({ en: 'Loading service…', th: 'กำลังโหลดร้านค้า...', zh: '正在加载服务…' }) : mine.error ?? t({ en: 'This service was not found in your account.', th: 'ไม่พบร้านค้านี้ในบัญชีของคุณ', zh: '您的账户中未找到此服务。' })}</Text><Pressable onPress={mine.reload} style={{ paddingTop: 10 }}><Text style={{ color: blue }}>{t({ en: 'Try again', th: 'ลองใหม่', zh: '重试' })}</Text></Pressable></View> : <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#123B64', marginBottom: 16 }}>{editing === 'new' ? t({ en: 'Add a service profile', th: 'เพิ่มโปรไฟล์บริการ', zh: '添加服务资料' }) : t({ en: 'Edit service profile', th: 'แก้ไขโปรไฟล์บริการ', zh: '编辑服务资料' })}</Text>
        {form.category === 'ไกด์นำเที่ยว' ? sectionTitle('Basic information', 'ข้อมูลพื้นฐาน', '基本信息') : null}
        {dropdownHeader(t({ en: 'Service type', th: 'ประเภทบริการ', zh: '服务类型' }), form.category ? categoryLabel(form.category) : t({ en: 'Select service type', th: 'เลือกประเภทบริการ', zh: '选择服务类型' }), 'category')}
        {openDropdown === 'category' ? <View style={{ backgroundColor: '#F0F9FD', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>{SHOP_CATEGORIES.map((category) => <Pressable key={category} onPress={() => { setForm((prev) => ({ ...prev, category, serviceType: category === 'ไกด์นำเที่ยว' ? 'guide' : 'business' })); setOpenDropdown(null); }} accessibilityRole="button" style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#D7EAF0' }}><Text style={{ color: form.category === category ? blue : '#123B64', fontWeight: form.category === category ? '700' : '400' }}>{categoryLabel(category)}{form.category === category ? ' ✓' : ''}</Text></Pressable>)}</View> : null}
        {form.category === 'ไกด์นำเที่ยว' ? <View style={{ alignItems: 'center', marginVertical: 12 }}><Pressable onPress={() => void uploadGuidePhoto()} disabled={busy} accessibilityRole="button" accessibilityLabel={t({ en: 'Choose guide profile photo', th: 'เลือกรูปโปรไฟล์ไกด์', zh: '选择导游头像' })} style={{ width: 108, height: 108 }}><View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: '#E9F6FA', borderWidth: 3, borderColor: '#48CAE4', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{pendingGuidePhoto ? <Image source={{ uri: pendingGuidePhoto.uri }} style={{ width: 98, height: 98, borderRadius: 49 }} /> : savedGuidePhoto ? <Image source={savedGuidePhoto} style={{ width: 98, height: 98, borderRadius: 49 }} /> : <UserRound size={48} color={blue} />}</View><View style={{ position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: blue, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}><Camera size={16} color="#fff" /></View></Pressable><Text style={{ color: blue, marginTop: 7 }}>{t({ en: 'Tap to choose a profile photo', th: 'แตะเพื่อเลือกรูปโปรไฟล์', zh: '点击选择头像' })}</Text>{pendingGuidePhoto ? <Pressable onPress={() => setPendingGuidePhoto(null)} style={{ padding: 6 }}><Text style={{ color: '#B91C1C' }}>{t({ en: 'Remove selected photo', th: 'ยกเลิกรูปที่เลือก', zh: '取消所选照片' })}</Text></Pressable> : form.guideProfilePhotoUrl && editing !== 'new' ? <Pressable onPress={() => void removeGuidePhoto()} disabled={busy} style={{ padding: 6 }}><Text style={{ color: '#B91C1C' }}>{t({ en: 'Remove profile photo', th: 'ลบรูปโปรไฟล์', zh: '删除头像' })}</Text></Pressable> : null}</View> : null}
        {field(form.category === 'ไกด์นำเที่ยว' ? t({ en: 'Guide name', th: 'ชื่อไกด์', zh: '导游姓名' }) : t({ en: 'Business name', th: 'ชื่อร้าน', zh: '商家名称' }), 'name', form.category === 'ไกด์นำเที่ยว' ? t({ en: 'e.g. Guide Somchai or Uncle Ood Tours', th: 'เช่น ไกด์สมชาย หรือ น้าอู๊ด พาทัวร์', zh: '例如：颂猜导游 或 乌德大叔带团游' }) : t({ en: 'Enter a business name', th: 'กรอกชื่อร้าน', zh: '请输入商家名称' }))}
        {dropdownHeader(t({ en: 'Service area', th: 'พื้นที่ให้บริการ', zh: '服务区域' }), t(AREAS.find((area) => area.key === form.areaKey)?.name ?? { en: 'Select area', th: 'เลือกพื้นที่', zh: '选择区域' }), 'area')}
        {openDropdown === 'area' ? <View style={{ backgroundColor: '#F0F9FD', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>{AREAS.map((area) => <Pressable key={area.key} onPress={() => { selectArea(area.key); setOpenDropdown(null); }} accessibilityRole="button" style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#D7EAF0' }}><Text style={{ color: form.areaKey === area.key ? blue : '#123B64', fontWeight: form.areaKey === area.key ? '700' : '400' }}>{t(area.name)}{form.areaKey === area.key ? ' ✓' : ''}</Text></Pressable>)}</View> : null}
        {form.category === 'ไกด์นำเที่ยว' ? <>
          {sectionTitle('Expertise & skills', 'ความเชี่ยวชาญและความสามารถ', '专长与技能')}
          <View style={{ marginBottom: 12 }}>{dropdownHeader(t({ en: 'Languages', th: 'ภาษาที่สื่อสารได้', zh: '可用语言' }), form.guideLanguages.length ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ flexDirection: 'row', gap: 3 }}>{form.guideLanguages.slice(0, 4).map((name) => <GuideLanguageFlag key={name} language={name} size={22} />)}</View><Text style={{ color: '#123B64' }} numberOfLines={1}>{form.guideLanguages.map(guideLanguageLabel).join(', ')}</Text></View> : t({ en: 'Select languages', th: 'เลือกภาษา', zh: '选择语言' }), 'language', form.guideLanguages.map(guideLanguageLabel).join(', '))}{openDropdown === 'language' ? <View style={{ backgroundColor: '#F0F9FD', borderRadius: 12, padding: 10 }}><TextInput value={languageQuery} onChangeText={setLanguageQuery} placeholder={t({ en: 'Search language', th: 'ค้นหาภาษา', zh: '搜索语言' })} style={inputStyle} accessibilityLabel={t({ en: 'Search language', th: 'ค้นหาภาษา', zh: '搜索语言' })} /><Text style={{ color: '#64748B', fontSize: 12, marginVertical: 8 }}>{t({ en: 'Select one or more languages', th: 'เลือกได้มากกว่า 1 ภาษา', zh: '可选择一种或多种语言' })}</Text><ScrollView nestedScrollEnabled style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">{visibleLanguages.map((language) => { const selected = form.guideLanguages.includes(language.name); return <Pressable key={language.name} onPress={() => toggleGuideLanguage(language.name)} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderRadius: 10, backgroundColor: selected ? '#D8F0F8' : 'transparent' }}><GuideLanguageFlag language={language.name} size={28} /><Text style={{ color: '#123B64', flex: 1 }}>{guideLanguageLabel(language.name)}</Text><Text style={{ color: blue }}>{selected ? '✓' : ''}</Text></Pressable>; })}{visibleLanguages.length === 0 ? <Text style={{ color: '#64748B', padding: 10 }}>{t({ en: 'No matching language', th: 'ไม่พบภาษาที่ค้นหา', zh: '未找到匹配的语言' })}</Text> : null}</ScrollView><Pressable onPress={() => { setOpenDropdown(null); setLanguageQuery(''); }} style={{ alignSelf: 'flex-end', padding: 10 }}><Text style={{ color: blue, fontWeight: '700' }}>{t({ en: 'Done', th: 'เสร็จสิ้น', zh: '完成' })}</Text></Pressable></View> : null}</View>
          {form.guideLanguages.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>{form.guideLanguages.map((name) => <Pressable key={name} onPress={() => toggleGuideLanguage(name)} accessibilityLabel={t({ en: `Remove ${guideLanguageLabel(name)}`, th: `ลบภาษา ${guideLanguageLabel(name)}`, zh: `移除${guideLanguageLabel(name)}` })} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 18, backgroundColor: '#DDF4FA', paddingHorizontal: 10, paddingVertical: 6 }}><GuideLanguageFlag language={name} size={20} /><Text style={{ color: '#005D82' }}>{guideLanguageLabel(name)} ×</Text></Pressable>)}</View> : null}
          <Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{t({ en: 'Tour style', th: 'ประเภททัวร์/สไตล์การนำเที่ยว', zh: '导览风格' })}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>{GUIDE_TOUR_STYLES.map((style) => { const selected = form.guideTourStyles.includes(style.th); return <Pressable key={style.th} onPress={() => update('guideTourStyles', selected ? form.guideTourStyles.filter((value) => value !== style.th) : [...form.guideTourStyles, style.th])} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} style={{ borderRadius: 18, backgroundColor: selected ? blue : '#E9F6FA', paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ color: selected ? '#fff' : '#123B64' }}>{selected ? '✓ ' : '+ '}{t(style)}</Text></Pressable>; })}</View>
          <View style={{ marginBottom: 12 }}><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{t({ en: 'Guide skills', th: 'ความสามารถของไกด์', zh: '导游技能' })}</Text><View style={{ flexDirection: 'row', gap: 8 }}><TextInput value={skillDraft} onChangeText={setSkillDraft} onSubmitEditing={addGuideSkill} returnKeyType="done" placeholder={t({ en: 'Add one skill at a time', th: 'กรอกความสามารถทีละข้อ', zh: '每次添加一项技能' })} style={[inputStyle, { flex: 1 }]} /><Pressable onPress={addGuideSkill} style={{ backgroundColor: blue, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '700' }}>{t({ en: 'Add', th: 'เพิ่ม', zh: '添加' })}</Text></Pressable></View><View style={{ gap: 6, marginTop: 8 }}>{form.guideSkills.map((skill, index) => <View key={`${skill}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F0F9FD', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ color: '#123B64', flex: 1 }}>• {skill}</Text><Pressable onPress={() => update('guideSkills', form.guideSkills.filter((_, i) => i !== index))} accessibilityLabel={t({ en: `Remove ${skill}`, th: `ลบ${skill}`, zh: `移除${skill}` })}><Text style={{ color: '#B91C1C', fontSize: 18 }}>×</Text></Pressable></View>)}</View></View>
          {sectionTitle('About the guide', 'เกี่ยวกับไกด์', '关于导游')}
          {field(t({ en: 'Background & experience', th: 'ประวัติและประสบการณ์', zh: '背景与经验' }), 'description', t({ en: 'Tell travellers about your guiding experience', th: 'เล่าประสบการณ์การนำเที่ยวของคุณ', zh: '向旅行者介绍您的带团经验' }), true)}
        </> : <>
          {field(t({ en: 'Business details', th: 'รายละเอียดร้าน', zh: '店铺详情' }), 'description', t({ en: 'Describe products and services', th: 'อธิบายสินค้าและบริการ', zh: '描述您的商品与服务' }), true)}
          {field(t({ en: 'Address', th: 'ที่อยู่', zh: '地址' }), 'address', t({ en: 'Street, subdistrict, district', th: 'บ้านเลขที่ ถนน ตำบล', zh: '街道、分区、区县' }))}
        </>}
        {form.category !== 'ไกด์นำเที่ยว' ? <><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{t({ en: 'Business coordinates', th: 'พิกัดร้านค้า', zh: '店铺坐标' })}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}><TextInput value={lat} onChangeText={setLat} keyboardType="decimal-pad" placeholder={t({ en: 'Latitude', th: 'ละติจูด', zh: '纬度' })} style={[inputStyle, { flex: 1 }]} /><TextInput value={lng} onChangeText={setLng} keyboardType="decimal-pad" placeholder={t({ en: 'Longitude', th: 'ลองจิจูด', zh: '经度' })} style={[inputStyle, { flex: 1 }]} /></View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <Pressable onPress={openCoordinatePicker} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: '#E4F4F8' }}><MapPin size={16} color={blue} /><Text style={{ color: blue, fontWeight: '700' }}>{t({ en: 'Choose on map', th: 'เลือกจากแผนที่', zh: '在地图上选择' })}</Text></Pressable>
          <Pressable onPress={() => { if (here) { setLat(String(here.lat)); setLng(String(here.lng)); } else fail(t({ en: 'Could not get the device location.', th: 'ยังไม่ได้รับตำแหน่งจากอุปกรณ์', zh: '无法获取设备位置。' })); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 10 }}><MapPin size={16} color={blue} /><Text style={{ color: blue }}>{t({ en: 'Use current location', th: 'ใช้ตำแหน่งปัจจุบัน', zh: '使用当前位置' })}</Text></Pressable>
        </View></> : null}
        {form.category === 'ไกด์นำเที่ยว' ? sectionTitle('Contact information', 'ช่องทางติดต่อ', '联系方式') : null}
        {field(t({ en: 'Contact phone', th: 'เบอร์ติดต่อ', zh: '联系电话' }), 'phone')}
        {form.category === 'ไกด์นำเที่ยว' ? field('LINE ID', 'guideLineId', t({ en: 'Your LINE ID', th: 'LINE ID สำหรับติดต่อ', zh: '您的 LINE ID' })) : null}
        {field(t({ en: 'Email', th: 'อีเมล', zh: '邮箱' }), 'email')}{form.category !== 'ไกด์นำเที่ยว' ? field(t({ en: 'Opening hours', th: 'เวลาเปิด–ปิด', zh: '营业时间' }), 'openingHours', '09:00-18:00') : null}
        {form.category !== 'ไกด์นำเที่ยว' ? <><Text style={{ color: '#123B64', fontWeight: '700', marginBottom: 6 }}>{t({ en: 'Amenities (comma-separated)', th: 'สิ่งอำนวยความสะดวก (คั่นด้วยจุลภาค)', zh: '设施（用逗号分隔）' })}</Text><TextInput value={amenities} onChangeText={setAmenities} style={inputStyle} placeholder="Wi-Fi" /></> : null}
        <Pressable onPress={() => update('active', !form.active)} style={{ paddingVertical: 14 }}><Text style={{ color: blue }}>{form.active ? t({ en: '☑ Show profile publicly', th: '☑ แสดงโปรไฟล์', zh: '☑ 公开显示资料' }) : t({ en: '□ Hide profile', th: '□ ซ่อนโปรไฟล์', zh: '□ 隐藏资料' })}</Text></Pressable>
        {editing !== 'new' ? <><View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}><Pressable onPress={() => void uploadPhoto('cover')} disabled={busy} style={{ flex: 1, padding: 12, backgroundColor: '#E9F6FA', borderRadius: 12, alignItems: 'center' }}><Camera size={18} color={blue} /><Text style={{ color: blue }}>{t({ en: 'Cover photo', th: 'รูปหน้าปก', zh: '封面照片' })}</Text></Pressable><Pressable onPress={() => void uploadPhoto('interior')} disabled={busy} style={{ flex: 1, padding: 12, backgroundColor: '#E9F6FA', borderRadius: 12, alignItems: 'center' }}><Camera size={18} color={blue} /><Text style={{ color: blue }}>{t({ en: form.category === 'ไกด์นำเที่ยว' ? 'More photos' : 'Interior photo', th: form.category === 'ไกด์นำเที่ยว' ? 'รูปเพิ่มเติม' : 'รูปภายใน', zh: form.category === 'ไกด์นำเที่ยว' ? '更多照片' : '店内照片' })}</Text></Pressable></View><ScrollView horizontal contentContainerStyle={{ gap: 8, marginTop: 10 }}>{images.map((img) => <View key={img.id}><Image source={{ uri: shopImageUri(img.url) }} style={{ width: 110, height: 88, borderRadius: 10 }} /><Pressable onPress={() => void removeImage(img.id)}><Text style={{ color: '#B91C1C', textAlign: 'center' }}>{t({ en: 'Remove', th: 'ลบ', zh: '删除' })} {img.kind === 'cover' ? t({ en: 'cover', th: 'หน้าปก', zh: '封面' }) : t({ en: 'photo', th: 'รูป', zh: '照片' })}</Text></Pressable></View>)}</ScrollView><Pressable onPress={() => void remove()} disabled={busy} style={{ padding: 14 }}><Text style={{ color: '#B91C1C', textAlign: 'center' }}>{confirmDelete ? t({ en: 'Confirm deleting this profile and all reviews', th: 'ยืนยันลบร้านค้าและรีวิวทั้งหมด', zh: '确认删除此资料及全部评价' }) : t({ en: 'Delete this profile', th: 'ลบโปรไฟล์นี้', zh: '删除此资料' })}</Text></Pressable></> : null}
        {editing !== 'new' ? <ShopRewardsPanel shopId={editing} /> : null}
        {message ? <Text style={{ color: message.ok ? '#15803D' : '#B91C1C', marginTop: 8 }}>{message.text}</Text> : null}
      </View>}
    </View>
  </ScrollView>{editing ? <View style={{ backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#D7EAF0', paddingHorizontal: 16, paddingBottom: 12, paddingTop: 2 }}><Pressable onPress={() => void save()} disabled={busy} style={[button, { maxWidth: 720, width: '100%', alignSelf: 'center', opacity: busy ? 0.6 : 1 }]}><Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? t({ en: 'Saving…', th: 'กำลังบันทึก...', zh: '保存中…' }) : t({ en: 'Save profile', th: 'บันทึกข้อมูลโปรไฟล์', zh: '保存资料' })}</Text></Pressable></View> : null}
  <Modal visible={pickingCoordinates} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setPickingCoordinates(false)}>
    <View style={{ flex: 1, backgroundColor: '#EAF7FB' }}>
      <SamuiMap
        area={pickerArea}
        places={[]}
        shops={[]}
        onSelect={() => {}}
        height={windowHeight}
        compact={false}
        interactive
        fullScreenControls
        onPickCoordinate={setPickedCoordinates}
        selectedCoordinate={pickedCoordinates}
      />
      <View style={{ position: 'absolute', top: Platform.OS === 'web' ? 14 : 52, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => setPickingCoordinates(false)} accessibilityRole="button" accessibilityLabel={t({ en: 'Back', th: 'กลับ', zh: '返回' })} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 5 }}><ArrowLeft size={23} color={blue} /></Pressable>
        <Text style={{ flex: 1, color: '#123B64', fontWeight: '800', fontSize: 16, backgroundColor: 'rgba(255,255,255,0.94)', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18 }}>{t({ en: 'Tap the map to choose a location', th: 'แตะแผนที่เพื่อเลือกตำแหน่งร้าน', zh: '点击地图选择店铺位置' })}</Text>
      </View>
      <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14, backgroundColor: '#fff', borderRadius: 20, padding: 16, elevation: 8, shadowColor: '#123B64', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
        <Text style={{ color: '#123B64', fontWeight: '700' }}>{pickedCoordinates ? `${pickedCoordinates.lat.toFixed(6)}, ${pickedCoordinates.lng.toFixed(6)}` : t({ en: 'No location selected', th: 'ยังไม่ได้เลือกตำแหน่ง', zh: '尚未选择位置' })}</Text>
        <Pressable onPress={acceptPickedCoordinates} disabled={!pickedCoordinates} style={{ backgroundColor: pickedCoordinates ? blue : '#9CBAC7', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 }}><Text style={{ color: '#fff', fontWeight: '800' }}>{t({ en: 'Use this location', th: 'ใช้ตำแหน่งนี้', zh: '使用此位置' })}</Text></Pressable>
      </View>
    </View>
  </Modal>
  {cropping ? (
    <PhotoCropper
      uri={cropping.uri}
      onCancel={() => setCropping(null)}
      onDone={(croppedUri) => {
        // The cropper hands back an object URL. The upload path already
        // turns a web URI into a blob, so it needs nothing else - and the
        // result is a square, which is what the avatar was always drawn as.
        setPendingGuidePhoto({ ...cropping, uri: croppedUri, mimeType: 'image/jpeg' });
        setCropping(null);
      }}
    />
  ) : null}</>;
}
