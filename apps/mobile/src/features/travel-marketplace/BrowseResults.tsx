import React from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import {
  BedDouble,
  Check,
  Clock,
  Compass,
  Heart,
  LayoutGrid,
  MapPin,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react-native";
import { Body, Heading } from "../../components/Type.tsx";
import { Button } from "../../components/Button.tsx";
import { SkeletonList } from "../../components/States.tsx";
import { useReduceMotion } from "../../components/reduce-motion.ts";
import { color } from "../../theme/index.ts";
import {
  DEFAULT_FILTERS,
  type Filters,
  type SortOrder,
} from "./types/search.ts";
import type { Listing } from "./types/listing.ts";
import type { TravelViewport } from "./viewport.ts";
import { BrowseFilters, SortControl } from "./BrowseFilters.tsx";
import { LazyPhoto, ThaiLine } from "./BrowseDecor.tsx";
import { Reveal } from "./Motion.tsx";

const CATEGORIES = [
  { key: "all", en: "All", th: "ทั้งหมด", Icon: LayoutGrid },
  { key: "tour", en: "Tours", th: "ทัวร์", Icon: Compass },
  { key: "stay", en: "Stays", th: "ที่พัก", Icon: BedDouble },
  { key: "experience", en: "Experiences", th: "ประสบการณ์", Icon: Sparkles },
] as const;

function ActiveChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  const still = useReduceMotion();
  const progress = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => () => progress.stopAnimation(), [progress]);
  return (
    <Animated.View
      testID="browse-active-chip"
      style={{
        opacity: progress,
        transform: [
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.94, 1],
            }),
          },
        ],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove filter: ${label}`}
        onPress={() => {
          if (still) {
            onRemove();
            return;
          }
          Animated.timing(progress, {
            toValue: 0,
            duration: 140,
            useNativeDriver: Platform.OS !== "web",
          }).start(({ finished }) => {
            if (finished) onRemove();
          });
        }}
        style={{
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: "#e4f1ee",
          paddingHorizontal: 12,
          borderRadius: 12,
        }}
      >
        <Body colour={color.text}>{label}</Body>
        <X color={color.brand} size={15} />
      </Pressable>
    </Animated.View>
  );
}

function ResultCard({
  item,
  viewport,
  onOpen,
}: {
  item: Listing;
  viewport: TravelViewport;
  onOpen: (item: Listing) => void;
}) {
  const [saved, setSaved] = React.useState(false);
  const opener = React.useRef<View>(null);
  const open = () => {
    // Always restore focus to the card, including when its CTA was used.
    if (Platform.OS === "web") opener.current?.focus();
    onOpen(item);
  };
  return (
    <View
      testID="travel-card"
      style={{
        backgroundColor: "#fff",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#e5e1d7",
        overflow: "hidden",
      }}
    >
      <View
        testID="browse-card-photo"
        pointerEvents="box-none"
        style={{ height: 220, zIndex: 2 }}
      >
        <View pointerEvents="none" style={{ flex: 1 }}>
          <LazyPhoto photo={item.images[0]!} viewport={viewport} />
        </View>
        <Pressable
          testID="browse-save"
          accessibilityRole={Platform.OS === "web" ? "button" : "togglebutton"}
          {...(Platform.OS === "web" ? { "aria-pressed": saved } : {})}
          accessibilityLabel={`${saved ? "Unsave" : "Save"} demo: ${item.title}`}
          accessibilityState={{ checked: saved }}
          onPress={() => setSaved(!saved)}
          style={{
            position: "absolute",
            zIndex: 3,
            right: 12,
            top: 12,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            key={String(saved)}
            testID={saved ? "browse-heart-saved" : undefined}
          >
            <Heart
              size={20}
              color={saved ? "#a7472f" : color.text}
              fill={saved ? "#a7472f" : "transparent"}
            />
          </View>
        </Pressable>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: 8,
            backgroundColor: "rgba(7,35,50,.88)",
          }}
        >
          <Body colour="#fff" style={{ fontSize: 12, lineHeight: 17 }}>
            Illustrative stock photo · not a listed property
          </Body>
        </View>
      </View>
      <View
        testID="browse-card-copy"
        style={{ padding: 20, gap: 12, flex: 1, minWidth: 0 }}
      >
        <View
          style={{
            alignSelf: "flex-start",
            backgroundColor: "#fbefd4",
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 8,
          }}
        >
          <Body
            colour="#715018"
            style={{ fontSize: 12 }}
          >{`${item.category[0]!.toUpperCase()}${item.category.slice(1)} · Fictional listing`}</Body>
        </View>
        <Heading size={22}>{item.title}</Heading>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <MapPin size={16} color={color.brand} />
          <Body>{item.location}</Body>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Clock size={16} color={color.neutral700} />
          <Body>{item.duration}</Body>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {item.tags.slice(0, 3).map((tag) => (
            <View
              key={tag}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: "#f4f3ee",
              }}
            >
              <Body style={{ fontSize: 12 }}>{tag}</Body>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <View
            style={{
              backgroundColor: color.brand,
              borderRadius: 10,
              padding: 8,
            }}
          >
            <Heading size={16} colour="#fff">
              {String(item.rating)}
            </Heading>
          </View>
          <View>
            <Heading size={14}>
              {item.rating >= 4.8 ? "Excellent" : "Very good"}
            </Heading>
            <Body style={{ fontSize: 12 }}>Demo rating · made up</Body>
          </View>
        </View>
      </View>
      <View
        testID="browse-card-price"
        pointerEvents="box-none"
        style={{ padding: 20, gap: 8, justifyContent: "center", zIndex: 2 }}
      >
        <View pointerEvents="none" style={{ gap: 8 }}>
          <Body style={{ fontSize: 12 }}>From</Body>
          <Heading
            size={26}
          >{`฿${item.price.toLocaleString("en-US")}`}</Heading>
          <Body style={{ fontSize: 12 }}>{`per ${item.priceUnit}`}</Body>
        </View>
        <View style={{ zIndex: 2 }}>
          <Button
            label="View demo"
            icon={null}
            accessibilityLabel={`View demo: ${item.title}`}
            onPress={open}
            style={{ marginTop: 8, borderRadius: 12 }}
          />
        </View>
        <View pointerEvents="none">
          <Body style={{ fontSize: 12 }}>Nothing reservable</Body>
        </View>
      </View>
      {/* A sibling overlay makes the whole card actionable without nesting
          the save and CTA buttons inside another button. */}
      <Pressable
        ref={opener}
        testID="travel-card-open"
        accessibilityRole="button"
        accessibilityLabel={`Open details: ${item.title}`}
        onPress={open}
        style={({ pressed }) => ({
          position: "absolute",
          inset: 0,
          zIndex: 1,
          borderRadius: 20,
          backgroundColor: pressed ? "rgba(8,111,123,.06)" : "transparent",
        })}
      />
    </View>
  );
}

/** FLIP only moves transforms, using positions relative to the list so scrolling
 * does not produce a false reorder. No state or timing is added to filter logic. */
function ResultList({
  items,
  viewport,
  onOpen,
}: {
  items: Listing[];
  viewport: TravelViewport;
  onOpen: (item: Listing) => void;
}) {
  const node = React.useRef<View>(null);
  const previous = React.useRef(new Map<string, number>());
  const still = useReduceMotion();
  const revision = items.map((item) => item.id).join("|");
  React.useLayoutEffect(() => {
    if (Platform.OS !== "web") return;
    const root = node.current as unknown as HTMLElement | null;
    if (!root?.querySelectorAll) return;
    const next = new Map<string, number>();
    const animations: Animation[] = [];
    const rootTop = root.getBoundingClientRect().top;
    root
      .querySelectorAll<HTMLElement>('[data-testid^="browse-result-"]')
      .forEach((element) => {
        const id = element.dataset.testid!;
        const top = element.getBoundingClientRect().top - rootTop;
        next.set(id, top);
        if (!still && element.animate) {
          const offset = previous.current.has(id)
            ? previous.current.get(id)! - top
            : 14;
          animations.push(
            element.animate(
              [
                { opacity: 0.45, transform: `translateY(${offset}px)` },
                { opacity: 1, transform: "translateY(0)" },
              ],
              { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" },
            ),
          );
        }
      });
    previous.current = next;
    viewport.check();
    return () => animations.forEach((animation) => animation.cancel());
  }, [revision, still, viewport]);
  return (
    <View ref={node} testID="browse-results-list" style={{ gap: 16 }}>
      {items.map((item, index) => (
        <View key={item.id} testID={`browse-result-${item.id}`}>
          <Reveal viewport={viewport} delay={Math.min(index, 4) * 60}>
            <ResultCard item={item} viewport={viewport} onOpen={onOpen} />
          </Reveal>
        </View>
      ))}
    </View>
  );
}

export function BrowseResults({
  items,
  filters,
  onFilters,
  sort,
  onSort,
  destination,
  onClearDestination,
  onReset,
  loading,
  failed,
  onRetry,
  onOpen,
  viewport,
}: {
  items: Listing[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
  sort: SortOrder;
  onSort: (sort: SortOrder) => void;
  destination: string;
  onClearDestination: () => void;
  onReset: () => void;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onOpen: (item: Listing) => void;
  viewport: TravelViewport;
}) {
  const { width } = useWindowDimensions();
  const desktop = width >= 1024;
  const [sheet, setSheet] = React.useState<"filters" | "sort" | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const still = useReduceMotion();
  const openSheet = (value: "filters" | "sort") => {
    if (Platform.OS === "web" && typeof document !== "undefined")
      opener.current = document.activeElement as HTMLElement;
    setSheet(value);
  };
  const closeSheet = () => setSheet(null);
  React.useEffect(() => {
    if (sheet !== null) return;
    const frame = requestAnimationFrame(() => opener.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [sheet]);
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (destination.trim())
    chips.push({
      key: "destination",
      label: destination,
      remove: onClearDestination,
    });
  if (filters.category !== "all")
    chips.push({
      key: "category",
      label: CATEGORIES.find((c) => c.key === filters.category)!.en,
      remove: () => onFilters({ ...filters, category: "all" }),
    });
  if (filters.maxPrice !== DEFAULT_FILTERS.maxPrice)
    chips.push({
      key: "price",
      label: `Up to ฿${filters.maxPrice.toLocaleString("en-US")}`,
      remove: () =>
        onFilters({ ...filters, maxPrice: DEFAULT_FILTERS.maxPrice }),
    });
  if (filters.minRating !== 0)
    chips.push({
      key: "rating",
      label: `${filters.minRating}+ rating`,
      remove: () => onFilters({ ...filters, minRating: 0 }),
    });
  if (filters.duration !== "all")
    chips.push({
      key: "duration",
      label:
        filters.duration === "short"
          ? "Up to 4 hours"
          : filters.duration === "day"
            ? "4–24 hours"
            : "Over 24 hours",
      remove: () => onFilters({ ...filters, duration: "all" }),
    });
  const clearButton = (
    <Button
      label="Clear all"
      accessibilityLabel="Reset demo filters"
      variant="secondary"
      onPress={onReset}
      height={44}
      style={{ borderRadius: 12 }}
    />
  );
  return (
    <View testID="browse-results" style={{ marginTop: 40, gap: 20 }}>
      <Reveal viewport={viewport}>
        <View
          testID="browse-heading"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <View style={{ flex: 1 }}>
            <Body colour="#926420">สวัสดี</Body>
            <Heading size={desktop ? 32 : 26}>Good days start here</Heading>
          </View>
          <ThaiLine />
        </View>
      </Reveal>
      <Reveal viewport={viewport} delay={60}>
        <View
          testID="browse-categories"
          style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
        >
          {CATEGORIES.map(({ key, en, th, Icon }) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`Demo category: ${en}`}
              accessibilityState={{ selected: filters.category === key }}
              {...(Platform.OS === "web"
                ? { "aria-pressed": filters.category === key }
                : {})}
              onPress={() => onFilters({ ...filters, category: key })}
              style={{
                flexGrow: 1,
                flexBasis: width < 480 ? "45%" : "22%",
                minHeight: 72,
                padding: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: filters.category === key ? color.brand : "#e0ddd2",
                backgroundColor:
                  filters.category === key ? color.brand : "#fff",
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Icon
                size={22}
                color={filters.category === key ? "#fff" : color.brand}
              />
              <View style={{ flex: 1 }}>
                <Heading
                  size={16}
                  colour={filters.category === key ? "#fff" : color.text}
                >
                  {en}
                </Heading>
                <Body
                  colour={filters.category === key ? "#fff" : color.neutral700}
                  style={{ fontSize: 12 }}
                >
                  {th}
                </Body>
              </View>
              {filters.category === key ? (
                <Check size={18} color="#fff" />
              ) : null}
            </Pressable>
          ))}
        </View>
      </Reveal>
      {!desktop ? (
        <View
          testID="browse-mobile-toolbar"
          style={{
            flexDirection: "row",
            gap: 12,
            paddingVertical: 12,
            backgroundColor: "#fbf9f3",
          }}
        >
          <Button
            label={`Filters${chips.length ? ` (${chips.length})` : ""}`}
            accessibilityLabel="Open demo filters"
            variant="secondary"
            icon={<SlidersHorizontal size={18} color={color.brand} />}
            onPress={() => openSheet("filters")}
            style={{ flex: 1, borderRadius: 12 }}
          />
          <Button
            label="Sort"
            accessibilityLabel="Open demo sort"
            variant="secondary"
            onPress={() => openSheet("sort")}
            style={{ flex: 1, borderRadius: 12 }}
          />
        </View>
      ) : null}
      <View testID="browse-columns" style={{ gap: 24 }}>
        {desktop ? (
          <View
            testID="browse-sidebar"
            style={{
              padding: 20,
              borderRadius: 20,
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: "#e5e1d7",
            }}
          >
            <Heading size={20} style={{ marginBottom: 16 }}>
              Make it your kind of day
            </Heading>
            {loading ? (
              <SkeletonList rows={3} />
            ) : (
              <BrowseFilters filters={filters} onChange={onFilters} />
            )}
            {clearButton}
            <ThaiLine />
          </View>
        ) : null}
        <View testID="browse-main" style={{ flex: 1, minWidth: 0, gap: 16 }}>
          <View
            testID="browse-results-header"
            style={{
              gap: 12,
              padding: 20,
              backgroundColor: "#fff",
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "#e5e1d7",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <View style={{ gap: 8 }}>
                <View accessibilityLiveRegion="polite">
                  <View
                    key={`${items.length}-${loading}-${failed}`}
                    testID="browse-count"
                  >
                    <Heading size={22}>
                      {loading
                        ? "Finding your demo days…"
                        : failed
                          ? "Demo catalogue unavailable."
                          : `${items.length} demo results`}
                    </Heading>
                  </View>
                </View>
                <View
                  style={{
                    alignSelf: "flex-start",
                    borderRadius: 8,
                    backgroundColor: "#fbefd4",
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  }}
                >
                  <Body colour="#715018" style={{ fontSize: 12 }}>
                    Fictional demo
                  </Body>
                </View>
              </View>
              {desktop ? (
                <View style={{ width: 190, gap: 4 }}>
                  <Body style={{ fontSize: 12 }}>Sort by</Body>
                  <SortControl value={sort} onChange={onSort} />
                </View>
              ) : null}
            </View>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
              }}
            >
              {chips.map((chip) => (
                <ActiveChip
                  key={`${chip.key}-${chip.label}`}
                  label={chip.label}
                  onRemove={chip.remove}
                />
              ))}
              {clearButton}
            </View>
          </View>
          {loading ? (
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Loading demo results"
            >
              <ThaiLine />
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  testID="browse-skeleton"
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: 20,
                    padding: 20,
                    marginBottom: 16,
                  }}
                >
                  <View
                    style={{
                      height: 160,
                      backgroundColor: "#ede9df",
                      borderRadius: 12,
                    }}
                  />
                  <SkeletonList rows={2} />
                </View>
              ))}
            </View>
          ) : failed ? (
            <View style={{ gap: 16, padding: 24 }}>
              <ThaiLine large />
              <Body>The demo is taking a little detour.</Body>
              <Button label="Retry demo" onPress={onRetry} />
            </View>
          ) : items.length === 0 ? (
            <View
              testID="browse-empty"
              style={{
                alignItems: "center",
                gap: 16,
                padding: 32,
                backgroundColor: "#fff",
                borderRadius: 20,
              }}
            >
              <ThaiLine large />
              <Heading size={24}>A little room to wander</Heading>
              <Body>No demo matches. Try resetting the filters.</Body>
              {clearButton}
            </View>
          ) : (
            <ResultList items={items} viewport={viewport} onOpen={onOpen} />
          )}
        </View>
      </View>
      <Modal
        visible={sheet !== null}
        transparent
        animationType={still ? "none" : "slide"}
        onRequestClose={closeSheet}
      >
        <View
          testID="browse-sheet-root"
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(7,29,46,.5)",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close filter backdrop"
            onPress={closeSheet}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
            }}
          />
          <View
            testID="browse-sheet"
            accessibilityViewIsModal
            style={{
              maxHeight: "88%",
              width: "100%",
              maxWidth: 600,
              alignSelf: "center",
              backgroundColor: "#fbf9f3",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                padding: 20,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Heading size={22}>
                {sheet === "filters" ? "Your kind of day" : "Sort demo results"}
              </Heading>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close browse sheet"
                onPress={closeSheet}
                style={{ padding: 12 }}
              >
                <X size={22} color={color.text} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: 16,
              }}
            >
              {sheet === "filters" ? (
                <BrowseFilters filters={filters} onChange={onFilters} />
              ) : (
                <SortControl value={sort} onChange={onSort} />
              )}
            </ScrollView>
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                padding: 20,
                borderTopWidth: 1,
                borderColor: "#e5e1d7",
              }}
            >
              <Button
                label="Clear"
                accessibilityLabel="Clear sheet filters"
                variant="secondary"
                onPress={onReset}
                style={{ borderRadius: 12 }}
              />
              <Button
                label={`Show ${items.length} results`}
                onPress={closeSheet}
                style={{ flex: 1, borderRadius: 12 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
