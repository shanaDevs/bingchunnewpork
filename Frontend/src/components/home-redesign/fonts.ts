import { Bricolage_Grotesque, Geist, Plus_Jakarta_Sans } from "next/font/google";

// Body face for the home page (the rest of the app keeps its own).
const homeSans = Geist({
  variable: "--font-home-sans",
  subsets: ["latin"],
});

// Display face for the wordmark and headings; the width axis enables the condensed cut.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["wdth", "opsz"],
});

// Numeral face for prices: crisp, evenly spaced figures.
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

/** Class names that define the home page's font variables; put them on its outermost element. */
export const homeFontVariables = `${homeSans.variable} ${bricolage.variable} ${plusJakarta.variable}`;
