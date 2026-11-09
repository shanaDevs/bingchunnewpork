/** English copy aligned with bingchun-homepage-redesign messages/en.json → menu */
export const menuCopy = {
  hero: {
    eyebrow: 'Explore our menu',
    headlineBefore: 'Find your ',
    headlineHighlight: 'happy sip.',
    intro: 'Explore your favourites, made just for you.',
    labelFreshFruits: ['Fresh', 'Fruits'] as const,
    labelChewyBoba: ['Chewy', 'Boba'] as const,
    labelRealGoodness: ['Real', 'Goodness'] as const,
  },
  branchBar: {
    yourBranch: 'Your branch',
    pickupFrom: 'Pickup from',
    deliveryToFrom: (area: string) => `Delivery to ${area} from`,
    deliveryFrom: 'Delivery from',
    notChosen: 'Not chosen yet',
    changeBranch: 'Change Branch',
    chooseBranch: 'Choose Branch',
    branchName: (name: string) => `Bing Chun ${name.replace(/^Bing Chun\s*-\s*/i, '').trim()}`,
  },
  listing: {
    label: 'Menu',
    all: 'All',
    allTreats: 'All Treats',
    categories: 'Categories',
    searchLabel: 'Search the menu',
    searchPlaceholder: 'Search drinks & desserts',
    itemCount: (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`,
    matching: (query: string) => ` matching “${query}”`,
    soldOutAt: (count: number, branch: string) =>
      ` · ${count} sold out at ${branch.replace(/^Bing Chun\s*-\s*/i, '').trim()}`,
    noMatch: (query: string) => `No sips match “${query}”`,
    noMatchHint: 'Try another name, or browse a different category.',
    clearSearch: 'Clear search',
    seeMatchesInAll: (count: number) =>
      `See ${count} ${count === 1 ? 'match' : 'matches'} in All`,
  },
} as const;
