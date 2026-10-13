import React from "react";
import { Animated, Easing, Platform, Pressable, View } from "react-native";
import { Check, ChevronDown, Minus, Plus } from "lucide-react-native";
import { Body, Heading } from "../../components/Type.tsx";
import { color, font } from "../../theme/index.ts";
import { useReduceMotion } from "../../components/reduce-motion.ts";
import type { Filters, SortOrder } from "./types/search.ts";

const PRICE_STEPS = [500, 1000, 2000, 3000, 5000] as const;
const SORT_OPTIONS: readonly (readonly [SortOrder, string])[] = [
  ["featured", "Our picks"],
  ["price-asc", "Price ↑"],
  ["price-desc", "Price ↓"],
  ["rating", "Rating ↓"],
];

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  const [mounted, setMounted] = React.useState(true);
  const progress = React.useRef(new Animated.Value(1)).current;
  const still = useReduceMotion();
  React.useEffect(() => {
    if (open) setMounted(true);
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: still ? 0 : 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
    return () => animation.stop();
  }, [open, progress, still]);
  return (
    <View
      style={{ borderTopWidth: 1, borderColor: "#e6e1d6", paddingVertical: 12 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen(!open)}
        style={{
          minHeight: 44,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Heading size={16}>{title}</Heading>
        <Animated.View
          style={{
            transform: [
              {
                rotate: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["-90deg", "0deg"],
                }),
              },
            ],
          }}
        >
          <ChevronDown size={18} color={color.text} />
        </Animated.View>
      </Pressable>
      {mounted ? (
        <Animated.View
          pointerEvents={open ? "auto" : "none"}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? "auto" : "no-hide-descendants"}
          style={{
            paddingTop: 8,
            gap: 8,
            opacity: progress,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-6, 0],
                }),
              },
            ],
          }}
        >
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

function RadioRows({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  const group = React.useId();
  if (Platform.OS === "web")
    return React.createElement(
      "div",
      {
        role: "radiogroup",
        "aria-label": label,
        style: { display: "grid", gap: 4 },
      },
      rows.map(([key, text]) =>
        React.createElement(
          "label",
          {
            key,
            "data-browse-radio": "",
            style: {
              minHeight: 44,
              boxSizing: "border-box",
              padding: "10px 12px",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
              backgroundColor: key === value ? color.brand : "transparent",
              cursor: "pointer",
            },
          },
          React.createElement("input", {
            type: "radio",
            name: group,
            value: key,
            checked: key === value,
            "aria-label": `${label}: ${text}`,
            onChange: () => onChange(key),
            style: {
              width: 20,
              height: 20,
              margin: 0,
              accentColor: color.brand,
            },
          }),
          React.createElement(
            "span",
            {
              style: {
                color: key === value ? "#fff" : color.text,
                fontSize: 14,
                fontFamily: font.body,
              },
            },
            text,
          ),
          key === value
            ? React.createElement(
                "span",
                {
                  "aria-hidden": true,
                  style: { marginLeft: "auto", color: "#fff" },
                },
                "✓",
              )
            : null,
        ),
      ),
    );
  // Pressable provides native button/keyboard activation; checked state is announced.
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ gap: 4 }}
    >
      {rows.map(([key, text]) => (
        <Pressable
          key={key}
          accessibilityRole="radio"
          accessibilityState={{ checked: key === value }}
          accessibilityLabel={`${label}: ${text}`}
          onPress={() => onChange(key)}
          style={{
            minHeight: 44,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: key === value ? color.brand : "transparent",
          }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: key === value ? "#ffffff" : color.neutral700,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {key === value ? <Check size={14} color="#ffffff" /> : null}
          </View>
          <Body colour={key === value ? "#ffffff" : color.text}>{text}</Body>
        </Pressable>
      ))}
    </View>
  );
}

function PriceSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (price: number) => void;
}) {
  const index = PRICE_STEPS.indexOf(value as (typeof PRICE_STEPS)[number]);
  return (
    <View style={{ gap: 12 }}>
      <Heading
        size={22}
        colour={color.brand}
      >{`฿${value.toLocaleString("en-US")}`}</Heading>
      {Platform.OS === "web" ? (
        React.createElement("input", {
          type: "range",
          min: 0,
          max: 4,
          step: 1,
          value: index,
          "aria-label": "Maximum base price",
          "aria-valuetext": `${value} THB`,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
            onChange(PRICE_STEPS[Number(event.target.value)]!),
          style: {
            width: "100%",
            height: 44,
            accentColor: color.brand,
            cursor: "pointer",
            margin: 0,
          },
        })
      ) : (
        <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lower maximum price"
            disabled={index === 0}
            onPress={() => onChange(PRICE_STEPS[Math.max(0, index - 1)]!)}
            style={{ padding: 14 }}
          >
            <Minus color={color.brand} size={18} />
          </Pressable>
          <View
            accessibilityRole="adjustable"
            accessibilityLabel="Maximum base price"
            accessibilityValue={{ min: 500, max: 5000, now: value }}
            accessibilityActions={[
              { name: "increment" },
              { name: "decrement" },
            ]}
            onAccessibilityAction={(event) =>
              onChange(
                PRICE_STEPS[
                  Math.max(
                    0,
                    Math.min(
                      4,
                      index +
                        (event.nativeEvent.actionName === "increment" ? 1 : -1),
                    ),
                  )
                ]!,
              )
            }
            style={{
              flex: 1,
              height: 8,
              backgroundColor: color.brand,
              borderRadius: 4,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Higher maximum price"
            disabled={index === 4}
            onPress={() => onChange(PRICE_STEPS[Math.min(4, index + 1)]!)}
            style={{ padding: 14 }}
          >
            <Plus color={color.brand} size={18} />
          </Pressable>
        </View>
      )}
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Body style={{ fontSize: 12 }}>฿500</Body>
        <Body style={{ fontSize: 12 }}>฿5,000</Body>
      </View>
      <Body style={{ fontSize: 12 }}>Per person / per night</Body>
    </View>
  );
}

export function BrowseFilters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  return (
    <View testID="browse-filter-controls">
      <FilterSection title="Maximum base price">
        <PriceSlider
          value={filters.maxPrice}
          onChange={(maxPrice) => onChange({ ...filters, maxPrice })}
        />
      </FilterSection>
      <FilterSection title="Minimum demo rating">
        <RadioRows
          label="Minimum demo rating"
          value={String(filters.minRating)}
          rows={[
            ["0", "Any"],
            ["4.8", "4.8+"],
            ["4.9", "4.9+"],
          ]}
          onChange={(value) =>
            onChange({ ...filters, minRating: Number(value) })
          }
        />
      </FilterSection>
      <FilterSection title="Duration">
        <RadioRows
          label="Demo duration"
          value={filters.duration}
          rows={[
            ["all", "Any"],
            ["short", "Up to 4 hours"],
            ["day", "4–24 hours"],
            ["long", "Over 24 hours"],
          ]}
          onChange={(duration) =>
            onChange({ ...filters, duration: duration as Filters["duration"] })
          }
        />
      </FilterSection>
    </View>
  );
}

export function SortControl({
  value,
  onChange,
}: {
  value: SortOrder;
  onChange: (sort: SortOrder) => void;
}) {
  return Platform.OS === "web" ? (
    React.createElement(
      "select",
      {
        "aria-label": "Sort demo results",
        value,
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
          onChange(event.target.value as SortOrder),
        style: {
          minHeight: 44,
          width: "100%",
          padding: "10px 14px",
          borderRadius: 12,
          border: `1px solid ${color.neutral300}`,
          color: color.text,
          background: "#fff",
          fontFamily: font.body,
          fontSize: 14,
        },
      },
      SORT_OPTIONS.map(([key, text]) =>
        React.createElement("option", { key, value: key }, text),
      ),
    )
  ) : (
    <RadioRows
      label="Demo sort"
      value={value}
      rows={SORT_OPTIONS}
      onChange={(value) => onChange(value as SortOrder)}
    />
  );
}
