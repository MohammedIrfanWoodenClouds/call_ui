/**
 * NameRecognizer — Kerala / Indian given-name STT verification.
 *
 * Used to detect near-misses (e.g. Mohamed ≈ Mohammed) so the agent
 * confirms spelling instead of guessing, and never silently swaps one
 * name for another (Mohammed ≠ Muhammad ≠ Muhammed).
 */

/** Frequent Kerala given names — spellings that STT often confuses. */
export const COMMON_KERALA_NAMES: readonly string[] = [
  // Mohammed-family (keep as distinct spellings — never auto-merge)
  "Mohammed",
  "Muhammad",
  "Muhammed",
  "Mohamed",
  "Mohamad",
  "Mohammad",
  // Common Muslim / Mappila given names
  "Irfan",
  "Shihab",
  "Niyas",
  "Abdul",
  "Shamil",
  "Jabir",
  "Junaid",
  "Ashraf",
  "Faisal",
  "Shanavas",
  "Noufal",
  "Naufal",
  "Fathima",
  "Fatima",
  "Amina",
  "Ameena",
  "Aysha",
  "Aisha",
  "Rasheed",
  "Rashid",
  "Shakeel",
  "Shakkeer",
  "Shabeer",
  "Shabir",
  "Suhail",
  "Jaleel",
  "Jalal",
  "Nizar",
  "Naseer",
  "Nasir",
  "Salim",
  "Saleem",
  "Sajid",
  "Sajith",
  "Anas",
  "Anees",
  "Anwar",
  "Azhar",
  "Azad",
  "Basheer",
  "Bashir",
  "Firoz",
  "Feroz",
  "Haneefa",
  "Hanifa",
  "Hassan",
  "Hasan",
  "Hussain",
  "Husain",
  "Ibrahim",
  "Ismail",
  "Jafar",
  "Jaffer",
  "Kabeer",
  "Kabir",
  "Latif",
  "Lateef",
  "Majeed",
  "Majid",
  "Mansoor",
  "Mansur",
  "Mubarak",
  "Mustafa",
  "Musthafa",
  "Nabeel",
  "Nabil",
  "Nadeem",
  "Nadim",
  "Rafeek",
  "Rafiq",
  "Rahman",
  "Rehman",
  "Sajjad",
  "Sameer",
  "Samir",
  "Shafi",
  "Shafeek",
  "Shafiq",
  "Shamsudheen",
  "Shamsuddin",
  "Sherif",
  "Shareef",
  "Thaha",
  "Taha",
  "Usman",
  "Osman",
  "Yousuf",
  "Yusuf",
  "Zubair",
  "Zainaba",
  "Zainab",
  "Suhara",
  "Suhra",
  "Raziya",
  "Jameela",
  "Jamila",
  "Khadija",
  "Khadeeja",
  "Mariyam",
  "Maryam",
  "Safiya",
  "Safiyya",
  // Common Kerala Christian / general names
  "Joseph",
  "Jose",
  "Thomas",
  "Tom",
  "Mathew",
  "Matthew",
  "George",
  "Geevarghese",
  "Varghese",
  "Philip",
  "Philipose",
  "John",
  "Johny",
  "Johnny",
  "Paul",
  "Paulose",
  "Peter",
  "Simon",
  "Stephen",
  "Steven",
  "Andrew",
  "Anthony",
  "Antony",
  "Francis",
  "Franco",
  "Michael",
  "Micheal",
  "David",
  "Daniel",
  "Samuel",
  "Abraham",
  "Jacob",
  "James",
  "Mary",
  "Maria",
  "Ann",
  "Anna",
  "Anne",
  "Elizabeth",
  "Elsy",
  "Elsie",
  "Grace",
  "Sarah",
  "Sara",
  "Susan",
  "Susanna",
  "Rebecca",
  "Rebekah",
  "Rose",
  "Rosy",
  "Teresa",
  "Theresa",
  // Common Hindu / general Kerala names
  "Anand",
  "Ananda",
  "Arun",
  "Arjun",
  "Ajith",
  "Ajit",
  "Anoop",
  "Anup",
  "Ashok",
  "Asha",
  "Anitha",
  "Anita",
  "Anjali",
  "Biju",
  "Binoj",
  "Deepak",
  "Deepa",
  "Divya",
  "Gopalan",
  "Gopal",
  "Hari",
  "Haris",
  "Harish",
  "Jayan",
  "Jayanth",
  "Jithin",
  "Jithu",
  "Krishnan",
  "Krishna",
  "Lakshmi",
  "Lekshmi",
  "Manu",
  "Manoj",
  "Midhun",
  "Mithun",
  "Nithin",
  "Nitin",
  "Pradeep",
  "Pradip",
  "Praveen",
  "Pravin",
  "Priya",
  "Priyanka",
  "Rajan",
  "Rajesh",
  "Ramesh",
  "Ravi",
  "Suresh",
  "Sreejith",
  "Srijith",
  "Sreekumar",
  "Srikumar",
  "Subash",
  "Subhash",
  "Sunil",
  "Suni",
  "Unni",
  "Vijay",
  "Vijayan",
  "Vinod",
  "Vishnu",
  "Anjana",
  "Anjaly",
  "Meera",
  "Mira",
  "Nisha",
  "Neethu",
  "Nithya",
  "Reshma",
  "Reshmi",
  "Sandhya",
  "Santhosh",
  "Santosh",
  "Shalini",
  "Shyam",
  "Sreeja",
  "Srija",
  "Sreelakshmi",
  "Sruthi",
  "Shruti",
  "Sneha",
  "Sowmya",
  "Saumya",
  "Vidya",
  "Vineeth",
  "Vinit",
  "Vipin",
  "Vivek",
] as const;

