# 39 — The statement as a file

The statement of verified activity (docs/31) was a JSON record and a page.
A hotel's sustainability officer does not attach JSON to a report; they
attach a spreadsheet or a PDF, and until now they copied the id and the
digest by hand into whatever they were filing.

`GET /statements/:id/csv` and `GET /statements/:id/pdf` are the same record
as files. Public and immutable like the JSON, readable from any origin, and
each carries the id, the SHA-256 digest and the verify URL — so a file that
has been forwarded three times still points back to the thing anyone can
check. The console's issued-statements table and the public verify page
link to both.

**The CSV** is one row per line (day, quest, activity in both languages,
pillar, verified count, weight) followed by the totals and the provenance
rows, UTF-8 with a byte-order mark so Excel reads the Thai, CRLF because
that is what RFC 4180 and every spreadsheet expect.

**The PDF is written by hand.** No library: a PDF with one standard font
and text is a few hundred bytes of syntax, and a dependency that renders
every font in the world would be the heaviest thing in the API for a
document that must, above all, stay simple enough to be checked. The cost
is honest and printed on the page: the standard fonts carry no Thai, so the
PDF prints the English side of each line and says the Thai is in the
record. It paginates, numbers its pages, and its cross-reference table's
offsets are tested to land on the objects they name — the one thing a
reader insists on.

Nobody is in either file. Ten tests in core, one in the API's hardening
suite.
