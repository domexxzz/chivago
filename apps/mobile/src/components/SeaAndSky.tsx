/**
 * The sea and sky above the area you are looking at, live from Open-Meteo
 * through the API (apps/api/src/weather.ts).
 *
 * Same card discipline as the stalls and the courts: a figure the service did
 * not just give is DATED, and when it could not be reached that is said -
 * never a nought, which on a wave height reads as a flat calm.
 *
 * It says it is not a navigation forecast, because it is not one: Open-Meteo
 * is a model, the reading is at the area's centre, and nobody should cross a
 * channel on it.
 */

import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Bell, ChevronRight, Cloud, CloudRain, CloudSun, Compass, Ship, Thermometer, Waves } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { categoriesFor, strings, weatherDescription, type AreaKey, type AreaWeather, type WeatherCategoryKey } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, platformShadow } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { Button } from './Button.tsx';
import { WeatherCategoriesBar } from './WeatherCategoriesBar.tsx';
import { t } from '../i18n/locale.ts';
import { formatDecimal, formatTime } from '../i18n/format.ts';

/** "22:45" on the island's clock, whatever the phone's own is set to. */
function clock(iso: string): string {
  return formatTime(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Bangkok' });
}

function weatherSource(data: AreaWeather | null | undefined): string {
  if (data?.provider === 'tmd-station') return t({
    en: 'Thai Meteorological Department · Ko Sichang station (WMO 48460) · waves: Open-Meteo Marine',
    th: 'กรมอุตุนิยมวิทยา · สถานีเกาะสีชัง (WMO 48460) · คลื่น: Open-Meteo Marine',
    zh: '泰国气象局 · 西昌岛气象站（WMO 48460）· 海浪：Open-Meteo Marine',
  });
  if (data?.provider === 'tmd-nwp') return t({
    en: 'Thai Meteorological Department · location NWP · waves: Open-Meteo Marine',
    th: 'กรมอุตุนิยมวิทยา · แบบจำลอง NWP ตามพิกัด · คลื่น: Open-Meteo Marine',
    zh: '泰国气象局 · 坐标 NWP 模型 · 海浪：Open-Meteo Marine',
  });
  if (data?.provider === 'open-meteo') return t({
    en: 'Open-Meteo · weather forecast and marine model',
    th: 'Open-Meteo · พยากรณ์อากาศและแบบจำลองคลื่น',
    zh: 'Open-Meteo · 天气预报与海浪模型',
  });
  return data?.source || t(strings.place.weatherVia);
}

/**
 * How long a reading is shown without a date on it. Open-Meteo steps every
 * fifteen minutes, so a quarter hour is as fresh as the feed itself gets.
 */
export const LIVE_FOR_MS = 15 * 60_000;

/** When this answer reached the phone, on the phone's own clock. */
function useReceivedAt(data: unknown): number {
  const stamp = React.useRef<{ data: unknown; at: number }>({ data: undefined, at: 0 });
  if (stamp.current.data !== data) stamp.current = { data, at: Date.now() };
  return stamp.current.at;
}

export function SeaAndSkyCard({ area, liveForMs = LIVE_FOR_MS }: { area: AreaKey; liveForMs?: number }) {
  const res = useAsync(() => api.weather(area), [area]);
  const data = res.data;
  const receivedAt = useReceivedAt(data);
  const [picked, setPicked] = React.useState<WeatherCategoryKey | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  const offered = data ? categoriesFor(data) : [];
  // The chosen tab, or the first the reading can fill. A tab that stops being
  // answerable (the sea feed drops out) falls back rather than showing empty.
  const selected = picked !== null && offered.includes(picked) ? picked : offered[0];

  const live = data?.provenance === 'live';
  const fresh = live && Date.now() - receivedAt < liveForMs;
  const condition = data ? weatherDescription(data.weatherCode) : null;
  const officialAlert = data?.officialAlerts?.[0] ?? null;

  // Nothing read: say so plainly rather than drawing an empty bar.
  const nothing = !data || offered.length === 0;
  const note = nothing
    ? t(res.error !== null || data ? strings.place.weatherDown : strings.place.weatherNoStatus)
    : !data.observedAt
      ? t(strings.place.weatherNoStatus)
      : fresh
        ? null
        : t(data.provenance === 'live'
          ? strings.place.weatherAsOf(clock(data.observedAt))
          : strings.place.weatherStale(clock(data.observedAt)));

  return (
    <View style={{ marginTop: 16, padding: 11, backgroundColor: '#F8FDFF', borderRadius: 22, borderWidth: 1, borderColor: '#BFE6EF', ...platformShadow('0 5px 16px rgba(0, 119, 182, 0.10)', { shadowColor: '#0077B6', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.10, shadowRadius: 16, elevation: 4 }) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: '#E1F8FC', alignItems: 'center', justifyContent: 'center' }}><Waves size={20} color="#08AFC3" /></View>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.76}
          style={{ flex: 1, minWidth: 0, color: '#102F55', fontSize: 18, lineHeight: 26, fontWeight: '900' }}
        >
          {t({ en: 'Today’s weather & sea', th: 'อากาศและทะเลวันนี้', zh: '今日天气与海况' })}
        </Text>
        {data ? (
          <View style={{ flexShrink: 0, alignItems: 'flex-end', gap: 2 }}>
            <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 11, backgroundColor: fresh ? '#FFF0D7' : '#FFF2D9' }}>
              <Label size={9} numberOfLines={1} tracking={0.02} colour="#D56B22">
                {fresh
                  ? data.readingKind === 'observation'
                    ? t({ en: 'OBSERVED', th: 'ตรวจวัดจริง', zh: '实测数据' })
                    : t({ en: 'FORECAST', th: 'ข้อมูลพยากรณ์', zh: '预报数据' })
                  : t({ en: 'EARLIER DATA', th: 'ข้อมูลก่อนหน้า', zh: '较早数据' })}
              </Label>
            </View>
            {data.observedAt ? (
              <Label size={9} numberOfLines={1} colour="#60778C" style={{ textTransform: 'none' }}>
                {t({ en: `Updated ${clock(data.observedAt)}`, th: `อัปเดต ${clock(data.observedAt)} น.`, zh: `${clock(data.observedAt)} 更新` })}
              </Label>
            ) : null}
          </View>
        ) : null}
      </View>

      {res.loading && !data ? <Body size={13} style={{ marginTop: 12 }}>…</Body> : null}

      {data && !nothing ? (
        <>
          <View style={{ marginTop: 10, padding: 9, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D9EEF4', flexDirection: 'row', gap: 8 }}>
            <View style={{ width: 88, paddingRight: 8, borderRightWidth: 1, borderRightColor: '#D9EEF4', alignItems: 'center', justifyContent: 'center' }}>
              <WeatherMark code={data.weatherCode} />
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 2 }}>
                <Text style={{ color: '#102F55', fontSize: 34, lineHeight: 38, fontWeight: '900' }}>{data.tempC === null ? '—' : formatDecimal(data.tempC, 1)}</Text>
                {data.tempC !== null ? <Text style={{ color: '#102F55', fontSize: 14, fontWeight: '800', marginTop: 3 }}>°C</Text> : null}
              </View>
              <Text numberOfLines={2} style={{ color: '#506B82', fontSize: 10, lineHeight: 14, fontWeight: '700', textAlign: 'center' }}>{condition ? t(condition) : t({ en: 'Condition unavailable', th: 'ไม่มีข้อมูลสภาพอากาศ', zh: '天气状况暂无' })}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', columnGap: 6, rowGap: 6 }}>
              {data.rainMm !== null ? <WeatherFact Mark={CloudRain} label={t({ en: 'Rainfall now', th: 'ฝนขณะนี้', zh: '当前降雨' })} value={`${formatDecimal(data.rainMm, 1)} mm`} /> : null}
              {data.windKn !== null ? <WeatherFact Mark={Compass} label={t({ en: 'Wind', th: 'ลม', zh: '风速' })} value={`${formatDecimal(data.windKn, 1)} ${t({ en: 'kn', th: 'นอต', zh: '节' })}${data.windDirectionDeg !== null && data.windDirectionDeg !== undefined ? ` · ${formatDecimal(data.windDirectionDeg, 0)}°` : ''}`} /> : null}
              {data.relativeHumidityPct !== null && data.relativeHumidityPct !== undefined ? <WeatherFact Mark={CloudRain} label={t({ en: 'Humidity', th: 'ความชื้น', zh: '湿度' })} value={`${formatDecimal(data.relativeHumidityPct, 0)}%`} /> : null}
              {data.wavePeriodS !== null ? <WeatherFact Mark={Thermometer} label={t({ en: 'Wave period', th: 'คาบคลื่น', zh: '波浪周期' })} value={`${formatDecimal(data.wavePeriodS, 1)} s`} /> : null}
              {data.waveHeightM !== null ? <WeatherFact Mark={Waves} label={t({ en: 'Waves', th: 'คลื่น', zh: '浪高' })} value={`${formatDecimal(data.waveHeightM, 1)} m`} /> : null}
            </View>
          </View>

          <View style={{ marginTop: 8, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 12, backgroundColor: '#FFF4DE', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <CloudSun size={20} color="#E99A14" />
            <Body size={13} colour="#7C5819" style={{ flexShrink: 1, textAlign: 'center' }}>{data.readingKind === 'observation'
              ? t({ en: 'Land conditions are observed by TMD; waves remain model data. Check official notices before sea travel.', th: 'สภาพอากาศบนบกตรวจวัดโดยกรมอุตุนิยมวิทยา ส่วนคลื่นเป็นข้อมูลแบบจำลอง ควรตรวจประกาศทางการก่อนเดินทางทางทะเล', zh: '陆地天气来自泰国气象局实测，海浪仍为模型数据；海上出行前请查看官方通知。' })
              : t({ en: 'Model forecast — check official notices before travelling by sea.', th: 'ข้อมูลจากแบบจำลอง ควรตรวจประกาศทางการก่อนเดินทางทางทะเล', zh: '模型预报；海上出行前请查看官方通知。' })}</Body>
          </View>

          <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen((open) => !open)} style={({ pressed }) => ({ marginTop: 9, minHeight: 42, borderRadius: 21, paddingHorizontal: 16, backgroundColor: pressed ? '#008D98' : '#06A6B2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 })}>
            <Heading size={13} colour="#FFFFFF">{detailsOpen ? t({ en: 'Hide details', th: 'ซ่อนรายละเอียด', zh: '收起详情' }) : t({ en: 'View data details', th: 'ดูรายละเอียดข้อมูล', zh: '查看数据详情' })}</Heading>
            <ChevronRight size={17} color="#FFFFFF" style={{ transform: [{ rotate: detailsOpen ? '90deg' : '0deg' }] }} />
          </Pressable>

          {detailsOpen && selected ? <WeatherCategoriesBar weather={data} selected={selected} onSelect={setPicked} /> : null}
        </>
      ) : null}

      {note ? <Body size={13} colour={color.neutral700} style={{ marginTop: 10 }}>{note}</Body> : null}
      {nothing ? <Button label={t(strings.place.weatherAgain)} onPress={res.reload} variant="ghost" busy={res.loading} style={{ marginTop: 4 }} /> : null}

      <Pressable
        accessibilityRole={officialAlert?.url ? 'link' : undefined}
        disabled={!officialAlert?.url}
        onPress={() => { if (officialAlert?.url) void Linking.openURL(officialAlert.url); }}
        style={({ pressed }) => ({ marginTop: 9, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 14, backgroundColor: officialAlert ? '#FFF4EA' : '#FFFFFF', borderWidth: 1, borderColor: officialAlert ? '#F3B27C' : '#D9EEF4', flexDirection: 'row', alignItems: 'center', gap: 9, opacity: pressed ? 0.82 : 1 })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Bell size={20} color="#E6A313" /><Ship size={21} color="#087FB7" /></View>
        <View style={{ flex: 1 }}>
          <Heading size={13} colour="#173A5E">{t({ en: 'Alerts & ferry status', th: 'ประกาศเตือนและสถานะเรือ', zh: '预警与渡轮状态' })}</Heading>
          <Body size={13} colour={officialAlert ? '#8A461D' : '#60778C'} style={{ marginTop: 2 }}>{officialAlert
            ? `${t({ en: 'TMD: ', th: 'กรมอุตุนิยมวิทยา: ', zh: '泰国气象局：' })}${officialAlert.title}`
            : data?.officialAlertStatus === 'none'
              ? t({ en: 'No active TMD warning. Ferry status is not connected.', th: 'ไม่พบประกาศเตือนที่กำลังใช้งานจากกรมอุตุนิยมวิทยา ส่วนสถานะเรือยังไม่ได้เชื่อมต่อ', zh: '泰国气象局暂无有效预警；渡轮状态尚未接入。' })
              : t({ en: 'Official TMD warnings or ferry status are unavailable.', th: 'ยังไม่สามารถอ่านประกาศเตือนจากกรมอุตุนิยมวิทยาหรือสถานะเรือได้', zh: '暂时无法读取泰国气象局预警或渡轮状态。' })}</Body>
        </View>
        {officialAlert?.url ? <ChevronRight size={18} color="#173A5E" /> : null}
      </Pressable>

      <Label size={10} tracking={0.02} colour={color.neutral600} style={{ marginTop: 8, textTransform: 'none' }}>{weatherSource(data)}</Label>
    </View>
  );
}

function WeatherMark({ code }: { code: number | null }) {
  const Mark = code !== null && code >= 51 ? CloudRain : code !== null && code <= 2 ? CloudSun : Cloud;
  return <View style={{ width: 54, height: 46, alignItems: 'center', justifyContent: 'center' }}><Mark size={42} color={code !== null && code <= 2 ? '#F4B522' : '#18B7C9'} strokeWidth={1.8} /></View>;
}

function WeatherFact({ Mark, label, value }: { Mark: LucideIcon; label: string; value: string }) {
  return (
    <View style={{ width: '48%', minWidth: 0, minHeight: 58, paddingHorizontal: 7, paddingVertical: 7, borderRadius: 12, backgroundColor: '#EFF9FC', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Mark size={18} color="#0AAFC0" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: '#526F84', fontSize: 9, fontWeight: '700' }}>{label}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76} style={{ color: '#102F55', fontSize: 13, fontWeight: '900', marginTop: 1 }}>{value}</Text>
      </View>
    </View>
  );
}
