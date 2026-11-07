"use client";

/**
 * GSAP for the Offers page: the home page's setup (ScrollTrigger, SplitText) plus Flip, which the deal filter
 * animates with. Import from here in the offers-redesign components.
 */
import { Flip } from "gsap/Flip";
import { gsap, ScrollTrigger, SplitText, useGSAP } from "@/components/home-redesign/lib/gsap";

gsap.registerPlugin(Flip);

export { Flip, gsap, ScrollTrigger, SplitText, useGSAP };
