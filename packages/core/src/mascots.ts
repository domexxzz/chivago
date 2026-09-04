/**
 * Seventy-seven mascots, one per province, each the province's own emblem.
 *
 * The companions were five real animals for five Samui habitats, and the
 * other seventy-five provinces held sealed eggs that named no species -
 * because you cannot say what lives somewhere nobody has surveyed. That
 * refusal was about WILDLIFE, and it stands: nothing here claims an animal
 * lives anywhere.
 *
 * A mascot is a different kind of claim. It is the province's emblem, drawn
 * as a small creature: the white elephant on Chiang Mai's seal, the rooster
 * on Lampang's bowls, Trang's dugong, Nonthaburi's durian, Loei's ghost
 * masks. Every entry says what it is drawn from (`basis`), in one line, so a
 * reader can tell an official seal from a famous fruit from a local legend -
 * and so somebody who knows better can correct it.
 *
 * WHAT THIS IS NOT. It is not the Ministry of Interior's list of provincial
 * trees and flowers, which this file does not reproduce; it is a field guide
 * of emblems chosen for being recognisable, checked against what the author
 * knows, and marked with where each came from. Treat a `basis` as "drawn
 * from", never as "the official symbol of".
 *
 * Every mascot is built from the same eight body archetypes and a short list
 * of parts - ears, tail, crest, one prop - so seventy-seven of them can be
 * drawn by one renderer, in three dimensions on the web and as a mark on a
 * phone, and a test can hold that no two are the same creature.
 */

import type { Bilingual, LayerKey } from './types.ts';

export type MascotArchetype = 'bird' | 'beast' | 'sea' | 'naga' | 'bug' | 'sprite' | 'ape' | 'shell';

/** Where the emblem comes from. Said on the card, so the reader can judge it. */
export type MascotBasis = 'seal' | 'wildlife' | 'produce' | 'craft' | 'festival' | 'landmark' | 'legend';

export type MascotEars = 'none' | 'round' | 'long' | 'fan' | 'horns' | 'antlers' | 'tufts';
export type MascotTail = 'none' | 'short' | 'long' | 'plume' | 'flukes' | 'fan';
export type MascotCrest = 'none' | 'crest' | 'crown' | 'flower' | 'fruit' | 'leaf' | 'spikes' | 'fin' | 'whiskers' | 'antennae' | 'flame';
export type MascotProp =
  | 'umbrella' | 'chedi' | 'lantern' | 'mask' | 'drum' | 'boat' | 'gem' | 'scarf' | 'rocket' | 'salt'
  | 'pearl' | 'steam' | 'tusks' | 'trunk' | 'pot' | 'book' | 'wings' | 'shell' | 'basket' | 'petals';
/** The body's outline, for the archetypes that vary in it. */
export type MascotShape = 'round' | 'pear' | 'tall' | 'flat' | 'long';

export interface Mascot {
  /** ISO 3166-2:TH province code. */
  code: string;
  /** A stable key for assets and tests. */
  key: string;
  /** The mascot's name - a nickname a child would use. */
  name: Bilingual;
  /** What it is: "a white elephant", "a durian". */
  creature: Bilingual;
  /** One line on why this, for this province. */
  why: Bilingual;
  basis: MascotBasis;
  archetype: MascotArchetype;
  /** Which of the five habitats its room is drawn as. */
  habitat: LayerKey;
  colours: { body: string; belly: string; feature: string; accent: string };
  ears: MascotEars;
  tail: MascotTail;
  crest: MascotCrest;
  prop: MascotProp | null;
  shape: MascotShape;
}

const B = (en: string, th: string): Bilingual => ({ en, th });

type Row = [
  code: string, key: string, name: [string, string], creature: [string, string], why: [string, string],
  basis: MascotBasis, archetype: MascotArchetype, habitat: LayerKey,
  colours: [string, string, string, string], ears: MascotEars, tail: MascotTail, crest: MascotCrest,
  prop: MascotProp | null, shape: MascotShape,
];