/** Deduped lowercase → preferred display spelling from the list. */
const BY_KEY = new Map<string, string>();
for (const n of COMMON_KERALA_NAMES) {
  const k = normalizeNameKey(n);
  if (k && !BY_KEY.has(k)) BY_KEY.set(k, n);
}

export function normalizeNameKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0d00-\u0d7f]+/g, "");
}

/**
 * Loose Latin transliteration key for candidate generation only. It handles
 * common Kerala vowel-length variants (Shameel/Shamil, Naufal/Noufal) but is
 * never used to overwrite the spelling the caller actually confirmed.
 */
function phoneticNameKey(s: string): string {
  return normalizeNameKey(s)
    .replace(/ph/g, "f")
    .replace(/(?:ee|ea|ei)/g, "i")
    .replace(/(?:oo|ou|au)/g, "u")
    .replace(/aa/g, "a")
    .replace(/iy/g, "i")
    .replace(/ck/g, "k")
    .replace(/([a-z])\1+/g, "$1");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length]!;
}

/** Max edit distance allowed for a "close" match, scaled by length. */
function nearDistanceBudget(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 8) return 2;
  return 3;
}

export function namesEqual(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return normalizeNameKey(a) === normalizeNameKey(b);
}

/** Exact list hit (case-insensitive / punctuation-insensitive). */
export function exactKeralaName(heard: string): string | undefined {
  const k = normalizeNameKey(heard);
  if (!k) return undefined;
  return BY_KEY.get(k);
}

/**
 * Find list entries close to `heard` (including exact).
 * Sorted best-first. Exact matches first, then by edit distance.
 * Multi-word full names are scored token-by-token as well.
 */
export function findNearKeralaNames(heard: string, limit = 5): string[] {
  const key = normalizeNameKey(heard);
  if (!key) return [];

  const exact = BY_KEY.get(key);
  if (exact) return [exact];

  const tokens = [
    key,
    ...heard
      .trim()
      .split(/\s+/)
      .map((t) => normalizeNameKey(t))
      .filter((t) => t.length >= 3 && t !== key),
  ];

  type Hit = { name: string; dist: number };
  const hits: Hit[] = [];
  const seen = new Set<string>();

  for (const [listKey, display] of BY_KEY) {
    let best = Infinity;
    for (const t of tokens) {
      const budget = nearDistanceBudget(Math.max(t.length, listKey.length));
      const direct = levenshtein(t, listKey);
      const phonetic = levenshtein(phoneticNameKey(t), phoneticNameKey(listKey));
      const dist = Math.min(direct, phonetic);
      if (dist <= budget) best = Math.min(best, dist);
    }
    if (best === Infinity || seen.has(display)) continue;
    seen.add(display);
    hits.push({ name: display, dist: best });
  }

  hits.sort((a, b) => a.dist - b.dist || a.name.localeCompare(b.name));
  return hits.slice(0, limit).map((h) => h.name);
}

