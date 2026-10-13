import { useEffect } from "react";
import { Platform } from "react-native";
import { browseStyles } from "./browseStyles.ts";

/** Web-only polish, scoped to Stays & Tours; native keeps the same RN layout. */
const styles = `
[data-testid="travel-card"]:has([data-testid="travel-card-open"]:focus-visible) {
  outline: 3px solid #096e79; outline-offset: 4px;
}
[data-testid="travel-card-open"] { cursor: pointer; }
[data-testid="travel-card-open"]:hover { background-color: rgba(8,111,123,.035) !important; }
[data-testid="marketplace-modal-scroll"] { overscroll-behavior: contain; }
[data-testid="marketplace-modal-box"] [role="button"]:focus-visible {
  outline: 3px solid #096e79; outline-offset: -3px;
}
[data-testid="marketplace-modal-close"]:hover { background-color: #d7e8eb !important; }
[data-testid="stays-screen"] { background: linear-gradient(160deg, #edf5f5, #f7faf9); }
[data-testid="stays-screen"] [role="button"],
[data-testid="stays-screen"] [role="link"],
[data-testid="stays-navigation"] [role="tab"] {
  transition: transform 180ms ease-out, opacity 180ms ease-out;
}
[data-testid="stays-screen"] [role="button"]:hover,
[data-testid="stays-screen"] [role="link"]:hover { opacity: .9; }
[data-testid="stays-screen"] [role="button"]:active,
[data-testid="stays-navigation"] [role="tab"]:active { transform: scale(.98); }
[data-testid="stays-screen"] :is([role="button"], [role="link"]):focus-visible,
[data-testid="stays-navigation"] [role="tab"]:focus-visible {
  outline: 3px solid #096e79; outline-offset: 4px;
}
[data-testid="travel-hero"] { background: #073e50 !important; }
[data-testid="travel-hero-image"] { opacity: .8 !important; }
[data-testid="travel-hero"]::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(4,29,48,.8), rgba(4,29,48,.2));
}
[data-testid="travel-hero-copy"] { z-index: 1; }
[data-testid="travel-search"] {
  box-shadow: 0 16px 40px rgba(15,48,64,.09); z-index: 2;
}
[data-testid="travel-search"] [role="button"] svg {
  transition: transform 180ms ease-out;
}
[data-testid="travel-search"] [role="button"]:hover svg { transform: translateX(4px); }
[data-testid="travel-field"] { position: relative; min-width: 0; }
[data-testid="travel-field"] input { width: 100%; padding: 25px 14px 9px !important; background: #f6f9f9; }
[data-testid="travel-field"] input::placeholder { opacity: 0; }
[data-testid="travel-field"]:focus-within input::placeholder { opacity: 1; }
[data-testid="travel-field-label"] {
  position: absolute; top: 7px; left: 14px; pointer-events: none;
  transform-origin: left top; transition: transform 180ms ease-out;
}
[data-testid="travel-field"]:has(input:placeholder-shown):not(:focus-within) [data-testid="travel-field-label"] { transform: translateY(13px) scale(1.1); }
[data-testid="travel-field"]::after {
  content: ''; position: absolute; inset: -2px; border: 2px solid #096e79;
  border-radius: 18px; opacity: 0; transform: scale(.98); pointer-events: none;
  transition: opacity 180ms ease-out, transform 180ms ease-out;
}
[data-testid="travel-field"]:focus-within::after { opacity: 1; transform: scale(1); }
[data-testid="travel-field"] input:focus { outline: none; }
[data-testid="travel-card"], [data-testid="travel-destination"] { isolation: isolate; }
[data-testid="travel-card"]:hover, [data-testid="travel-destination"]:hover {
  opacity: 1 !important; transform: translateY(-4px); box-shadow: 0 16px 30px rgba(15,48,64,.12);
}
[data-testid="travel-card-image"] > div, [data-testid="travel-destination"] > [role="img"] {
  transition: transform 450ms ease-out;
}
[data-testid="travel-card"]:hover [data-testid="travel-card-image"] > div,
[data-testid="travel-destination"]:hover > [role="img"] { transform: scale(1.045); }
[data-testid="travel-destination"]::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(180deg, transparent 25%, rgba(4,29,48,.88));
}
[data-testid="travel-destination-label"] { position: absolute; bottom: 4px; left: 4px; z-index: 1; }
[data-testid="stays-navigation"] { box-shadow: 0 8px 28px rgba(15,48,64,.13); }
[data-testid="stays-navigation"] [role="tab"] { border-radius: 28px; }
[data-testid="stays-navigation"] [role="tab"]:hover { background: rgba(7,115,128,.06); }
@media (min-width: 1024px) {
  [data-testid="stays-header"], [data-testid="stays-container"] { padding-left: 16px; padding-right: 16px; }
  [data-testid="travel-hero-copy"] { max-width: 760px; }
  [data-testid="travel-search"] { margin-left: 24px; margin-right: 24px; }
  [data-testid="travel-search-row"] { display: grid; grid-template-columns: 1.5fr 1fr 1fr .85fr auto; align-items: center; gap: 12px; }
  [data-testid="travel-search-row"] > * { min-width: 0; }
}
@media (prefers-reduced-motion: reduce) {
  [data-testid="stays-screen"] *, [data-testid="stays-screen"] *::after,
  [data-testid="stays-navigation"] * { transition: none !important; animation: none !important; }
  [data-testid="stays-screen"] [role="button"]:is(:hover,:active),
  [data-testid="stays-screen"] [role="button"]:hover [role="img"],
  [data-testid="stays-screen"] [role="button"]:hover svg,
  [data-testid="stays-navigation"] [role="tab"]:active { transform: none !important; }
}
`;

export function useTravelPresentation() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const sheet = document.createElement("style");
    sheet.textContent = styles + browseStyles;
    document.head.appendChild(sheet);
    return () => sheet.remove();
  }, []);
}
