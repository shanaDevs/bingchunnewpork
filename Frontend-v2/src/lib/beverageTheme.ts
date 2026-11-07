export type BeverageTheme = {
  liquid: [string, string, string];
  pearl: string;
  lid: [string, string];
  accent: string;
};

const DEFAULT: BeverageTheme = {
  liquid: ['#92400e', '#f59e0b', '#fde68a'],
  pearl: '#1a5cd4',
  lid: ['#307ef2', '#1a5cd4'],
  accent: '#f59e0b',
};

const THEMES: { match: RegExp; theme: BeverageTheme }[] = [
  {
    match: /matcha|green tea|jasmine/i,
    theme: {
      liquid: ['#14532d', '#22c55e', '#bbf7d0'],
      pearl: '#166534',
      lid: ['#4ade80', '#16a34a'],
      accent: '#22c55e',
    },
  },
  {
    match: /strawberry|rose|pink|sakura|berry/i,
    theme: {
      liquid: ['#9d174d', '#ec4899', '#fbcfe8'],
      pearl: '#831843',
      lid: ['#f472b6', '#db2777'],
      accent: '#ec4899',
    },
  },
  {
    match: /mango|passion|orange|peach|yuzu|citrus/i,
    theme: {
      liquid: ['#c2410c', '#f97316', '#fed7aa'],
      pearl: '#9a3412',
      lid: ['#fb923c', '#ea580c'],
      accent: '#f97316',
    },
  },
  {
    match: /taro|ube|purple|lavender|grape/i,
    theme: {
      liquid: ['#5b21b6', '#a855f7', '#e9d5ff'],
      pearl: '#6b21a8',
      lid: ['#c084fc', '#9333ea'],
      accent: '#a855f7',
    },
  },
  {
    match: /coffee|mocha|espresso|chocolate|cocoa/i,
    theme: {
      liquid: ['#3f2e1f', '#78350f', '#d6b48a'],
      pearl: '#292524',
      lid: ['#78716c', '#44403c'],
      accent: '#a16207',
    },
  },
  {
    match: /blueberry|blue|ocean|mint/i,
    theme: {
      liquid: ['#1e3a8a', '#3b82f6', '#bfdbfe'],
      pearl: '#1d4ed8',
      lid: ['#60a5fa', '#2563eb'],
      accent: '#3b82f6',
    },
  },
  {
    match: /brown sugar|milk tea|classic|original|boba|pearl/i,
    theme: DEFAULT,
  },
];

export function getBeverageTheme(productName: string): BeverageTheme {
  const hit = THEMES.find(({ match }) => match.test(productName));
  return hit?.theme ?? DEFAULT;
}
