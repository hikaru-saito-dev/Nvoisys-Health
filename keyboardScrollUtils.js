import { useEffect, useState } from "react";
import {
  Dimensions,
  InteractionManager,
  Keyboard,
  Platform,
} from "react-native";

/**
 * Keyboard frame from OS events. On Android, `screenY` is the top edge of the IME
 * (including the suggestion strip) and is more reliable than windowHeight - height.
 */
export function useKeyboardBottomInset() {
  const [frame, setFrame] = useState({ height: 0, screenY: null });
  useEffect(() => {
    const showEv =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEv =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEv, (e) => {
      const ec = e?.endCoordinates;
      const h = typeof ec?.height === "number" ? Math.round(ec.height) : 0;
      const sy =
        typeof ec?.screenY === "number" ? Math.round(ec.screenY) : null;
      setFrame({ height: h > 0 ? h : 0, screenY: sy });
    });
    const onHide = Keyboard.addListener(hideEv, () =>
      setFrame({ height: 0, screenY: null }),
    );
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);
  return frame;
}

/** Bottom padding for ScrollView content while IME is open (Android only needs extra space). */
export function androidKeyboardPad(frameOrHeight) {
  const h =
    typeof frameOrHeight === "number"
      ? frameOrHeight
      : frameOrHeight?.height ?? 0;
  return Platform.OS === "android" ? h : 0;
}

export function scheduleScrollAfterTypingLayout(scrollFn) {
  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(() => {
      scrollFn();
      requestAnimationFrame(scrollFn);
    });
  });
}

/**
 * Scroll a vertical ScrollView so an input (measureInWindow) clears the IME.
 * Prefer `keyboardScreenY` when provided (Android).
 */
export function scrollInputAboveImeAndroid({
  scrollRef,
  scrollYRef,
  inputRef,
  keyboardHeight,
  keyboardScreenY,
  extraClearance = 88,
  breathing = 16,
}) {
  const winH = Dimensions.get("window").height;
  let imeTop;
  if (
    typeof keyboardScreenY === "number" &&
    Number.isFinite(keyboardScreenY) &&
    keyboardScreenY > 0
  ) {
    imeTop = keyboardScreenY - extraClearance;
  } else if (keyboardHeight > 0) {
    imeTop = winH - keyboardHeight - extraClearance;
  } else {
    return;
  }

  const applyScroll = () => {
    const node = inputRef?.current;
    if (!node?.measureInWindow) return;
    node.measureInWindow((_, y, __, h) => {
      const bottom = y + h;
      const overflow = bottom - imeTop + breathing;
      if (overflow <= 0) return;
      const baseY = scrollYRef?.current ?? 0;
      const nextY = baseY + overflow;
      scrollRef?.current?.scrollTo({
        y: Math.max(0, nextY),
        animated: false,
      });
    });
  };

  requestAnimationFrame(() => {
    applyScroll();
    requestAnimationFrame(() => {
      applyScroll();
      setTimeout(applyScroll, 64);
      setTimeout(applyScroll, 200);
    });
  });
}
