"use client";

/**
 * Single entry point for GSAP in this project.
 * Import `gsap` and `useGSAP` from here (not directly from the packages) so plugins
 * are registered exactly once. Register additional plugins (e.g. ScrollTrigger) below.
 * Only import this module from Client Components.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

export { gsap, ScrollTrigger, SplitText, useGSAP };
