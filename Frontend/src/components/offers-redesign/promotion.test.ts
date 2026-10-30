import { describe, expect, it } from "vitest";
import type { PromoCode } from "@/types";
import { defaultCardDesign, defaultCardDesignSet, defaultLightCardDesign } from "@/lib/promotionCardDesign";
import { customCardDesign, dealFigure, matchesFilter, promotionCategories, toPromotions } from "./promotion";

const NOW = new Date("2026-10-30T06:00:00Z");

const promo = (overrides: Partial<PromoCode> & Record<string, unknown> = {}): PromoCode => ({
  code: "TEAFEST10",
  title: "Tea Fest 10% off",
  description: "Everyday offer on orders over LKR 1,000.",
  discountType: "PERCENTAGE",
  discountValue: 10,
  minOrderValue: 1000,
  ...overrides,
});

describe("toPromotions", () => {
  it("leaves out spin-wheel prizes and keeps the admin's order", () => {
    const cards = toPromotions(
      [
        promo({ code: "FIRST" }),
        promo({ code: "SW1", promotionRules: { source: "SPIN_WHEEL", spinOfferId: "x" } }),
        promo({ code: "SECOND" }),
      ],
      NOW,
    );
    expect(cards.map((c) => c.id)).toEqual(["FIRST", "SECOND"]);
  });

  it("carries the admin's title, description, minimum order and end date", () => {
    const [card] = toPromotions([promo({ expiresAt: "2026-12-31T18:29:00.000Z" })], NOW);
    expect(card).toMatchObject({
      title: "Tea Fest 10% off",
      description: "Everyday offer on orders over LKR 1,000.",
      minOrderValue: 1000,
      endsAt: "2026-12-31T18:29:00.000Z",
      headline: "10%",
      suffix: "off",
    });
  });

  it("redeems by code, by the cup's auto-apply, or with no code (as promotionAutoApply decides)", () => {
    const [bank, legacy, percentage, welcome, bogo] = toPromotions(
      [
        promo({ code: "hnb20", promotionKind: "BANK_OFFER" }),
        promo({ code: "OLD50" }),
        promo({ code: "TEAFEST10", promotionKind: "PERCENTAGE_DISCOUNT" }),
        promo({ code: "WELCOME10", promotionKind: "WELCOME" }),
        promo({ code: "BOGO1", promotionKind: "BOGO", promotionRules: { buyQty: 1, getQty: 1 } }),
      ],
      NOW,
    );
    expect(bank.redeem).toEqual({ type: "code", code: "HNB20" });
    expect(legacy.redeem).toEqual({ type: "code", code: "OLD50" });
    expect(percentage.redeem).toEqual({ type: "auto" });
    expect(welcome.redeem).toEqual({ type: "auto" });
    expect(bogo.redeem).toEqual({ type: "direct" });
    // Every card shows its promo code, however it's redeemed.
    expect([bank, legacy, percentage, welcome, bogo].map((c) => c.code)).toEqual(["HNB20", "OLD50", "TEAFEST10", "WELCOME10", "BOGO1"]);
  });

  it("rotates the page's colourways and layouts when the design is still the designer's default", () => {
    const cards = toPromotions([promo({ cardDesign: defaultCardDesignSet() }), promo({ code: "B" }), promo({ code: "C" })], NOW);
    expect(cards.map((c) => c.tone)).toEqual(["blue", "ink", "sun"]);
    expect(cards.map((c) => c.look)).toEqual(["poster", "poster", "stamp"]);
    expect(cards.every((c) => c.colours === undefined)).toBe(true);
  });

  it("uses the colours and layout the admin set in the Card Designer", () => {
    const dark = { ...defaultCardDesign(), backgroundColor: "#7c1d6f", accentColor: "#ffe27a", layoutPreset: "text-right-image-left" as const };
    const [card] = toPromotions([promo({ cardDesign: { dark, light: defaultLightCardDesign() } })], NOW);
    expect(card.colours).toEqual({ background: "#7c1d6f", accent: "#ffe27a", dark: true });
    expect(card.look).toBe("wide");
    expect(card.artFirst).toBe(true);
  });

  it("falls back to the light design, and drops an accent that wouldn't stand out", () => {
    const light = { ...defaultLightCardDesign(), backgroundColor: "#fff4cc", accentColor: "#fff8e0", layoutPreset: "background-image" as const };
    const [card] = toPromotions([promo({ cardDesign: JSON.stringify({ dark: defaultCardDesign(), light }) })], NOW);
    expect(card.colours).toEqual({ background: "#fff4cc", accent: undefined, dark: false });
    expect(card.look).toBe("poster");
  });

  it("shows the offer's products, else the designer's image, else a mascot", () => {
    const withProducts = promo({
      promotionKind: "COMBO_OFFER",
      promotionRules: { comboProducts: [{ id: "a", name: "A", imageUrl: "/products/a.png" }, { id: "b", name: "B", imageUrl: "/products/b.png" }] },
    });
    const designed = { ...defaultCardDesign(), backgroundColor: "#123456" };
    designed.elements = designed.elements.map((el) => (el.type === "image" ? { ...el, content: "/promos/custom.png" } : el));
    const placeholder = { ...defaultCardDesign(), backgroundColor: "#123456" };
    const [products, image, mascot] = toPromotions(
      [withProducts, promo({ code: "D", cardDesign: designed }), promo({ code: "M", promotionKind: "FREE_DELIVERY", cardDesign: placeholder })],
      NOW,
    );
    expect(products.art).toEqual({ type: "images", images: ["/products/a.png", "/products/b.png"] });
    expect(image.art).toEqual({ type: "images", images: ["/promos/custom.png"] });
    expect(mascot.art).toEqual({ type: "mascot", mascot: "rider" });
  });

  it("makes Upload Banner offers banner cards with the admin's image, price and button", () => {
    const [banner, plain] = toPromotions(
      [
        promo({ code: "BANNER", promotionKind: "UPLOAD_BANNER", promotionRules: { bannerImageUrl: "/promos/b.jpg", displayPrice: 1490, ctaLabel: "Grab it" } }),
        promo({ code: "BANNER2", promotionKind: "UPLOAD_BANNER", promotionRules: {} }),
      ],
      NOW,
    );
    expect(banner.look).toBe("banner");
    expect(banner.banner).toEqual({ imageUrl: "/promos/b.jpg", price: 1490, ctaLabel: "Grab it" });
    expect(plain.banner).toEqual({ imageUrl: undefined, price: undefined, ctaLabel: "Add to Bucket" });
    expect(banner.categories).toEqual([]);
  });
});

