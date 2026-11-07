import { CakeSlice, Citrus, Crown, Sun, type LucideIcon } from "lucide-react";
import { isProductInStock } from "@/lib/productAvailability";
import type { Product } from "@/types";
import type { DayPart } from "../colomboTime";

/**
 * The Overview's moods, over the live menu (overview/liveData). The menu has no ingredients or ratings, so each mood
 * goes by what the admin does set: the product's category, words in its name and description, and its tag. Each
 * mood's products are ordered by tag (Best Seller first, then Signature, Popular, New, Classic, then untagged), then
 * by the admin's own menu order (a mood may list some last, see `later`), and only those the customer's branch can
 * sell right now count.
 */

export type MoodId = "hotDay" | "sweetTooth" | "lightFruity" | "treatMyself";

/** How many picks the mood picker shows. */
export const MOOD_PICKS = 4;

/** The product's name and description, lower-case, for word checks. */
const words = (product: Product) => `${product.name} ${product.description ?? ""}`.toLowerCase();
const mentions = (product: Product, list: string[]) => list.some((word) => words(product).includes(word));
const category = (product: Product) => (product.category?.slug ?? "").toLowerCase();

const ZESTY = ["lemon", "lime", "citrus"];
const MILKY = ["milk", "cream", "soft serve", "soft-serve", "yogurt", "yoghurt"];
/** The tags Treat myself takes, best first; the same order ranks every mood's products. */
const TAG_RANK = ["best seller", "signature", "popular", "new", "classic"];
const tagRank = (product: Product) => {
  const index = TAG_RANK.indexOf((product.tag ?? "").trim().toLowerCase().replace(/-/g, " "));
  return index === -1 ? TAG_RANK.length : index;
};

export const MOODS: {
  id: MoodId;
  name: string;
  text: string;
  icon: LucideIcon;
  pick: (product: Product) => boolean;
  /** Suits the mood less: listed after the rest. */
  later?: (product: Product) => boolean;
}[] = [
  // Icy and zesty: the fruit teas with lemon (or lime) in them.
  { id: "hotDay", name: "Hot day", text: "Icy and zesty", icon: Sun, pick: (product) => category(product) === "fruit-tea" && mentions(product, ZESTY) },
  // Rich and creamy: sundaes and milkshakes.
  { id: "sweetTooth", name: "Sweet tooth", text: "Rich and creamy", icon: CakeSlice, pick: (product) => category(product) === "sundae" || category(product) === "milkshake" },
  // Fresh, no milk: fruit and bubble teas whose name and description don't mention milk or cream. The lemon ones come
  // last, so it doesn't open with the same teas as Hot day.
  {
    id: "lightFruity",
    name: "Light & fruity",
    text: "Fresh, no milk",
    icon: Citrus,
    pick: (product) => (category(product) === "fruit-tea" || category(product) === "bubble-tea") && !mentions(product, MILKY),
    later: (product) => mentions(product, ZESTY),
  },
  // Our best-sellers: whatever the admin tagged Best Seller, Signature or Popular.
  { id: "treatMyself", name: "Treat myself", text: "Our best-sellers", icon: Crown, pick: (product) => tagRank(product) <= 2 },
];

/** The mood that suits the time of day, chosen first. */
export const MOOD_FOR: Record<DayPart, MoodId> = { morning: "lightFruity", afternoon: "hotDay", evening: "sweetTooth", night: "treatMyself" };

/** Everything on the live menu that suits a mood and can be ordered now, best first (Surprise me draws from it). */
export function moodPool(id: MoodId, menu: Product[]): Product[] {
  const mood = MOODS.find((candidate) => candidate.id === id)!;
  return menu
    .map((product, order) => ({ product, order }))
    .filter(({ product }) => mood.pick(product) && isProductInStock(product))
    .sort((a, b) => Number(mood.later?.(a.product) ?? false) - Number(mood.later?.(b.product) ?? false) || tagRank(a.product) - tagRank(b.product) || a.order - b.order)
    .map(({ product }) => product);
}
