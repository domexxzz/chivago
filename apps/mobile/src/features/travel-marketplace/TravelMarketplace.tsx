import React from "react";
import {
  Animated,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { Body, Heading, Label } from "../../components/Type.tsx";
import { Button } from "../../components/Button.tsx";
import { SkeletonList } from "../../components/States.tsx";
import { SearchField } from "./SearchField.tsx";
import { color, gutter, radius, onFill } from "../../theme/index.ts";
import { t } from "../../i18n/locale.ts";
import { travelImage } from "./images.ts";
import { useReduceMotion } from "../../components/reduce-motion.ts";
import { getTravelListings } from "./data.ts";
import {
  IMAGE_CREDITS,
  MOCK_DESTINATIONS,
  MOCK_TESTIMONIALS,
  PHOTOS,
} from "./mockData.ts";
import { selectListings, searchProblems, formatPrice } from "./catalogue.ts";
import {
  DEFAULT_FILTERS,
  DEFAULT_SEARCH,
  type SortOrder,
} from "./types/search.ts";
import type { Listing } from "./types/listing.ts";
import { Reveal } from "./Motion.tsx";
import type { TravelViewport } from "./viewport.ts";

const words = (en: string, th: string) => t({ en, th });
const boundary = () =>
  words(
    "Fictional travel demo · not real operators or offers. Nothing is reserved or charged.",
    "ตัวอย่างท่องเที่ยวสมมติ · ไม่ใช่ผู้ประกอบการหรือข้อเสนอจริง ไม่มีการจองหรือเรียกเก็บเงิน",
  );
const control = {
  borderWidth: 1,
  borderColor: color.neutral300,
  borderRadius: radius.sm,
  padding: 12,
  color: color.text,
  minHeight: 44,
};

function Choices({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: readonly (readonly [string, string])[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ marginVertical: 6 }}>
      <Label size={10}>{label}</Label>
      <View style={{ marginTop: 8 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {choices.map(([key, text]) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${text}`}
              accessibilityState={{ selected: key === value }}
              onPress={() => onChange(key)}
              style={{
                ...control,
                backgroundColor: key === value ? color.brand : color.bg,
              }}
            >
              <Label
                size={11}
                tracking={0}
                colour={key === value ? onFill.brand : color.text}
              >
                {text}
              </Label>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

export function TravelMarketplace({
  viewport,
  scroll,
}: {
  viewport: TravelViewport;
  scroll: Animated.Value;
}) {
  const [items, setItems] = React.useState<Listing[]>([]);
  const [failed, setFailed] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState({ ...DEFAULT_SEARCH });
  const [draft, setDraft] = React.useState({ ...DEFAULT_SEARCH });
  const [filters, setFilters] = React.useState({ ...DEFAULT_FILTERS });
  const [sort, setSort] = React.useState<SortOrder>("featured");
  const [errors, setErrors] = React.useState<string[]>([]);
  const [detail, setDetail] = React.useState<Listing | null>(null);
  const [photo, setPhoto] = React.useState(0);
  const [confirmed, setConfirmed] = React.useState(false);
  const [credits, setCredits] = React.useState(false);
  const { width } = useWindowDimensions();
  const still = useReduceMotion();
  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    getTravelListings()
      .then((list) => {
        if (active) setItems(list);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const visible = selectListings(items, search, filters, sort);
  const reset = () => {
    setSearch({ ...DEFAULT_SEARCH });
    setDraft({ ...DEFAULT_SEARCH });
    setFilters({ ...DEFAULT_FILTERS });
    setSort("featured");
    setErrors([]);
  };
  const submit = () => {
    const problems = searchProblems(draft);
    setErrors(problems);
    if (!problems.length) setSearch({ ...draft });
  };
  const close = () => {
    if (confirmed) setConfirmed(false);
    else setDetail(null);
  };
  const columns = width >= 1100 ? 3 : width >= 650 ? 2 : 1;
  const desktop = width >= 1024;
  const contentWidth = Math.min(width, 1280) - (desktop ? 32 : 0) - gutter * 2;
  const cardWidth = (contentWidth - 16 * (columns - 1)) / columns;
  const destinationColumns = desktop ? 4 : width >= 480 ? 2 : 1;

  return (
    <View
      style={{
        marginTop: 24,
        borderTopWidth: 1,
        borderTopColor: color.neutral300,
        paddingTop: 22,
      }}
      testID="travel-marketplace-demo"
    >
      <View
        style={{
          maxWidth: 1280,
          width: "100%",
          alignSelf: "center",
          paddingHorizontal: gutter,
        }}
      >
        <Label size={10} colour={color.brand}>
          {words(
            "SEPARATE FICTIONAL DEMO",
            "ส่วนตัวอย่างสมมติ แยกจากการสอบถาม",
          )}
        </Label>
        <Body size={13} style={{ marginTop: 8 }}>
          {boundary()}
        </Body>
        <Reveal viewport={viewport}>
          <View
            testID="travel-hero"
            style={{
              marginTop: 18,
              overflow: "hidden",
              borderRadius: 24,
              minHeight: desktop ? 400 : 340,
              justifyContent: "center",
              backgroundColor: color.brand,
            }}
          >
            <Animated.View
              testID="travel-hero-image"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                width: "100%",
                opacity: 0.32,
                transform: still
                  ? []
                  : [
                      { scale: 1.08 },
                      {
                        translateY: scroll.interpolate({
                          inputRange: [0, 400],
                          outputRange: [0, 18],
                          extrapolate: "clamp",
                        }),
                      },
                    ],
              }}
            >
              <Image
                source={travelImage(PHOTOS.coast)}
                accessibilityLabel={PHOTOS.coast.alt}
                style={{ width: "100%", flex: 1 }}
              />
            </Animated.View>
            <View
              testID="travel-hero-copy"
              style={{
                padding: desktop ? 48 : 24,
                paddingBottom: desktop ? 88 : 64,
              }}
            >
              <Label size={10} colour={onFill.brand}>
                {words("LESS RUSH. MORE WONDER.", "ช้าลงอีกนิด ค้นพบอีกหน่อย")}
              </Label>
              <Heading
                size={width < 650 ? 32 : desktop ? 52 : 42}
                colour={onFill.brand}
                style={{ marginVertical: 18 }}
              >
                {words(
                  "A little closer to somewhere good.",
                  "ใกล้วันดี ๆ อีกนิด",
                )}
              </Heading>
              <Body colour={onFill.brand}>
                {words(
                  "Quiet stays, gentle adventures. Explore an imagined Thailand.",
                  "ที่พักสงบและทริปสบาย ๆ สำรวจประเทศไทยผ่านตัวอย่างสมมติ",
                )}
              </Body>
              <Label size={10} colour={onFill.brand} style={{ marginTop: 15 }}>
                {words(
                  "Illustrative stock photo · not a listed property",
                  "ภาพประกอบ · ไม่ใช่ภาพสถานที่ที่ลงประกาศ",
                )}
              </Label>
            </View>
          </View>
        </Reveal>
        <Reveal viewport={viewport} delay={60}>
          <View
            testID="travel-search"
            style={{
              marginTop: -40,
              padding: desktop ? 24 : 16,
              gap: 16,
              borderRadius: 24,
              backgroundColor: color.surface,
              borderWidth: 1,
              borderColor: color.neutral300,
            }}
          >
            <View testID="travel-search-row" style={{ gap: 12 }}>
              <SearchField
                label={words("Destination", "จุดหมาย")}
                accessibilityLabel="Demo destination"
                placeholder={words("Destination", "จุดหมาย")}
                value={draft.destination}
                onChangeText={(destination) =>
                  setDraft({ ...draft, destination })
                }
              />
              <SearchField
                label={words("Arrival", "วันเข้า")}
                accessibilityLabel="Demo arrival date"
                placeholder="YYYY-MM-DD"
                value={draft.checkIn}
                onChangeText={(checkIn) => setDraft({ ...draft, checkIn })}
              />
              <SearchField
                label={words("Departure", "วันออก")}
                accessibilityLabel="Demo departure date"
                placeholder="YYYY-MM-DD"
                value={draft.checkOut}
                onChangeText={(checkOut) => setDraft({ ...draft, checkOut })}
              />
              <SearchField
                label={words("Travelers (1–20)", "ผู้เดินทาง (1–20 คน)")}
                accessibilityLabel="Demo travelers"
                placeholder="Travelers (1–20)"
                keyboardType="number-pad"
                value={
                  Number.isNaN(draft.travelers) ? "" : String(draft.travelers)
                }
                onChangeText={(value) =>
                  setDraft({ ...draft, travelers: Number(value) })
                }
              />
              <Button
                label="Explore demo trips"
                thai="สำรวจทริปตัวอย่าง"
                onPress={submit}
                height={60}
                style={{ borderRadius: 16 }}
              />
            </View>
            {errors.length ? (
              <View accessibilityRole="alert">
                {errors.map((error) => (
                  <Body key={error} colour={color.accent2}>
                    {error}
                  </Body>
                ))}
              </View>
            ) : null}
            <Body size={13}>
              {words(
                "Dates do not establish availability. Prices are per person or per night, not trip totals.",
                "วันที่ไม่ได้ยืนยันห้องว่างหรือที่ว่าง ราคาเป็นราคาต่อคนหรือต่อคืน ไม่ใช่ยอดรวมทริป",
              )}
            </Body>
          </View>
        </Reveal>
        <Heading
          size={desktop ? 30 : 24}
          style={{ marginTop: 40, marginBottom: 16 }}
        >
          {words("Find your rhythm", "ค้นหาจังหวะของคุณ")}
        </Heading>
        <View
          testID="travel-destinations"
          style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}
        >
          {MOCK_DESTINATIONS.map((d, index) => (
            <View
              key={d.name}
              style={{
                width:
                  (contentWidth - 16 * (destinationColumns - 1)) /
                  destinationColumns,
              }}
            >
              <Reveal viewport={viewport} delay={index * 60}>
                <Pressable
                  testID="travel-destination"
                  accessibilityRole="button"
                  accessibilityLabel={`Demo destination: ${d.name}`}
                  onPress={() => {
                    setDraft({ ...draft, destination: d.name });
                    setSearch({ ...search, destination: d.name });
                  }}
                  style={{
                    borderRadius: 20,
                    overflow: "hidden",
                    backgroundColor: color.brand,
                  }}
                >
                  <Image
                    source={travelImage(d.image)}
                    accessibilityLabel={d.image.alt}
                    style={{ height: desktop ? 220 : 180, width: "100%" }}
                  />
                  <View testID="travel-destination-label">
                    <Label
                      size={11}
                      colour={onFill.brand}
                      style={{ padding: 12 }}
                    >
                      {d.name}
                    </Label>
                  </View>
                </Pressable>
              </Reveal>
            </View>
          ))}
        </View>
        <Heading
          size={desktop ? 30 : 24}
          style={{ marginTop: 40, marginBottom: 16 }}
        >
          {words("Good days start here", "วันดี ๆ เริ่มที่นี่")}
        </Heading>
        <View
          testID="travel-filters"
          style={{
            padding: 20,
            borderRadius: 24,
            backgroundColor: color.surface,
            borderWidth: 1,
            borderColor: color.neutral300,
            marginBottom: 16,
          }}
        >
          <Choices
            label="Demo category"
            value={filters.category}
            choices={[
              ["all", "All"],
              ["tour", "Tours"],
              ["stay", "Stays"],
              ["experience", "Experiences"],
            ]}
            onChange={(category) =>
              setFilters({
                ...filters,
                category: category as typeof filters.category,
              })
            }
          />
          <Choices
            label="Maximum base price"
            value={String(filters.maxPrice)}
            choices={["500", "1000", "2000", "3000", "5000"].map((v) => [
              v,
              `${v} THB`,
            ])}
            onChange={(v) => setFilters({ ...filters, maxPrice: Number(v) })}
          />
          <Choices
            label="Minimum demo rating"
            value={String(filters.minRating)}
            choices={[
              ["0", "Any"],
              ["4.8", "4.8+"],
              ["4.9", "4.9+"],
            ]}
            onChange={(v) => setFilters({ ...filters, minRating: Number(v) })}
          />
          <Choices
            label="Demo duration"
            value={filters.duration}
            choices={[
              ["all", "Any"],
              ["short", "Up to 4 hours"],
              ["day", "4–24 hours"],
              ["long", "Over 24 hours"],
            ]}
            onChange={(duration) =>
              setFilters({
                ...filters,
                duration: duration as typeof filters.duration,
              })
            }
          />
          <Choices
            label="Demo sort"
            value={sort}
            choices={[
              ["featured", "Our picks"],
              ["price-asc", "Price ↑"],
              ["price-desc", "Price ↓"],
              ["rating", "Rating ↓"],
            ]}
            onChange={(v) => setSort(v as SortOrder)}
          />
        </View>
        <Button
          label="Reset demo filters"
          thai="ล้างตัวกรองตัวอย่าง"
          variant="ghost"
          onPress={reset}
        />
        <Body size={13}>
          {loading
            ? "Loading demo…"
            : failed
              ? "Demo catalogue unavailable."
              : `${visible.length} fictional possibilities · ratings are made up`}
        </Body>
        {loading ? (
          <View style={{ flexDirection: "row", gap: 16, marginTop: 16 }}>
            {Array.from({ length: columns }, (_, index) => (
              <View
                key={index}
                style={{
                  width: cardWidth,
                  borderRadius: 20,
                  overflow: "hidden",
                  backgroundColor: color.surface,
                }}
              >
                <View
                  style={{ height: 180, backgroundColor: color.neutral200 }}
                />
                <SkeletonList rows={2} />
              </View>
            ))}
          </View>
        ) : null}
        {failed ? (
          <Button label="Retry demo" onPress={() => setReload((n) => n + 1)} />
        ) : null}
        {!loading && !failed && !visible.length ? (
          <Body style={{ marginVertical: 18 }}>
            {words(
              "No demo matches. Try resetting the filters.",
              "ไม่มีตัวอย่างตรงกับตัวกรอง ลองล้างตัวกรอง",
            )}
          </Body>
        ) : null}
        {!failed && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 16,
              marginTop: 14,
            }}
          >
            {visible.map((item) => (
              <View key={item.id} style={{ width: cardWidth }}>
                <Reveal viewport={viewport}>
                  <Pressable
                    testID="travel-card"
                    accessibilityRole="button"
                    accessibilityLabel={`View demo: ${item.title}`}
                    onPress={() => {
                      setDetail(item);
                      setPhoto(0);
                      setConfirmed(false);
                    }}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: color.neutral300,
                      borderRadius: 20,
                      overflow: "hidden",
                      backgroundColor: color.surface,
                      opacity: pressed ? 0.85 : 1,
                      transform: !still && pressed ? [{ translateY: -3 }] : [],
                    })}
                  >
                    <View
                      testID="travel-card-image"
                      style={{ overflow: "hidden" }}
                    >
                      <Image
                        source={travelImage(item.images[0]!)}
                        accessibilityLabel={item.images[0]!.alt}
                        style={{ width: "100%", height: 190 }}
                      />
                    </View>
                    <View style={{ padding: 16, gap: 8 }}>
                      <Label
                        size={10}
                        colour={color.brand}
                      >{`${item.category} · Fictional listing`}</Label>
                      <Body size={13}>{item.location}</Body>
                      <Heading size={19}>{item.title}</Heading>
                      <Body
                        size={13}
                      >{`★ ${item.rating} (${item.reviewCount} demo ratings) · ${item.duration}`}</Body>
                      <Body size={13}>{item.tags.join(" · ")}</Body>
                      <Heading
                        size={18}
                      >{`${formatPrice(item.price)} / ${item.priceUnit}`}</Heading>
                    </View>
                  </Pressable>
                </Reveal>
              </View>
            ))}
          </View>
        )}
        <Heading size={22} style={{ marginTop: 26 }}>
          {words("The moments that stay", "ช่วงเวลาที่น่าจดจำ")}
        </Heading>
        <Body size={13}>
          {words(
            "Fictional testimonials · not endorsements.",
            "ความคิดเห็นสมมติ · ไม่ใช่คำรับรองจริง",
          )}
        </Body>
        {MOCK_TESTIMONIALS.map((entry) => (
          <Reveal key={entry.name} viewport={viewport}>
            <View
              style={{
                padding: 16,
                marginTop: 12,
                backgroundColor: color.neutral100,
                borderRadius: radius.md,
              }}
            >
              <Body>{`“${entry.quote}”`}</Body>
              <Label
                size={10}
                style={{ marginTop: 8 }}
              >{`${entry.name} · fictional traveler`}</Label>
            </View>
          </Reveal>
        ))}
        <Reveal viewport={viewport}>
          <View
            style={{
              padding: 22,
              marginTop: 22,
              backgroundColor: color.brand,
              borderRadius: radius.md,
            }}
          >
            <Heading size={24} colour={onFill.brand}>
              {words(
                "Good for your trip. Better for your pace.",
                "ดีต่อทริป ดีต่อจังหวะของคุณ",
              )}
            </Heading>
            <Body colour={onFill.brand} style={{ marginTop: 12 }}>
              {words(
                "Clear example prices. No account. No payment collected. Explore without a booking commitment.",
                "ราคาตัวอย่างชัดเจน ไม่ต้องมีบัญชี ไม่มีการรับเงิน สำรวจได้โดยไม่มีข้อผูกมัดการจอง",
              )}
            </Body>
          </View>
        </Reveal>
        <Button
          label={
            credits ? "Hide demo image credits" : "Demo image credits & license"
          }
          thai={
            credits ? "ซ่อนเครดิตภาพตัวอย่าง" : "เครดิตและสิทธิ์ภาพตัวอย่าง"
          }
          variant="ghost"
          onPress={() => setCredits(!credits)}
        />
        {credits ? (
          <View>
            <Body size={13}>
              Locally stored illustrative photos · Pexels License · no creator
              endorsement.
            </Body>
            {IMAGE_CREDITS.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="link"
                accessibilityLabel={`Photo credit: ${c.creator}`}
                onPress={() => {
                  void Linking.openURL(c.source);
                }}
                style={{ paddingVertical: 10 }}
              >
                <Body size={13}>{`${c.id} · ${c.creator}`}</Body>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <Modal
        visible={detail !== null}
        transparent
        animationType={still ? "none" : "slide"}
        onRequestClose={close}
      >
        {detail ? (
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.45)",
              justifyContent: "center",
              padding: gutter,
            }}
          >
            <ScrollView
              accessibilityViewIsModal
              style={{
                flexGrow: 0,
                maxHeight: "92%",
                width: "100%",
                maxWidth: 760,
                alignSelf: "center",
                backgroundColor: color.bg,
                borderRadius: radius.md,
              }}
              contentContainerStyle={{ padding: 20, gap: 14 }}
            >
              <Button
                label={
                  confirmed ? "Back to demo details" : "Close demo details"
                }
                thai={
                  confirmed
                    ? "กลับไปดูรายละเอียดตัวอย่าง"
                    : "ปิดรายละเอียดตัวอย่าง"
                }
                variant="ghost"
                onPress={close}
              />
              <Label size={10} colour={color.brand}>
                {words("FICTIONAL DEMO", "ตัวอย่างสมมติ")}
              </Label>
              <Heading size={25}>
                {confirmed
                  ? words(
                      "Demo only — nothing booked",
                      "ตัวอย่างเท่านั้น — ไม่มีการจอง",
                    )
                  : detail.title}
              </Heading>
              <Body>{boundary()}</Body>
              {confirmed ? (
                <View accessibilityRole="alert">
                  <Body>
                    {words(
                      "Nothing has been reserved or charged. No inquiry was sent.",
                      "ไม่มีการจองหรือเรียกเก็บเงิน และไม่ได้ส่งคำถามถึงผู้ประกอบการ",
                    )}
                  </Body>
                  <Body
                    style={{ marginTop: 12 }}
                  >{`${search.travelers} travelers · ${search.checkIn || "No arrival date"} → ${search.checkOut || "No departure date"}`}</Body>
                </View>
              ) : (
                <>
                  <Image
                    source={travelImage(detail.images[photo]!)}
                    accessibilityLabel={detail.images[photo]!.alt}
                    style={{
                      width: "100%",
                      height: 240,
                      borderRadius: radius.md,
                    }}
                  />
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    {detail.images.map((im, index) => (
                      <Pressable
                        key={index}
                        accessibilityRole="button"
                        accessibilityLabel={`Demo photo ${index + 1}`}
                        accessibilityState={{ selected: photo === index }}
                        onPress={() => setPhoto(index)}
                        style={{
                          flex: 1,
                          borderWidth: 2,
                          borderColor:
                            photo === index ? color.brand : color.neutral300,
                        }}
                      >
                        <Image
                          source={travelImage(im)}
                          accessibilityLabel={im.alt}
                          style={{ width: "100%", height: 60 }}
                        />
                      </Pressable>
                    ))}
                  </View>
                  <Body>{detail.description}</Body>
                  <Heading
                    size={22}
                  >{`${formatPrice(detail.price)} / ${detail.priceUnit}`}</Heading>
                  <Label size={10}>Fictional reviews</Label>
                  {detail.reviews.map((r) => (
                    <Body
                      key={r.id}
                    >{`${r.name} · ${r.rating}/5 · ${r.text}`}</Body>
                  ))}
                  <Button
                    label="Try demo confirmation"
                    thai="ทดลองหน้าตัวอย่างยืนยัน"
                    onPress={() => setConfirmed(true)}
                  />
                </>
              )}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}
