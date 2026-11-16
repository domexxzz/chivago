# Chivar Bot hybrid concierge

## Architecture

The production path is deliberately hybrid and evidence-bounded:

1. Authenticate the caller, apply the per-user rate limit, and bound the actual request stream before JSON parsing.
2. Load the caller's conversation context from SQLite.
3. Run the deterministic multilingual classifier first.
4. Handle safety locally without waiting for an upstream model.
5. Ask Groq for validated structured NLU only when the local reading is below the confidence threshold. Clear contextual rules cannot be overridden by the model.
6. Recompute the allowed actions on the server; model-provided action names are never executed directly.
7. Retrieve only the required data from ChivaGo's database, Open-Meteo, crowd readings, or the existing routing hand-off.
8. Build a complete factual fallback response.
9. Give Groq only validated facts and the verified fallback meaning — never the raw user prompt or stored summary — and ask it to rewrite them naturally.
10. Validate the response, persist the turn and updated context, and return cards plus provenance.

The model never receives an API key from the client, never chooses database IDs, never calls an unvalidated tool, and never creates emergency information.

## Conversation context

`concierge_conversations` is keyed by conversation, user, and area. A supplied conversation ID is accepted only when it belongs to the authenticated user in the requested area. With no ID, the most recent conversation for that user and area is resumed for 24 hours.

Stored context includes intent history, permitted location, destination, selected and recent place IDs, date, budget, categories, travel mode, language, and a bounded summary. Only the eight most recent messages are sent to NLU. Raw storage is capped at 200 messages (100 complete turns), and the owner history endpoint returns at most 100. Concurrent completions merge accumulated place/category context instead of silently overwriting one another. Full retained history can be read only by its owner through `GET /concierge/history`.

An explicit unknown, foreign, or wrong-area conversation ID returns the same generic not-found response and never allocates storage. Without an explicit ID, auto-resume remains scoped to the same user and area for 24 hours. A user may retain at most 50 active conversations; inactive threads expire after 30 days and their messages are removed by the database cascade. At the cap the API refuses a new thread instead of deleting active history.

## Data sources and limits

| Data | Source | Behaviour |
|---|---|---|
| Places and coordinates | ChivaGo database | Hidden places are excluded. No generated places. |
| Air | Existing ChivaGo air service | Returns its own source, timestamp, and provenance. |
| Weather | Existing Open-Meteo service | Current conditions only. `live`, `estimated`, `stale`, and `unavailable` remain distinct; future questions explicitly say forecast data is unavailable. |
| Crowd | Last-hour geofenced ChivaGo check-ins plus seeded survey density | The two values are labelled separately. Neither is called a total live headcount. |
| Route | Existing ChivaGo client router | Chat selects a verified destination and opens the router; it does not invent a route. |
| Opening times, admission, rooms | Only when present in verified data | Missing current values are stated as unavailable. |

There is currently no third-party live crowd-density provider and no future-weather payload in the existing weather service. The API is shaped so those providers can be added later without changing the chat contract.

## Intelligent place recommendations

Tourism, restaurant, and accommodation searches are ranked in
`apps/api/src/place-recommendation.ts` after records are loaded from the
existing place repository. Groq may rewrite the introduction, but it never
selects records or populates factual card fields.

The default 0–100 score uses preference relevance 35%, distance suitability
20%, review quality 15%, popularity 10%, category diversity 10%, and data
freshness/source verification 10%. Nearby and closest queries increase the
distance weight; category and family queries increase preference relevance. A
missing signal is `null`, not zero, and its weight is redistributed across the
signals actually available for that record. Diversity is applied while each
next card is selected so a general list does not collapse into one category.

The bounded `selectedPlaces` context is the pagination cursor. “Show more”
keeps the active category and excludes every result already shown. An explicit
named-place or closest comparison may show an earlier card because the user
asked for that record.

Structured cards carry only database-backed name, description, licensed image
metadata, coordinates, optional calculated distance, optional review summary,
provenance, and ranking reason. Opening status remains `null` until a reliable
source is connected. Budget requests include a visible limitation because the
place schema has no verified admission price. Family suitability is a strict
tag filter; no tag means no match rather than an inference.

