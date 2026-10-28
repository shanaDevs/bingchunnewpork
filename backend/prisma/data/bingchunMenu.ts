/** Canonical Bing Chun Sri Lanka menu — single source of truth for seeds and migrations. */

export const BINGCHUN_CATEGORIES = [
  { name: 'Bubble Tea', slug: 'bubble-tea', icon: '🧋', sortOrder: 1 },
  { name: 'Milk Tea', slug: 'milk-tea', icon: '🍵', sortOrder: 2 },
  { name: 'Fruit Tea', slug: 'fruit-tea', icon: '🍋', sortOrder: 3 },
  { name: 'Milkshake', slug: 'milkshake', icon: '🥤', sortOrder: 4 },
  { name: 'Sundae', slug: 'sundae', icon: '🍨', sortOrder: 5 },
  { name: 'Ice Cream', slug: 'ice-cream', icon: '🍦', sortOrder: 6 },
] as const;

export type BingchunProductSeed = {
  categorySlug: string;
  name: string;
  basePrice: number;
  tag?: string;
  description?: string;
};

export const BINGCHUN_PRODUCTS: BingchunProductSeed[] = [
  { categorySlug: 'bubble-tea', name: 'Bobo Milk Tea', basePrice: 450, tag: 'Classic', description: 'Creamy milk tea with chewy boba pearls. Our classic signature drink.' },
  { categorySlug: 'bubble-tea', name: 'Brown Sugar Boba Milk Tea', basePrice: 480, tag: 'Popular', description: 'Rich brown sugar syrup blended with fresh milk and boba pearls.' },
  { categorySlug: 'bubble-tea', name: 'Blueberry Bobo Tea', basePrice: 450, tag: 'Classic', description: 'Refreshing blueberry tea with boba pearls.' },
  { categorySlug: 'bubble-tea', name: 'Grape Bobo Tea', basePrice: 650, tag: 'New', description: 'Bold grape flavour with soft boba pearls.' },
  { categorySlug: 'bubble-tea', name: 'Strawberry Bobo Jasmine Milk Tea', basePrice: 650, tag: 'New', description: 'Delicate jasmine milk tea with strawberry and boba.' },
  { categorySlug: 'milk-tea', name: 'Original Milk Tea', basePrice: 380, tag: 'Signature', description: 'Our signature milk tea – smooth, balanced and timeless.' },
  { categorySlug: 'milk-tea', name: 'Lychee Jasmine Milk Tea', basePrice: 650, tag: 'Signature', description: 'Floral jasmine milk tea with sweet lychee.' },
  { categorySlug: 'fruit-tea', name: 'Fresh Lemonade', basePrice: 280, tag: 'Classic', description: 'Ice-cold freshly squeezed lemonade.' },
  { categorySlug: 'fruit-tea', name: 'Jasmine Green Tea', basePrice: 320, tag: 'Classic', description: 'Light and floral jasmine green tea served cold.' },
  { categorySlug: 'fruit-tea', name: 'Lemon Black Tea', basePrice: 380, tag: 'Classic', description: 'Bold black tea with a refreshing lemon twist.' },
  { categorySlug: 'fruit-tea', name: 'Lemon Green Tea', basePrice: 380, tag: 'New', description: 'Green tea infused with fresh lemon.' },
  { categorySlug: 'fruit-tea', name: 'Strawberry Lemon Tea', basePrice: 550, tag: 'Popular', description: 'Fruity strawberry blended with zesty lemon tea.' },
  { categorySlug: 'fruit-tea', name: 'Strawberry Mango Lemon Tea', basePrice: 650, tag: 'Popular', description: 'Tropical mango and strawberry in a lemon tea base.' },
  { categorySlug: 'milkshake', name: 'Blueberry Milkshake', basePrice: 550, tag: 'Classic', description: 'Thick and creamy blueberry milkshake.' },
  { categorySlug: 'milkshake', name: 'Strawberry Milkshake', basePrice: 550, tag: 'Popular', description: 'Classic strawberry milkshake made with real fruit.' },
  { categorySlug: 'milkshake', name: 'Chocolate Oreo Milkshake', basePrice: 550, tag: 'Popular', description: 'Rich chocolate milkshake blended with Oreo cookies.' },
  { categorySlug: 'milkshake', name: 'Mulberry Milkshake', basePrice: 550, tag: 'New', description: 'Unique mulberry flavour in a creamy milkshake.' },
  { categorySlug: 'milkshake', name: 'Strawberry Oreo Milkshake', basePrice: 550, tag: 'Popular', description: 'Strawberry milkshake with crushed Oreo topping.' },
  { categorySlug: 'sundae', name: 'Blueberry Sundae', basePrice: 450, tag: 'Classic', description: 'Blueberry compote over creamy vanilla ice cream.' },
  { categorySlug: 'sundae', name: 'Blueberry Chocolate Sundae', basePrice: 480, tag: 'Popular', description: 'Blueberry and chocolate drizzle over ice cream.' },
  { categorySlug: 'sundae', name: 'Brown Sugar Boba Sundae', basePrice: 480, tag: 'Best Seller', description: 'Our best-selling sundae with brown sugar caramel and boba.' },
  { categorySlug: 'sundae', name: 'Chocolate Oreo Sundae', basePrice: 520, tag: 'Popular', description: 'Chocolate sauce, Oreo crumble and vanilla ice cream.' },
  { categorySlug: 'sundae', name: 'Chocolate Biscuit Sundae', basePrice: 420, tag: 'Classic', description: 'Chocolate sauce and biscuit topping over ice cream.' },
  { categorySlug: 'sundae', name: 'Mango Sundae', basePrice: 450, tag: 'Popular', description: 'Fresh mango with creamy vanilla sundae.' },
  { categorySlug: 'sundae', name: 'Mango Pomelo Sago', basePrice: 580, tag: 'Signature', description: 'Signature Hong Kong-style mango pomelo sago dessert.' },
  { categorySlug: 'sundae', name: 'Oreo Chocolate Sundae', basePrice: 520, tag: 'Popular', description: 'Double Oreo and chocolate indulgence sundae.' },
  { categorySlug: 'sundae', name: 'Strawberry Sundae', basePrice: 420, tag: 'Classic', description: 'Fresh strawberry coulis over vanilla ice cream.' },
  { categorySlug: 'ice-cream', name: 'Vanilla Ice Cream', basePrice: 200, tag: 'Rs.200 Only', description: 'Classic creamy vanilla soft serve.' },
  { categorySlug: 'ice-cream', name: 'Chocolate Ice Cream', basePrice: 200, tag: 'Rs.200 Only', description: 'Rich chocolate soft serve ice cream.' },
  { categorySlug: 'ice-cream', name: 'Mix Choco Vanilla Ice Cream', basePrice: 200, tag: 'Rs.200 Only', description: 'Swirled chocolate and vanilla soft serve.' },
];

export const BINGCHUN_TOPPINGS = [
  { name: 'Boba 40G (Black Pearls)', extraPrice: 80 },
  { name: 'Bobo 25G (Crystal Pearls)', extraPrice: 80 },
  { name: 'Jelly 40G', extraPrice: 80 },
];

export function productSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const BINGCHUN_PRODUCT_SLUGS = BINGCHUN_PRODUCTS.map((p) => productSlug(p.name));

export const DRINK_CATEGORY_SLUGS = ['bubble-tea', 'milk-tea', 'fruit-tea'] as const;
