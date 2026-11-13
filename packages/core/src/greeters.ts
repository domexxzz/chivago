/**
 * An area's greeter: the one character who says hello when you open the app
 * somewhere.
 *
 * WHY THIS IS NOT ANY OF THE THREE CREATURE LISTS WE ALREADY HAVE, because
 * that was the first question asked of it and the answer is the design:
 *
 *   `companions.ts` holds REAL ANIMALS - a scientific name, a habitat, an
 *   IUCN category and one checkable fact each - and its header says in its
 *   own words that invented monsters "would have been easier and would have
 *   taught nothing". A costumed squirrel has no binomial and no Red List
 *   entry, and giving it one would be the exact lie that file refuses.
 *
 *   `mascots.ts` holds seventy-seven PROVINCE EMBLEMS, each carrying a
 *   `basis` saying what real thing it is drawn from - a seal, a fruit, a
 *   festival. Chon Buri's is the dolphin at Bang Saen. A character somebody
 *   commissioned has no basis of that kind, and putting it in that table
 *   would put a made-up emblem beside seventy-six researched ones with
 *   nothing marking the difference.
 *
 *   `spirits.ts` holds the twenty-four things a summon can yield, under rules
 *   about what a roll may decide. A greeter is never drawn for, never earned
 *   and never owned, so it has no business there either.
 *
 * So a greeter claims exactly one thing: THIS PROJECT MADE THIS CHARACTER FOR
 * THIS PLACE. `made` records who, and when. It is art, it says it is art, and
 * no screen should ever present it as the island's wildlife.
 *
 * A REGISTRY, not a requirement. `greeterFor` returns null for every area
 * without one, and every surface that shows a greeter must render fine
 * without it - the same rule `MascotPortrait` follows for the sixty-seven
 * province emblems nobody has drawn yet. Koh Sichang has one because Koh
 * Sichang is the pilot; the others are not waiting on anything.
 */

import type { AreaKey } from './areas.ts';
import type { Localised } from './types.ts';

export interface Greeter {
  /** The area this character greets. One greeter per area, at most. */
  area: AreaKey;
  key: string;
  /** What to call it. A character's name, not a species. */
  name: Localised;
  /** What it is, in the words a card uses: "a travelling squirrel". */
  creature: Localised;
  /** One line of who it is. Never a claim about what lives on the island. */
  blurb: Localised;
  /** Where the art came from, said on the card that shows it. */
  made: Localised;
  /**
   * The greeting portrait, as a path on the app's own origin. `photoUri` in
   * the mobile app turns it into something a phone can fetch; see that file
   * for why these live under `/media/` and never under `/assets/`.
   */
  portrait: string;
  /** A smaller cut of the same pose, for a row or a chip. */
  mark: string;
  /**
   * The three-dimensional model, for the platforms that can draw one. The
   * small build: vertex-coloured, untextured, 39,726 triangles, 771 KB.
   *
   * The colour was sampled onto the vertices and the 4K atlas thrown away,
   * which is how 222 MB became 771 KB. What that cannot carry is surface -
   * see `modelDetailed`, and `scripts/mascot-bake/` for both pipelines.
   */
  model: string;
  /**
   * The same character with its maps intact: base colour, normal and
   * metallic-roughness, 149,992 triangles, 7.4 MB.
   *
   * WHAT THE SIZE BUYS, and it is not a detail: eyes. The vertex-coloured
   * build has nineteen thousand colour samples for the whole animal, which
   * leaves the irises as dull smudges with no catchlight and no lash line.
   * With the maps there is an iris, a pupil, a highlight and an eyeliner -
   * and a face reads as friendly or it does not almost entirely on its eyes.
   * The hat turns out to have a lighthouse printed on it, too.
   *
   * It costs 3.8x the triangles because the atlas pins every UV seam and the
   * simplifier cannot collapse across one: measured, the floor is 103,144
   * triangles, and the error there is thirty times what it is at 150,000.
   *
   * WHO GETS IT is decided at the device, not here - `GreeterScene` sends a
   * phone the small build and a machine with a mouse this one. A field that
   * named one of them "the model" would have hidden that choice.
   */
  modelDetailed: string;
  /**
   * What it says when somebody taps it, as a path on the app's own origin.
   *
   * OPTIONAL, AND UNSET UNTIL THE RECORDING EXISTS. A greeter with no voice
   * is silent and nothing else changes; pointing this at a file that is not
   * there would turn every tap into a 404 and a console error, which is a
   * worse state than quiet.
   *
   * IT NEVER PLAYS ON ITS OWN. Only a tap starts it - not the greeting the
   * card plays when it first appears. Sound that arrives unasked on a home
   * screen is the kind of thing people close an app over, and browsers block
   * it anyway.
   */
  voice?: string;
}

export const GREETERS: Greeter[] = [
  {
    area: 'koh-sichang',
    key: 'changchang',
    name: { en: 'ChangChang', th: 'ช้างช้าง', zh: '昌昌' },
    creature: { en: 'a travelling squirrel', th: 'กระรอกนักเที่ยว', zh: '爱旅行的松鼠' },
    blurb: {
      en: 'Bucket hat, camera, one bag. ChangChang walks the island the way the app asks you to - on foot, and looking at things.',
      th: 'หมวกปีก กล้องหนึ่งตัว กระเป๋าหนึ่งใบ ช้างช้างเดินเที่ยวเกาะแบบที่แอปชวนให้ทำ คือเดินไป แล้วมองสิ่งรอบตัว',
      zh: '渔夫帽、一台相机、一个包。昌昌用这个应用建议的方式逛岛：步行，并且好好地看。',
    },
    made: {
      en: 'A character made for ChivaGo, modelled in 3D. Not a species, and not a claim about the animals of Koh Sichang.',
      th: 'ตัวละครที่ทำขึ้นสำหรับ ChivaGo ปั้นเป็นโมเดลสามมิติ ไม่ใช่ชนิดพันธุ์จริง และไม่ได้อ้างว่าเป็นสัตว์ที่อยู่บนเกาะสีชัง',
      zh: '为 ChivaGo 制作的角色，以三维建模。并非真实物种，也不代表锡昌岛的野生动物。',
    },
    portrait: '/media/mascots/changchang-greeting.png',
    mark: '/media/mascots/changchang-mark.png',
    model: '/media/mascots/changchang.glb',
    modelDetailed: '/media/mascots/changchang-detailed.glb',
  },
];

const BY_AREA = new Map<AreaKey, Greeter>(GREETERS.map((g) => [g.area, g]));

/** The greeter for an area, or null where that area has none. */
export const greeterFor = (area: AreaKey): Greeter | null => BY_AREA.get(area) ?? null;

/** How many areas have one. Said out loud where a screen would otherwise imply all. */
export const GREETER_COUNT = GREETERS.length;