Card actions reuse existing screens: Details opens the place record, Map sets
the existing MapLibre focus marker, and Navigate hands the verified coordinate
to the existing routing/provider decision. The concierge does not generate a
route.

## Groq configuration

Create a root `.env` (ignored by Git):

```dotenv
CHIVAGO_GROQ=on
GROQ_API_KEY=<server-only key>
GROQ_MODEL=openai/gpt-oss-120b
GROQ_TIMEOUT_MS=8000
GROQ_RETRIES=1
GROQ_GLOBAL_REQUESTS_PER_MINUTE=120
```

`GROQ_TIMEOUT` remains accepted as an alias. Retries are limited to 0-2 and apply only to timeouts, rate limits, capacity, and server errors. Authentication or validation errors are not retried. Every real HTTP attempt, including retries and both NLU/rewrite stages, atomically reserves one unit from the SQLite-backed shared-key quota before it can reach Groq. The rules fallback remains available when that quota is full.

The quota is global within one ChivaGo deployment: Node uses one SQLite writer, LiteFS forwards writes to its primary, and Cloudflare routes the API through one named Durable Object. If separate Fly and Cloudflare deployments are live at the same time, they must use separate Groq keys or an external shared quota coordinator to obtain an account-global ceiling.

The default model is a Groq production model with multilingual, tool-use, and JSON Schema support. Model configuration is isolated in `apps/api/src/groq-concierge.ts` and can be changed without changing retrieval or business rules.

## API

`POST /concierge/chat`

```json
{
  "message": "ที่ไหนคนน้อย",
  "area": "koh-sichang",
  "conversationId": "optional UUID",
  "location": { "lat": 13.16, "lng": 100.81, "accuracyM": 20 }
}
```

The response includes `conversationId`, structured analysis, the existing typed `Reply`, contextual quick replies, optional weather, evidence metadata, model/source, and a visible AI notice when Groq was unavailable. The client never silently presents a rules fallback as an AI answer.

## Failure behaviour

- Safety answers remain available without Groq.
- A missing key or failed Groq request returns a visible notice with a factual rules-based response.
- Invalid model JSON is rejected.
- Groq receives no raw user prompt during response rewriting; unsupported quantified claims and budget claims fail closed to the verified fallback.
- Sanitised error logs contain the failure class/status only, never the key, request text, upstream body, or authorization header.
- Missing weather or crowd data is stated rather than synthesized.
- Messages are limited to 500 characters and request bodies to 8 KB.
- The API allows 20 chat requests per authenticated user per minute.
- The shared Groq key defaults to 120 actual upstream attempts per minute across all users in one deployment.

## Tests

- `packages/core/src/concierge-hybrid.test.ts`: natural-language categories, entities, context follow-ups, multilingual quick replies.
- `apps/api/src/groq-concierge.test.ts`: configuration, strict validation, prompt boundary, retry policy, natural response schema.
- `apps/api/src/concierge-context.test.ts`: persistence, concurrent merge, storage limits, turn order, 24-hour resume, malformed state, area and cross-user isolation.
- `apps/api/src/concierge-service.test.ts`: places, food, accommodation, crowd provenance, weather freshness, navigation, fallback and concurrency.
- `apps/api/src/concierge-route.test.ts`: input limits and the authenticated 20-call HTTP rate-limit response.
- `apps/api/src/concierge-rate-limit.test.ts`: window reset and bounded identity storage.
- `apps/api/src/concierge-provider-quota.test.ts`: atomic shared-key quota, window reset, and clock rollback.
- `apps/mobile/test/screens-detail.test.ts`: thinking, retry, cards, distance, source attribution and contextual quick replies.
- Existing concierge, weather, database-schema, API and mobile type checks remain in the verification set.

Streaming is not enabled because the current mobile API client uses a typed request/response envelope rather than SSE. The UI provides a non-blocking thinking state and can adopt streaming later without changing the retrieval pipeline.
