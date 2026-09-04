# 40 — A party on one proof

A party (docs/14 §parties) counted what its members separately earned and
added nothing. Now it can do the one thing a group actually does on a
beach cleanup: the work together, one photo, one host.

When a member submits a proof, the other members of their active party who
have a last fix **inside this quest's fence, within the last thirty
minutes**, and who have not already finished the quest, ride the proof.
Their progress is set to `host_verification` alongside the submitter's
(joined and arrived if they had not), and their ids are written on the
proof. The console shows the host who else was there — by name, with the
line "one approval pays everyone listed the same reward" — so the decision
is made knowing what it pays. One approval completes and pays each of
them, idempotently by `source_ref` like any award, and each is told the
same way. One rejection sends the whole party back to `arrived`, with the
reason on every record.

What it is not: a way to be paid from a sofa. Presence is the phone's word
twice over — the geofence and the second signal (docs/30) — and the host
still decides, once, for all of them. Nothing here moves a point that a
host did not approve.

Four tests: a member in the fence rides and is paid once; a fix too old
does not count however close; a rejection goes back with the reason; a
member already through the quest does not ride it twice.
