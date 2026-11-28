/**
 * Reporting rubbish that washed up: photograph, three questions, done.
 *
 * Step one of the five in the Ko Sichang proposal ("one report's journey").
 * The traveller carries this one step and nothing else - no picking up, no
 * waiting, no chasing. Everything after it is the work of people with tools.
 *
 * WHAT THIS SCREEN WILL NOT SAY.
 *
 *   That reporting earns anything. It does not, and the screen says so twice,
 *   with the reason: pay for the button and the queue is worth nothing.
 *
 *   That faces are blurred. Nothing blurs them yet. What is true is that only
 *   municipal staff see the photograph and no route shows it publicly, so that
 *   is what the screen says, and it asks for the camera to point down.
 *
 *   That a case is finished when it is not. The status list shows where the
 *   case stands as the server reports it, including waiting.
 */
import React from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  DEBRIS_ACCESSES, DEBRIS_ACCESS_LABEL, DEBRIS_AMOUNTS, DEBRIS_AMOUNT_LABEL, DEBRIS_KINDS, DEBRIS_KIND_LABEL,
  DEBRIS_REJECT_REASON, strings,
  type DebrisAccess, type DebrisAmount, type DebrisKind, type DebrisReportView, type Fix,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { t } from '../i18n/locale.ts';
import { DebrisCaseSteps, debrisCollectionWords, debrisStatusWords } from '../components/DebrisCaseSteps.tsx';

interface Photo { uri: string; file: Blob | null; mimeType: string | null }

type Stage =
  | { kind: 'start' }
  | { kind: 'questions'; photo: Photo; fix: Fix; takenAt: string }
  | { kind: 'sent'; view: DebrisReportView };

/** How long to wait for a position before saying so. Under rock and trees a fix can hang. */
const FIX_PATIENCE_MS = 15_000;

function within<T>(ms: number, work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err: unknown) => { clearTimeout(timer); reject(err); },
    );
  });
}

const NO_POINTS = {
  en: 'Reporting earns no points. If pressing the button paid, people would press it for the pay, and the municipality could not decide anything from it.',
  th: 'การรายงานไม่ได้แต้ม ถ้าให้แต้มกับการกดปุ่ม จะมีคนกดเพื่อแต้ม แล้วเทศบาลจะใช้ข้อมูลตัดสินใจไม่ได้',
  zh: '报告不得积分。如果按按钮就有奖励，人们会为了奖励而按，市政就无法据此做决定。',
};

