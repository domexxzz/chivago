/**
 * Square-cropping a picked photograph, for the web.
 *
 * WHY ONLY THE WEB
 *
 * `ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1,1] })`
 * opens the platform's own crop UI on iOS and Android, and a person who
 * crops a photo on their phone should get the control their phone gives
 * them, not ours. On the web `allowsEditing` is silently ignored: the file
 * picker returns whatever was chosen, at whatever shape it was, and a
 * landscape photograph then sat in a circular avatar showing an ear.
 *
 * So this exists for the one platform that has no cropper, and the screen
 * only reaches for it there.
 *
 * HOW THE CROP IS COMPUTED
 *
 * The frame is what the person sees; the output is a square of OUTPUT px.
 * `zoom` is a multiple of the scale at which the image exactly covers the
 * frame, so zoom 1 is "as far out as you can go" and the frame can never
 * show emptiness. The offset is clamped for the same reason, which is also
 * why the clamp is applied in source pixels rather than screen ones: the
 * rounding that matters is the rounding the canvas will do.
 */

import React from 'react';
import { Image, Modal, PanResponder, Platform, Pressable, Text, View } from 'react-native';
import { t } from '../i18n/locale.ts';
import { FRAME, MAX_ZOOM, OUTPUT, clampOffset, cropRect, panLimit } from './photo-crop.ts';

const blue = '#0077B6';

interface Props {
  /** The picked image. A local file URI or an object URL. */
  uri: string;
  onCancel: () => void;
  /** Called with an object URL holding the cropped JPEG. */
  onDone: (croppedUri: string) => void;
}

/** Whether a cropper is needed at all. Phones have their own. */
export const needsCropper = Platform.OS === 'web';

export function PhotoCropper({ uri, onCancel, onDone }: Props) {
  const [natural, setNatural] = React.useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [busy, setBusy] = React.useState(false);
  // A ref as well as state: the pan responder is created once and would
  // otherwise close over the offset it was born with.
  const live = React.useRef({ zoom: 1, offset: { x: 0, y: 0 }, natural: null as { w: number; h: number } | null });
  live.current = { zoom, offset, natural };

  React.useEffect(() => {
    Image.getSize(uri, (w, h) => setNatural({ w, h }), () => setNatural(null));
  }, [uri]);

  const pan = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { start.current = live.current.offset; },
      onPanResponderMove: (_e, g) => {
        const s = start.current;
        const next = { x: s.x + g.dx, y: s.y + g.dy };
        const { zoom: z, natural: n } = live.current;
        if (!n) return;
        setOffset(clampOffset(next, n, z));
      },
    }),
  ).current;
  const start = React.useRef({ x: 0, y: 0 });

  const changeZoom = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, Number(next.toFixed(2))));
    setZoom(z);
    setOffset((o) => clampOffset(o, live.current.natural, z));
  };

  /**
   * Draw the framed square into a canvas and hand back an object URL.
   *
   * The source rectangle is the frame expressed in the image's own pixels,
   * so the output is as sharp as the original allows rather than as sharp as
   * the preview was.
   */
  const confirm = async () => {
    if (!natural) return;
    setBusy(true);
    try {
      const url = await drawToJpeg(uri, cropRect(natural, zoom, offset));
      onDone(url);
    } catch {
      // A crop that cannot be rendered should not strand the person on a
      // modal: hand back the original and let them save it uncropped.
      onDone(uri);
    } finally {
      setBusy(false);
    }
  };

  const scale = natural ? (FRAME / Math.min(natural.w, natural.h)) * zoom : 1;

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(5,30,45,0.72)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 18, maxWidth: 360, width: '100%' }}>
          <Text style={{ color: '#123B64', fontWeight: '700', fontSize: 17, marginBottom: 4 }}>
            {t({ en: 'Position your photo', th: 'จัดตำแหน่งรูป', zh: '调整照片位置' })}
          </Text>
          <Text style={{ color: '#52748A', fontSize: 13, marginBottom: 12 }}>
            {t({ en: 'Drag to move, and zoom until it sits the way you want.', th: 'ลากเพื่อเลื่อน และซูมจนได้ตำแหน่งที่ต้องการ', zh: '拖动可移动，缩放至合适位置。' })}
          </Text>

          <View
            {...pan.panHandlers}
            style={{ width: FRAME, height: FRAME, alignSelf: 'center', borderRadius: FRAME / 2, overflow: 'hidden', backgroundColor: '#E9F6FA' }}
          >
            {natural ? (
              <Image
                source={{ uri }}
                style={{
                  position: 'absolute',
                  width: natural.w * scale,
                  height: natural.h * scale,
                  left: FRAME / 2 - (natural.w * scale) / 2 + offset.x,
                  top: FRAME / 2 - (natural.h * scale) / 2 + offset.y,
                }}
              />
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 14 }}>
            <Pressable
              onPress={() => changeZoom(zoom - 0.25)}
              disabled={zoom <= 1}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Zoom out', th: 'ซูมออก', zh: '缩小' })}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#E9F6FA', alignItems: 'center', justifyContent: 'center', opacity: zoom <= 1 ? 0.45 : 1 }}
            >
              <Text style={{ color: blue, fontSize: 22, fontWeight: '700' }}>−</Text>
            </Pressable>
            <Text style={{ color: '#52748A', minWidth: 54, textAlign: 'center' }}>{`${Math.round(zoom * 100)}%`}</Text>
            <Pressable
              onPress={() => changeZoom(zoom + 0.25)}
              disabled={zoom >= MAX_ZOOM}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Zoom in', th: 'ซูมเข้า', zh: '放大' })}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#E9F6FA', alignItems: 'center', justifyContent: 'center', opacity: zoom >= MAX_ZOOM ? 0.45 : 1 }}
            >
              <Text style={{ color: blue, fontSize: 22, fontWeight: '700' }}>+</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => void confirm()}
            disabled={busy || !natural}
            style={{ backgroundColor: blue, borderRadius: 16, paddingVertical: 13, alignItems: 'center', marginTop: 16, opacity: busy || !natural ? 0.6 : 1 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {t({ en: 'Use this photo', th: 'ใช้รูปนี้', zh: '使用这张照片' })}
            </Text>
          </Pressable>
          <Pressable onPress={onCancel} disabled={busy} style={{ padding: 12, alignItems: 'center' }}>
            <Text style={{ color: '#B91C1C' }}>{t({ en: 'Cancel', th: 'ยกเลิก', zh: '取消' })}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The canvas step, kept apart from the component so the geometry above can be
 * read without it. Web only: it is the one place this file touches the DOM.
 */
async function drawToJpeg(uri: string, rect: { sx: number; sy: number; sSize: number }): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    // Object URLs and same-origin files need no CORS dance; a remote one
    // would taint the canvas and `toBlob` would throw, which `confirm`
    // catches and falls back from.
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('image failed to load'));
    el.src = uri;
  });

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(img, rect.sx, rect.sy, rect.sSize, rect.sSize, 0, 0, OUTPUT, OUTPUT);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('canvas produced nothing');
  return URL.createObjectURL(blob);
}
