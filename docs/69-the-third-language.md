# The third language

ChivaGo speaks English, Thai and now Simplified Chinese. This file is the
glossary the Chinese was written against, and the reason a glossary exists at
all.

## Why a glossary came first

The Thai did not have one. The machine check in `scripts/thai-review.mjs`
reports twenty-two English phrases that are rendered two or more different
ways in Thai: `Verified` is both ตรวจสอบแล้ว and ยืนยันแล้ว, `Done` is both
เสร็จแล้ว and เสร็จสิ้น, `Green Points` is both แต้มสีเขียว and แต้มกรีน. None of those
is wrong. Together they make the product read as though several people wrote
it, because several people did, months apart, with no list to agree on.

Chinese was written across ninety-three files. Without a fixed list the same
thing would have happened on the first afternoon rather than over a year.

## The terms

Product nouns. These are the ones that repeat and therefore the ones that
drift.

| English | 中文 | Note |
|---|---|---|
| ChivaGo | ChivaGo | The brand stays Latin. It is not transliterated. |
| Green Points | 绿色积分 | Never 绿点. |
| Healthy Score | 健康评分 | |
| Quest / Mission | 任务 | The product uses both English words for one thing. |
| Island Companions | 岛屿伙伴 | |
| Companion | 伙伴 | |
| Medal | 奖章 | Not 勋章, which reads military. |
| Passport | 护照 | |
| Wallet | 钱包 | |
| Party | 队伍 | A group travelling together, not a celebration. |
| The Summoning | 召唤 | |
| Monster | 怪物 | |
| Stall | 摊位 | A market stall. |
| Check in | 签到 | |
| Verified | 已验证 | One rendering only. See the table above for why. |
| Evidence | 证据 | |
| Statement | 报表 | The ESG document, not a spoken statement. |
| Traveller | 旅行者 | Not 游客, which is closer to "tourist" and reads cheaper. |
| Business operator | 商家 | |
| Host | 主办方 | The organisation setting quests, not a hotel host. |
| Moderator | 审核员 | |
| Low season | 淡季 | |
| Campus grounds | 校园 | |

Places keep their established Chinese names: Koh Samui is 苏梅岛, Koh Sichang
is 锡昌岛, Bangkok is 曼谷. A Thai province is 府, not 省.

### Terms the translation had to settle, and the reasoning

These are not in the table above because they came up while writing, but they
are now fixed and a reviewer should know the choice was deliberate:

| Case | Choice | Why |
|---|---|---|
| `Verified` as a status label | 已验证 | A badge. |
| "verified by the host" mid-sentence | 核实 | 已验证 reads as a badge dropped into prose. The split is intentional. |
| `operator` of a licensed tour company | 经营者 | 商家 means shop/merchant and reads wrong for a licensed operator. |
| `merchant` | 商家 | The glossary term, used where the English really is a shop. |
| `Good evening` / night | 傍晚好 / 晚上好 | English reuses one phrase for two parts of the day; Thai splits it and is marked `thai: intentional`. Chinese splits it too. |
| `New Year` | 元旦跨年 | 春节 sits three rows below in the same festival table, and a bare 新年 would be read as that. |
| `Songthaew` | 双条车 | The standard rendering in Chinese travel copy. |
| `EXP` | 经验值 | Used in all four EXP strings or none; see the checker note below. |
| `Chiva Balance` | Chiva 平衡 | The brand word stays Latin, the noun is translated. Fully Latin would trip the no-Han check, so this needed deciding either way. |
| `assurance` / assurance provider | 鉴证 / 鉴证机构 | The audit term, kept distinct from 验证 and 核查 so ISAE 3000 reads as a different order of thing from a host's check. |
| `placement` (of a figure under a standard) | 归类 | Weaker than 归档; nothing here files anything, which is what `PLACEMENT_LIMIT` says. |
| `operations` (GRI 413-1) | 运营点 | A countable site. 运营 is uncountable activity, and the rule turns on the unit being countable. Worth checking against the Chinese GRI 413. |

One term is still open: `กรมสุขภาพจิต`, the Department of Mental Health, whose
helpline appears in `gentle.ts`. It is currently 心理健康厅心理健康热线, which is
clumsy on repeat. This is safety-critical copy and should be checked against
the department's own Chinese name rather than guessed.