export function DebrisReportScreen({ onBack, onToast }: { onBack: () => void; onToast: (message: string) => void }) {
  const [stage, setStage] = React.useState<Stage>({ kind: 'start' });
  const [busy, setBusy] = React.useState(false);
  const [kinds, setKinds] = React.useState<DebrisKind[]>([]);
  const [amount, setAmount] = React.useState<DebrisAmount | null>(null);
  const [access, setAccess] = React.useState<DebrisAccess | null>(null);
  const mine = useAsync(() => api.debrisReports(), []);

  /*
    Location first, then the camera. A photograph taken by somebody whose
    phone will not say where they are is a photograph that cannot be sent,
    and finding that out after framing the shot is the worse order.
  */
  const capture = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const where = await Location.requestForegroundPermissionsAsync();
      if (!where.granted) {
        onToast(t({
          en: 'A report needs your phone’s location: it is the one thing only you can give. Allow location and try again.',
          th: 'รายงานต้องใช้ตำแหน่งของเครื่อง เพราะเป็นสิ่งเดียวที่มีแต่คุณให้ได้ เปิดการเข้าถึงตำแหน่งแล้วลองอีกครั้ง',
          zh: '报告需要手机的位置信息：这是只有您能提供的。请允许定位后再试。',
        }));
        return;
      }
      const camera = await ImagePicker.requestCameraPermissionsAsync();
      if (!camera.granted) {
        onToast(t({
          en: 'A report needs a photo taken now, from where you stand. Allow the camera and try again.',
          th: 'รายงานต้องใช้รูปที่ถ่ายตอนนี้จากจุดที่คุณยืน เปิดการเข้าถึงกล้องแล้วลองอีกครั้ง',
          zh: '报告需要现在在您所站位置拍摄的照片。请允许使用相机后再试。',
        }));
        return;
      }
      let result: ImagePicker.ImagePickerResult;
      try {
        result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      } catch {
        onToast(t(strings.quest.photoUnavailable));
        return;
      }
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;
      /*
        WHEN THE PHOTO WAS TAKEN, as near as the phone lets us say. On a phone
        the camera just fired, so it is now. On the web the "camera" is a file
        input that may also offer the gallery, so the file's own timestamp is
        used when it is older - which is what lets the server refuse a photo
        from yesterday rather than take it as fresh. The web also cannot say
        whether a position is simulated; `mocked` is only ever the phone's word.
      */
      const file = (asset as { file?: Blob & { lastModified?: number } }).file ?? null;
      const takenAt = new Date(Math.min(Date.now(), file?.lastModified ?? Date.now())).toISOString();
      let pos: Location.LocationObject;
      try {
        pos = await within(FIX_PATIENCE_MS, Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      } catch {
        onToast(t(strings.checkin.noFix));
        return;
      }
      setStage({
        kind: 'questions',
        photo: { uri: asset.uri, file, mimeType: asset.mimeType ?? null },
        fix: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? null, mocked: pos.mocked ?? false },
        takenAt,
      });
    } finally {
      setBusy(false);
    }
  };

  /*
    A ref, not `busy`: two taps in the same tick both read the old state, and
    the second report would count against the hour's cap for nothing.
  */
  const sending = React.useRef(false);
  const send = async () => {
    if (stage.kind !== 'questions' || !amount || !access || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const res = await api.submitDebrisReport({
        photo: stage.photo, position: stage.fix, takenAt: stage.takenAt, kinds, amount, access,
      });
      // A failure keeps every answer on screen: the traveller is still standing there.
      if (!res.ok) { onToast(res.error); return; }
      setStage({ kind: 'sent', view: res.data });
      // Only a report that joined a case is done with. One sent back is retaken
      // at the same beach, and the three answers have not changed.
      if (res.data.verdict !== 'rejected') { setKinds([]); setAmount(null); setAccess(null); }
      mine.reload();
    } catch {
      // Reading the photo back on the web can throw before the request is made.
      onToast(t({
        en: 'The photo could not be read to send it. Take it again: your answers are kept.',
        th: 'อ่านรูปเพื่อส่งไม่ได้ ถ่ายใหม่อีกครั้ง คำตอบของคุณยังอยู่',
        zh: '无法读取照片以发送。请重新拍摄：您的回答已保留。',
      }));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const again = () => setStage({ kind: 'start' });

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <PushHeader context={t({ en: 'Report washed-up rubbish', th: 'รายงานขยะที่ลอยมาติดหาด', zh: '报告冲上岸的垃圾' })} onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: gutter, paddingBottom: 48, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
        {stage.kind === 'start' ? (
          <Start busy={busy} onCapture={() => void capture()} reports={mine.data?.reports ?? []} />
        ) : stage.kind === 'questions' ? (
          <Questions
            photo={stage.photo} fix={stage.fix} busy={busy}
            kinds={kinds} amount={amount} access={access}
            onKind={(k) => setKinds((now) => (now.includes(k) ? now.filter((x) => x !== k) : [...now, k]))}
            onAmount={setAmount} onAccess={setAccess}
            onSend={() => void send()} onRetake={again}
          />
        ) : (
          <Sent view={stage.view} onAgain={again} onDone={onBack} />
        )}
      </ScrollView>
    </View>
  );
}

/* ----------------------------------------------------------------- start -- */

