import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  FACT_QUESTION, GHG_SCOPE3_CAT5, GRI_306_3, INDICATOR_RULES, PLACEMENT_LIMIT, STALE_AFTER_DAYS,
  UNEXAMINED_NOTE, UNKNOWN_FACTS, VERDICT_LABEL,
  DECLARED_FACTS_NOTE, DECLARED_MEASURED_BY, UNIT_UNRECOGNISED,
  assess, lineKey, measureFromUnit, placeAgainst, unexamined,
  type ActivityFacts, type Placement,
} from './indicator.ts';

/**
 * The one researched rule, and the machinery it forced.
 *
 * The assertions that carry weight are the ones about what this declines to
 * say: that there is no verdict meaning "correct", that an unstudied pair
 * cannot read as approval, and that a figure never comes out in a different
 * unit than it went in.
 */

const ASOF = new Date('2026-09-28T00:00:00.000Z');

const facts = (over: Partial<ActivityFacts> = {}): ActivityFacts => ({
  materialOrigin: 'own_operations',
  organisationRole: 'generator',
  insideBoundary: true,
  measuredBy: 'host_verified',
  ...over,
});

const place = (over: Partial<ActivityFacts> = {}): Placement =>
  placeAgainst(GRI_306_3, facts(over), ASOF);

describe('the case the whole module exists for', () => {
  test('BEACH LITTER CANNOT GO IN 306-3, AND THE REASON IS THE DEFINITION', () => {
    const p = place({ materialOrigin: 'third_party', organisationRole: 'manager' });
    assert.equal(p.verdict, 'refuses');
    assert.match(p.because.en, /GRI defines waste as what the holder discards/);
    assert.match(p.because.en, /never this organisation’s waste/);
    assert.match(p.because.th, /ไม่เคยเป็นขยะขององค์กรนี้/);
  });

  test('IT SAYS WHERE THE FIGURE COULD HONESTLY GO INSTEAD', () => {
    // A refusal with nowhere to go is a dead end. `docs/57` found two homes
    // and both travel with the refusal.
    const p = place({ materialOrigin: 'third_party' });
    assert.equal(p.insteadTry.length, 2);
    assert.match(p.insteadTry[0]!.en, /3-3-e-ii/);
    assert.match(p.insteadTry[1]!.en, /waste MANAGER/);
  });

  test('THE SAME KILOGRAMS FROM THE COMPANY’S OWN OPERATIONS ARE NOT REFUSED', () => {
    // The point the obvious build gets backwards. Kilograms were never the
    // problem; a table keyed on the measure would refuse this too.
    const p = place();
    assert.equal(p.verdict, 'conditional');
    assert.match(p.because.en, /nothing in this reading refuses 306-3/);
  });

  test('and even then it does not say the placement is correct', () => {
    const p = place();
    assert.match(p.because.en, /not the same as confirming the placement is correct/);
    assert.match(p.because.th, /ไม่เท่ากับการยืนยันว่า/);
  });
});

describe('the unknown that names its own question', () => {
  test('WHOSE WASTE IT WAS IS ASKED, NOT GUESSED', () => {
    const p = place({ materialOrigin: 'unknown' });
    assert.equal(p.verdict, 'unknown');
    assert.equal(p.settledBy, 'materialOrigin');
    assert.equal(p.ask?.en, FACT_QUESTION.materialOrigin.en);
    assert.match(p.because.en, /can refuse it or permit it until that is answered/);
  });

  test('an unknown role is asked once the material is the organisation’s own', () => {
    const p = place({ organisationRole: 'unknown' });
    assert.equal(p.verdict, 'unknown');
    assert.equal(p.settledBy, 'organisationRole');
  });

  test('an unknown boundary is the last thing asked', () => {
    const p = place({ insideBoundary: 'unknown' });
    assert.equal(p.verdict, 'unknown');
    assert.equal(p.settledBy, 'insideBoundary');
  });

  test('THE MATERIAL QUESTION IS ASKED BEFORE THE OTHERS', () => {
    // Order matters: asking about the boundary first would be asking a
    // question that does not decide anything yet.
    const p = place({ materialOrigin: 'unknown', organisationRole: 'unknown', insideBoundary: 'unknown' });
    assert.equal(p.settledBy, 'materialOrigin');
  });

  test('every fact has a question in both languages', () => {
    for (const [name, q] of Object.entries(FACT_QUESTION)) {
      assert.ok(q.en.length > 0 && q.th.length > 0, `${name} is missing a language`);
      assert.notEqual(q.en, q.th);
    }
  });
});

