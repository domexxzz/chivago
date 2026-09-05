# The chain Air4Thai forgets to send

`air4thai.pcd.go.th` serves a Let's Encrypt certificate signed by the **YR1**
intermediate, but sends Sectigo's intermediates under it. A browser fetches
the right link itself (AIA); Node does not, so from this process every
request to the feed was `fetch failed`. `src/air.ts` sends these two files
with each request, and trust still ends at ISRG Root X1, which Node ships.

| File | What | Subject → issuer |
|---|---|---|
| `lets-encrypt-yr1.pem` | the intermediate | `CN=YR1` → `CN=Root YR` |
| `isrg-root-yr-by-x1.pem` | Root YR, cross-signed | `CN=Root YR` → `CN=ISRG Root X1` |

Both copied from https://letsencrypt.org/certificates/ on 2026-09-05
(`/certs/gen-y/int-yr1.pem`, `/certs/gen-y/root-yr-by-x1.pem`) and checked
against what the leaf's own AIA pointers (`yr1.i.lencr.org`, `yr.i.lencr.org`)
serve; the SHA-256 fingerprints matched:

```
YR1              13:94:96:34:D9:9C:D6:FD:6A:A8:0B:C0:34:FE:FA:CC:EB:19:69:FE:EF:98:65:86:71:3E:CD:BB:05:75:8D:3F
Root YR (by X1)  07:26:39:D0:B1:40:D5:BF:FA:E1:6A:D9:C3:F6:CC:60:86:04:06:21:F5:1E:E6:1A:6D:46:A8:91:5C:07:CF:76
```

`air.test.ts` checks, offline, that each link signs the next and the top is
a root Node ships. When Air4Thai renews under another intermediate the feed
fails out loud with a warning that names this directory: fetch the new
intermediate from letsencrypt.org, verify it the same way, replace the file.
