// seed dictionary: codes start at 10, 24 unique words per phrase

export const WORDS: string[] = [
  "apple", "banana", "cherry", "date", "elderberry", "fig", "grape",
  "honeydew", "kiwi", "lemon", "mango", "nectarine", "orange", "papaya",
  "quince", "asparagus", "broccoli", "carrot", "daikon", "eggplant",
  "fennel", "garlic", "horseradish", "jicama", "kale", "lettuce",
  "mushroom", "onion", "potato", "radish", "anchovy", "bacon", "beef",
  "chicken", "duck", "eel", "flounder", "goose", "ham", "lamb",
  "mackerel", "pork", "quail", "salmon", "turkey", "brie", "cheddar",
  "edam", "feta", "gouda", "havarti", "mozzarella", "parmesan", "ricotta",
  "swiss", "anise", "basil", "cinnamon", "dill", "ginger", "mint",
  "nutmeg", "oregano", "paprika", "rosemary", "saffron", "thyme",
  "turmeric", "vanilla", "wasabi", "aioli", "barbecue", "chutney",
  "gravy", "hummus", "ketchup", "mayo", "mustard", "pesto", "salsa",
  "bagel", "croissant", "dumpling", "espresso", "fudge", "gelato",
  "honey", "jam", "zucchini",
];

export const WORD_TO_CODE = new Map<string, number>(WORDS.map((w, i) => [w, 10 + i]));
export const WORD_SET      = new Set(WORDS);

// random 24 words, no repeats
export function generateSeedPhrase(): string[] {
  const phrase: string[] = [];
  const used = new Set<string>();

  while (phrase.length < 24) {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    const word = WORDS[buf[0]! % WORDS.length]!;
    if (!used.has(word)) {
      used.add(word);
      phrase.push(word);
    }
  }

  return phrase;
}

// words → numeric seed string, validates uniqueness
export function seedStringFromWords(words: string[]): string {
  if (words.length !== 24) throw new Error("Seed phrase must be exactly 24 words");

  const seen = new Set<string>();
  for (const word of words) {
    const w = word.toLowerCase().trim();
    if (!WORD_SET.has(w))  throw new Error(`Unknown word in seed phrase: "${word}"`);
    if (seen.has(w))       throw new Error(`Duplicate word in seed phrase: "${word}"`);
    seen.add(w);
  }

  return words.map((w) => WORD_TO_CODE.get(w.toLowerCase().trim())!.toString()).join("");
}