describe('the branches between the two extremes', () => {
  test('mixed material must be separated, not reported as one figure', () => {
    const p = place({ materialOrigin: 'mixed' });
    assert.equal(p.verdict, 'conditional');
    assert.match(p.conditions[0]!.en, /Separate the two/);
    assert.match(p.because.en, /reports both as though they were the first/);
  });

  test('A MANAGER OR FUNDER OF ITS OWN MATERIAL STILL DID NOT GENERATE IT', () => {
    for (const role of ['manager', 'funder'] as const) {
      const p = place({ organisationRole: role });
      assert.equal(p.verdict, 'refuses', role);
      assert.match(p.because.en, /is not generating it/);
    }
  });

  test('outside the reported boundary is refused even when they generated it', () => {
    const p = place({ insideBoundary: false });
    assert.equal(p.verdict, 'refuses');
    assert.match(p.because.en, /outside the operational boundary/);
  });

  test('the basis of the figure becomes a condition, and names which basis', () => {
    assert.match(place({ measuredBy: 'host_verified' }).conditions[1]!.en, /not independent assurance/);
    assert.match(place({ measuredBy: 'declared' }).conditions[1]!.en, /Self-declared/);
    assert.match(place({ measuredBy: 'unknown' }).conditions[1]!.en, /Nobody has said where the figure came from/);
  });
});

describe('what this module declines to be', () => {
  test('THERE IS NO VERDICT THAT MEANS CORRECT', () => {
    // The design's actual principle. The nearest thing to a yes is a
    // conditional, and it says so in words.
    assert.deepEqual(
      Object.keys(VERDICT_LABEL).sort(),
      ['conditional', 'refuses', 'unexamined', 'unknown'],
    );
    for (const label of Object.values(VERDICT_LABEL)) {
      assert.doesNotMatch(label.en, /^(correct|approved|valid|yes|fits)$/i);
    }
  });

  test('NO VERDICT EVER CARRIES A CONVERTED FIGURE, IN ANY RULE', () => {
    // The moment a mapping layer can say "and therefore 2.4 tCO2e" it has
    // become the emission-factor table `esg.ts` has refused since it was
    // written. Nothing in Placement is a quantity except the reading's age.
    //
    // Walked across EVERY rule, not one. The first version of this test only
    // walked 306-3's branches, so it never saw the second rule's prose at all
    // - a guard that silently covers less as the rules grow.
    //
    // And it forbids a QUANTITY in a carbon unit, not the unit's name. The
    // first version refused the string "CO2e" outright, which would have
    // stopped the GHG rule saying the one thing it most needs to say: that
    // Category 5 is reported in CO2e, and a weight is not. The intent - no
    // converted figure - is kept and made exact.
    const branches: ActivityFacts[] = [
      facts(), facts({ materialOrigin: 'third_party' }), facts({ materialOrigin: 'mixed' }),
      facts({ materialOrigin: 'unknown' }), facts({ organisationRole: 'funder' }),
      facts({ organisationRole: 'unknown' }), facts({ insideBoundary: false }),
      facts({ insideBoundary: 'unknown' }), facts({ measuredBy: 'declared' }),
    ];
    const every: Placement[] = [
      ...INDICATOR_RULES.flatMap((r) => branches.map((f) => placeAgainst(r, f, ASOF))),
      unexamined('gri', '306-3'),
    ];
    for (const p of every) {
      const prose = [p.because, ...p.conditions, ...p.insteadTry]
        .flatMap((b) => [b.en, b.th]).join(' ');
      assert.doesNotMatch(prose, /\d+(\.\d+)?\s*(t|kg|g)?\s*CO2e?/i,
        `${p.ruleId} ${p.verdict} produced a carbon quantity`);
      assert.doesNotMatch(prose, /\d+(\.\d+)?\s*(kg|tonnes?|t\b)/i,
        `${p.ruleId} ${p.verdict} produced a quantity`);
    }
  });

  test('the carbon guard still catches the thing it exists for', () => {
    // Proof the refined pattern is not vacuous.
    for (const bad of ['2.4 tCO2e', '120 kgCO2', '3 t CO2e', '0.5 CO2e']) {
      assert.match(bad, /\d+(\.\d+)?\s*(t|kg|g)?\s*CO2e?/i, bad);
    }
    assert.doesNotMatch('reported as emissions in CO2e', /\d+(\.\d+)?\s*(t|kg|g)?\s*CO2e?/i);
  });

  test('the limit travels with every result and says it is a reading', () => {
    assert.match(PLACEMENT_LIMIT.en, /not a ruling and not an assurance opinion/);
    assert.match(PLACEMENT_LIMIT.en, /nothing here converts a figure/);
    assert.match(PLACEMENT_LIMIT.th, /ไม่ใช่คำวินิจฉัย/);
  });
});

