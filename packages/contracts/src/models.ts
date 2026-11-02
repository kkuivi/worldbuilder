export interface ModelPart {
  shape: "box" | "sphere" | "cone" | "cylinder";
  a: number;
  b: number;
  c: number;
  color: number;
  x: number;
  y: number;
  z: number;
}

const SHAPES = new Set(["box", "sphere", "cone", "cylinder"]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseModel(spec: string): ModelPart[] | null {
  const parts: ModelPart[] = [];
  for (const line of spec.split(/[;\n]+/)) {
    const bits = line.trim().split(/\s+/);
    if (!bits[0]) continue;
    if (bits.length < 8 || !SHAPES.has(bits[0])) return null;
    const size = bits.slice(1, 4).map(Number);
    const color = /^[0-9a-fA-F]{6}$/.test(bits[4] ?? "") ? Number.parseInt(bits[4] ?? "", 16) : Number.NaN;
    const at = bits.slice(5, 8).map(Number);
    if (size.some((value) => !Number.isFinite(value)) || at.some((value) => !Number.isFinite(value)) || !Number.isFinite(color)) return null;
    parts.push({
      shape: bits[0] as ModelPart["shape"],
      a: clamp(size[0] ?? 0, 0.02, 1.4),
      b: clamp(size[1] ?? 0, 0, 1.4),
      c: clamp(size[2] ?? 0, 0, 1.4),
      color,
      x: clamp(at[0] ?? 0, -1.2, 1.2),
      y: clamp(at[1] ?? 0, 0, 1.6),
      z: clamp(at[2] ?? 0, -1.2, 1.2),
    });
    if (parts.length >= 14) break;
  }
  return parts.length ? parts : null;
}

function hex(color: number): string {
  return color.toString(16).padStart(6, "0");
}

function hashLabel(label: string): number {
  let hash = 2166136261;
  for (const char of label.toLowerCase()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const PALETTE = [0xc23b3b, 0x3b6fe0, 0x2f8f3a, 0xefb423, 0x8d5a32, 0x6b4c9a, 0xe07a3b, 0xf7f4ee, 0x2c2c2c];

const COLOR_WORDS: Array<[RegExp, number]> = [
  [/\bred\b/i, 0xc23b3b],
  [/\bblue\b/i, 0x3b6fe0],
  [/\bgreen\b/i, 0x2f8f3a],
  [/\byellow\b/i, 0xefb423],
  [/\borange\b/i, 0xe07a3b],
  [/\bpurple\b/i, 0x6b4c9a],
  [/\bblack\b/i, 0x2c2c2c],
  [/\bwhite\b/i, 0xf4f8fc],
  [/\bgold(?:en)?\b/i, 0xd4a017],
  [/\bsilver\b/i, 0xc5ced6],
  [/\bpink\b/i, 0xe85d75],
  [/\bbrown\b/i, 0x8d5a32],
];

export type Portrayal = "tree" | "animal" | "building" | "custom";

export function namedColor(label: string): number | null {
  for (const [pattern, color] of COLOR_WORDS) if (pattern.test(label)) return color;
  return null;
}

export function shapeKey(label: string): string {
  let text = label.toLowerCase();
  for (const [pattern] of COLOR_WORDS) text = text.replace(new RegExp(pattern.source, "gi"), " ");
  text = text.replace(/\b(little|small|large|big|tall|huge|tiny|a|an|the)\b/g, " ");
  text = text.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return text || label.trim().toLowerCase();
}

export function wantsShape(label: string): boolean {
  const name = label.trim();
  return Boolean(name) && portrayal(name) === "custom" && !isFurniture(name);
}

export function colorWord(text: string): string | null {
  for (const [pattern] of COLOR_WORDS) {
    const match = text.match(pattern);
    if (!match?.[0]) continue;
    const word = match[0].toLowerCase();
    if (word === "gold" || word === "golden") return "Gold";
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  return null;
}

export function coloredNouns(text: string): Array<{ color: string; noun: string }> {
  const found: Array<{ color: string; noun: string }> = [];
  const pattern = /\b(red|blue|green|yellow|orange|purple|black|white|golden|gold|silver|pink|brown)\s+(?:little\s+|small\s+|large\s+|big\s+|tall\s+)?([a-z]{3,})/gi;
  for (const match of text.matchAll(pattern)) {
    const raw = match[1]?.toLowerCase() ?? "";
    const color = raw === "gold" || raw === "golden" ? "Gold" : raw.charAt(0).toUpperCase() + raw.slice(1);
    const noun = match[2]?.toLowerCase();
    if (noun) found.push({ color, noun });
  }
  return found;
}

type AnimalBody = "cow" | "horse" | "dog" | "cat" | "pig" | "sheep" | "bird" | "fish" | "snake" | "elephant" | "giraffe" | "dragon" | "frog" | "turtle" | "beast";

const ANIMALS: Array<[RegExp, string, AnimalBody]> = [
  [/\b(cows?|cattle|bulls?|oxen|ox)\b/i, "Cow", "cow"],
  [/\b(zebras?)\b/i, "Zebra", "horse"],
  [/\b(horses?|ponies|pony|donkeys?)\b/i, "Horse", "horse"],
  [/\b(wolves|wolf)\b/i, "Wolf", "dog"],
  [/\b(foxes|fox)\b/i, "Fox", "dog"],
  [/\b(dogs?)\b/i, "Dog", "dog"],
  [/\b(lions?)\b/i, "Lion", "cat"],
  [/\b(tigers?)\b/i, "Tiger", "cat"],
  [/\b(cats?|kittens?)\b/i, "Cat", "cat"],
  [/\b(pigs?|hogs?|boars?)\b/i, "Pig", "pig"],
  [/\b(sheep|lambs?)\b/i, "Sheep", "sheep"],
  [/\b(goats?)\b/i, "Goat", "sheep"],
  [/\b(elephants?)\b/i, "Elephant", "elephant"],
  [/\b(giraffes?)\b/i, "Giraffe", "giraffe"],
  [/\b(snakes?)\b/i, "Snake", "snake"],
  [/\b(frogs?|toads?)\b/i, "Frog", "frog"],
  [/\b(turtles?|tortoises?)\b/i, "Turtle", "turtle"],
  [/\b(dragons?|dinosaurs?)\b/i, "Dragon", "dragon"],
  [/\b(eagles?)\b/i, "Eagle", "bird"],
  [/\b(parrots?)\b/i, "Parrot", "bird"],
  [/\b(owls?)\b/i, "Owl", "bird"],
  [/\b(ducks?)\b/i, "Duck", "bird"],
  [/\b(chickens?)\b/i, "Chicken", "bird"],
  [/\b(penguins?)\b/i, "Penguin", "bird"],
  [/\b(birds?)\b/i, "Bird", "bird"],
  [/\b(sharks?|whales?|dolphins?|fish|fishes)\b/i, "Fish", "fish"],
  [/\b(bears?)\b/i, "Bear", "beast"],
  [/\b(deer|moose|elk)\b/i, "Deer", "beast"],
  [/\b(rabbits?|bunnies)\b/i, "Rabbit", "beast"],
  [/\b(monkeys?|apes?|gorillas?)\b/i, "Monkey", "beast"],
];

export function animalNames(text: string): string[] {
  const found: string[] = [];
  for (const [pattern, label] of ANIMALS) if (pattern.test(text) && !found.includes(label)) found.push(label);
  return found;
}

export function airborne(label: string): boolean {
  if (/\bfly(?:ing)?\b/i.test(label)) return true;
  if (/\b(chickens?|ducks?|penguins?|owls?)\b/i.test(label)) return false;
  return /\b(birds?|eagles?|parrots?)\b/i.test(label);
}

const FURNITURE: Array<[RegExp, string]> = [
  [/\b(couches|couch|sofas|sofa)\b/i, "Couch"],
  [/\b(chairs?)\b/i, "Chair"],
  [/\b(tables?)\b/i, "Table"],
  [/\b(beds?)\b/i, "Bed"],
  [/\b(rugs?|carpets?)\b/i, "Rug"],
  [/\b(lamps?|lanterns?)\b/i, "Lamp"],
  [/\b(plants?)\b/i, "Plant"],
  [/\b(bookshelves|bookshelf|bookcases?)\b/i, "Bookshelf"],
  [/\b(paintings?|pictures?)\b/i, "Painting"],
  [/\b(desks?)\b/i, "Desk"],
];

export function furnitureNames(text: string): string[] {
  const found: string[] = [];
  for (const [pattern, label] of FURNITURE) if (pattern.test(text) && !found.includes(label)) found.push(label);
  return found;
}

export function isFurniture(label: string): boolean {
  return FURNITURE.some(([pattern]) => pattern.test(label));
}

function animalBody(label: string): AnimalBody | null {
  for (const [pattern, , body] of ANIMALS) if (pattern.test(label)) return body;
  return null;
}

export function portrayal(label: string): Portrayal {
  const name = label.toLowerCase();
  if (/\b(trees?|oaks?|pines?|palms?)\b/.test(name)) return "tree";
  if (animalBody(label)) return "animal";
  if (/\b(barns?|stables?|stores?|shops?|cabins?|houses?|churches|church|chapels?|cathedrals?|abbeys?|basilicas?|shrines?|mosques?|temples?|synagogues?|lighthouses?|windmills?|schools?|libraries|library|hospitals?|museums?|stations?|inns?|taverns?|hotels?|restaurants?|cafes?|bakeries|bakery|halls?|theat(?:er|re)s?|garages?|factories|factory|warehouses?|mills?)\b/.test(name)) return "building";
  return "custom";
}

function treeModel(label: string): string {
  const tint = namedColor(label);
  const leaf = hex(tint ?? 0x2f8f3a);
  const tip = hex(tint ?? 0x8ed56a);
  if (/\bpines?\b/i.test(label)) {
    return ["cylinder 0.1 0.55 0 6b4423 0 0.28 0", `cone 0.4 0.9 0 ${leaf} 0 0.85 0`, `cone 0.26 0.55 0 ${tip} 0 1.35 0`].join("\n");
  }
  return ["cylinder 0.12 0.72 0 6b4423 0 0.36 0", `sphere 0.42 0 0 ${leaf} 0 0.95 0`, `sphere 0.26 0 0 ${tip} 0.16 1.22 0.06`].join("\n");
}

function cowModel(label = ""): string {
  const hide = hex(namedColor(label) ?? 0xf7f4ee);
  return [
    `box 0.86 0.32 0.4 ${hide} 0 0.5 0`,
    "box 0.2 0.12 0.16 2c2c2c -0.18 0.68 0.08",
    "box 0.16 0.1 0.12 2c2c2c 0.2 0.68 -0.1",
    `box 0.26 0.2 0.22 ${hide} 0.5 0.62 0`,
    "sphere 0.07 0 0 f2b8c6 0.64 0.56 0",
    "cone 0.04 0.16 0 f6e6c8 0.44 0.82 0.08",
    "cone 0.04 0.16 0 f6e6c8 0.44 0.82 -0.08",
    "sphere 0.09 0 0 f2b8c6 -0.08 0.32 0",
    "cylinder 0.06 0.36 0 f7f4ee -0.26 0.18 -0.14",
    "cylinder 0.06 0.36 0 f7f4ee -0.26 0.18 0.14",
    "cylinder 0.06 0.36 0 f7f4ee 0.22 0.18 -0.14",
    "cylinder 0.06 0.36 0 f7f4ee 0.22 0.18 0.14",
    "box 0.16 0.06 0.06 2c2c2c -0.52 0.54 0",
  ].join("\n");
}

function legs(color: string, height: number, radius: number, y: number, reach: number, stance: number): string[] {
  const lines: string[] = [];
  for (const x of [-reach, reach * 0.85]) {
    for (const z of [-stance, stance]) lines.push(`cylinder ${radius} ${height} 0 ${color} ${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`);
  }
  return lines;
}

function quadruped(label: string, bodyColor: number, hoofColor: number, length = 0.7, height = 0.24, reach = 0.22): string[] {
  const hide = hex(namedColor(label) ?? bodyColor);
  const hoof = hex(hoofColor);
  const legH = Math.max(0.22, height + 0.08);
  return [
    `box ${length} ${height} ${Math.min(0.36, height + 0.1)} ${hide} 0 ${(legH * 0.55 + height * 0.45).toFixed(2)} 0`,
    ...legs(hoof, legH, 0.045, legH / 2, reach, 0.11),
    `sphere 0.11 0 0 ${hide} ${(length * 0.42).toFixed(2)} ${(legH * 0.55 + height * 0.7).toFixed(2)} 0`,
    `box 0.1 0.08 0.08 ${hoof} ${(length * 0.55).toFixed(2)} ${(legH * 0.55 + height * 0.55).toFixed(2)} 0`,
    `box 0.18 0.05 0.05 ${hoof} ${(-length * 0.55).toFixed(2)} ${(legH * 0.55 + height * 0.4).toFixed(2)} 0`,
  ];
}

function building(roof: number, wall: number): string {
  return [
    `box 0.74 0.48 0.56 ${hex(wall)} 0 0.32 0`,
    `cone 0.48 0.34 0 ${hex(roof)} 0 0.74 0`,
    "box 0.16 0.26 0.06 5c3a22 0 0.16 0.3",
    "box 0.12 0.12 0.04 9fd4ef -0.18 0.4 0.3",
  ].join("\n");
}

function churchModel(label: string): string {
  const wall = hex(namedColor(label) ?? 0xf4f1e8);
  const stone = "c5ced6";
  return [
    `box 0.86 0.46 0.58 ${wall} 0 0.28 0`,
    "cone 0.52 0.3 0 8c3428 0 0.64 0",
    `box 0.18 0.62 0.18 ${stone} 0 0.78 0.1`,
    "cone 0.16 0.32 0 8c3428 0 1.2 0.1",
    "box 0.03 0.16 0.03 f7f4ee 0 1.46 0.1",
    "box 0.12 0.03 0.03 f7f4ee 0 1.42 0.1",
    "box 0.16 0.28 0.06 5c3a22 0 0.16 0.3",
    "box 0.12 0.16 0.04 9fd4ef -0.22 0.36 0.3",
    "box 0.12 0.16 0.04 9fd4ef 0.16 0.36 0.3",
  ].join("\n");
}

function mosqueModel(label: string): string {
  const wall = hex(namedColor(label) ?? 0xf4f1e8);
  return [
    `box 0.78 0.4 0.62 ${wall} 0 0.24 0`,
    "sphere 0.28 0 0 efe6d2 0 0.58 0",
    "cone 0.08 0.16 0 d4a017 0 0.86 0",
    "cylinder 0.06 0.7 0 c5ced6 0.36 0.4 0.16",
    "cone 0.1 0.16 0 8c3428 0.36 0.82 0.16",
    "box 0.14 0.24 0.06 5c3a22 0 0.14 0.32",
  ].join("\n");
}

function templeModel(label: string): string {
  const wall = hex(namedColor(label) ?? 0xf7f4ee);
  return [
    `box 0.84 0.36 0.5 ${wall} 0 0.22 0`,
    "cylinder 0.05 0.42 0 e7d7b8 -0.28 0.28 0.22",
    "cylinder 0.05 0.42 0 e7d7b8 -0.1 0.28 0.22",
    "cylinder 0.05 0.42 0 e7d7b8 0.1 0.28 0.22",
    "cylinder 0.05 0.42 0 e7d7b8 0.28 0.28 0.22",
    "box 0.9 0.1 0.56 c5ced6 0 0.52 0",
    "cone 0.5 0.22 0 8c3428 0 0.68 0",
  ].join("\n");
}

function lighthouseModel(label: string): string {
  const band = hex(namedColor(label) ?? 0xe85d4c);
  return [
    "cylinder 0.16 0.7 0 f7f4ee 0 0.4 0",
    `cylinder 0.17 0.12 0 ${band} 0 0.62 0`,
    "cylinder 0.12 0.16 0 9fd4ef 0 0.84 0",
    "cone 0.18 0.16 0 2c2c2c 0 1.0 0",
    "box 0.1 0.16 0.04 5c3a22 0 0.12 0.14",
  ].join("\n");
}

function windmillModel(label: string): string {
  const wall = hex(namedColor(label) ?? 0xf4f1e8);
  return [
    `cylinder 0.2 0.7 0 ${wall} 0 0.4 0`,
    "cone 0.28 0.28 0 8c3428 0 0.86 0",
    "box 0.7 0.06 0.04 5c3a22 0 0.62 0.18",
    "box 0.06 0.7 0.04 5c3a22 0 0.62 0.18",
    "box 0.12 0.2 0.04 5c3a22 0 0.16 0.18",
  ].join("\n");
}

function landmarkModel(label: string): string | null {
  if (/\b(churches|church|chapels?|cathedrals?|abbeys?|basilicas?|shrines?)\b/i.test(label)) return churchModel(label);
  if (/\bmosques?\b/i.test(label)) return mosqueModel(label);
  if (/\b(temples?|synagogues?)\b/i.test(label)) return templeModel(label);
  if (/\blighthouses?\b/i.test(label)) return lighthouseModel(label);
  if (/\bwindmills?\b/i.test(label)) return windmillModel(label);
  return null;
}

function creature(label: string): string {
  const tint = namedColor(label);
  const body = animalBody(label);
  if (body === "cow") return cowModel(label);
  if (body === "elephant") {
    const hide = hex(tint ?? 0x9aa3ad);
    return [
      `box 0.86 0.4 0.48 ${hide} 0 0.58 0`,
      ...legs("5c6770", 0.42, 0.09, 0.21, 0.26, 0.16),
      `box 0.28 0.26 0.3 ${hide} 0.52 0.72 0`,
      `box 0.1 0.46 0.1 ${hide} 0.66 0.4 0`,
      `box 0.06 0.24 0.28 ${hide} 0.42 0.82 0.22`,
      `box 0.06 0.24 0.28 ${hide} 0.42 0.82 -0.22`,
      "box 0.18 0.05 0.05 5c6770 -0.5 0.62 0",
    ].join("\n");
  }
  if (body === "giraffe") {
    const hide = hex(tint ?? 0xe0b15a);
    return [
      `box 0.48 0.2 0.24 ${hide} 0 0.78 0`,
      ...legs("8d5a32", 0.62, 0.04, 0.31, 0.16, 0.08),
      `box 0.1 0.48 0.1 ${hide} 0.22 1.1 0`,
      `sphere 0.1 0 0 ${hide} 0.28 1.4 0`,
      "cone 0.02 0.1 0 5c3a22 0.24 1.52 0.04",
      "cone 0.02 0.1 0 5c3a22 0.24 1.52 -0.04",
      "box 0.1 0.08 0.08 8d5a32 -0.06 0.84 0.06",
    ].join("\n");
  }
  if (body === "snake") {
    const hide = hex(tint ?? 0x2f8f3a);
    return [
      `sphere 0.11 0 0 ${hide} -0.28 0.12 0`,
      `sphere 0.13 0 0 ${hide} -0.08 0.14 0`,
      `sphere 0.13 0 0 ${hide} 0.12 0.14 0`,
      `sphere 0.11 0 0 ${hide} 0.3 0.16 0`,
      `sphere 0.1 0 0 ${hide} 0.46 0.22 0`,
      "cone 0.03 0.1 0 e85d4c 0.56 0.24 0",
    ].join("\n");
  }
  if (body === "bird") {
    const hide = hex(tint ?? 0x3b6fe0);
    const flying = airborne(label);
    const y = flying ? 0.2 : 0;
    const lines = [
      `sphere 0.16 0 0 ${hide} 0 ${0.4 + y} 0`,
      `sphere 0.09 0 0 ${hide} 0.18 ${0.5 + y} 0`,
      `cone 0.04 0.12 0 efb423 0.28 ${0.52 + y} 0`,
      `box 0.36 0.03 0.14 ${hide} -0.02 ${0.48 + y} 0.14`,
      `box 0.36 0.03 0.14 ${hide} -0.02 ${0.48 + y} -0.14`,
    ];
    if (!flying) lines.push("cylinder 0.02 0.16 0 efb423 0.04 0.16 -0.04", "cylinder 0.02 0.16 0 efb423 0.04 0.16 0.04");
    return lines.join("\n");
  }
  if (body === "fish") {
    const hide = hex(tint ?? 0x3aa0c8);
    return [`box 0.55 0.16 0.22 ${hide} 0 0.22 0`, `box 0.16 0.2 0.04 ${hide} -0.34 0.24 0`, `box 0.22 0.04 0.16 ${hide} 0.02 0.32 0`, "sphere 0.04 0 0 2c2c2c 0.2 0.26 0.08"].join("\n");
  }
  if (body === "dragon") {
    const hide = hex(tint ?? 0x2f8f3a);
    return [
      `box 0.72 0.22 0.28 ${hide} 0 0.4 0`,
      ...legs("1d5c28", 0.28, 0.04, 0.14, 0.22, 0.1),
      `sphere 0.12 0 0 ${hide} 0.42 0.52 0`,
      "cone 0.04 0.14 0 e85d4c 0.4 0.68 0.05",
      "cone 0.04 0.14 0 e85d4c 0.4 0.68 -0.05",
      `box 0.36 0.04 0.28 ${hide} -0.02 0.56 0.24`,
      `box 0.36 0.04 0.28 ${hide} -0.02 0.56 -0.24`,
      `box 0.28 0.06 0.06 ${hide} -0.48 0.42 0`,
    ].join("\n");
  }
  if (body === "frog") {
    const hide = hex(tint ?? 0x3e9a48);
    return [`box 0.42 0.14 0.32 ${hide} 0 0.16 0`, `sphere 0.07 0 0 f7f4ee 0.12 0.26 0.08`, `sphere 0.07 0 0 f7f4ee 0.12 0.26 -0.08`, ...legs(hide, 0.12, 0.04, 0.06, 0.16, 0.14)].join("\n");
  }
  if (body === "turtle") {
    const hide = hex(tint ?? 0x3e9a48);
    return [`box 0.46 0.12 0.34 ${hide} 0 0.14 0`, "sphere 0.22 0 0 8d5a32 0 0.26 0", `box 0.14 0.1 0.12 ${hide} 0.3 0.16 0`, ...legs(hide, 0.1, 0.04, 0.05, 0.16, 0.14)].join("\n");
  }
  if (body === "horse") {
    const hide = hex(tint ?? (/\bzebras?\b/i.test(label) ? 0xf7f4ee : 0x8d5a32));
    const lines = [
      `box 0.7 0.22 0.24 ${hide} 0 0.52 0`,
      ...legs("5c3a22", 0.4, 0.045, 0.2, 0.24, 0.09),
      `box 0.1 0.28 0.1 ${hide} 0.28 0.72 0`,
      `sphere 0.11 0 0 ${hide} 0.36 0.9 0`,
      "box 0.08 0.16 0.06 3d342c 0.22 0.78 0",
      "box 0.2 0.06 0.05 3d342c -0.42 0.58 0",
    ];
    if (/\bzebras?\b/i.test(label)) lines.push("box 0.08 0.16 0.26 2c2c2c -0.08 0.54 0", "box 0.08 0.16 0.26 2c2c2c 0.12 0.54 0");
    return lines.join("\n");
  }
  if (body === "dog" || body === "cat" || body === "pig" || body === "sheep" || body === "beast") {
    const fallback =
      body === "pig" ? 0xf2b8c6 : body === "sheep" ? 0xf7f4ee : body === "cat" ? (/\blions?\b/i.test(label) ? 0xe0b15a : /\btigers?\b/i.test(label) ? 0xe07a3b : 0xc48945) : body === "dog" ? (/\bfox/i.test(label) ? 0xe07a3b : /\bwolf|wolves/i.test(label) ? 0x8a8f93 : 0x8d643c) : /\brabbits?|bunnies/i.test(label) ? 0xf7f4ee : 0x8d5a32;
    const lines = quadruped(label, tint ?? fallback, 0x3d342c, body === "cat" || body === "pig" ? 0.48 : 0.62, body === "sheep" ? 0.3 : 0.2, 0.18);
    if (/\blions?\b/i.test(label)) lines.push("sphere 0.14 0 0 c48945 0.28 0.62 0");
    if (/\btigers?\b/i.test(label)) lines.push("box 0.06 0.14 0.22 2c2c2c -0.06 0.42 0");
    if (/\brabbits?|bunnies/i.test(label)) lines.push("box 0.04 0.16 0.04 f7f4ee 0.2 0.62 0.04", "box 0.04 0.16 0.04 f7f4ee 0.2 0.62 -0.04");
    if (/\bdeer|moose|elk\b/i.test(label)) lines.push("cone 0.03 0.16 0 5c3a22 0.22 0.7 0.04");
    return lines.join("\n");
  }
  return quadruped(label, tint ?? 0x8d5a32, 0x3d342c).join("\n");
}

function furnitureModel(label: string): string {
  const cloth = hex(namedColor(label) ?? 0xc23b3b);
  const wood = "8d5a32";
  if (/\b(couches|couch|sofas|sofa)\b/i.test(label)) {
    return [`box 0.92 0.22 0.4 ${cloth} 0 0.18 0`, `box 0.92 0.32 0.1 ${cloth} 0 0.4 -0.16`, `box 0.12 0.24 0.4 ${cloth} -0.42 0.28 0`, `box 0.12 0.24 0.4 ${cloth} 0.42 0.28 0`].join("\n");
  }
  if (/\bchairs?\b/i.test(label)) {
    return [`box 0.36 0.1 0.36 ${wood} 0 0.28 0`, `box 0.36 0.4 0.08 ${cloth} 0 0.48 -0.14`, `cylinder 0.04 0.28 0 ${wood} -0.12 0.14 -0.12`, `cylinder 0.04 0.28 0 ${wood} 0.12 0.14 -0.12`, `cylinder 0.04 0.28 0 ${wood} -0.12 0.14 0.12`, `cylinder 0.04 0.28 0 ${wood} 0.12 0.14 0.12`].join("\n");
  }
  if (/\btables?\b/i.test(label)) {
    return [`box 0.7 0.08 0.46 ${wood} 0 0.42 0`, `cylinder 0.04 0.4 0 ${wood} -0.26 0.2 -0.16`, `cylinder 0.04 0.4 0 ${wood} 0.26 0.2 -0.16`, `cylinder 0.04 0.4 0 ${wood} -0.26 0.2 0.16`, `cylinder 0.04 0.4 0 ${wood} 0.26 0.2 0.16`].join("\n");
  }
  if (/\bbeds?\b/i.test(label)) {
    return [`box 0.7 0.16 0.95 ${wood} 0 0.16 0`, `box 0.6 0.12 0.78 f7f4ee 0 0.28 0.04`, `box 0.42 0.1 0.18 ${cloth} 0 0.38 -0.32`].join("\n");
  }
  if (/\b(rugs?|carpets?)\b/i.test(label)) {
    return [`box 0.9 0.04 0.7 ${cloth} 0 0.04 0`, `box 0.7 0.02 0.5 f7f4ee 0 0.07 0`].join("\n");
  }
  if (/\b(lamps?|lanterns?)\b/i.test(label)) {
    return [`cylinder 0.04 0.46 0 5c3a22 0 0.24 0`, `cone 0.16 0.18 0 ${cloth} 0 0.54 0`, `sphere 0.06 0 0 f4f1c8 0 0.46 0`].join("\n");
  }
  if (/\bplants?\b/i.test(label)) {
    return ["cylinder 0.12 0.16 0 c48945 0 0.1 0", "sphere 0.2 0 0 2f8f3a 0 0.32 0", "sphere 0.12 0 0 3e9a48 0.12 0.42 0"].join("\n");
  }
  if (/\b(bookshelves|bookshelf|bookcases?)\b/i.test(label)) {
    return [`box 0.7 0.7 0.16 ${wood} 0 0.38 0`, "box 0.5 0.06 0.08 c23b3b 0 0.52 0.06", "box 0.4 0.06 0.08 3b6fe0 0 0.28 0.06"].join("\n");
  }
  if (/\b(paintings?|pictures?)\b/i.test(label)) {
    return [`box 0.08 0.5 0.4 ${wood} 0 0.55 0`, `box 0.04 0.38 0.3 ${cloth} 0 0.55 0.04`].join("\n");
  }
  return [`box 0.7 0.08 0.4 ${wood} 0 0.42 0`, `cylinder 0.04 0.4 0 ${wood} -0.24 0.2 -0.12`, `cylinder 0.04 0.4 0 ${wood} 0.24 0.2 -0.12`, `cylinder 0.04 0.4 0 ${wood} -0.24 0.2 0.12`, `cylinder 0.04 0.4 0 ${wood} 0.24 0.2 0.12`].join("\n");
}

export function inventModel(label: string): string {
  const name = label.trim().toLowerCase();
  const tint = namedColor(label);
  if (portrayal(label) === "tree") return treeModel(label);
  if (animalBody(label)) return creature(label);
  if (isFurniture(label)) return furnitureModel(label);
  if (portrayal(label) === "building") return landmarkModel(label) ?? building(tint ?? 0x8d3a32, tint ?? 0xc48945);
  if (/\b(rafters?|beams?|joists?)\b/i.test(label)) {
    const wood = hex(tint ?? 0x8d5a32);
    return [`cylinder 0.05 0.72 0 5c3a22 -0.38 0.36 0`, `cylinder 0.05 0.72 0 5c3a22 0.38 0.36 0`, `box 0.96 0.1 0.16 ${wood} 0 0.74 0`].join("\n");
  }
  const color = hex(tint ?? PALETTE[hashLabel(name) % PALETTE.length] ?? 0xc48945);
  const accent = hex(tint ?? PALETTE[(hashLabel(name) >> 4) % PALETTE.length] ?? 0xefb423);
  return [`box 0.46 0.36 0.4 ${color} 0 0.28 0`, `sphere 0.16 0 0 ${accent} 0 0.58 0`, "box 0.18 0.08 0.14 3d342c 0 0.12 0.16"].join("\n");
}

function near(value: number, target: number): boolean {
  return Math.abs(value - target) < 0.001;
}

export function isStockBlob(spec: string): boolean {
  const parts = parseModel(spec);
  if (!parts || parts.length !== 3) return false;
  const [body, head, foot] = parts;
  return Boolean(
    body && head && foot
    && body.shape === "box" && near(body.a, 0.46) && near(body.b, 0.36) && near(body.c, 0.4)
    && head.shape === "sphere" && near(head.a, 0.16)
    && foot.shape === "box" && near(foot.a, 0.18) && near(foot.b, 0.08),
  );
}

export function usableModel(spec: string | undefined): boolean {
  if (!spec?.trim()) return false;
  const parts = parseModel(spec);
  if (!parts || parts.length < 3) return false;
  if (parts.every((part) => part.shape === "box")) return false;
  return !isStockBlob(spec);
}

function partNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function formatModel(parts: ModelPart[]): string {
  return parts.map((part) => `${part.shape} ${partNumber(part.a)} ${partNumber(part.b)} ${partNumber(part.c)} ${hex(part.color)} ${partNumber(part.x)} ${partNumber(part.y)} ${partNumber(part.z)}`).join("\n");
}

function seated(part: ModelPart): ModelPart {
  const half = part.shape === "sphere" ? part.a : part.b / 2;
  return { ...part, y: clamp(Math.max(part.y, half), 0, 1.6) };
}

export function canonicalModel(spec: string): string | null {
  if (!usableModel(spec)) return null;
  const parts = parseModel(spec);
  return parts ? formatModel(parts.map(seated)) : null;
}

function partVolume(part: ModelPart): number {
  if (part.shape === "sphere") return part.a ** 3;
  if (part.shape === "box") return part.a * Math.max(part.b, 0.02) * Math.max(part.c, 0.02);
  return part.a * part.a * Math.max(part.b, 0.02);
}

export function tintModel(spec: string, label: string): string {
  const color = namedColor(label);
  const parts = parseModel(spec);
  if (!color || !parts?.length) return spec.trim();
  let dominant = parts[0]?.color ?? color;
  let biggest = -1;
  for (const part of parts) {
    const volume = partVolume(part);
    if (volume > biggest) {
      biggest = volume;
      dominant = part.color;
    }
  }
  return formatModel(parts.map((part) => (part.color === dominant ? { ...part, color } : part)));
}

export function modelFor(label: string, supplied?: string): string {
  if (portrayal(label) !== "custom" || isFurniture(label)) return inventModel(label);
  if (supplied && usableModel(supplied)) return supplied.trim();
  return inventModel(label);
}
