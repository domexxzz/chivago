# 37 — The island counts itself

Two figures the seed could only fake, now read from what the app actually
recorded. Neither is a new claim: each is an old record, read a second way.

## Who is there now

`GET /places` carries `crowd` on every place: how many distinct ChivaGo
travellers have a geofenced check-in there in the last hour, counted from
the ledger — the same rows the wallet paid. Zero is zero and is shown; an
unvisited beach is not a "quiet" one, it is one nobody counted at. The
place screen says it in words (`crowdLine`) and says where it came from.

What it does NOT do is replace the crowd metric. A check-in count is not
people per hundred square metres, and pretending it were would be a new
invention on top of the old one. The seeded crowd figure stays in the score
— and is now labelled the estimate it always was. It had been scored as
`live`, the default, for the whole life of the file; labelled, the score
discounts it (docs/04 §2), and the demo's Healthy Scores moved by a point or
two, downward, which is the honest direction. The more the app is used, the
more the count means; on day one it is honest about being small.

## What the air has been

`air_cache` held one row per grid cell: the latest reading, for the TTL.
Nothing kept what the air *was*. Every fresh fetch now also appends to
`air_history`, keyed by the model's own observation hour so a re-fetch is
not a second sample, and `GET /places/:id/history` groups it by island day
— min, max, mean, sample count — for the last thirty days. Days with no
sample are absent, not zero. The chart on the place screen draws a bar per
recorded day from max down to min with the mean marked, coloured on the
AQI scale's own bands (not the evidence green), and says when recording
started. Nothing is invented backwards: the history begins the day the
server began, and the demo's shows one day, because that is how many it
has.

## Tests

Six in the API (distinct travellers per place inside the window, an hour
and a minute is out, the future is out; island-day grouping, duplicate
hours, the thirty-day cut), three in core for the line, three in the
mobile suite for the chart's geometry.
