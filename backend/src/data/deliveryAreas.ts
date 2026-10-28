export interface AreaSearchResult {
  placeId: string;
  description: string;
  lat: number;
  lng: number;
}

export interface DeliveryArea {
  description: string;
  lat: number;
  lng: number;
  /** Extra tokens used for search matching (lowercase). */
  keywords?: string[];
}

/** Branch coverage areas and major Colombo suburbs for address autocomplete. */
export const DELIVERY_AREAS: DeliveryArea[] = [
  // Bing Chun branch areas — Colombo district
  { description: 'Kollupitiya, Colombo', lat: 6.9022, lng: 79.8551, keywords: ['colpetty', 'colombo 03'] },
  { description: 'Duplication Road, Colombo 03', lat: 6.8924, lng: 79.8554, keywords: ['ra de mel', 'colombo 3'] },
  { description: 'Port City, Colombo', lat: 6.9352, lng: 79.8432, keywords: ['chaithya', 'colombo 1'] },
  { description: 'Bambalapitiya, Colombo', lat: 6.8961631, lng: 79.8547522, keywords: ['bambalapitiya', 'colombo 04'] },
  { description: 'Nugegoda, Colombo', lat: 6.8726, lng: 79.8897 },
  { description: 'Dehiwala, Colombo', lat: 6.8510, lng: 79.8647, keywords: ['dehiwala mount lavinia'] },
  { description: 'Maradana, Colombo 10', lat: 6.9200, lng: 79.8664, keywords: ['colombo 10'] },
  { description: 'Rathmalana, Colombo', lat: 6.8072, lng: 79.8812 },
  { description: 'Mount Lavinia, Colombo', lat: 6.8323, lng: 79.8669, keywords: ['mt lavinia', 'dehiwala mount lavinia'] },
  { description: 'Battaramulla, Colombo', lat: 6.9040, lng: 79.9210, keywords: ['baththaramulla'] },
  { description: 'Borella, Colombo', lat: 6.9166, lng: 79.8745, keywords: ['colombo 08'] },
  { description: 'Havelock Town, Colombo', lat: 6.8959, lng: 79.8589, keywords: ['havelock', 'colombo 05', 'colombo 06'] },
  { description: 'Punchi Borella, Colombo', lat: 6.9253, lng: 79.8737, keywords: ['colombo 10'] },
  { description: 'Union Place, Colombo 02', lat: 6.9105, lng: 79.8555, keywords: ['colombo 2', 'akbar mawatha'] },
  { description: 'Piliyandala, Colombo', lat: 6.8014, lng: 79.9296 },
  { description: 'Pannipitiya, Colombo', lat: 6.8411, lng: 79.9047 },
  { description: 'Kohuwala, Colombo', lat: 6.8780, lng: 79.8952 },
  { description: 'Sri Jayawardenepura Kotte, Colombo', lat: 6.9028, lng: 79.9197, keywords: ['pitakotte', 'kotte', 'pagoda road'] },
  { description: 'Malabe, Colombo', lat: 6.9073, lng: 79.9711, keywords: ['malambe'] },
  { description: 'Pepiliyana, Colombo', lat: 6.8712, lng: 79.8921 },

  // Colombo postal districts
  { description: 'Colombo 01, Fort', lat: 6.9344, lng: 79.8428, keywords: ['fort', 'colombo 1', 'pettah'] },
  { description: 'Colombo 02, Slave Island', lat: 6.9180, lng: 79.8480, keywords: ['colombo 2', 'union place'] },
  { description: 'Colombo 03, Kollupitiya', lat: 6.9022, lng: 79.8551, keywords: ['colombo 3', 'kollupitiya'] },
  { description: 'Colombo 04, Bambalapitiya', lat: 6.8961631, lng: 79.8547522, keywords: ['colombo 4'] },
  { description: 'Colombo 05, Havelock Town', lat: 6.8939, lng: 79.8596, keywords: ['colombo 5'] },
  { description: 'Colombo 06, Wellawatte', lat: 6.8770, lng: 79.8610, keywords: ['colombo 6', 'wellawatta', 'pamankada'] },
  { description: 'Colombo 07, Cinnamon Gardens', lat: 6.9130, lng: 79.8600, keywords: ['colombo 7', 'cinnamon gardens', 'thimbirigasyaya'] },
  { description: 'Colombo 08, Borella', lat: 6.9166, lng: 79.8745, keywords: ['colombo 8'] },
  { description: 'Colombo 09, Dematagoda', lat: 6.9360, lng: 79.8770, keywords: ['colombo 9'] },
  { description: 'Colombo 10, Maradana', lat: 6.9200, lng: 79.8664, keywords: ['colombo 10'] },
  { description: 'Colombo 11, Pettah', lat: 6.9380, lng: 79.8500, keywords: ['colombo 11'] },
  { description: 'Colombo 12, Hulftsdorp', lat: 6.9420, lng: 79.8580, keywords: ['colombo 12'] },
  { description: 'Colombo 13, Kotahena', lat: 6.9480, lng: 79.8620, keywords: ['colombo 13'] },
  { description: 'Colombo 14, Grandpass', lat: 6.9520, lng: 79.8680, keywords: ['colombo 14'] },
  { description: 'Colombo 15, Mutwal', lat: 6.9580, lng: 79.8520, keywords: ['colombo 15'] },

  // Other Colombo suburbs
  { description: 'Rajagiriya, Colombo', lat: 6.9085, lng: 79.8915 },
  { description: 'Kaduwela, Colombo', lat: 6.9355, lng: 79.9840 },
  { description: 'Wellawatte, Colombo', lat: 6.8770, lng: 79.8610 },
  { description: 'Pamankada, Colombo', lat: 6.8820, lng: 79.8680 },
  { description: 'Thimbirigasyaya, Colombo', lat: 6.8980, lng: 79.8640 },
  { description: 'Dematagoda, Colombo', lat: 6.9360, lng: 79.8770 },
  { description: 'Nawala, Colombo', lat: 6.8980, lng: 79.8880 },
  { description: 'Nawala Road, Colombo', lat: 6.9010, lng: 79.8910 },
  { description: 'Ethul Kotte, Colombo', lat: 6.8950, lng: 79.9100 },
  { description: 'Pelawatte, Colombo', lat: 6.8780, lng: 79.9450 },
  { description: 'Kotte, Colombo', lat: 6.9028, lng: 79.9197 },
  { description: 'Moratuwa, Colombo', lat: 6.7730, lng: 79.8820 },
  { description: 'Angoda, Colombo', lat: 6.9280, lng: 79.9150 },
  { description: 'Homagama, Colombo', lat: 6.8410, lng: 80.0020 },
  { description: 'Avissawella, Colombo', lat: 6.9520, lng: 80.2130 },
  { description: 'Maharagama, Colombo', lat: 6.8480, lng: 79.9260 },
  { description: 'Kottawa, Colombo', lat: 6.8410, lng: 79.9620 },
  { description: 'Mulleriyawa, Colombo', lat: 6.9280, lng: 79.9350 },
  { description: 'Hanwella, Colombo', lat: 6.9020, lng: 80.0820 },
  { description: 'Kesbewa, Colombo', lat: 6.7920, lng: 79.9420 },
  { description: 'Kolonnawa, Colombo', lat: 6.9280, lng: 79.8950 },
  { description: 'Oruwala, Colombo', lat: 6.8580, lng: 79.8780 },
  { description: 'Lunawa, Colombo', lat: 6.8380, lng: 79.8720 },
  { description: 'Rawathawatta, Colombo', lat: 6.8280, lng: 79.8780 },

  // Gampaha district
  { description: 'Gampaha, Gampaha', lat: 7.0842, lng: 80.0135 },
  { description: 'Negombo, Gampaha', lat: 7.2096, lng: 79.8378 },
  { description: 'Ja-Ela, Gampaha', lat: 7.0730, lng: 79.8912, keywords: ['ja ela'] },
  { description: 'Kelaniya, Gampaha', lat: 6.9546, lng: 79.9207 },
  { description: 'Wattala, Gampaha', lat: 6.9890, lng: 79.8882 },
  { description: 'Minuwangoda, Gampaha', lat: 7.4749, lng: 80.0435 },

  // Other districts
  { description: 'Kalutara, Kalutara', lat: 6.5854, lng: 79.9607 },
  { description: 'Panadura, Kalutara', lat: 6.7146, lng: 79.9035 },
  { description: 'Kandy City, Kandy', lat: 7.2906, lng: 80.6337, keywords: ['kandy'] },
  { description: 'Kurunegala, Kurunegala', lat: 7.4818, lng: 80.3609 },
  { description: 'Matara, Matara', lat: 5.9549, lng: 80.5550 },
  { description: 'Galle, Galle', lat: 6.0535, lng: 80.2210 },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function areaScore(queryNorm: string, area: DeliveryArea): number {
  const descNorm = normalize(area.description);
  const tokens = [descNorm, ...(area.keywords ?? []).map(normalize)];

  let best = 0;
  for (const token of tokens) {
    if (token === queryNorm) best = Math.max(best, 100 + token.length);
    else if (token.startsWith(queryNorm)) best = Math.max(best, 80 + token.length);
    else if (token.includes(queryNorm)) best = Math.max(best, 50 + queryNorm.length);
    else if (queryNorm.includes(token) && token.length >= 4) best = Math.max(best, 30 + token.length);
  }
  return best;
}

/** Search local delivery areas — returns all matches, sorted by relevance. */
export function searchDeliveryAreas(query: string, limit = 60): AreaSearchResult[] {
  const queryNorm = normalize(query);
  if (queryNorm.length < 2) return [];

  const scored = DELIVERY_AREAS
    .map((area, index) => ({ area, score: areaScore(queryNorm, area), index }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const seen = new Set<string>();
  const results: AreaSearchResult[] = [];

  for (const { area } of scored) {
    const key = area.description.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      placeId: `area_${seen.size}`,
      description: area.description,
      lat: area.lat,
      lng: area.lng,
    });
    if (results.length >= limit) break;
  }

  return results;
}

export function nearestDeliveryArea(lat: number, lng: number): DeliveryArea {
  let best = DELIVERY_AREAS[0];
  let bestDist = Infinity;
  for (const area of DELIVERY_AREAS) {
    const d = Math.hypot(area.lat - lat, area.lng - lng);
    if (d < bestDist) {
      bestDist = d;
      best = area;
    }
  }
  return best;
}