const ROWS: Row[] = [
  // ---- North ---------------------------------------------------------------
  ['TH-50', 'chiangmai-elephant', ['Phuak', 'เผือก'], ['a white elephant', 'ช้างเผือก'], ['The white elephant on the provincial seal, under a Bo Sang umbrella.', 'ช้างเผือกบนตราจังหวัด กางร่มบ่อสร้าง'], 'seal', 'beast', 'Green', ['#e9e0dc', '#f6f0ec', '#c9b3ad', '#d9536f'], 'fan', 'short', 'none', 'umbrella', 'round'],
  ['TH-57', 'chiangrai-catfish', ['Buek', 'บึก'], ['a Mekong giant catfish', 'ปลาบึก'], ['The giant catfish of the Mekong at Chiang Khong.', 'ปลาบึกแห่งแม่น้ำโขงที่เชียงของ'], 'wildlife', 'sea', 'Quest', ['#7d8a99', '#d8dfe6', '#4a5563', '#f2c24e'], 'none', 'flukes', 'whiskers', null, 'long'],
  ['TH-52', 'lampang-rooster', ['Kai Kaeo', 'ไก่แก้ว'], ['a white rooster', 'ไก่ขาว'], ['The rooster on the seal, and on every chicken bowl ever made here.', 'ไก่บนตราจังหวัด และบนชามตราไก่ทุกใบ'], 'seal', 'bird', 'Wellness', ['#f7f2ea', '#fffaf3', '#d33a2f', '#f2a83b'], 'none', 'plume', 'crest', null, 'round'],
  ['TH-51', 'lamphun-longan', ['Lamyai', 'ลำไย'], ['a longan', 'ลำไย'], ['Lamphun grows the longans the rest of the country waits for.', 'ลำไยลำพูน ของขึ้นชื่อที่ทั้งประเทศรอ'], 'produce', 'sprite', 'Green', ['#c9a06a', '#f1e3cc', '#8a6a3c', '#6b8f3a'], 'none', 'none', 'leaf', null, 'round'],
  ['TH-58', 'maehongson-buatong', ['Bua Tong', 'บัวตอง'], ['a Mexican sunflower sprite', 'ดอกบัวตอง'], ['The hills at Mae U-Kho turn gold with bua tong every November.', 'ทุ่งบัวตองดอยแม่อูคอเหลืองทั้งเขาทุกพฤศจิกายน'], 'landmark', 'sprite', 'Wellness', ['#f2b52c', '#ffe08a', '#a35a12', '#5f7f3a'], 'none', 'none', 'flower', null, 'round'],
  ['TH-55', 'nan-bull', ['Usu', 'อุสุ'], ['a black bull', 'โคอุสุภราช'], ['The bull that carries the relic on Nan\'s seal.', 'โคอุสุภราชที่อัญเชิญพระธาตุ บนตราจังหวัดน่าน'], 'seal', 'beast', 'Wellness', ['#3a3230', '#6b5a55', '#1f1a19', '#e0b34a'], 'horns', 'short', 'none', 'chedi', 'round'],
  ['TH-56', 'phayao-egret', ['Kwan', 'กว๊าน'], ['a little egret', 'นกยางเปีย'], ['The egrets that fish Kwan Phayao at dusk, beside the lake on the seal.', 'นกยางที่หากินในกว๊านพะเยายามเย็น'], 'landmark', 'bird', 'Quest', ['#f4f4f0', '#ffffff', '#2c2c2c', '#f2c24e'], 'none', 'short', 'crest', 'lantern', 'tall'],
  ['TH-54', 'phrae-horse', ['Mo Hom', 'ม่อฮ่อม'], ['an indigo horse', 'ม้าสีคราม'], ['The horse on Phrae\'s seal, in the indigo of a mo hom shirt.', 'ม้าบนตราจังหวัดแพร่ ในสีครามของเสื้อม่อฮ่อม'], 'seal', 'beast', 'Wellness', ['#2f4f7a', '#8aa3c8', '#1c2f4d', '#f2f2f2'], 'tufts', 'plume', 'crest', 'scarf', 'tall'],
  ['TH-53', 'uttaradit-langsat', ['Langsat', 'ลางสาด'], ['a langsat', 'ลางสาด'], ['Uttaradit\'s langsat and its Long Lap Lae durian are the fruit the province is known by.', 'ลางสาดและทุเรียนหลงลับแลของอุตรดิตถ์'], 'produce', 'sprite', 'Green', ['#e2c98a', '#f7ecc8', '#a67c3a', '#6b8f3a'], 'none', 'none', 'leaf', 'basket', 'pear'],

  // ---- Northeast -----------------------------------------------------------
  ['TH-46', 'kalasin-dino', ['Sirin', 'สิริน'], ['a small dinosaur', 'ไดโนเสาร์น้อย'], ['Phu Kum Khao\'s fossils - Sirindhorna - are why every child here knows the word.', 'ฟอสซิลภูกุ้มข้าว ทำให้เด็กกาฬสินธุ์ทุกคนรู้จักไดโนเสาร์'], 'wildlife', 'beast', 'Wellness', ['#6f9b6a', '#cfe3c4', '#3f6b3c', '#f2a83b'], 'none', 'long', 'spikes', null, 'long'],
  ['TH-40', 'khonkaen-silkworm', ['Mai', 'ไหม'], ['a silkworm', 'หนอนไหม'], ['Mudmee silk from Chonnabot is the province\'s cloth.', 'ผ้าไหมมัดหมี่ชนบท ผ้าของขอนแก่น'], 'craft', 'bug', 'Green', ['#f1e4c6', '#fff7e6', '#8a3b5c', '#d9a441'], 'none', 'short', 'antennae', 'scarf', 'long'],
  ['TH-36', 'chaiyaphum-krachiao', ['Krachiao', 'กระเจียว'], ['a Siam tulip sprite', 'ดอกกระเจียว'], ['Pa Hin Ngam\'s fields of pink krachiao in the rains.', 'ทุ่งดอกกระเจียวป่าหินงามในหน้าฝน'], 'landmark', 'sprite', 'Wellness', ['#e07aa8', '#f7c6dc', '#9a3c6a', '#5f8f4a'], 'none', 'none', 'flower', null, 'tall'],
  ['TH-48', 'nakhonphanom-softshell', ['Fai', 'ไฟ'], ['a Mekong softshell turtle', 'ตะพาบแม่น้ำโขง'], ['A river turtle carrying a lantern for the illuminated boat procession.', 'ตะพาบโขงถือโคมไฟ สำหรับงานไหลเรือไฟ'], 'festival', 'shell', 'Quest', ['#6d7f5c', '#c9d3b3', '#3f4d33', '#f2c24e'], 'none', 'short', 'none', 'lantern', 'flat'],
  ['TH-30', 'korat-cat', ['Sawat', 'สวาด'], ['a Korat cat', 'แมวสีสวาด'], ['The silver-blue cat that carries the province\'s old name.', 'แมวสีสวาด แมวที่ใช้ชื่อเก่าของโคราช'], 'wildlife', 'beast', 'Food', ['#8d9aa8', '#d5dde5', '#5f6c7a', '#8fd07a'], 'round', 'long', 'none', null, 'round'],
  ['TH-38', 'buengkan-stone-naga', ['Naka', 'นาคา'], ['a stone naga', 'พญานาคหิน'], ['Naka Cave, where the rock lies in scales.', 'ถ้ำนาคา ที่หินเรียงตัวเป็นเกล็ด'], 'landmark', 'naga', 'Wellness', ['#7f8b86', '#c7cfca', '#4f5a56', '#c9a24a'], 'none', 'long', 'crest', null, 'long'],
  ['TH-31', 'buriram-sandstone', ['Phanom', 'พนม'], ['a sandstone sprite', 'ตุ๊กตาหินทราย'], ['Phanom Rung, stone stacked into a hill, with the sanctuary\'s crown.', 'ปราสาทพนมรุ้ง หินทรายซ้อนเป็นเขา สวมยอดปราสาท'], 'landmark', 'sprite', 'Wellness', ['#c48a6a', '#e8c9b3', '#8a5a3f', '#e0b34a'], 'none', 'none', 'crown', null, 'tall'],
  ['TH-44', 'mahasarakham-owl', ['Taksila', 'ตักสิลา'], ['a scholar owl', 'นกฮูกบัณฑิต'], ['The province calls itself Taksila, the city of learning.', 'เมืองตักสิลานคร เมืองแห่งการศึกษา'], 'landmark', 'bird', 'Green', ['#8a6a4a', '#e3cfb3', '#4a3625', '#f2c24e'], 'tufts', 'short', 'none', 'book', 'round'],
  ['TH-49', 'mukdahan-clam', ['Mukda', 'มุกดา'], ['a river clam with a pearl', 'หอยกาบกับไข่มุก'], ['Mukda is the pearl in the province\'s name.', 'มุกดาคือไข่มุกในชื่อจังหวัด'], 'legend', 'shell', 'Quest', ['#b9a89a', '#efe6dc', '#7c6a5c', '#f6f0ff'], 'none', 'none', 'none', 'pearl', 'flat'],
  ['TH-35', 'yasothon-toad', ['Khan Khak', 'คันคาก'], ['a toad with a rocket', 'คางคกถือบั้งไฟ'], ['Phaya Khan Khak, the toad king, and the rocket festival that asks the sky for rain.', 'พญาคันคาก และบุญบั้งไฟขอฝน'], 'festival', 'sprite', 'Quest', ['#7a9a3e', '#d6e3a3', '#4c6424', '#e8543a'], 'none', 'none', 'none', 'rocket', 'flat'],
  ['TH-45', 'roiet-barb', ['Phalan', 'พลาญ'], ['a golden barb', 'ปลาตะเพียนทอง'], ['A barb from Bueng Phlan Chai, the lake with eleven gates on the seal.', 'ปลาตะเพียนจากบึงพลาญชัย บึงสิบเอ็ดประตูบนตรา'], 'seal', 'sea', 'Food', ['#e0b34a', '#fbe7a6', '#a37a1e', '#d33a2f'], 'none', 'fan', 'fin', null, 'round'],
  ['TH-42', 'loei-phitakhon', ['Ta Khon', 'ตาโขน'], ['a Phi Ta Khon sprite', 'ผีตาโขน'], ['Dan Sai\'s ghost festival, in the mask with the long nose.', 'ผีตาโขนด่านซ้าย หน้ากากจมูกยาว'], 'festival', 'sprite', 'Wellness', ['#c43c2f', '#f2b57a', '#5a1e16', '#2f8f6a'], 'none', 'none', 'none', 'mask', 'round'],
  ['TH-33', 'sisaket-shallot', ['Hom', 'หอม'], ['a shallot', 'หอมแดง'], ['Si Sa Ket\'s shallots and garlic, grown in volcanic soil.', 'หอมแดงกระเทียมศรีสะเกษ ปลูกในดินภูเขาไฟ'], 'produce', 'sprite', 'Food', ['#b45a7a', '#e9b8cc', '#7a2f4f', '#6b8f3a'], 'none', 'none', 'leaf', null, 'pear'],
  ['TH-47', 'sakon-kingfisher', ['Khram', 'คราม'], ['an indigo kingfisher', 'นกกระเต็นสีคราม'], ['Sakon Nakhon dyes its cloth with indigo and fishes Nong Han.', 'ผ้าย้อมครามสกลนคร และหนองหาร'], 'craft', 'bird', 'Quest', ['#2c5d9e', '#e8734a', '#1a3766', '#f2f2f2'], 'none', 'short', 'crest', null, 'round'],
  ['TH-32', 'surin-elephant', ['Kong', 'ก้อง'], ['a grey elephant in a silk blanket', 'ช้างห่มผ้าไหม'], ['Surin\'s elephants, and the round-up every November.', 'ช้างสุรินทร์ และงานช้างทุกพฤศจิกายน'], 'festival', 'beast', 'Wellness', ['#8c8886', '#c9c4c1', '#5c5856', '#b03a4a'], 'fan', 'short', 'none', 'drum', 'round'],
  ['TH-43', 'nongkhai-fire-naga', ['Bang Fai', 'บั้งไฟ'], ['a naga with a fireball', 'พญานาคกับบั้งไฟพญานาค'], ['The naga fireballs that rise from the Mekong at the end of Lent.', 'บั้งไฟพญานาคที่ลอยขึ้นจากโขงวันออกพรรษา'], 'legend', 'naga', 'Quest', ['#2f7a5f', '#a6d8b5', '#1b4a3a', '#f2c24e'], 'none', 'long', 'crown', 'lantern', 'long'],
  ['TH-39', 'nongbua-dragonfly', ['Bua', 'บัว'], ['a dragonfly over a lotus pond', 'แมลงปอเหนือหนองบัว'], ['Nong Bua: the lotus pond in the name.', 'หนองบัว หนองน้ำที่มีบัวในชื่อ'], 'legend', 'bug', 'Quest', ['#3f8fbf', '#bfe3f2', '#1f5a80', '#e07aa8'], 'none', 'long', 'antennae', 'wings', 'long'],
  ['TH-41', 'udon-banchiang', ['Chiang', 'เชียง'], ['a Ban Chiang pot sprite', 'ตุ๊กตาหม้อบ้านเชียง'], ['The red spirals of Ban Chiang, five thousand years old.', 'ลายก้นหอยสีแดงบ้านเชียง อายุห้าพันปี'], 'landmark', 'sprite', 'Food', ['#d9b28a', '#f3e2cc', '#b33a2a', '#7a4a2a'], 'none', 'none', 'none', 'pot', 'pear'],
  ['TH-34', 'ubon-candle', ['Thian', 'เทียน'], ['a carved candle sprite', 'เทียนพรรษาแกะสลัก'], ['The candle procession at the start of Lent.', 'งานแห่เทียนพรรษา'], 'festival', 'sprite', 'Green', ['#f2c24e', '#fff0b8', '#b08018', '#e8543a'], 'none', 'none', 'flame', null, 'tall'],
  ['TH-37', 'amnat-loris', ['Ai', 'อาย'], ['a slow loris', 'นางอาย'], ['The shy loris of the Mekong forests.', 'นางอายในป่าริมโขง'], 'wildlife', 'ape', 'Green', ['#b58a5a', '#e8d2b3', '#5c3a1e', '#f2c24e'], 'round', 'none', 'none', null, 'round'],

  // ---- Central -------------------------------------------------------------
  ['TH-10', 'bangkok-siamese', ['Wichian', 'วิเชียร'], ['a Siamese cat', 'แมววิเชียรมาศ'], ['The cat the world calls Siamese, from the capital.', 'แมววิเชียรมาศ แมวที่โลกเรียกว่าสยาม'], 'wildlife', 'beast', 'Food', ['#efe3d0', '#faf4ea', '#5a3e2e', '#3f8fbf'], 'round', 'long', 'none', null, 'round'],
  ['TH-62', 'kamphaengphet-banana', ['Kluai Khai', 'กล้วยไข่'], ['a kluai khai banana', 'กล้วยไข่'], ['The small sweet banana the province is famous for.', 'กล้วยไข่กำแพงเพชร'], 'produce', 'sprite', 'Green', ['#f2d24e', '#fff3b0', '#a68a1e', '#6b8f3a'], 'none', 'none', 'leaf', null, 'tall'],
  ['TH-18', 'chainat-parakeet', ['Kaeo', 'แก้ว'], ['a green parakeet', 'นกแก้ว'], ['The bird park at Chai Nat, under the biggest cage in the country.', 'สวนนกชัยนาท กรงนกใหญ่ที่สุดในประเทศ'], 'landmark', 'bird', 'Green', ['#5fa84a', '#c9e6a6', '#2f6b2a', '#e8543a'], 'none', 'plume', 'none', null, 'round'],
  ['TH-26', 'nakhonnayok-mayongchid', ['Mayong', 'มะยง'], ['a marian plum', 'มะยงชิด'], ['Mayongchid from Nakhon Nayok, sweet and orange in the hot season.', 'มะยงชิดนครนายก หวานสีส้มหน้าร้อน'], 'produce', 'sprite', 'Green', ['#f2963b', '#ffd39a', '#b35a12', '#5f8f4a'], 'none', 'none', 'leaf', null, 'round'],
  ['TH-73', 'nakhonpathom-pomelo', ['Som O', 'ส้มโอ'], ['a pomelo', 'ส้มโอ'], ['Nakhon Chai Si pomelo, under the great chedi.', 'ส้มโอนครชัยศรี ใต้องค์พระปฐมเจดีย์'], 'produce', 'sprite', 'Food', ['#b7c95a', '#eef3c2', '#7a8a2a', '#e8b34a'], 'none', 'none', 'none', 'chedi', 'round'],
  ['TH-60', 'nakhonsawan-dragon', ['Long', 'หลง'], ['a golden dragon', 'มังกรทอง'], ['The dragon parade at Pak Nam Pho every Chinese New Year.', 'แห่มังกรปากน้ำโพทุกตรุษจีน'], 'festival', 'naga', 'Food', ['#d33a2f', '#f2c24e', '#8a1e16', '#f2f2f2'], 'horns', 'long', 'whiskers', null, 'long'],
  ['TH-12', 'nonthaburi-durian', ['Mon Thong', 'หมอนทอง'], ['a durian', 'ทุเรียน'], ['Nonthaburi durian, the one the orchards along the river are known for.', 'ทุเรียนนนท์ ทุเรียนสวนริมน้ำ'], 'produce', 'sprite', 'Green', ['#9fb04a', '#e6eeb0', '#5f6e22', '#f2d24e'], 'none', 'none', 'spikes', null, 'round'],
  ['TH-13', 'pathumthani-lotus', ['Pathum', 'ปทุม'], ['a pink lotus', 'ดอกบัวหลวง'], ['Pathum is the lotus in the province\'s name and on its seal.', 'ปทุมคือดอกบัวในชื่อและบนตราจังหวัด'], 'seal', 'sprite', 'Quest', ['#e88fb0', '#fbd3e2', '#b04a74', '#6b9a4a'], 'none', 'none', 'flower', null, 'round'],
  ['TH-14', 'ayutthaya-conch', ['Sang', 'สังข์'], ['a conch shell', 'หอยสังข์'], ['The conch in a tray on Ayutthaya\'s seal.', 'สังข์บนพานบนตราจังหวัดพระนครศรีอยุธยา'], 'seal', 'shell', 'Food', ['#f1e6d6', '#fff8ee', '#c9a06a', '#e0b34a'], 'none', 'none', 'crown', null, 'round'],
  ['TH-66', 'phichit-crocodile', ['Chalawan', 'ชาละวัน'], ['a crocodile', 'จระเข้'], ['Chalawan, the crocodile of the Krai Thong legend, from Phichit.', 'ชาละวัน จระเข้ในเรื่องไกรทอง'], 'legend', 'beast', 'Quest', ['#5f8a4a', '#c9dfa6', '#2f4f22', '#f2c24e'], 'none', 'long', 'spikes', null, 'long'],
  ['TH-65', 'phitsanulok-otter', ['Nan', 'น่าน'], ['a river otter', 'นากน้อย'], ['The Nan river runs through the city, and the raft houses on it.', 'แม่น้ำน่านกลางเมือง กับเรือนแพริมน้ำ'], 'landmark', 'beast', 'Quest', ['#8a6a4a', '#e3cfb3', '#4a3625', '#3f8fbf'], 'round', 'long', 'none', 'boat', 'long'],
  ['TH-67', 'phetchabun-tamarind', ['Makham', 'มะขาม'], ['a sweet tamarind', 'มะขามหวาน'], ['Phetchabun\'s sweet tamarind.', 'มะขามหวานเพชรบูรณ์'], 'produce', 'sprite', 'Wellness', ['#a06a3c', '#e3c9a6', '#5c3a1e', '#6b8f3a'], 'none', 'none', 'leaf', null, 'long'],
  ['TH-16', 'lopburi-macaque', ['Ling', 'ลิง'], ['a macaque', 'ลิงแสม'], ['The monkeys of Phra Prang Sam Yot, who own the old town.', 'ลิงพระปรางค์สามยอด เจ้าของเมืองเก่า'], 'wildlife', 'ape', 'Wellness', ['#a8927a', '#e6d9c6', '#5c4a3a', '#e0b34a'], 'round', 'long', 'crown', null, 'round'],
  ['TH-11', 'samutprakan-gull', ['Bang Pu', 'บางปู'], ['a seagull', 'นกนางนวล'], ['The gulls that winter at Bang Pu, thousands at a time.', 'นกนางนวลที่มาหนีหนาวที่บางปูทีละพัน'], 'wildlife', 'bird', 'Safe', ['#f4f4f0', '#ffffff', '#8a9aa8', '#f2a83b'], 'none', 'fan', 'none', null, 'round'],
  ['TH-75', 'samutsongkhram-mackerel', ['Pla Thu', 'ปลาทู'], ['a short mackerel', 'ปลาทูแม่กลอง'], ['Mae Klong mackerel, the one with the bent neck in the basket.', 'ปลาทูแม่กลอง ปลาทูหน้างอคอหักในเข่ง'], 'produce', 'sea', 'Food', ['#4f7fa6', '#d7e6f0', '#2c4f6b', '#f2c24e'], 'none', 'fan', 'fin', 'basket', 'long'],
  ['TH-74', 'samutsakhon-crab', ['Mahachai', 'มหาชัย'], ['a blue swimming crab', 'ปูม้า'], ['Mahachai\'s seafood, and the salt fields along the coast.', 'อาหารทะเลมหาชัย และนาเกลือริมฝั่ง'], 'produce', 'shell', 'Safe', ['#4a76b8', '#cfe0f2', '#2b4a7a', '#f4f4f0'], 'none', 'none', 'none', 'salt', 'flat'],
  ['TH-17', 'singburi-lion', ['Singha', 'สิงห์'], ['a lion', 'สิงห์'], ['Singha - the lion - is the province\'s name.', 'สิงห์คือชื่อของจังหวัด'], 'legend', 'beast', 'Food', ['#e0b34a', '#f7e2a6', '#a67a1e', '#b03a2a'], 'round', 'plume', 'crest', null, 'round'],
  ['TH-64', 'sukhothai-celadon', ['Sangkhalok', 'สังคโลก'], ['a celadon fish', 'ปลาสังคโลก'], ['The fish painted on Sangkhalok ware, and the first Loy Krathong.', 'ปลาบนเครื่องสังคโลก และลอยกระทงครั้งแรก'], 'craft', 'sea', 'Quest', ['#8fb8a0', '#e0efe6', '#4f7a66', '#f2c24e'], 'none', 'fan', 'fin', 'lantern', 'round'],
  ['TH-72', 'suphanburi-buffalo', ['Khwai', 'ควาย'], ['a water buffalo', 'ควายไทย'], ['The buffalo village at Si Prachan.', 'บ้านควายไทยที่ศรีประจันต์'], 'landmark', 'beast', 'Food', ['#5c5652', '#9a938e', '#33302e', '#6b9a4a'], 'horns', 'short', 'none', null, 'round'],
  ['TH-19', 'saraburi-sunflower', ['Tantawan', 'ตะวัน'], ['a sunflower sprite', 'ดอกทานตะวัน'], ['The sunflower fields on the Saraburi side of the hills every winter.', 'ทุ่งทานตะวันสระบุรีทุกหน้าหนาว'], 'landmark', 'sprite', 'Wellness', ['#f2c24e', '#ffe58a', '#5c3a1e', '#5f8f4a'], 'none', 'none', 'flower', null, 'round'],
  ['TH-15', 'angthong-sparrow', ['Klong', 'กลอง'], ['a Java sparrow with a drum', 'นกกระจอกชวาตีกลอง'], ['Ang Thong\'s drum-makers\' village, and the rice fields around it.', 'บ้านทำกลองอ่างทอง กลางทุ่งนา'], 'craft', 'bird', 'Food', ['#8a94a3', '#f4f4f0', '#3a4250', '#d33a2f'], 'none', 'short', 'none', 'drum', 'round'],
  ['TH-61', 'uthaithani-tiger', ['Huai', 'ห้วย'], ['a tiger cub', 'ลูกเสือ'], ['Huai Kha Khaeng, where the tigers still are.', 'ห้วยขาแข้ง ป่าที่ยังมีเสือ'], 'wildlife', 'beast', 'Green', ['#e8963b', '#f9e3c4', '#2c2c2c', '#f4f4f0'], 'round', 'long', 'none', null, 'round'],

  // ---- East ----------------------------------------------------------------
  ['TH-22', 'chanthaburi-rabbit', ['Chan', 'จันทร์'], ['a moon rabbit with a gem', 'กระต่ายในดวงจันทร์ถือพลอย'], ['The rabbit in the moon on the seal, and the gem market in town.', 'กระต่ายในดวงจันทร์บนตรา และตลาดพลอย'], 'seal', 'beast', 'Green', ['#f4f0ea', '#ffffff', '#c9b3ad', '#3a7fd0'], 'long', 'short', 'none', 'gem', 'round'],
  ['TH-24', 'chachoengsao-mango', ['Nam Dok Mai', 'น้ำดอกไม้'], ['a mango', 'มะม่วง'], ['Chachoengsao mango, the nam dok mai kind.', 'มะม่วงน้ำดอกไม้แปดริ้ว'], 'produce', 'sprite', 'Green', ['#f2c94e', '#fff0b0', '#a67a1e', '#6b8f3a'], 'none', 'none', 'leaf', null, 'pear'],
  ['TH-20', 'chonburi-dolphin', ['Saen', 'แสน'], ['a dolphin', 'โลมา'], ['The bay at Bang Saen, the hill and the sea on the seal.', 'อ่าวบางแสน เขากับทะเลบนตราจังหวัด'], 'seal', 'sea', 'Safe', ['#7fa3c4', '#dbe8f2', '#4a6f8f', '#f2c24e'], 'none', 'flukes', 'fin', null, 'long'],
  ['TH-23', 'trat-hermit', ['Chang', 'ช้าง'], ['a hermit crab', 'ปูเสฉวน'], ['The islands off Trat - Koh Chang, Koh Kut - and their beaches.', 'หมู่เกาะตราด เกาะช้าง เกาะกูด และหาด'], 'landmark', 'shell', 'Safe', ['#e8963b', '#f9e3c4', '#a65a12', '#7fa3c4'], 'none', 'none', 'none', 'shell', 'round'],
  ['TH-25', 'prachinburi-bamboo', ['No Mai', 'หน่อไม้'], ['a bamboo-shoot sprite', 'หน่อไม้'], ['Bamboo shoots and the herbal medicine of Abhaibhubejhr.', 'หน่อไม้ปราจีน และสมุนไพรอภัยภูเบศร'], 'produce', 'sprite', 'Green', ['#8fb35a', '#e0eec4', '#5f7f2a', '#c9a06a'], 'none', 'none', 'leaf', null, 'tall'],
  ['TH-21', 'rayong-squid', ['Muek', 'หมึก'], ['a squid', 'หมึก'], ['Rayong squid, dried on racks all along the coast road.', 'หมึกระยอง ตากบนราวริมถนนเลียบทะเล'], 'produce', 'sea', 'Safe', ['#e9b4c4', '#fbe4ec', '#b06a86', '#f2c24e'], 'none', 'long', 'fin', null, 'tall'],
  ['TH-27', 'sakaeo-butterfly', ['Pang Sida', 'ปางสีดา'], ['a butterfly', 'ผีเสื้อ'], ['Pang Sida, where the butterflies gather by the hundred in the rains.', 'ปางสีดา ที่ผีเสื้อมารวมกันเป็นร้อยในหน้าฝน'], 'wildlife', 'bug', 'Green', ['#3a4a6b', '#f2c24e', '#1f2a40', '#e07aa8'], 'none', 'none', 'antennae', 'wings', 'round'],

  // ---- West ----------------------------------------------------------------
  ['TH-71', 'kanchanaburi-muntjac', ['Kwae', 'แคว'], ['a barking deer', 'เก้ง'], ['The forests of the Kwai valley and Thung Yai.', 'ป่าลุ่มน้ำแคว และทุ่งใหญ่'], 'wildlife', 'beast', 'Green', ['#b0805a', '#e6d2ba', '#6b4a2e', '#f4f4f0'], 'antlers', 'short', 'none', null, 'tall'],
  ['TH-63', 'tak-lantern', ['Sai', 'สาย'], ['a krathong-sai lantern sprite', 'กระทงสาย'], ['Loy Krathong Sai on the Ping: a thousand coconut-shell lamps in a line.', 'ลอยกระทงสายในแม่น้ำปิง โคมกะลาเป็นสายพันดวง'], 'festival', 'sprite', 'Quest', ['#a06a3c', '#f2c24e', '#5c3a1e', '#e8543a'], 'none', 'none', 'flame', null, 'flat'],
  ['TH-77', 'prachuap-pineapple', ['Sapparot', 'สับปะรด'], ['a pineapple', 'สับปะรด'], ['Prachuap pineapple, and the monkeys on Mirror Mountain who steal it.', 'สับปะรดประจวบ กับลิงเขาช่องกระจกที่มาขโมย'], 'produce', 'sprite', 'Safe', ['#f2b52c', '#ffe08a', '#a35a12', '#5f8f4a'], 'none', 'none', 'leaf', null, 'tall'],
  ['TH-76', 'phetchaburi-bee', ['Tanot', 'โตนด'], ['a palm-sugar bee', 'ผึ้งน้ำตาลโตนด'], ['Palm sugar from the toddy palms, and the sweets made with it.', 'น้ำตาลโตนดเพชรบุรี และขนมหวานเมืองเพชร'], 'produce', 'bug', 'Food', ['#e0b34a', '#fff0b8', '#3a2a1a', '#f4f4f0'], 'none', 'short', 'antennae', 'wings', 'round'],
  ['TH-70', 'ratchaburi-jar', ['Ong', 'โอ่ง'], ['a dragon-jar creature', 'โอ่งมังกร'], ['The dragon jars of Ratchaburi, in every Thai kitchen for a century.', 'โอ่งมังกรราชบุรี อยู่ในครัวไทยมาร้อยปี'], 'craft', 'shell', 'Food', ['#a86a3c', '#e3c9a6', '#5c3a1e', '#d33a2f'], 'none', 'none', 'none', 'pot', 'round'],

  // ---- South ---------------------------------------------------------------
  ['TH-81', 'krabi-seahorse', ['Railay', 'ไร่เลย์'], ['a seahorse', 'ม้าน้ำ'], ['The limestone sea at Railay and Phi Phi.', 'ทะเลหินปูนไร่เลย์และพีพี'], 'landmark', 'sea', 'Safe', ['#e8963b', '#f9e3c4', '#a65a12', '#3f8fbf'], 'none', 'long', 'fin', null, 'tall'],
  ['TH-86', 'chumphon-coffee', ['Robusta', 'โรบัสต้า'], ['a coffee-cherry sprite', 'ผลกาแฟ'], ['Chumphon grows the robusta the country drinks.', 'กาแฟโรบัสต้าชุมพร ที่ทั้งประเทศดื่ม'], 'produce', 'sprite', 'Green', ['#b33a2a', '#f2b5a6', '#5c1e14', '#5f8f4a'], 'none', 'none', 'leaf', null, 'round'],
  ['TH-92', 'trang-dugong', ['Mariam', 'มาเรียม'], ['a dugong', 'พะยูน'], ['The dugongs of Koh Libong, in the seagrass.', 'พะยูนเกาะลิบง ในดงหญ้าทะเล'], 'wildlife', 'sea', 'Safe', ['#9a9aa0', '#dcdce0', '#6a6a72', '#7fa3c4'], 'none', 'flukes', 'none', null, 'long'],
  ['TH-80', 'nakhonsi-puppet', ['Talung', 'ตะลุง'], ['a shadow-puppet sprite', 'หนังตะลุง'], ['Nang talung, the leather shadow play of the south.', 'หนังตะลุง การละเล่นเงาของภาคใต้'], 'craft', 'sprite', 'Wellness', ['#a06a3c', '#e3c9a6', '#3a2a1a', '#e0b34a'], 'none', 'none', 'crown', null, 'tall'],
  ['TH-96', 'narathiwat-kolae', ['Kolae', 'กอและ'], ['a kolae-painted fish', 'ปลาลายเรือกอและ'], ['The painted kolae boats on Narathiwat\'s seal and beaches.', 'เรือกอและลายสีบนตราจังหวัดและชายหาด'], 'seal', 'sea', 'Safe', ['#e8543a', '#f2c24e', '#1f4a7a', '#2f8f6a'], 'none', 'fan', 'fin', 'boat', 'round'],
  ['TH-82', 'phangnga-ray', ['Similan', 'สิมิลัน'], ['a manta ray', 'กระเบนราหู'], ['The mantas of the Similans.', 'กระเบนราหูแห่งหมู่เกาะสิมิลัน'], 'wildlife', 'sea', 'Safe', ['#3a4a6b', '#e6ecf2', '#1f2a40', '#7fa3c4'], 'none', 'long', 'none', null, 'flat'],
  ['TH-93', 'phatthalung-manora', ['Nora', 'โนรา'], ['a manora bird', 'นกมโนราห์'], ['Manora, the bird-dance of Phatthalung, and the birds of Thale Noi.', 'มโนราห์ และนกที่ทะเลน้อย'], 'festival', 'bird', 'Quest', ['#e0b34a', '#f7e2a6', '#b03a4a', '#2f8f6a'], 'none', 'plume', 'crown', null, 'tall'],
  ['TH-83', 'phuket-whale', ['Andaman', 'อันดามัน'], ['a whale', 'วาฬ'], ['The whales that pass the Andaman coast.', 'วาฬที่ผ่านชายฝั่งอันดามัน'], 'wildlife', 'sea', 'Safe', ['#4a6f8f', '#d7e6f0', '#2c4f6b', '#f2c24e'], 'none', 'flukes', 'none', null, 'long'],
  ['TH-95', 'yala-dove', ['Khao', 'เขา'], ['a zebra dove', 'นกเขาชวา'], ['The zebra-dove cooing contests of the deep south.', 'นกเขาชวา และการแข่งขันเสียงนกเขาชายแดนใต้'], 'craft', 'bird', 'Green', ['#b8a898', '#eee6dc', '#5c4a3a', '#f2c24e'], 'none', 'short', 'none', null, 'round'],
  ['TH-85', 'ranong-hotspring', ['Un', 'อุ่น'], ['a hot-spring turtle', 'เต่าบ่อน้ำร้อน'], ['Ranong\'s hot springs, and eight months of rain.', 'บ่อน้ำร้อนระนอง และฝนแปดเดือน'], 'landmark', 'shell', 'Wellness', ['#6b8a5a', '#c9d9b3', '#3f5a33', '#f4f4f0'], 'none', 'short', 'none', 'steam', 'round'],
  ['TH-90', 'songkhla-mouse', ['Nu', 'หนู'], ['a little mouse', 'หนูน้อย'], ['Koh Nu and Koh Maeo - Mouse Island and Cat Island - off Samila beach.', 'เกาะหนู เกาะแมว หน้าหาดสมิหลา'], 'landmark', 'beast', 'Safe', ['#a8a0a8', '#e6e0e6', '#5c525c', '#e07aa8'], 'round', 'long', 'none', null, 'round'],
  ['TH-91', 'satun-ammonite', ['Tarutao', 'ตะรุเตา'], ['an ammonite', 'แอมโมไนต์'], ['The Satun geopark, where the rock is full of fossils.', 'อุทยานธรณีสตูล หินที่เต็มไปด้วยฟอสซิล'], 'landmark', 'shell', 'Safe', ['#b39a80', '#e8dcc9', '#6b5a48', '#3f8fbf'], 'none', 'none', 'none', null, 'round'],
  ['TH-84', 'suratthani-rambutan', ['Ngo', 'เงาะ'], ['a rambutan', 'เงาะโรงเรียน'], ['Rong Rian rambutan, from Ban Na San.', 'เงาะโรงเรียนบ้านนาสาร'], 'produce', 'sprite', 'Green', ['#d33a2f', '#f2b5a6', '#8a1e16', '#6b8f3a'], 'none', 'none', 'spikes', null, 'round'],
  ['TH-94', 'pattani-goat', ['Phae', 'แพะ'], ['a goat', 'แพะ'], ['The goats of the southern farms, kept in every village.', 'แพะฟาร์มชายแดนใต้ ที่มีอยู่ทุกหมู่บ้าน'], 'produce', 'beast', 'Food', ['#f1e6d6', '#fff8ee', '#8a6a4a', '#2f8f6a'], 'horns', 'short', 'none', null, 'round'],
];