describe('an unstudied pair', () => {
  test('IT IS NOT SILENCE, AND IT IS NOT APPROVAL', () => {
    // A caller handed nothing renders nothing, and a blank space where a
    // refusal might have been is the failure this module is about.
    const p = assess(INDICATOR_RULES, 'weight_kg', 'ifrs_s', 'S2-29a', facts(), ASOF);
    assert.equal(p.verdict, 'unexamined');
    assert.match(p.because.en, /gap in what ChivaGo has studied/);
    assert.match(p.because.en, /not a finding that the placement is sound/);
    assert.match(p.because.th, /ไม่ใช่ข้อสรุปว่าการจัดวางนั้นถูกต้อง/);
  });

  test('a measure the rule is not about does not borrow its rule', () => {
    // GRI 306-3 is about weight. Reaching it with a headcount would be the
    // table-shaped mistake arriving by another door.
    const p = assess(INDICATOR_RULES, 'distinct_participants', 'gri', '306-3', facts(), ASOF);
    assert.equal(p.verdict, 'unexamined');
  });

  test('it carries no source, because there was no reading', () => {
    const p = unexamined('gri', '999');
    assert.equal(p.source, null);
    assert.equal(p.ruleId, null);
    assert.equal(p.readingAgeDays, null);
    assert.equal(p.stale, false);
    assert.equal(p.because.en, UNEXAMINED_NOTE.en);
  });

  test('the studied pair is found', () => {
    assert.equal(assess(INDICATOR_RULES, 'weight_kg', 'gri', '306-3', facts(), ASOF).ruleId,
      GRI_306_3.id);
  });
});