/**
 * True when two spellings are different but both look like the same
 * confusable Kerala-name cluster (e.g. Mohammed vs Muhammad).
 */
export function isConfusableNameSwap(a: string, b: string): boolean {
  if (namesEqual(a, b)) return false;
  const nearA = findNearKeralaNames(a, 8);
  const nearB = findNearKeralaNames(b, 8);
  if (!nearA.length || !nearB.length) {
    // Both close to each other even if not on the list
    const ka = normalizeNameKey(a);
    const kb = normalizeNameKey(b);
    if (!ka || !kb) return false;
    return levenshtein(ka, kb) <= nearDistanceBudget(Math.max(ka.length, kb.length));
  }
  // Share any near-candidate, or each is near the other's spelling
  const setB = new Set(nearB.map(normalizeNameKey));
  if (nearA.some((n) => setB.has(normalizeNameKey(n)))) return true;
  if (nearA.some((n) => namesEqual(n, b))) return true;
  if (nearB.some((n) => namesEqual(n, a))) return true;
  return levenshtein(normalizeNameKey(a), normalizeNameKey(b)) <= 3;
}

export interface NameAssessment {
  heard: string;
  /** Exact list spelling if heard matches one entry. */
  exact?: string;
  /** Near list matches (for confirmation prompts). */
  candidates: string[];
  /** Heard form is close to list but not an exact spelling match. */
  nearMiss: boolean;
  /** Ambiguous: multiple distinct near candidates. */
  ambiguous: boolean;
}

export function assessHeardName(raw?: string): NameAssessment | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const heard = raw.trim().replace(/\s+/g, " ");
  const exact = exactKeralaName(heard);
  const candidates = findNearKeralaNames(heard, 5);
  const nearMiss = !exact && candidates.length > 0;
  const ambiguous =
    candidates.length > 1 &&
    new Set(candidates.map(normalizeNameKey)).size > 1;
  return { heard, exact, candidates, nearMiss, ambiguous };
}

/** Compact list for the agent prompt — focus on STT-confusable spellings. */
export function keralaNamesPromptList(): string {
  const promptFocus = [
    "Mohammed",
    "Muhammad",
    "Muhammed",
    "Mohamed",
    "Irfan",
    "Shihab",
    "Niyas",
    "Abdul",
    "Rahman",
    "Shamil",
    "Shafi",
    "Jabir",
    "Junaid",
    "Ashraf",
    "Faisal",
    "Shanavas",
    "Noufal",
    "Naufal",
    "Fathima",
    "Fatima",
    "Amina",
    "Ameena",
    "Aysha",
    "Aisha",
    "Rasheed",
    "Rashid",
    "Basheer",
    "Bashir",
    "Hussain",
    "Husain",
    "Mustafa",
    "Musthafa",
    "Shamsudheen",
    "Shamsuddin",
    "Yousuf",
    "Yusuf",
    "Khadeeja",
    "Khadija",
    "Mariyam",
    "Maryam",
    "Varghese",
    "Geevarghese",
    "Mathew",
    "Matthew",
    "Antony",
    "Anthony",
    "Midhun",
    "Mithun",
    "Sreejith",
    "Srijith",
    "Subash",
    "Subhash",
    "Lekshmi",
    "Lakshmi",
    "Santhosh",
    "Santosh",
  ];
  return promptFocus.join(", ") + " (and other common Kerala names — treat every spelling as distinct)";
}