function Start({ busy, onCapture, reports }: { busy: boolean; onCapture: () => void; reports: DebrisReportView[] }) {
  return (
    <>
      <View style={card}>
        <Heading size={20}>{t({ en: 'Photograph what you see', th: 'ถ่ายจุดที่เห็น', zh: '拍下您看到的' })}</Heading>
        <Guide text={t({ en: 'Point the camera down at the ground, with no one in the frame. People in the water have not agreed to be photographed.', th: 'ก้มกล้องลงที่พื้น อย่าให้คนอยู่ในเฟรม คนที่กำลังเล่นน้ำไม่ได้ยินยอมให้ถ่าย', zh: '把镜头朝下对准地面，画面中不要有人。在水里的人没有同意被拍摄。' })} />
        <Guide text={t({ en: 'Include something to find it by - a rock, steps, a line of trees. The team uses it when they arrive.', th: 'ให้มีจุดอ้างอิงด้วย เช่น โขดหิน บันได หรือแนวต้นไม้ เจ้าหน้าที่ใช้หาจุดตอนไปถึง', zh: '拍进可以辨认位置的东西——礁石、台阶、一排树。团队到达时会用它找到地点。' })} />
        <Guide text={t({ en: 'You do not need to go close or climb down. Your phone adds the position and time itself.', th: 'ไม่ต้องเข้าใกล้ ไม่ต้องปีนลงไป เครื่องเก็บพิกัดและเวลาให้เอง', zh: '无需靠近或爬下去。手机会自动记录位置和时间。' })} />
        <Button label="Take the photo" thai="ถ่ายรูป" chinese="拍照" onPress={onCapture} busy={busy} style={{ marginTop: 6 }} />
      </View>
      <Body size={13} colour={color.brand}>{t(NO_POINTS)}</Body>
      {reports.length > 0 ? (
        <View style={card}>
          <Label size={10} colour={color.neutral600}>{t({ en: 'YOUR REPORTS', th: 'รายงานของคุณ', zh: '您的报告' })}</Label>
          {reports.map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 6 }}>
              <Body size={14}>{r.case?.number ?? t({ en: 'Sent back', th: 'ถูกตีกลับ', zh: '已退回' })}</Body>
              <Body size={13} colour={color.neutral700} style={{ flexShrink: 1, textAlign: 'right' }}>
                {r.case?.collection
                  ? t(debrisCollectionWords(r.case.collection))
                  : r.case ? t(debrisStatusWords(r.case.status)) : t(DEBRIS_REJECT_REASON[r.rejectReason ?? 'outside_area']).split(/[.。]/)[0]}
              </Body>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

const Guide = ({ text }: { text: string }) => (
  <View style={{ flexDirection: 'row', gap: 8 }}>
    <Body size={14} colour={color.brand}>•</Body>
    <Body size={14} style={{ flex: 1 }}>{text}</Body>
  </View>
);

/* ------------------------------------------------------------- questions -- */

function Questions(p: {
  photo: Photo; fix: Fix; busy: boolean;
  kinds: DebrisKind[]; amount: DebrisAmount | null; access: DebrisAccess | null;
  onKind: (k: DebrisKind) => void; onAmount: (a: DebrisAmount) => void; onAccess: (a: DebrisAccess) => void;
  onSend: () => void; onRetake: () => void;
}) {
  const where = p.fix.accuracyM != null
    ? t({ en: `±${Math.round(p.fix.accuracyM)} m · from your phone, nothing to type`, th: `±${Math.round(p.fix.accuracyM)} ม. · จากเครื่อง ไม่ต้องกรอก`, zh: `±${Math.round(p.fix.accuracyM)} 米 · 来自手机，无需填写` })
    : t({ en: 'From your phone, nothing to type', th: 'จากเครื่อง ไม่ต้องกรอก', zh: '来自手机，无需填写' });
  return (
    <>
      <View style={card}>
        <Image source={{ uri: p.photo.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.sm, backgroundColor: color.neutral200 }} accessibilityIgnoresInvertColors />
        <Body size={13} colour={color.neutral700}>{where}</Body>
        <Body size={13} colour={color.brand}>{t({ en: 'Only municipal staff see this photo. It is never shown publicly.', th: 'รูปนี้เห็นเฉพาะเจ้าหน้าที่เทศบาล ไม่แสดงต่อสาธารณะ', zh: '只有市政工作人员能看到这张照片，绝不公开展示。' })}</Body>
        <Button label="Retake" thai="ถ่ายใหม่" chinese="重拍" variant="ghost" height={44} onPress={p.onRetake} />
      </View>
      <View style={card}>
        <Heading size={16}>{t({ en: '1 · What did you see (optional)', th: '1 · เห็นอะไร (ไม่บังคับ)', zh: '1 · 看到了什么（可选）' })}</Heading>
        <Chips items={DEBRIS_KINDS} label={(k) => t(DEBRIS_KIND_LABEL[k])} on={(k) => p.kinds.includes(k)} onPress={p.onKind} />
        <Heading size={16} style={{ marginTop: 6 }}>{t({ en: '2 · How much', th: '2 · มากแค่ไหน', zh: '2 · 有多少' })}</Heading>
        <Chips items={DEBRIS_AMOUNTS} label={(a) => t(DEBRIS_AMOUNT_LABEL[a])} on={(a) => p.amount === a} onPress={p.onAmount} />
        <Heading size={16} style={{ marginTop: 6 }}>{t({ en: '3 · How would someone get to it', th: '3 · คนจะเข้าไปถึงยังไง', zh: '3 · 人要怎么过去' })}</Heading>
        <Chips items={DEBRIS_ACCESSES} label={(a) => t(DEBRIS_ACCESS_LABEL[a])} on={(a) => p.access === a} onPress={p.onAccess} />
        <Body size={13} colour={color.brand}>{t({ en: 'This one matters most. It decides whether the municipality sends a truck, people on foot or the boat team - and only you know, standing there.', th: 'ข้อนี้สำคัญที่สุด มันตัดสินว่าเทศบาลจะส่งรถ ส่งคนเดิน หรือต้องรอทีมเรือ คุณคือคนเดียวที่ยืนอยู่ตรงนั้นและรู้', zh: '这一题最重要。它决定市政派车、派人步行还是等船队——只有站在那里的您知道。' })}</Body>
      </View>
      <Button label="Send report" thai="ส่งรายงาน" chinese="提交报告" onPress={p.onSend} busy={p.busy} disabled={!p.amount || !p.access} />
    </>
  );
}

function Chips<T extends string>({ items, label, on, onPress }: {
  items: readonly T[]; label: (item: T) => string; on: (item: T) => boolean; onPress: (item: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((item) => {
        const selected = on(item);
        return (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityLabel={label(item)}
            accessibilityState={{ selected }}
            onPress={() => onPress(item)}
            style={{
              minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius.lg,
              borderWidth: 1.5, borderColor: selected ? color.brand : color.neutral300,
              backgroundColor: selected ? color.brandSoft : color.surface,
            }}
          >
            <Body size={14} colour={selected ? color.brandDeep : color.text}>{label(item)}</Body>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ sent -- */

function Sent({ view, onAgain, onDone }: { view: DebrisReportView; onAgain: () => void; onDone: () => void }) {
  if (!view.case || view.verdict === 'rejected') {
    return (
      <View style={card}>
        <Heading size={20}>{t({ en: 'Sent back', th: 'ถูกตีกลับ', zh: '已退回' })}</Heading>
        <Body size={14} colour={color.accent2}>{t(DEBRIS_REJECT_REASON[view.rejectReason ?? 'outside_area'])}</Body>
        <Body size={13} colour={color.neutral700}>{t({ en: 'Nothing was kept: the photo was not stored.', th: 'ไม่ได้เก็บอะไรไว้ รูปนี้ไม่ถูกบันทึก', zh: '没有保存任何内容：照片未被存储。' })}</Body>
        <Button label="Take it again" thai="ถ่ายใหม่" chinese="重新拍摄" onPress={onAgain} />
      </View>
    );
  }
  const others = view.case.reporters - 1;
  return (
    <>
      <View style={card}>
        <Label size={10} colour={color.neutral600}>{t({ en: 'SENT', th: 'ส่งแล้ว', zh: '已提交' })}</Label>
        <Heading size={26}>{view.case.number}</Heading>
        <Body size={13} colour={color.neutral700}>{t({ en: 'It stays under “Your reports” on this screen, with where it stands.', th: 'เลขนี้อยู่ใน “รายงานของคุณ” ที่หน้านี้ พร้อมสถานะล่าสุด', zh: '它会保留在本页的“您的报告”中，并显示当前进度。' })}</Body>
        {others > 0 ? (
          <Body size={14} colour={color.brand}>{t({
            en: `Your report joined ${others} other ${others === 1 ? 'person’s' : 'people’s'} from the same spot. The more people see it, the sooner it comes up.`,
            th: `ใบของคุณถูกรวมกับของอีก ${others} คนที่ส่งจากจุดเดียวกัน ยิ่งหลายคนเห็น เทศบาลยิ่งจัดลำดับขึ้นมาก่อน`,
            zh: `您的报告已与同一地点其他 ${others} 人的报告合并。看到的人越多，处理得越早。`,
          })}</Body>
        ) : null}
      </View>
      <View style={card}>
        <DebrisCaseSteps status={view.case.status} />
        {view.access === 'boat_only' ? (
          <Body size={13} colour={color.neutral700}>{t({ en: 'Somewhere only a boat reaches may wait for the boat team’s next round. This screen will show it waiting, not go quiet.', th: 'จุดที่ต้องใช้เรืออาจต้องรอทีมเรือรอบหน้า หน้าจอนี้จะบอกตรงๆ ว่ารออยู่ ไม่เงียบหาย', zh: '只有船能到的地方可能要等船队下一轮。此页面会显示正在等待，而不是没有消息。' })}</Body>
        ) : null}
      </View>
      <Body size={13} colour={color.brand}>{t({ en: 'You earn no points for this report, and that is why the municipality can trust it.', th: 'คุณไม่ได้แต้มจากใบนี้ และนั่นคือเหตุผลที่เทศบาลเชื่อข้อมูลนี้ได้', zh: '这份报告不得积分，这正是市政可以信任它的原因。' })}</Body>
      <Button label="Back to your trip" thai="กลับไปเที่ยวต่อได้เลย" chinese="继续您的旅程" variant="secondary" onPress={onDone} />
    </>
  );
}

const card = { ...shadow.card, padding: 16, gap: 10, borderRadius: radius.md, backgroundColor: color.surface } as const;