export const MASCOTS: Mascot[] = ROWS.map(([code, key, name, creature, why, basis, archetype, habitat, colours, ears, tail, crest, prop, shape]) => ({
  code, key, name: B(...name), creature: B(...creature), why: B(...why), basis, archetype, habitat,
  colours: { body: colours[0], belly: colours[1], feature: colours[2], accent: colours[3] },
  ears, tail, crest, prop, shape,
}));

export const MASCOT_COUNT = MASCOTS.length;

const BY_CODE = new Map(MASCOTS.map((m) => [m.code, m]));
const BY_KEY = new Map(MASCOTS.map((m) => [m.key, m]));

export const mascotFor = (code: string): Mascot | null => BY_CODE.get(code) ?? null;
export const mascotByKey = (key: string): Mascot | null => BY_KEY.get(key) ?? null;

/** What a `basis` says on the card. */
export const BASIS_LABEL: Record<MascotBasis, Bilingual> = {
  seal: B('From the provincial seal', 'จากตราประจำจังหวัด'),
  wildlife: B('An animal the province is known for', 'สัตว์ที่จังหวัดขึ้นชื่อ'),
  produce: B('Something the province grows or makes', 'ของดีของจังหวัด'),
  craft: B('A craft of the province', 'งานหัตถกรรมของจังหวัด'),
  festival: B('A festival of the province', 'ประเพณีของจังหวัด'),
  landmark: B('A place in the province', 'สถานที่ในจังหวัด'),
  legend: B('A legend, or the name itself', 'ตำนาน หรือชื่อจังหวัดเอง'),
};

/**
 * The signature that must differ between any two mascots: the body, the
 * outline, what is on its head, and the main colour. Ears and tails and
 * props can repeat - a lot of animals have round ears - but two creatures
 * with the same body, outline, crest and colour are the same creature with
 * a different name, and the test refuses that.
 */
export const mascotSignature = (m: Mascot): string =>
  [m.archetype, m.shape, m.crest, m.colours.body.toLowerCase()].join('|');
