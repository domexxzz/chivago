import React from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  ArrowLeft, Camera, CheckCircle2, Flashlight, Image as ImageIcon,
  MapPin, QrCode, RefreshCw, ShieldCheck, Upload,
} from 'lucide-react-native';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AdventureEvidence, AdventureNode, Fix } from '@chivago/core';
import { api } from '../api/client.ts';
import { locationOff } from '../state/server-config.ts';
import { t } from '../i18n/locale.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { shadow } from '../theme/index.ts';
import { enqueueActivityEvidence } from '../state/outbox.ts';
import { persistEvidencePhotos } from '../state/outbox-photo.ts';
import { deviceOutbox } from '../state/outbox-device.ts';

type Step = 'scan' | 'evidence' | 'pending' | 'success' | 'error';

const requestId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * Whether this activity needs a fix from the phone. Its policy may ask for
 * one, but not while the server has opened the fence: the server checks
 * nothing then, and the app keeps out of the GPS. See server-config.ts.
 */
async function needsFix(node: AdventureNode): Promise<boolean> {
  return node.policy.requiresGps && !(await locationOff());
}

async function currentFix(): Promise<Fix | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return null;
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracyM: position.coords.accuracy ?? null,
    mocked: position.mocked ?? false,
  };
}

export function AdventureVerificationScreen({ node, onBack, onCompleted }: {
  node: AdventureNode;
  onBack: () => void;
  onCompleted: () => void;
}) {
  const initial: Step = node.policy.requiresQr ? 'scan' : 'evidence';
  const [step, setStep] = React.useState<Step>(initial);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [torch, setTorch] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [scanId, setScanId] = React.useState<string | null>(null);
  const [photo, setPhoto] = React.useState<ImagePicker.ImagePickerAsset | null>(null);
  const [evidence, setEvidence] = React.useState<AdventureEvidence | null>(null);
  const scanning = React.useRef(false);

  const fail = (message: string) => { setError(message); setStep('error'); setBusy(false); scanning.current = false; };

  const verifyToken = async (token: string) => {
    if (scanning.current) return;
    scanning.current = true;
    setBusy(true);
    let fix: Fix | null = null;
    try {
      if (await needsFix(node)) {
        fix = await currentFix();
        if (!fix) { fail(t({ en: 'Location permission is required for this activity.', th: 'กิจกรรมนี้ต้องอนุญาตตำแหน่ง', zh: '此活动需要位置权限。' })); return; }
      }
      const result = await api.verifyAdventureQr({
        token, nodeId: node.id, clientRequestId: requestId('qr'), position: fix,
      });
      if (!result.ok) { fail(result.error); return; }
      setScanId(result.data.scanId);
      setBusy(false);
      if (result.data.activityVerified) setStep('success');
      else setStep('evidence');
    } catch {
      fail(t({ en: 'QR verification could not reach the server.', th: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อตรวจ QR', zh: '无法连接服务器验证二维码。' }));
    }
  };

  const choosePhoto = async (camera: boolean) => {
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(t({ en: 'Photo permission was not granted.', th: 'ยังไม่ได้อนุญาตใช้รูปภาพ', zh: '未授予照片权限。' }));
      return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.75 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75 });
    if (!result.canceled) setPhoto(result.assets[0] ?? null);
  };

  const submit = async () => {
    if (node.policy.requiresEvidence && !photo) {
      setError(t({ en: 'Add a photo before submitting.', th: 'เพิ่มรูปก่อนส่งหลักฐาน', zh: '提交前请添加照片。' }));
      return;
    }
    setBusy(true);
    setError('');
    const clientRequestId = requestId('evidence');
    try {
      const wantsFix = await needsFix(node);
      const fix = wantsFix ? await currentFix() : null;
      if (wantsFix && !fix) { fail(t({ en: 'Location is required to submit evidence.', th: 'ต้องใช้ตำแหน่งในการส่งหลักฐาน', zh: '提交证据需要位置信息。' })); return; }
      const selectedPhotos = photo ? [{ uri: photo.uri, mimeType: photo.mimeType }] : [];
      const queued = {
        nodeId: node.id, clientRequestId, qrScanId: scanId,
        photos: selectedPhotos, position: fix,
      };
      const draft = await api.createAdventureEvidence(node.id, clientRequestId, scanId);
      if (!draft.ok) {
        if (draft.code === 'NETWORK' || draft.code === 'TIMEOUT') {
          await enqueueActivityEvidence(deviceOutbox(), {
            ...queued, photos: await persistEvidencePhotos(queued.photos, clientRequestId),
          });
          setBusy(false); setEvidence(null); setStep('pending');
          return;
        }
        fail(draft.error); return;
      }
      const submitted = await api.submitAdventureEvidence(
        draft.data.id,
        queued.photos,
        fix,
      );
      if (!submitted.ok) {
        if (submitted.code === 'NETWORK' || submitted.code === 'TIMEOUT') {
          await enqueueActivityEvidence(deviceOutbox(), {
            ...queued, photos: await persistEvidencePhotos(queued.photos, clientRequestId),
          });
          setBusy(false); setEvidence(null); setStep('pending');
          return;
        }
        fail(submitted.error); return;
      }
      setEvidence(submitted.data);
      setBusy(false);
      setStep(submitted.data.status === 'approved' ? 'success' : 'pending');
    } catch {
      fail(t({ en: 'Evidence could not be uploaded. Your reward was not issued.', th: 'อัปโหลดหลักฐานไม่สำเร็จ และยังไม่มีการออกรางวัล', zh: '证据上传失败，尚未发放奖励。' }));
    }
  };

  if (step === 'scan') {
    if (!cameraPermission) return <Shell title={t({ en: 'QR verification', th: 'ตรวจสอบ QR', zh: '二维码验证' })} onBack={onBack}><Body>{t({ en: 'Checking camera permission…', th: 'กำลังตรวจสิทธิ์กล้อง…', zh: '正在检查相机权限…' })}</Body></Shell>;
    if (!cameraPermission.granted) {
      return <Shell title={t({ en: 'QR verification', th: 'ตรวจสอบ QR', zh: '二维码验证' })} onBack={onBack}>
        <StateIcon icon={Camera} />
        <Heading size={21}>{t({ en: 'Camera access is needed', th: 'ต้องอนุญาตใช้กล้อง', zh: '需要相机权限' })}</Heading>
        <Body style={styles.center}>{t({ en: 'The QR is read on this device, then verified by the server.', th: 'อุปกรณ์จะอ่าน QR แล้วส่งให้เซิร์ฟเวอร์ตรวจสอบ', zh: '设备读取二维码后由服务器验证。' })}</Body>
        <Action label={t({ en: 'Allow camera', th: 'อนุญาตกล้อง', zh: '允许相机' })} onPress={() => { void requestCameraPermission(); }} />
      </Shell>;
    }
    return <View style={styles.cameraRoot}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => { void verifyToken(data); }}
      />
      <View style={styles.cameraShade}>
        <View style={styles.cameraTop}><Pressable onPress={onBack} style={styles.round}><ArrowLeft size={23} color="#fff" /></Pressable><Heading colour="#fff" size={20}>{t({ en: 'Scan activity QR', th: 'สแกน QR กิจกรรม', zh: '扫描活动二维码' })}</Heading><Pressable onPress={() => setTorch((value) => !value)} style={styles.round}><Flashlight size={22} color={torch ? '#FFD75E' : '#fff'} /></Pressable></View>
        <View style={styles.scanFrame}><QrCode size={62} color="#fff" /></View>
        <Body colour="#fff" style={styles.cameraHelp}>{busy ? t({ en: 'Verifying with server…', th: 'กำลังตรวจสอบกับเซิร์ฟเวอร์…', zh: '正在与服务器验证…' }) : t({ en: 'Place the ChivaGo QR inside the frame', th: 'วาง QR ของ ChivaGo ให้อยู่ในกรอบ', zh: '将 ChivaGo 二维码放入框内' })}</Body>
      </View>
    </View>;
  }

  if (step === 'evidence') return <Shell title={t({ en: 'Activity evidence', th: 'หลักฐานกิจกรรม', zh: '活动证据' })} onBack={onBack}>
    <View style={styles.policyCard}>
      <ShieldCheck size={28} color="#06899A" />
      <View style={{ flex: 1 }}><Heading size={18}>{t(node.title)}</Heading><Body size={13} colour="#607988">{t({ en: 'The server chooses every required check.', th: 'เซิร์ฟเวอร์เป็นผู้กำหนดเงื่อนไขที่ต้องผ่านทั้งหมด', zh: '所有验证条件均由服务器决定。' })}</Body></View>
    </View>
    <View style={styles.requirements}>
      {node.policy.requiresGps ? <Requirement icon={MapPin} label={t({ en: 'Location and geofence', th: 'ตำแหน่งและขอบเขตพื้นที่', zh: '位置和地理围栏' })} /> : null}
      {node.policy.requiresQr ? <Requirement icon={QrCode} label={t({ en: 'Signed QR verified', th: 'QR ลงลายเซ็นผ่านแล้ว', zh: '签名二维码已验证' })} /> : null}
      {node.policy.requiresEvidence ? <Requirement icon={ImageIcon} label={t({ en: 'Photo evidence', th: 'หลักฐานภาพ', zh: '照片证据' })} /> : null}
      {node.policy.requiresHost ? <Requirement icon={ShieldCheck} label={t({ en: 'Host approval', th: 'ผู้ดูแลอนุมัติ', zh: '主办方审核' })} /> : null}
    </View>
    {node.policy.requiresEvidence ? <>
      <Pressable onPress={() => { void choosePhoto(true); }} style={styles.photoBox}>
        {photo ? <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" /> : <><Camera size={34} color="#088EA7" /><Text style={styles.photoLabel}>{t({ en: 'Take evidence photo', th: 'ถ่ายภาพหลักฐาน', zh: '拍摄证据照片' })}</Text></>}
      </Pressable>
      <Pressable onPress={() => { void choosePhoto(false); }} style={styles.secondary}><ImageIcon size={19} color="#087F98" /><Text style={styles.secondaryText}>{t({ en: 'Choose from library', th: 'เลือกจากคลังรูป', zh: '从相册选择' })}</Text></Pressable>
    </> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Action label={busy ? t({ en: 'Uploading…', th: 'กำลังอัปโหลด…', zh: '正在上传…' }) : t({ en: 'Submit securely', th: 'ส่งหลักฐานอย่างปลอดภัย', zh: '安全提交' })} icon={Upload} disabled={busy} onPress={() => { void submit(); }} />
  </Shell>;

  if (step === 'pending') return <Shell title={t({ en: 'Awaiting review', th: 'รอการตรวจสอบ', zh: '等待审核' })} onBack={onBack}>
    <StateIcon icon={ShieldCheck} />
    <Heading size={24}>{t({ en: 'Evidence received', th: 'รับหลักฐานแล้ว', zh: '已收到证据' })}</Heading>
    <Body style={styles.center}>{t({ en: 'A host for this location will review it. No reward or story unlock is issued while pending.', th: 'ผู้ดูแลสถานที่จะตรวจสอบ โดยระหว่างรอจะยังไม่มีรางวัลหรือการปลดล็อกเรื่องราว', zh: '地点主办方将进行审核。待审核期间不会发放奖励或解锁故事。' })}</Body>
    <View style={styles.statusPill}><Text style={styles.statusText}>{evidence?.status === 'pending_review' ? t({ en: 'Pending host review', th: 'รอผู้ดูแลตรวจสอบ', zh: '等待主办方审核' }) : evidence ? t({ en: 'Submitted', th: 'ส่งแล้ว', zh: '已提交' }) : t({ en: 'Saved offline · waiting to sync', th: 'บันทึกออฟไลน์ · รอซิงก์', zh: '已离线保存 · 等待同步' })}</Text></View>
    <Action label={t({ en: 'Back to Adventure', th: 'กลับไปหน้า Adventure', zh: '返回冒险' })} onPress={onBack} />
  </Shell>;

  if (step === 'success') return <Shell title={t({ en: 'Verified activity', th: 'กิจกรรมผ่านการตรวจสอบ', zh: '活动已验证' })} onBack={onBack}>
    <StateIcon icon={CheckCircle2} success />
    <Heading size={26}>{t({ en: 'Verification complete!', th: 'ตรวจสอบสำเร็จ!', zh: '验证完成！' })}</Heading>
    <Body style={styles.center}>{t({ en: 'The server confirmed the activity. Story, memory and rewards now come from the recorded transaction.', th: 'เซิร์ฟเวอร์ยืนยันกิจกรรมแล้ว เรื่องราว ความทรงจำ และรางวัลจะอ้างอิงจากรายการที่บันทึกจริง', zh: '服务器已确认活动，故事、记忆和奖励均来自已记录的交易。' })}</Body>
    <Action label={t({ en: 'Continue Adventure', th: 'ผจญภัยต่อ', zh: '继续冒险' })} onPress={onCompleted} />
  </Shell>;

  return <Shell title={t({ en: 'Verification failed', th: 'ตรวจสอบไม่สำเร็จ', zh: '验证失败' })} onBack={onBack}>
    <StateIcon icon={RefreshCw} />
    <Heading size={22}>{t({ en: 'Nothing was unlocked', th: 'ยังไม่มีการปลดล็อก', zh: '尚未解锁任何内容' })}</Heading>
    <Body style={styles.center}>{error}</Body>
    <Action label={t({ en: 'Try again', th: 'ลองอีกครั้ง', zh: '重试' })} onPress={() => { scanning.current = false; setError(''); setStep(initial); }} />
  </Shell>;
}

function Shell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return <ScrollView contentContainerStyle={styles.page}><View style={styles.header}><Pressable onPress={onBack} style={styles.back}><ArrowLeft size={22} color="#073D5E" /></Pressable><Heading size={21}>{title}</Heading></View><View style={styles.content}>{children}</View></ScrollView>;
}

function StateIcon({ icon: Icon, success = false }: { icon: typeof Camera; success?: boolean }) { return <View style={[styles.stateIcon, success && styles.stateIconSuccess]}><Icon size={44} color={success ? '#168B59' : '#078DA4'} /></View>; }
function Requirement({ icon: Icon, label }: { icon: typeof MapPin; label: string }) { return <View style={styles.requirement}><Icon size={18} color="#078DA4" /><Text style={styles.requirementText}>{label}</Text><CheckCircle2 size={17} color="#168B59" /></View>; }
function Action({ label, onPress, icon: Icon = ShieldCheck, disabled = false }: { label: string; onPress: () => void; icon?: typeof ShieldCheck; disabled?: boolean }) { return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, (pressed || disabled) && { opacity: disabled ? 0.55 : 0.82 }]}><Icon size={21} color="#fff" /><Text style={styles.actionText}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: '#EFFBFF', padding: 18, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.card },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', alignItems: 'center', gap: 16 },
  center: { textAlign: 'center', maxWidth: 500 },
  cameraRoot: { flex: 1, backgroundColor: '#00131E' }, cameraShade: { flex: 1, padding: 20, justifyContent: 'space-between', backgroundColor: 'rgba(0,22,35,0.32)' },
  cameraTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, round: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,20,32,0.66)', alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 270, height: 270, alignSelf: 'center', borderWidth: 4, borderColor: '#7DEBEB', borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.1)' }, cameraHelp: { textAlign: 'center', marginBottom: 30, fontWeight: '700' },
  policyCard: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#BDE8F2', ...shadow.card },
  requirements: { width: '100%', gap: 8 }, requirement: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, backgroundColor: '#E4F8F7', borderRadius: 15 }, requirementText: { flex: 1, color: '#174B60', fontWeight: '700' },
  photoBox: { width: '100%', height: 230, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed', borderColor: '#73CBDD', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }, photoLabel: { marginTop: 9, color: '#087F98', fontWeight: '800' },
  secondary: { minHeight: 48, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#8BD1DE', borderRadius: 16, backgroundColor: '#fff' }, secondaryText: { color: '#087F98', fontWeight: '800' },
  action: { width: '100%', minHeight: 55, borderRadius: 18, backgroundColor: '#079DB0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, ...shadow.card }, actionText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  stateIcon: { width: 92, height: 92, borderRadius: 46, backgroundColor: '#DDF7FA', alignItems: 'center', justifyContent: 'center' }, stateIconSuccess: { backgroundColor: '#DDF7EA' },
  statusPill: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18, backgroundColor: '#FFF1C7' }, statusText: { color: '#805E00', fontWeight: '800' }, error: { color: '#A62C35', fontWeight: '700', textAlign: 'center' },
});
