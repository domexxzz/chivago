# 41 — The console in a pocket

Most hosts are a municipal officer, a foundation volunteer or a market
trader with a phone, not a desk, and "verification can take 24 hours"
(docs/01) was mostly the time it took somebody to sit down at a computer.

The console works on a phone now: the header stacks, the nav wraps, a
review's row and its photographs go full width, tables scroll sideways,
inputs fill the screen and every button is at least 44 px tall. Nothing
about what a host can see or do changed; only the width it fits in.

And the queue moves without a reload. `GET /console/pending` answers the
signed-in host's pending count as JSON, uncached; every console page polls
it once a minute and whenever the tab comes back into view, updates the
badge on the queue tab and the `(3)` in the browser title, and — if the
host pressed "Notify me of new proofs" once and said yes — shows a browser
notification when the count rises. It is the browser's own notification,
which works on Android and on a desktop and, since iOS 16.4, on a home-
screen web app; it is not a push service, needs no token and holds no
address. The count is the only thing that leaves the session; the proofs
stay behind it like everything else.

Two tests: the count is this host's and uncached; it is behind the session.