Units, codes and reporting standards stay as they are — GRI 306, IFRS S1/S2,
PM2.5, AQI, PDPA, SOS, QR. A Chinese sustainability officer reads those by
their initials, and translating them makes a report harder to check rather
than easier.

## What is and is not checked

`node scripts/thai:review` — despite the name, which predates this — counts
every pair with no Chinese and every Chinese side containing no Han script.
Those two numbers go to zero and stay there; a new pair with no Chinese is
reported on the next run.

### Two things the checker got wrong first, and what they cost

**It could not see concatenated strings.** The collector matched `en` and
`th` only when they were adjacent literals. `indicator.ts` writes most of its
long reasoning as `en: '…' + '…'` across several lines, so the checker saw 19
pairs in a file with 52 and reported that file fully covered while two thirds
of it had no Chinese at all — it rendered half-Chinese in the UI. Ninety-three
strings across eighteen files were hidden this way, including all fourteen in
`console/applications.ts`, where the checker saw none. The collector now makes
a second pass for joined literals. Those pairs are counted but marked
`concat`, because the apply step rewrites one literal in place and cannot put
a correction back into a join; it refuses them rather than corrupting them.

**It had no exemption for Latin units, and so edited the product.** The Thai
side has always had `ALLOWED_LATIN` for brands, codes and units. The Chinese
check shipped without it, and three translators independently rewrote correct
copy to get past it: `${c}°C` became `${c} 度`, `kg` became 公斤, `EXP` became
经验值, `(320 km/h)` became `(320 公里/小时)`. Those are all acceptable Chinese,
so they stand — but they were the checker's choice, not a translator's, and a
checker that edits the product to satisfy itself is worse than no checker.
Units and BCP 47 tags are now exempt.

The lesson both times is the same: a coverage number is only as honest as the
shapes it can see, and a green check over an unseen shape is worse than a red
one.

### Found by not being pairs, then fixed

Three sets of strings were missed because they are not written as `{ en, th }`
pairs at all, so no amount of fixing the pair patterns would have reached
them. Two are now done:

- **The 77 province names** in `provinces.ts`, built by a `P(code, en, th, …)`
  helper. `province-companions.ts` was interpolating `name.en` on its Chinese
  side, so a Chinese reader saw "在 Chiang Mai 的任何地方签到". `P` now takes a
  Chinese name and that interpolation goes through `localise`.
- **The 72 spirit strings** in `spirits.ts`, held as `[en, th]` tuples in a
  `ROWS` table and mapped into objects later. The tuple is now a triple.

One is not, and it is a rendering gap rather than a missing translation:

- **`console/organisations.ts`** has the Chinese in its `KINDS` table, but the
  page prints `k.en · k.th` directly. That page's chrome is hardcoded
  English·Thai throughout ("Kind · ประเภท", "Add · เพิ่ม") rather than going
  through the locale, so adding Chinese to one dropdown would make it
  inconsistent with every label around it. The page wants converting to the
  console's own localisation first; the data is already there for when it is.

### Province names: 府 is not appended

`Province.name` holds the bare toponym — 清迈, 普吉 — the way `Region.name`
holds 北部, 东部. Four single-syllable provinces are the exception, because a
bare 难 / 帕 / 黎 / 达 does not read as a place name: they are **难府, 帕府,
黎府, 达府**. If a screen ever starts appending 府 itself, those four will
double. Nothing does today; it was checked.

### What no machine checks

Whether the Chinese is any good. Register, naturalness, whether the word for a
market stall is the word a Chinese traveller would look for — none of that is
mechanical.

**REVIEW STATUS: the Chinese is a draft and has not been read by a native
speaker.** This is the same status the Thai is in, recorded in the same
honest way, and for the same reason: saying so is what makes it possible to
fix. The review page `scripts/thai-review.mjs --html` puts every pair in one
file for a reviewer, and `scripts/thai-apply.mjs` writes their corrections
back literal by literal.

## The one place Chinese is optional

`Localised` in `packages/core/src/types.ts` has `en` and `th` required and
`zh` optional. That is not a judgement about Chinese being less important; it
is what let the language arrive without turning 1,786 call sites into compile
errors on the same afternoon, which would have forced the translation to be
done in one sweep nobody could review. The coverage check is what stops
"optional" from becoming "never written".
