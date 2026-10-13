/** Scoped additions for the native-web browse components; no global theme changes. */
export const browseStyles = `
[data-testid="stays-screen"] { background: linear-gradient(140deg, #fbf9f3, #f5f7f3); }
[data-testid="browse-results"] { color: #123354; }
[data-testid="browse-results"] [role="button"],
[data-testid="browse-sheet-root"] [role="button"],
[data-testid="browse-results"] [role="radio"],
[data-testid="browse-sheet-root"] [role="radio"] { transition: transform 180ms ease-out, opacity 180ms ease-out; }
[data-testid="browse-results"] :is([role="button"], [role="radio"], input, select):focus-visible,
[data-testid="browse-sheet-root"] :is([role="button"], [role="radio"], input, select):focus-visible {
  outline: 3px solid #0e7480; outline-offset: 3px;
}
[data-testid="browse-sheet-root"] { font-family: 'Anuphan_400Regular', 'IBM Plex Sans Thai', sans-serif; }
[data-testid="browse-results"] :is(input,select), [data-testid="browse-sheet-root"] :is(input,select) { box-sizing: border-box; }
[data-browse-radio]:has(input:focus-visible) { outline: 3px solid #0e7480; outline-offset: 2px; }
[data-browse-radio]:hover { box-shadow: inset 0 0 0 1px #0e7480; }
[data-testid="browse-sheet-root"] [role="button"]:hover,
[data-testid="browse-results"] [role="radio"]:hover,
[data-testid="browse-sheet-root"] [role="radio"]:hover { opacity: .9; }
[data-testid="browse-results"] [role="radio"]:active,
[data-testid="browse-sheet-root"] :is([role="button"],[role="radio"]):active { transform: scale(.98); }
[data-testid="browse-mobile-toolbar"] { position: sticky !important; top: 0; z-index: 5; box-shadow: 0 6px 10px rgba(20,44,50,.04); }
[data-testid="browse-results-header"], [data-testid="browse-sidebar"], [data-testid="travel-card"] { box-shadow: 0 2px 4px rgba(20,44,50,.025), 0 8px 22px rgba(20,44,50,.035); }
[data-testid="travel-card"] { transition: transform 180ms ease-out; }
[data-testid="browse-photo"] > [role="img"] { transition: transform 400ms ease-out; }
[data-testid="travel-card"]:hover [data-testid="browse-photo"] > [role="img"],
[data-testid="browse-destination-link"]:hover [data-testid="browse-photo"] > [role="img"] { transform: scale(1.045); }
[data-testid="browse-destination-link"]:hover { transform: translateY(-3px); }
[data-testid="browse-count"], [data-testid="browse-active-chip"] { animation: browse-enter 360ms ease-out backwards; }
[data-testid="browse-heart-saved"] { animation: heart-pop 360ms ease-out; }
[data-testid="browse-sheet"] { box-shadow: 0 -12px 44px rgba(7,29,46,.16); }
[data-testid="browse-results"] input[type="range"]::-webkit-slider-thumb,
[data-testid="browse-sheet-root"] input[type="range"]::-webkit-slider-thumb { transition: transform 160ms ease-out; }
[data-testid="browse-results"] input[type="range"]:active::-webkit-slider-thumb,
[data-testid="browse-sheet-root"] input[type="range"]:active::-webkit-slider-thumb { transform: scale(1.18); }
@keyframes browse-enter { from { opacity: .35; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes heart-pop { 0%,100% { transform: scale(1); } 45% { transform: scale(1.22); } }
@media (min-width: 768px) {
  [data-testid="browse-destination-tile"] { flex-basis: 30% !important; }
}
@media (min-width: 1024px) {
  [data-testid="browse-destination-tile"] { flex-basis: 14% !important; }
  [data-testid="browse-columns"] { display: grid; grid-template-columns: 288px minmax(0,1fr); align-items: start; }
  [data-testid="browse-sidebar"] { position: sticky !important; top: 16px; max-height: calc(100dvh - 176px); overflow-y: auto; animation: browse-enter 420ms 120ms ease-out both; }
  [data-testid="travel-card"] { display: grid; grid-template-columns: minmax(160px, 26%) minmax(0,1fr) 176px; }
  [data-testid="browse-card-photo"] { height: 100% !important; min-height: 260px; }
  [data-testid="browse-card-price"] { border-left: 1px solid #eee9df; }
}
@media (prefers-reduced-motion: reduce) {
  [data-testid="browse-results"] *, [data-testid="browse-sheet-root"] * { animation: none !important; transition: none !important; }
  [data-testid="travel-card"]:hover, [data-testid="browse-destination-link"]:hover,
  [data-testid="travel-card"]:hover [role="img"], [data-testid="browse-destination-link"]:hover [role="img"],
  [data-testid="browse-results"] [role="radio"]:active,
  [data-testid="browse-sheet-root"] :is([role="button"],[role="radio"]):active { transform: none !important; }
  [data-testid="browse-results"] input[type="range"]:active::-webkit-slider-thumb,
  [data-testid="browse-sheet-root"] input[type="range"]:active::-webkit-slider-thumb { transform: none; }
}
`;
