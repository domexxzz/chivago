import React from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  type GestureResponderEvent,
} from "react-native";
import { X } from "lucide-react-native";
import { color } from "../../theme/index.ts";
import { useReduceMotion } from "../../components/reduce-motion.ts";

/** One modal lifetime spans details → confirmation, preserving the opening card.
 * RN Modal supplies dialog semantics, Escape, and the web focus trap/return.
 */
export function MarketplaceModal({
  title,
  view,
  onClose,
  children,
}: {
  title: string;
  view: "details" | "confirmation";
  onClose: () => void;
  children: React.ReactNode;
}) {
  const still = useReduceMotion();
  const backdrop = React.useRef<View>(null);
  const closeButton = React.useRef<View>(null);
  const content = React.useRef<ScrollView>(null);
  const box = React.useRef<View>(null);
  const touchOutside = React.useRef(false);
  const dismiss = React.useRef(onClose);
  dismiss.current = onClose;

  React.useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const node = backdrop.current as unknown as HTMLElement | null;
    if (!node) return;
    const roots = [document.documentElement, document.body];
    const previous = roots.map((root) => root.style.overflow);
    roots.forEach((root) => {
      root.style.overflow = "hidden";
    });
    let pointer: number | null = null;
    let releasedOutside = false;
    const down = (event: PointerEvent) => {
      pointer =
        event.target === node && event.button === 0 ? event.pointerId : null;
      releasedOutside = false;
    };
    const up = (event: PointerEvent) => {
      // Touch implicitly captures the pointer at its starting element. Check
      // the actual release position too, rather than trusting event.target.
      releasedOutside =
        event.pointerId === pointer &&
        event.target === node &&
        document.elementFromPoint(event.clientX, event.clientY) === node;
      pointer = null;
    };
    const cancel = () => {
      pointer = null;
      releasedOutside = false;
    };
    const click = (event: MouseEvent) => {
      if (releasedOutside && event.target === node) dismiss.current();
      cancel();
    };
    // The app uses nested scroll views, so locking body alone is insufficient.
    const preventBackdropScroll = (event: Event) => {
      if (event.target === node) event.preventDefault();
    };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", cancel);
    node.addEventListener("click", click);
    node.addEventListener("wheel", preventBackdropScroll, { passive: false });
    node.addEventListener("touchmove", preventBackdropScroll, {
      passive: false,
    });
    return () => {
      roots.forEach((root, index) => {
        root.style.overflow = previous[index]!;
      });
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancel);
      node.removeEventListener("click", click);
      node.removeEventListener("wheel", preventBackdropScroll);
      node.removeEventListener("touchmove", preventBackdropScroll);
    };
  }, []);

  React.useEffect(() => {
    content.current?.scrollTo({ y: 0, animated: false });
    if (Platform.OS === "web") closeButton.current?.focus();
  }, [view]);

  return (
    <Modal
      visible
      transparent
      animationType={still ? "none" : "fade"}
      accessibilityLabel={title}
      onRequestClose={onClose}
    >
      <View
        ref={backdrop}
        testID="marketplace-modal-backdrop"
        {...(Platform.OS !== "web"
          ? {
              onTouchStart: (event: {
                target: unknown;
                currentTarget: unknown;
              }) => {
                touchOutside.current = event.target === event.currentTarget;
              },
              onTouchEnd: (event: GestureResponderEvent) => {
                const outside =
                  touchOutside.current && event.target === event.currentTarget;
                const { pageX, pageY } = event.nativeEvent;
                touchOutside.current = false;
                if (outside)
                  box.current?.measureInWindow((x, y, width, height) => {
                    if (
                      pageX < x ||
                      pageX > x + width ||
                      pageY < y ||
                      pageY > y + height
                    )
                      dismiss.current();
                  });
              },
              onTouchCancel: () => {
                touchOutside.current = false;
              },
            }
          : {})}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,.45)",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <View
          ref={box}
          testID="marketplace-modal-box"
          accessibilityViewIsModal
          style={{
            width: "100%",
            maxWidth: 760,
            maxHeight: "92%",
            alignSelf: "center",
            backgroundColor: color.bg,
            borderRadius: 24,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              alignItems: "flex-end",
              paddingHorizontal: 12,
              paddingTop: 8,
            }}
          >
            <Pressable
              ref={closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
              testID="marketplace-modal-close"
              onPress={onClose}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? color.neutral300 : color.surface,
              })}
            >
              <X size={22} color={color.text} />
            </Pressable>
          </View>
          <ScrollView
            ref={content}
            testID="marketplace-modal-scroll"
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 14 }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
