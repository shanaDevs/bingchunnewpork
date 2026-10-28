/** Area keywords that map a delivery address to a specific outlet (beyond raw distance). */
const AREA_ALIASES: Record<string, string[]> = {
  bambalapitiya: ['bambalpitiya', 'bambalapitya'],
  'duplication road': ['duplication rd', 'r a de mel', 'ra de mel mawatha', 'de mel mawatha'],
  kollupitiya: ['colpetty', 'colombo 03 galle road'],
  'port city food court': ['port city', 'chaithya'],
  nugegoda: ['nugegoda town'],
  'dehiwala 1': ['dehiwala galle road'],
  'dehiwala 2': ['dehiwala a2'],
  maradana: ['deans road'],
  'mt lavinia': ['mount lavinia', 'mt. lavinia', 'mount lavinia'],
  baththaramulla: ['battaramulla', 'battaramulla'],
  borella: ['borella town'],
  'havelock 1': ['havelock road 592'],
  'havelock 2': ['havelock road 143'],
  'punchi borella': ['punchi borella', 'maradana road 816'],
  'union place': ['union place', 'akbar mawatha', 'justice akbar'],
  piliyandala: ['piliyandala horana'],
  pannipitiya: ['pannipitiya high level'],
  kohuwala: ['kohuwala'],
  pitakotte: ['pitakotte', 'pagoda road kotte', 'sri jayawardenepura'],
  malambe: ['malabe'],
  gampaha: ['gampaha town'],
  negombo: ['negombo town'],
  'ja ela': ['ja-ela', 'ja ela'],
  kelaniya: ['kelaniya'],
  wattala: ['wattala'],
  kalutara: ['kalutara town'],
  panadura: ['panadura'],
  'kandy city': ['kandy city', 'dalada veediya'],
  kurunegala: ['kurunegala town'],
  matara: ['matara town'],
  galle: ['galle fort', 'lighthouse street'],
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Branch label after "Bing Chun - " */
export function storeAreaLabel(storeName: string): string {
  const match = storeName.match(/bing chun\s*-\s*(.+)/i);
  return match?.[1]?.trim() ?? storeName;
}

function matchScore(addressNorm: string, token: string): number {
  const normToken = normalize(token);
  if (normToken.length < 4) return 0;
  if (!addressNorm.includes(normToken)) return 0;
  return normToken.length;
}

/**
 * Prefer an outlet whose area name appears in the delivery address
 * (e.g. pin in Bambalapitiya → Bing Chun - Bambalapitiya).
 */
export function findStoreMatchingAddress<T extends { id: string; name: string }>(
  address: string | undefined,
  stores: T[]
): T | null {
  if (!address?.trim() || stores.length === 0) return null;

  const addressNorm = normalize(address);
  let best: { store: T; score: number } | null = null;

  for (const store of stores) {
    const area = storeAreaLabel(store.name);
    const areaKey = normalize(area);
    const tokens = [area, ...(AREA_ALIASES[areaKey] ?? [])];

    for (const token of tokens) {
      const score = matchScore(addressNorm, token);
      if (score > 0 && (!best || score > best.score)) {
        best = { store, score };
      }
    }
  }

  return best?.store ?? null;
}