describe('a rule that can be dated, and retired', () => {
  test('it carries the clause, where to read it, when and by whom', () => {
    const s = GRI_306_3.source;
    assert.match(s.clause, /anything that the holder discards/);
    assert.match(s.where, /GRI 306: Waste 2020/);
    assert.match(s.readOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(s.readBy.length > 0);
  });

  test('IT SAYS WHAT THE READING DID NOT COVER', () => {
    // `docs/57` could not read the SEC's pages and wrote the gap into the
    // document rather than letting it sit inside a conclusion.
    assert.match(GRI_306_3.source.notChecked.en, /No ruling, no assurance provider’s opinion/);
    assert.match(GRI_306_3.source.notChecked.en, /sector standard/);
  });

  test('a fresh reading is not stale and reports its age', () => {
    const p = placeAgainst(GRI_306_3, facts(), new Date('2026-09-28T00:00:00.000Z'));
    assert.equal(p.readingAgeDays, 2);
    assert.equal(p.stale, false);
  });

  test('A STALE READING STILL ANSWERS, AND SAYS IT IS STALE', () => {
    // An old reading of a clause that did not change is still right. It just
    // cannot be trusted silently.
    const p = placeAgainst(GRI_306_3, facts({ materialOrigin: 'third_party' }),
      new Date('2027-10-01T00:00:00.000Z'));
    assert.equal(p.verdict, 'refuses', 'a stale rule stopped answering');
    assert.equal(p.stale, true);
    assert.ok(p.readingAgeDays! > STALE_AFTER_DAYS);
  });

  test('the boundary day is not yet stale', () => {
    const on = new Date(Date.parse('2026-09-26') + STALE_AFTER_DAYS * 86_400_000);
    assert.equal(placeAgainst(GRI_306_3, facts(), on).stale, false);
    assert.equal(
      placeAgainst(GRI_306_3, facts(), new Date(on.getTime() + 86_400_000)).stale, true,
    );
  });

  test('A CLOCK BEHIND THE READING DOES NOT LOOK FRESHER THAN NEW', () => {
    const p = placeAgainst(GRI_306_3, facts(), new Date('2020-01-01T00:00:00.000Z'));
    assert.equal(p.readingAgeDays, 0);
    assert.equal(p.stale, false);
  });
});

describe('the rules this build carries', () => {
  test('two, and each one was read from its source', () => {
    assert.deepEqual(INDICATOR_RULES.map((r) => r.id), [GRI_306_3.id, GHG_SCOPE3_CAT5.id]);
  });

  test('no two rules claim the same line in the same standard', () => {
    // Otherwise `assess` would answer with whichever came first and the
    // other would be dead code nobody noticed.
    const seen = new Set<string>();
    for (const r of INDICATOR_RULES) {
      for (const l of [r.line, ...(r.aliases ?? [])]) {
        for (const m of r.measures) {
          const k = `${r.framework}|${lineKey(l)}|${m}`;
          assert.ok(!seen.has(k), `${r.id} and another rule both claim ${k}`);
          seen.add(k);
        }
      }
    }
  });

  test('every rule can be dated and sourced', () => {
    for (const r of INDICATOR_RULES) {
      assert.ok(r.source.clause.length > 0, `${r.id} rests on nothing quotable`);
      assert.ok(!Number.isNaN(Date.parse(r.source.readOn)), `${r.id} has no readable date`);
      assert.ok(r.measures.length > 0, `${r.id} is about no measure`);
    }
  });

  test('EVERY BRANCH OF EVERY RULE GIVES A REASON IN BOTH LANGUAGES', () => {
    const branches: ActivityFacts[] = [
      facts(), facts({ materialOrigin: 'third_party' }), facts({ materialOrigin: 'mixed' }),
      facts({ materialOrigin: 'unknown' }), facts({ organisationRole: 'manager' }),
      facts({ organisationRole: 'funder' }), facts({ organisationRole: 'unknown' }),
      facts({ insideBoundary: false }), facts({ insideBoundary: 'unknown' }),
      facts({ measuredBy: 'declared' }), facts({ measuredBy: 'unknown' }),
    ];
    for (const r of INDICATOR_RULES) {
      for (const f of branches) {
        const out = r.test(f);
        assert.ok(out.because.en.length > 20, `${r.id} gave a thin English reason`);
        assert.ok(out.because.th.length > 20, `${r.id} gave a thin Thai reason`);
        assert.notEqual(out.because.en, out.because.th);
        if (out.verdict === 'unknown') {
          assert.ok(out.settledBy, `${r.id} returned unknown without naming a fact`);
        }
        if (out.verdict === 'conditional') {
          assert.ok((out.conditions ?? []).length > 0, `${r.id} was conditional on nothing`);
        }
      }
    }
  });
});

/**
 * Reading somebody else's sheet well enough to ask the question.
 *
 * The bridge from a pasted file to a rule. A guess here is not a small guess:
 * it picks which rule runs.
 */
describe('which measure a declared file is talking about', () => {
  test('the units a partner actually writes', () => {
    for (const u of ['kg', 'KG', ' kg ', 'kilograms', 'กก', 'กก.', 'กิโลกรัม']) {
      assert.equal(measureFromUnit(u), 'weight_kg', u);
    }
    for (const u of ['people', 'คน', 'participants']) {
      assert.equal(measureFromUnit(u), 'distinct_participants', u);
    }
    for (const u of ['submissions', 'รายการ', 'ครั้ง']) {
      assert.equal(measureFromUnit(u), 'verified_submissions', u);
    }
  });

  test('IT DOES NOT GUESS, AND A NEAR MISS IS A MISS', () => {
    // `parseDeclaredCsv` refuses to guess which COLUMN is which for the same
    // reason. A fuzzy match here would run a rule written about a different
    // kind of figure, and it would answer confidently.
    for (const u of ['kgs.', 'kg/day', 'tonnes', 'ton', 'บาท', 'x', '', '  ']) {
      assert.equal(measureFromUnit(u), null, u);
    }
    assert.equal(measureFromUnit(null), null);
    assert.equal(measureFromUnit(undefined), null);
  });

  test('an unrecognised unit is said out loud, not quietly skipped', () => {
    assert.match(UNIT_UNRECOGNISED.en, /not one this platform measures/);
    assert.match(UNIT_UNRECOGNISED.en, /Guessing which measure was meant/);
    assert.match(UNIT_UNRECOGNISED.th, /การเดาว่าหมายถึงตัววัดใด/);
  });

  test('A PASTED FILE IS DECLARED, AND IS NOT ASKED', () => {
    // The first thing building the console column found. `measuredBy` looked
    // like a fourth question and is not one: asking would invite the answer
    // "verified", which that page exists to refuse.
    assert.equal(DECLARED_MEASURED_BY, 'declared');
    assert.match(DECLARED_FACTS_NOTE.en, /is not asked here and cannot be answered here/);
    assert.match(DECLARED_FACTS_NOTE.en, /self-declared, whatever it says about itself/);
  });

  test('the declared basis reaches the conditions when a placement is allowed', () => {
    const p = placeAgainst(GRI_306_3, facts({ measuredBy: DECLARED_MEASURED_BY }), ASOF);
    assert.equal(p.verdict, 'conditional');
    assert.match(p.conditions[1]!.en, /Self-declared and not verified by anybody here/);
  });
});

/**
 * The second rule, and what it taught the design.
 *
 * GHG Protocol Scope 3 Category 5, written from the Technical Guidance
 * chapter itself. The weight of collected litter turned into carbon and
 * netted against a footprint is the move `esg.ts` has refused in prose since
 * it was written; this is the same refusal with a clause behind it.
 */
describe('GHG Protocol Scope 3 Category 5', () => {
  const cat5 = (over: Partial<ActivityFacts> = {}) => placeAgainst(GHG_SCOPE3_CAT5, facts(over), ASOF);

  test('BEACH LITTER IS REFUSED, ON THE CATEGORY’S OWN DEFINITION', () => {
    const p = cat5({ materialOrigin: 'third_party' });
    assert.equal(p.verdict, 'refuses');
    assert.match(p.because.en, /owned or controlled\s+operations/);
    assert.match(p.because.en, /Material somebody else discarded was never in them/);
  });

  test('AND IT SAYS WHY A WEIGHT CANNOT BE THE FIGURE AT ALL', () => {
    // The category is reported in CO2e. Saying so is the refusal; printing a
    // converted number would be the lie.
    assert.match(cat5({ materialOrigin: 'third_party' }).because.en, /in CO2e, which a weight is not/);
  });

  test('AVOIDED EMISSIONS ARE NEVER OFFERED AS A WAY ROUND IT', () => {
    // p.79: any claims of avoided emissions associated with recycling should
    // not be included in, or deducted from, the scope 3 inventory.
    const p = cat5({ materialOrigin: 'third_party' });
    const instead = p.insteadTry.map((i) => i.en).join(' ');
    assert.match(instead, /never deducted from them/);
    assert.match(instead, /which ChivaGo does not supply/);
  });

  test('THE COMPANY’S OWN WASTE IS ACTIVITY DATA, AND STILL NOT THE ANSWER', () => {
    // A weight can be the input to the calculation without being its result.
    const p = cat5();
    assert.equal(p.verdict, 'conditional');
    assert.match(p.because.en, /as ACTIVITY DATA for Category 5/);
    assert.match(p.because.en, /It is not\s+the Category 5 figure/);
    assert.match(p.because.en, /does not hold and will not\s+estimate/);
  });

  test('the new fact the design predicted arrives as a condition', () => {
    // Treatment by a third party is required - a company's own facility is
    // scope 1 and 2 - and it is carried as a condition, not asked.
    assert.match(cat5().conditions[0]!.en, /Only if a third party treats it/);
    assert.match(cat5().conditions[0]!.en, /belongs\s+in scope 1 and 2/);
  });

  test('NOT EVERY RULE NEEDS EVERY FACT: CATEGORY 5 NEVER ASKS THE ROLE', () => {
    // Its clause does not turn on role, so an unknown role changes nothing.
    assert.equal(cat5({ organisationRole: 'unknown' }).verdict, 'conditional');
    assert.equal(cat5({ organisationRole: 'unknown' }).settledBy, null);
    for (const role of ['generator', 'manager', 'funder', 'unknown'] as const) {
      assert.notEqual(cat5({ organisationRole: role }).settledBy, 'organisationRole');
    }
  });

  test('told nothing, it asks the same question 306-3 asks', () => {
    const p = cat5({ materialOrigin: 'unknown' });
    assert.equal(p.settledBy, 'materialOrigin');
    assert.match(p.because.en, /same question that settles GRI 306-3/);
  });

  test('mixed material must be separated first', () => {
    const p = cat5({ materialOrigin: 'mixed' });
    assert.equal(p.verdict, 'conditional');
    assert.match(p.conditions[0]!.en, /Separate the two/);
  });

  test('outside the inventory boundary is refused; unknown boundary is asked', () => {
    assert.equal(cat5({ insideBoundary: false }).verdict, 'refuses');
    assert.equal(cat5({ insideBoundary: 'unknown' }).settledBy, 'insideBoundary');
  });

  test('it carries its source, read directly and dated', () => {
    const s = GHG_SCOPE3_CAT5.source;
    assert.match(s.clause, /owned or controlled operations/);
    assert.match(s.where, /Category 5: Waste Generated in Operations, pp\. 72–80/);
    assert.equal(s.readOn, '2026-09-28');
    assert.match(s.notChecked.en, /section 9\.5 on avoided emissions/);
  });
});

describe('the same fact deciding two standards', () => {
  test('ONE ANSWER ABOUT WHOSE WASTE IT WAS SETTLES BOTH RULES THE SAME WAY', () => {
    // Keying on facts about the activity was a bet made on one example. Two
    // independent standards, written by different bodies, both turn on this
    // one fact - and a customer answers it once.
    for (const origin of ['own_operations', 'third_party', 'mixed', 'unknown'] as const) {
      const f = facts({ materialOrigin: origin });
      const gri = placeAgainst(GRI_306_3, f, ASOF).verdict;
      const ghg = placeAgainst(GHG_SCOPE3_CAT5, f, ASOF).verdict;
      assert.equal(gri, ghg, `${origin}: GRI said ${gri}, GHG said ${ghg}`);
    }
  });

  test('told nothing, both ask exactly the same question', () => {
    const a = placeAgainst(GRI_306_3, UNKNOWN_FACTS, ASOF);
    const b = placeAgainst(GHG_SCOPE3_CAT5, UNKNOWN_FACTS, ASOF);
    assert.equal(a.ask?.en, b.ask?.en);
  });
});

describe('spellings of the same line', () => {
  test('GRI 306-3 is found however the dash is written', () => {
    for (const line of ['306-3', '306.3', '306 3', ' 306-3 ']) {
      assert.equal(assess(INDICATOR_RULES, 'weight_kg', 'gri', line, facts(), ASOF).ruleId,
        GRI_306_3.id, line);
    }
  });

  test('THE GHG LINE HAS SEVERAL NAMES AND EACH IS LISTED, NOT GUESSED', () => {
    for (const line of ['Scope 3 Category 5', 'Category 5', 'cat 5', 'Cat. 5', 'S3C5', 'scope 3 cat 5']) {
      assert.equal(assess(INDICATOR_RULES, 'weight_kg', 'ghg_protocol', line, facts(), ASOF).ruleId,
        GHG_SCOPE3_CAT5.id, line);
    }
  });

  test('A NEAR MISS IS A MISS', () => {
    // A bare "5" could be anything in any standard. A guessed line would run
    // a rule against a line it was never about.
    for (const line of ['5', 'Category 12', 'Scope 3', 'Category 50', '']) {
      assert.equal(assess(INDICATOR_RULES, 'weight_kg', 'ghg_protocol', line, facts(), ASOF).verdict,
        'unexamined', line);
    }
  });

  test('a line never crosses into another standard', () => {
    assert.equal(assess(INDICATOR_RULES, 'weight_kg', 'gri', 'Category 5', facts(), ASOF).verdict,
      'unexamined');
    assert.equal(assess(INDICATOR_RULES, 'weight_kg', 'ghg_protocol', '306-3', facts(), ASOF).verdict,
      'unexamined');
  });

  test('the placement shows the canonical line, not what was typed', () => {
    assert.equal(assess(INDICATOR_RULES, 'weight_kg', 'ghg_protocol', 'cat 5', facts(), ASOF).line,
      'Scope 3 Category 5');
  });

  test('lineKey is deterministic and dull', () => {
    assert.equal(lineKey('Scope 3 — Category 5!'), 'scope3category5');
    assert.equal(lineKey('306-3'), '3063');
    assert.equal(lineKey('   '), '');
  });
});