describe("promotionCategories", () => {
  it("files each type under the admin type picker's category", () => {
    const cats = (overrides: Partial<PromoCode>) => promotionCategories(promo(overrides), NOW);
    expect(cats({ promotionKind: "FREE_DELIVERY" })).toEqual(["delivery"]);
    expect(cats({ promotionKind: "BOGO" })).toEqual(["freebies"]);
    expect(cats({ promotionKind: "FIXED_DISCOUNT" })).toEqual(["discounts"]);
    expect(cats({ promotionKind: "HAPPY_HOUR" })).toEqual(["discounts", "limited"]);
    expect(cats({})).toEqual(["discounts"]);
  });

  it("adds Limited Time for offers ending within a week", () => {
    expect(promotionCategories(promo({ expiresAt: "2026-11-03T00:00:00Z" }), NOW)).toContain("limited");
    expect(promotionCategories(promo({ expiresAt: "2026-12-31T00:00:00Z" }), NOW)).not.toContain("limited");
  });
});

describe("dealFigure", () => {
  it("formats the big figure for each kind of offer", () => {
    expect(dealFigure(promo({ discountType: "FIXED", discountValue: 200 }))).toEqual({ headline: "LKR 200", suffix: "off" });
    expect(dealFigure(promo({ discountType: "FIXED", discountValue: 1500 }))).toEqual({ headline: "LKR 1,500", suffix: "off" });
    expect(dealFigure(promo({ promotionKind: "BXGY", discountType: "FIXED", discountValue: 1, promotionRules: { buyQty: 2, getQty: 1 } }))).toEqual({
      headline: "2+1",
      suffix: "free",
    });
    expect(dealFigure(promo({ promotionKind: "FREE_DELIVERY", discountType: "FIXED", discountValue: 0 }))).toEqual({ headline: "FREE" });
    expect(dealFigure(promo({ promotionKind: "WELCOME", promotionRules: { referralDiscountMode: "FIXED", discountAmount: 300 } }))).toEqual({
      headline: "LKR 300",
      suffix: "off",
    });
  });

  it("never shows the LKR 1 accounting value", () => {
    expect(dealFigure(promo({ promotionKind: "CUSTOM", discountType: "FIXED", discountValue: 1 }))).toEqual({ headline: "DEAL" });
  });
});

describe("customCardDesign", () => {
  it("ignores missing, broken and default designs", () => {
    expect(customCardDesign(null)).toBeNull();
    expect(customCardDesign("{not json")).toBeNull();
    expect(customCardDesign(defaultCardDesignSet())).toBeNull();
  });

  it("reads a legacy single design as the dark one", () => {
    const legacy = { ...defaultCardDesign(), layoutPreset: "custom" as const };
    expect(customCardDesign(legacy)?.layoutPreset).toBe("custom");
  });
});

describe("matchesFilter", () => {
  it("shows everything under All and only matching deals under a tab", () => {
    const [card] = toPromotions([promo({ promotionKind: "FREE_DELIVERY" })], NOW);
    expect(matchesFilter(card, "all")).toBe(true);
    expect(matchesFilter(card, "delivery")).toBe(true);
    expect(matchesFilter(card, "discounts")).toBe(false);
  });
});
