# Research findings

Everything below was verified against live sources while building, not recalled.
Dates are August 2026.

---

## 1. Air quality — the significant finding

**Thailand has no air-quality monitoring station on Koh Samui.**

Air4Thai, the Pollution Control Department's official network, was queried
directly (`https://air4thai.pcd.go.th/services/getNewAQI_JSON.php`, free, no API
key, 173 stations nationwide). Filtering for the Surat Thani province returns
exactly one station:

| Station | Location | Coordinates | Distance to Samui |
| --- | --- | --- | --- |
| `42t` | Environment Agency Section 14, Makham Tia, Mueang, Surat Thani | 9.126, 99.325 | **~87 km**, across open water |

### Why this matters to the product

The design shows a **different AQI for every place** — 18 AQI at Na Muang
waterfall, 42 at Chaweng beach, 31 at Fisherman's Village. That variation is a
core part of the Healthy Score's story.

It is not obtainable. Reading one mainland station 87 km away and presenting it
as five distinct island readings would be fabrication.

### What was done instead

Primary source is **Open-Meteo's air-quality API** (free, no key), serving the
Copernicus CAMS global model. It genuinely varies by coordinate, covers the
island, and returns a US AQI directly. Verified live:

```
GET https://air-quality-api.open-meteo.com/v1/air-quality
    ?latitude=9.5120&longitude=100.0136&current=us_aqi,pm2_5
-> { "us_aqi": 38, "pm2_5": 5.2 }
```

**But CAMS resolves to ~11 km, and Koh Samui is ~25 km across.** In practice all
five seed places return the *same* AQI. This was measured, not assumed — the
first working build returned "AQI 38" for every place.

So the implementation says so out loud:
- the cache grid snaps to the model's own 0.1° resolution rather than inventing
  100 cache entries per model cell;
- the source string reads "~11 km area reading", not a point reading;
- the place screen's score explainer states plainly that Thailand has no station
  on the island and that air is modelled for an area.

Air4Thai is kept as a **cross-check, not a source**: if the model and the nearest
ground station diverge by more than 40 AQI (roughly a full EPA category), the
reading is downgraded to `estimated` and the Healthy Score weights it lower.

> For the first forty commits that paragraph described code that was written,
> exported and tested in isolation — and never called from `getAir`. It is
> applied now: the station is asked once per cache window however many places
> are scored, a station that is down changes nothing, and a test hands in a
> station that disagrees and reads `estimated` back.

### The honest fix

**Three low-cost PM2.5 sensors** — Chaweng, Lamai, Na Muang — would cost less
than a month of ad spend and would let ChivaGo publish *real* island readings
instead of a modelled area average. For a product whose central claim is
"travel healthily", owning the air data is close to a strategic asset. It also
turns a liability (making air claims you cannot substantiate) into a
differentiator (the only real-time air data on the island).

**Recommendation: budget for this before any marketing makes per-place air
claims.**

---

## 2. Thailand PDPA — this is enforced now

Thailand's Personal Data Protection Act applies directly to this app: precise
location, health preferences, and family-contact sharing are all personal data,
and live location plus family sharing are exactly the features the PDPA expects
explicit, specific, **logged** consent for *before* activation.

Enforcement is no longer theoretical — Thailand's PDPC has become one of the
more active data protection authorities in Southeast Asia, with substantial
fines issued through 2025.

### What the build does

- **Consent is captured on the screen that switches the features on** —
  onboarding step 3, where the user picks air alerts, crowd warnings, scam
  checks, live location and language help — not buried in a settings page.
- **The notice version is stored with the consent timestamp**
  (`profiles.consent_version`, `profiles.consented_at`), so we can prove *what*
  was agreed to, not merely that a box was ticked.
- **Right to erasure works**: `DELETE /profile` removes the user, and every
  table cascades. Tested.
- **Data minimisation**: the pilot has no sign-up. Identity is a device-scoped
  id. The least personal data you can collect is the safest amount to hold.

### Still owed

A Thai-language privacy notice reviewed by counsel, and a decision on where data
is hosted. Nothing here substitutes for legal advice.

---

## 3. Emergency infrastructure

Verified national numbers, all free and reachable without airtime credit:

| Number | Service | Notes |
| --- | --- | --- |
| **1669** | Emergency medical services | ~10 min response in cities, 30 min+ rural |
| **1155** | Tourist Police | 24h, **English-speaking operators** — the primary line for foreign visitors |
| **191** | Police | General emergency |
| 1672 | Tourism Authority of Thailand | Non-emergency assistance |
| 1784 | Disaster Prevention and Mitigation | |

All three primary numbers are now on the Safety screen as one-tap dial buttons.

**Bangkok Hospital Samui** is the island's main private hospital and is the
facility the design names in the dispatch panel — retained.

---

## 4. Market context

Numbers relevant to sizing the pilot:

**Koh Samui**
- ~2.78 million air arrivals in 2024, up 21% year-on-year and past the 2019
  pre-pandemic peak of 2.42 million.
- 1.13 million passenger arrivals in the first four months of 2025, +9% YoY.
- 35 cruise ships / 65,792 passengers in the same period, +6% YoY.
- **56% of international arrivals are European** — UK, Germany, France. This is
  why English is the primary language line, not a translation of Thai.
- Samui has announced five tourism styles for 2026 with **wellness and
  sustainability explicitly at the core** — the island's own positioning matches
  this product's.

**Thailand**
- 32.97 million foreign arrivals in 2025, 1.53 trillion baht in visitor spending.
  Down 7.2% on 2024's 35.5 million, but shifting toward **higher-spending,
  longer-staying** long-haul visitors.
- TAT's 2026 target: 39–40 million arrivals, 3.4 trillion baht.

**Read for the product:** the wellness segment is the one growing in value per
visitor, stays longer, and visits year-round rather than seasonally. A product
that measures and rewards it is aligned with where the island's revenue is
already moving — and with what the municipality has publicly committed to.

---

## 5. Technology choices, and why

| Choice | Alternative considered | Reason |
| --- | --- | --- |
| **Expo SDK 52 / React Native** | Flutter, native | The handoff's own default for a bilingual app with maps and camera. SDK 56 (RN 0.85 / React 19.2) is current as of mid-2026; 52 was pinned for a stable install here — upgrading is routine. |
| **`node:sqlite`** | Postgres, better-sqlite3 | Built into Node 22+, so the API has **no native build step** and runs on a Windows dev machine and a small island VPS alike. The schema is plain SQL, so moving to Postgres later is a dump-and-load. |
| **Hono** | Express, Fastify | Small, fast, Web-standard `Request`/`Response`. Runs unchanged on Node, Bun, Workers — useful if this ever needs an edge deployment near the users. |
| **Open-Meteo** | IQAir, WAQI/aqicn | Free, no API key, per-coordinate, and CAMS is a citable source. WAQI needs a key and mostly re-serves the same ground stations that do not exist on Samui. |
| **MapLibre (planned)** | Mapbox, Google Maps | Open-source renderer, no per-load licence. Tiles from MapTiler (free tier: 5k sessions/mo, non-commercial) or self-hosted Protomaps PMTiles for cheap scale. |
| **pnpm workspaces** | npm, turborepo | Fast, strict. One caveat found the hard way: Metro must keep `disableHierarchicalLookup: false` for pnpm, because a package's own dependencies live under `.pnpm/<pkg>/node_modules` and Metro only reaches them by walking up. Expo's monorepo guide says the opposite — it assumes npm/yarn hoisting. |

---

## 6. Sources

Air quality:
- [Air4Thai / Pollution Control Department JSON feed](https://air4thai.pcd.go.th/services/getNewAQI_JSON.php) — queried live, 173 stations
- [Open-Meteo Air Quality API](https://air-quality-api.open-meteo.com/v1/air-quality) — queried live
- [AQICN data platform](https://aqicn.org/api/) — evaluated, not used

PDPA:
- [Thailand PDPA 2026 guide to consent and compliance](https://cookieinformation.com/blog/what-is-the-thailand-pdpa/)
- [Thailand's PDPA compliance guidelines](https://bigid.com/blog/thailand-pdpa-compliance/)
- [Thailand's Personal Data Protection Act explained](https://termly.io/resources/articles/thailands-personal-data-protection-act/)

Emergency services:
- [Essential tourist assistance contact numbers — thailand.go.th](https://thailand.go.th/issue-focus-detail/essential-tourist-assistance-contact-numbers-to-ensure-a-smooth-and-safe-journey)
- [Emergency numbers in Thailand (2026)](https://allemergencynum.com/thailand/)

Market:
- [Koh Samui tourism performance — C9 Hotelworks report](https://www.hospitalitynet.org/news/4127624.html)
- [Samui unveils 5 new tourism styles for 2026 — The Nation](https://www.nationthailand.com/news/tourism/40059084)
- [Thailand tourism statistics 2026](https://www.visitthailandtoday.com/thailand-tourism-statistics)
- [Koh Samui's 2025 tourism boom](https://www.travelandtourworld.com/news/article/koh-samuis-2025-tourism-boom-strong-arrivals-cruise-growth-and-wellness-focus-drive-success-in-thailand/)

Platform:
- [React Native's New Architecture — Expo docs](https://docs.expo.dev/guides/new-architecture/)
- [Expo SDK 56 / React Native 0.85 / React 19.2 in mid-2026](https://dev.to/davekurian/react-native-ecosystem-advances-with-expo-sdk-56-and-react-192-updates-in-2026-3df5)
- [PMTiles for MapLibre — Protomaps docs](https://docs.protomaps.com/pmtiles/maplibre)
- [MapTiler pricing 2026](https://frontdeskreview.com/software/maps-api/maptiler/)
