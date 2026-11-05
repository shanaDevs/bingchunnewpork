"use client";

import { LoaderCircle } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { homeFontVariables } from "@/components/home-redesign/fonts";
import { BottomNav } from "@/components/home-redesign/layout/BottomNav";
import { SiteHeader } from "@/components/home-redesign/layout/SiteHeader";
import { cn } from "@/components/home-redesign/lib/cn";
import { gsap, useGSAP } from "@/components/home-redesign/lib/gsap";
import { heroBackdropImage } from "@/components/home-redesign/sections/hero/hero.config";
import { heroAssetsReady } from "@/components/home-redesign/sections/hero/heroIntro";
import { Container } from "@/components/home-redesign/ui/Container";
import { useAuthHydrated } from "@/hooks/useAuthHydrated";
import { api, ApiError } from "@/lib/api";
import { requestCustomerOtp, type OtpIntent } from "@/lib/otpIntent";
import { useAuthStore } from "@/store/authStore";
import type { User } from "@/types";
import { needsName } from "./loginHelpers";
import { LoginMoodContext, type LoginMood } from "./loginMood";
import { DeletedStep, OtpStep, PhoneStep, ProfileStep } from "./LoginSteps";

/** Starts hidden only where it will animate in, so there's no flash before the entrance (and it shows at once with reduced motion). */
const enters = "motion-safe:opacity-0";

/** How long the welcome shows before going on to the homepage. */
const WELCOME_MS = 900;

/** Where customers go once signed in (as before the redesign). */
const AFTER_SIGN_IN = "/";

/**
 * The mango drink bursting open (a transparent PNG in public/images/login-scene, trimmed to the artwork),
 * in the bottom-left corner, cut off by both edges, its burst towards the card.
 */
const CUP = { src: "/images/login-scene/mango_drink_cup_burst.png", width: 900, height: 886 };

/** The orange splash pouring up out of the cup. */
const SPLASH = { src: "/images/login-scene/glossy_orange_liquid_splash.png", width: 640, height: 633 };

const FRIEND = {
  pomelo: { src: "/images/login-scene/pomelo_character.png", width: 480, height: 475 },
  lemon: { src: "/images/login-scene/lemon_character.png", width: 480, height: 472 },
  mango: { src: "/images/login-scene/mango_character.png", width: 480, height: 531 },
};

const ICE = { src: "/images/login-scene/glossy_crystalline_ice_cubes_and_droplets.png", width: 640, height: 611 };

/** A piece's placement (`className`) and base tilt in degrees (`rotate`). */
type Placed = { className: string; rotate: number };

/**
 * Tablets and up: the fruit friends around the cup, placed in % of it (so they keep their spots as it scales):
 * the pomelo jumping above it, the lemon riding the top of the splash, the mango cheering by its lower right.
 */
const friends: (Placed & { art: keyof typeof FRIEND })[] = [
  { art: "pomelo", className: "top-[-30%] left-[24%] w-[22%]", rotate: -10 },
  // Tablets (below lg) have the card above the cup, so the lemon moves out from under it, beside the splash.
  { art: "lemon", className: "top-[-38%] left-[88%] w-[20%] max-lg:top-[6%] max-lg:left-[100%]", rotate: 8 },
  { art: "mango", className: "top-[58%] left-[92%] w-[21%]", rotate: -6 },
];

/** Tablets and up: ice cubes thrown out with the splash, in % of the cup: above it, and between the splash and the mango. */
const ices: Placed[] = [
  { className: "top-[-22%] left-[50%] w-[20%]", rotate: -14 },
  { className: "top-[32%] left-[96%] w-[19%]", rotate: 18 },
];

/**
 * Phones: there's no room beside the card, so the scene peeks out from behind it (placed around the card): the
 * drink from its bottom-left corner, its mouth at the corner, with the mango beside it; the pomelo and the lemon
 * (with an ice cube) over its top corners. The card wrapper leaves a strip above and below the card for them.
 */
const phoneCup = "top-[calc(100%-1.5rem)] -left-18 w-36 low:top-[calc(100%-1rem)] low:-left-15 low:w-28";
const phoneFriends: (Placed & { art: keyof typeof FRIEND })[] = [
  { art: "pomelo", className: "-top-9 left-3 w-14 low:-top-6 low:w-11", rotate: -12 },
  { art: "lemon", className: "-top-10 right-4 w-12 low:-top-7 low:w-10", rotate: 10 },
  { art: "mango", className: "top-[calc(100%-1rem)] left-22 w-11 low:top-[calc(100%-0.75rem)] low:left-17 low:w-9", rotate: -6 },
];
const phoneIces: Placed[] = [{ className: "-top-7 right-18 w-9 low:-top-5 low:w-7", rotate: -12 }];

/** A fruit friend. Reactions (`mood`), idle bounce (`cheer`) and entrance (`hop`) each get a layer, so they never fight. */
function Friend({ art, className, rotate, sizes }: Placed & { art: keyof typeof FRIEND; sizes: string }) {
  return (
    <span className={cn("absolute", className)}>
      <span data-login="mood" className="block origin-bottom">
        <span data-login="cheer" className="block origin-bottom">
          <span data-login="hop" className={cn("block", enters)} style={{ rotate: `${rotate}deg` }}>
            <Image {...FRIEND[art]} alt="" loading="eager" sizes={sizes} className="block h-auto w-full drop-shadow-[0_10px_12px_rgb(15_33_71/0.35)]" />
          </span>
        </span>
      </span>
    </span>
  );
}

/** An ice cube piece: tossed in (`toss`), then tumbling (`tumble`). */
function IceBit({ className, rotate, sizes }: Placed & { sizes: string }) {
  return (
    <span className={cn("absolute", className)}>
      <span data-login="tumble" className="block">
        <span data-login="toss" className={cn("block", enters)} style={{ rotate: `${rotate}deg` }}>
          <Image {...ICE} alt="" loading="eager" sizes={sizes} className="block h-auto w-full drop-shadow-[0_8px_10px_rgb(15_33_71/0.3)]" />
        </span>
      </span>
    </span>
  );
}

/** Fades the splash's root (bottom left) away, so it blends into the liquid in the cup's mouth. */
const splashStyle = { maskImage: "linear-gradient(45deg, transparent 4%, black 30%)" };

/** Mango droplets hidden in the cup's mouth, for the burst when someone signs in: size in rem. */
const droplets = [0.9, 0.55, 0.75, 1, 0.5, 0.8, 0.65, 0.95, 0.6, 0.7, 0.85, 0.5];

/**
 * Fizzy bubbles drifting up the empty right side, to balance the drink on the left: `left` in %, `size` in
 * rem, `duration` and `delay` (negative, so they start mid-rise) in seconds.
 */
const bubbles = [
  { left: 70, size: 1.6, duration: 15, delay: 0 },
  { left: 76, size: 0.7, duration: 11, delay: -4 },
  { left: 82, size: 2.2, duration: 19, delay: -9 },
  { left: 88, size: 1, duration: 13, delay: -2 },
  { left: 93, size: 1.4, duration: 17, delay: -12 },
  { left: 73, size: 0.9, duration: 12, delay: -7 },
  { left: 85, size: 0.55, duration: 10, delay: -5 },
  { left: 96, size: 0.8, duration: 14, delay: -10 },
];

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A field in the card: focusing one makes the friends lean in to watch. */
const isField = (target: EventTarget | null) => target instanceof HTMLInputElement;

type Step =
  | { name: "phone" }
  | { name: "deleted"; phone: string }
  | { name: "otp"; phone: string; intent: OtpIntent }
  | { name: "profile"; phone: string };

type Welcome = { name: string; isNew: boolean };

/**
 * The customer sign-in page (/account/login), in the prototype's design, on the app's real sign-in API.
 * One flow for signing in and joining, with a mobile number and an SMS code:
 *
 * 1. The number (PhoneStep): POST /auth/otp/request sends the code. The backend makes an account for a new
 *    number then (named "Guest"). A number whose account was deleted answers ACCOUNT_DELETED, and DeletedStep
 *    asks whether to recover it or start a new one (the request's `intent`).
 * 2. The code (OtpStep): POST /auth/otp/verify signs in (httpOnly cookies; authStore.login keeps the user).
 * 3. Only when the account has no real name yet (needsName): the name (ProfileStep), saved with PUT /auth/me.
 *
 * A friend's referral code (?ref=, kept by /account/register's redirect) goes with the request and the verify,
 * as the old register page sent it. Once signed in it says welcome and goes on to the homepage; anyone already
 * signed in when the page opens goes straight there. "Continue with Google" is only the design for now.
 *
 * Layout: the redesigned header and phone bottom nav (no footer); a compact white card with the current step,
 * centred on the site's blue backdrop, with a soft glow behind it and the mango drink (CUP) in the bottom-left
 * corner from tablets up (phones get a smaller scene peeking out around the card). The page is exactly one
 * screen tall and never scrolls, phones included (the card tightens its spacing on shorter screens, see the
 * `low`/`mid`/`tall` variants, and stays clear of the phones' bottom nav). Only screens under 34rem tall
 * (phones turned sideways) scroll, as the card can't fit there.
 *
 * GSAP entrance, in the homepage hero's style, in two overlapping parts. The card goes straight away: the glow
 * blooms, the card rises, its title punches up and the rest of the step settles in piece by piece, and the
 * bubbles fade in. The scene goes once its artwork is decoded (at most 1.2s): the cup flies in from the
 * bottom-left corner, an orange splash (SPLASH) erupts from its mouth throwing out ice cubes, and the fruit
 * friends hop in, nearest first. Once everything has landed the cup floats gently, the splash keeps stretching
 * a little along its flow, the ice tumbles and the friends cheer. The card itself never moves after its
 * entrance. Each step change slides the new step in (CSS). Fizzy bubbles drift up the right side (CSS).
 *
 * The scene reacts to the form: the friends lean in while a field has focus, shiver at a wrong entry and hop
 * when a code is sent (the steps report those through useLoginMood), and on signing in everyone jumps and
 * mango droplets burst out of the cup. Nothing moves when reduced motion is requested.
 */
export default function LoginPage() {
  const rootRef = useRef<HTMLElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const referralCode = searchParams.get("ref")?.trim().toUpperCase() || undefined;
  const authHydrated = useAuthHydrated();
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [step, setStep] = useState<Step>({ name: "phone" });
  /** The number typed so far (digits after +94), kept when going back from the code. */
  const [digits, setDigits] = useState("");
  /** Back on the number step after leaving it: its field takes focus (not on page load, where it would pop up the keyboard). */
  const [returned, setReturned] = useState(false);
  /** Set once signed in, for the welcome. */
  const [welcome, setWelcome] = useState<Welcome | null>(null);
  /** Whether the visitor was already signed in when the page opened has been checked (once, not after signing in here). */
  const checkedSession = useRef(false);

  // Already signed in when the page opens: nothing to do here.
  useEffect(() => {
    if (!authHydrated || checkedSession.current) return;
    checkedSession.current = true;
    if (useAuthStore.getState().isAuthenticated) router.replace(AFTER_SIGN_IN);
  }, [authHydrated, router]);

  useEffect(() => {
    if (!welcome) return;
    const timer = window.setTimeout(() => router.replace(AFTER_SIGN_IN), WELCOME_MS);
    return () => window.clearTimeout(timer);
  }, [welcome, router]);

  /*
   * The scene reacting to the form. The friends' reactions animate their own layer (`mood`), so they never
   * fight their entrance or idle motion. All skipped with reduced motion.
   */
  const scene = useCallback((name: string) => gsap.utils.toArray<HTMLElement>(`[data-login="${name}"]`, rootRef.current), []);

  /** While a field has focus, the friends lean in towards the card to watch. */
  const lean = useCallback(
    (on: boolean) => {
      if (reducedMotion()) return;
      gsap.to(scene("mood"), { x: on ? 6 : 0, rotation: on ? 8 : 0, duration: 0.5, ease: on ? "back.out(2)" : "power2.out", overwrite: "auto" });
    },
    [scene],
  );

  /** The friends hop one after another (`times` extra rounds). */
  const hop = useCallback(
    (times = 0) => {
      gsap.to(scene("mood"), {
        keyframes: [
          { y: -30, duration: 0.25, ease: "power2.out" },
          { y: 0, duration: 0.4, ease: "bounce.out" },
        ],
        stagger: 0.08,
        repeat: times,
      });
    },
    [scene],
  );

  /** From the steps (useLoginMood): "oops" makes the friends shiver, "cheer" makes them hop. */
  const react = useCallback(
    (mood: LoginMood) => {
      if (reducedMotion()) return;
      if (mood === "cheer") hop();
      else gsap.fromTo(scene("mood"), { xPercent: 0 }, { keyframes: { xPercent: [-6, 6, -5, 5, -2, 0] }, duration: 0.5, ease: "none" });
    },
    [hop, scene],
  );

  // Signed in: everyone jumps twice and mango droplets burst out of the cup.
  useEffect(() => {
    if (!welcome || reducedMotion()) return;
    hop(1);
    // Fully opaque the whole way (half-faded orange looks grey on the blue): each one shrinks away instead.
    for (const drop of scene("drop")) {
      const duration = gsap.utils.random(0.9, 1.3);
      gsap
        .timeline()
        .set(drop, { x: 0, y: 0, scale: 0.4, opacity: 1 })
        .to(drop, { x: gsap.utils.random(-80, 280), y: gsap.utils.random(-340, -90), duration, ease: "power3.out" }, 0)
        .to(drop, { scale: gsap.utils.random(1, 1.4), duration: duration * 0.4, ease: "power2.out" }, 0)
        .to(drop, { scale: 0, duration: duration * 0.45, ease: "power2.in" }, duration * 0.55)
        .set(drop, { opacity: 0 });
    }
  }, [welcome, hop, scene]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(rootRef);
        const all = (name: string) => q<HTMLElement>(`[data-login="${name}"]`);

        const ambient = () => {
          gsap.to(all("float"), { y: -10, rotation: 3, duration: 3.2, ease: "sine.inOut", yoyo: true, repeat: -1 });
          // Liquid in motion: the splash keeps stretching a little along its flow, from where it leaves the cup.
          gsap.to(all("splash"), { scaleX: 1.025, scaleY: 1.05, rotation: 1.5, duration: 2.2, ease: "sine.inOut", yoyo: true, repeat: -1 });
          all("tumble").forEach((el, i) => {
            gsap.to(el, { y: i % 2 ? 8 : -8, rotation: i % 2 ? -10 : 10, duration: 2.6 + i * 0.5, ease: "sine.inOut", yoyo: true, repeat: -1 });
          });
          all("cheer").forEach((el, i) => {
            gsap.to(el, { y: -8, rotation: i % 2 ? -5 : 5, duration: 0.9 + i * 0.2, ease: "sine.inOut", yoyo: true, repeat: -1, delay: i * 0.25 });
          });
        };

        // 1. The card, straight away (the form never waits for the artwork): the glow blooms, the card rises,
        //    then its title punches up from its baseline (as the homepage headline does) and the rest of the
        //    step settles in, one piece after another. The bubbles fade in alongside.
        gsap
          .timeline({ defaults: { ease: "power3.out" } })
          .fromTo(all("glow"), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 1.4, ease: "power2.out" }, 0)
          .fromTo(all("card"), { opacity: 0, y: 40, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, clearProps: "transform" }, 0.1)
          .from(q('[data-login="card"] form > *'), { autoAlpha: 0, y: 16, duration: 0.6, stagger: 0.06 }, 0.35)
          .from(
            q('[data-login="card"] h2'),
            { yPercent: 45, scale: 0.9, transformOrigin: "50% 100%", duration: 0.85, ease: "back.out(1.5)" },
            0.35,
          )
          .fromTo(all("bubbles"), { opacity: 0 }, { opacity: 1, duration: 1.6, ease: "power1.out" }, 0.4);

        // 2. The scene, once its artwork is decoded (so nothing pops in mid-flight): the cup flies in from the
        //    bottom-left corner; as it lands the splash erupts from its mouth and throws out the ice; then the
        //    fruit friends hop in, nearest first. The idle motion starts once everything has landed.
        const sceneIntro = gsap
          .timeline({ paused: true, defaults: { ease: "power3.out" }, onComplete: ambient })
          .fromTo(
            all("slide"),
            { opacity: 0, xPercent: -70, yPercent: 70, rotation: -18, scale: 0.85 },
            { opacity: 1, xPercent: 0, yPercent: 0, rotation: 0, scale: 1, duration: 1.2, ease: "back.out(1.2)" },
            0.25,
          )
          .fromTo(
            all("splash"),
            { opacity: 0, scaleX: 0.3, scaleY: 0.1, rotation: -12 },
            { opacity: 1, scaleX: 1, scaleY: 1, rotation: 0, duration: 0.8, ease: "expo.out" },
            1.05,
          )
          .fromTo(
            all("toss"),
            { opacity: 0, x: -60, y: 60, scale: 0.3, rotation: -60 },
            { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, duration: 0.9, ease: "back.out(1.6)", stagger: 0.1 },
            1.1,
          )
          .fromTo(
            all("hop"),
            { opacity: 0, y: 50, scale: 0.4, rotation: (i) => (i % 2 ? 25 : -25) },
            { opacity: 1, y: 0, scale: 1, rotation: 0, duration: 0.7, ease: "back.out(2.2)", stagger: { each: 0.14, from: "end" } },
            1.35,
          );

        let cancelled = false;
        void heroAssetsReady(q('[data-login="scene"]')[0] ?? document.body, 1200).then(() => {
          if (!cancelled) sceneIntro.play();
        });
        return () => {
          cancelled = true;
        };
      });
      return () => mm.revert();
    },
    { scope: rootRef },
  );

  /** Asks the backend to text a code to `phone` (07XXXXXXXX). */
  const sendCode = (phone: string, intent: OtpIntent) => requestCustomerOtp(phone, { intent, referralCode });

  const submitPhone = async (phone: string) => {
    try {
      await sendCode(phone, "login");
    } catch (err) {
      if (err instanceof ApiError && err.code === "ACCOUNT_DELETED") {
        setStep({ name: "deleted", phone });
        return;
      }
      throw err;
    }
    setStep({ name: "otp", phone, intent: "login" });
  };

  const chooseDeleted = async (phone: string, intent: Exclude<OtpIntent, "login">) => {
    await sendCode(phone, intent);
    setStep({ name: "otp", phone, intent });
  };

  const verify = async (phone: string, code: string, intent: OtpIntent) => {
    const res = await api.post<{ user: User; accessExpiresAt?: number }>("/auth/otp/verify", {
      phone,
      code,
      ...(intent === "login" ? {} : { intent }),
      ...(referralCode ? { referralCode } : {}),
    });
    login(res.user, { accessExpiresAt: res.accessExpiresAt });
    if (needsName(res.user.name)) setStep({ name: "profile", phone });
    else setWelcome({ name: res.user.name, isNew: intent === "create_new" });
  };

  const saveName = async (name: string) => {
    const updated = await api.put<User>("/auth/me", { name }, true);
    updateUser(updated);
    setWelcome({ name: updated.name || name, isNew: true });
  };

  const backToPhone = (clear = false) => {
    if (clear) setDigits("");
    setReturned(true);
    setStep({ name: "phone" });
  };

  return (
    <div className={`home-redesign ${homeFontVariables} relative flex min-h-dvh flex-col bg-white antialiased`}>
      <SiteHeader />
      <main className="flex-1">
        <section
          ref={rootRef}
          className="relative isolate flex min-h-dvh flex-col overflow-hidden pt-22 text-snow [@media(min-height:34rem)]:h-dvh"
          style={{ backgroundImage: heroBackdropImage }}
        >
          {/* Decorative: the mango drink in the bottom-left corner (tablets and up; phones get theirs around the card).
              On tablets the card sits high, leaving the lower part of the screen to the drink. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            {/* The artwork loads eagerly (not lazily), so it's ready for its entrance. */}
            <span
              data-login="scene"
              className="absolute bottom-[-2%] left-[-7%] hidden w-[min(52vw,36vh)] md:block lg:bottom-[-6%] lg:left-[-5%] lg:w-[min(34vw,64vh)] lg:max-w-136"
            >
              <span data-login="float" className="block">
                <span data-login="slide" className={cn("relative block", enters)}>
                  {/* The splash pouring up out of the cup: behind the cup and placed in % of it, so it moves with it.
                      The splash's root (the thin end of its stream, at 8% 92% of the artwork) sits in the middle of
                      the cup's mouth, and fades out there so it rises out of the liquid already spilling over the rim. */}
                  <span className="absolute bottom-[61%] left-[47%] w-[60%]">
                    <span data-login="splash" className={cn("block origin-[8%_92%]", enters)} style={splashStyle}>
                      <Image
                        {...SPLASH}
                        alt=""
                        loading="eager"
                        sizes="(min-width: 1024px) 330px, 200px"
                        className="block h-auto w-full drop-shadow-[0_10px_12px_rgb(15_33_71/0.28)]"
                      />
                    </span>
                  </span>
                  <Image
                    {...CUP}
                    alt=""
                    loading="eager"
                    sizes="(min-width: 1024px) 544px, 320px"
                    className="relative block h-auto w-full drop-shadow-[0_14px_16px_rgb(15_33_71/0.35)]"
                  />
                  {ices.map((ice) => (
                    <IceBit key={ice.className} {...ice} sizes="(min-width: 1024px) 90px, 80px" />
                  ))}
                  {friends.map((friend) => (
                    <Friend key={friend.art} {...friend} sizes="(min-width: 1024px) 120px, 100px" />
                  ))}
                  {/* Hidden in the cup's mouth until someone signs in, then they burst out. */}
                  {droplets.map((size, i) => (
                    <span
                      key={i}
                      data-login="drop"
                      className="absolute top-[32%] left-[50%] aspect-square rounded-full bg-[radial-gradient(circle_at_35%_30%,rgb(255_255_255/0.75)_0,#ffb52e_32%,#f27c00_100%)] opacity-0 shadow-[0_3px_6px_rgb(15_33_71/0.3)]"
                      style={{ width: `${size}rem` }}
                    />
                  ))}
                </span>
              </span>
            </span>

            <div data-login="bubbles" className={cn("absolute inset-0 hidden md:block", enters)}>
              {bubbles.map((bubble) => (
                <span
                  key={bubble.left}
                  className="absolute top-full animate-bubble-rise"
                  style={{ left: `${bubble.left}%`, width: `${bubble.size}rem`, animationDuration: `${bubble.duration}s`, animationDelay: `${bubble.delay}s` }}
                >
                  <span
                    className="block aspect-square animate-bubble-sway rounded-full border border-white/35 bg-[radial-gradient(circle_at_32%_30%,rgb(255_255_255/0.55)_0,rgb(255_255_255/0.12)_35%,rgb(255_255_255/0.04)_70%)]"
                    style={{ animationDuration: `${2.5 + (bubble.size % 1) * 2}s` }}
                  />
                </span>
              ))}
            </div>
          </div>

          <Container className="flex min-h-0 flex-1 items-center justify-center pt-1 pb-[calc(var(--bottom-nav-space)+0.5rem)] sm:pt-4 md:pb-6 md:max-lg:items-start md:max-lg:pt-[max(1.5rem,5vh)] lg:py-4 mid:pb-[calc(var(--bottom-nav-space)+1rem)] md:mid:pb-6 tall:lg:py-6">
            {/* Phones: a strip above and below the card for the scene peeking out from behind it. */}
            <div className="w-full max-w-106 max-md:pt-9 max-md:pb-14 max-md:low:pt-6 max-md:low:pb-9">
              <div className="relative">
                {/* Decorative, phones only: the scene peeking out from behind the card (see phoneCup). */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 md:hidden">
                  <span className={cn("absolute", phoneCup)}>
                    <span data-login="float" className="block">
                      <span data-login="slide" className={cn("block", enters)}>
                        <Image {...CUP} alt="" loading="eager" sizes="144px" className="block h-auto w-full drop-shadow-[0_10px_12px_rgb(15_33_71/0.35)]" />
                      </span>
                    </span>
                  </span>
                  {phoneIces.map((ice) => (
                    <IceBit key={ice.className} {...ice} sizes="36px" />
                  ))}
                  {phoneFriends.map((friend) => (
                    <Friend key={friend.art} {...friend} sizes="56px" />
                  ))}
                </div>

                {/* Decorative: a soft blue glow centred on the card, behind everything else. */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-20">
                  <span
                    data-login="glow"
                    className={cn(
                      "absolute top-1/2 left-1/2 aspect-square w-[230%] -translate-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-brand-400)_80%,transparent),transparent)]",
                      enters,
                    )}
                  />
                </div>

                <div
                  data-login="card"
                  className={cn(
                    "relative w-full overflow-hidden rounded-[1.75rem] bg-white px-5 py-5 text-slate-900 shadow-[0_1px_0_rgb(255_255_255/0.8)_inset,0_32px_64px_-24px_rgb(15_33_71/0.6),0_12px_28px_-12px_rgb(15_33_71/0.35)] ring-1 ring-white/70 sm:px-7 sm:py-6 mid:sm:py-8 tall:sm:py-9",
                    enters,
                  )}
                  onFocus={(event) => isField(event.target) && lean(true)}
                  onBlur={(event) => !isField(event.relatedTarget) && lean(false)}
                  // Kept from the old sign-in page: staff double-click the title to reach the admin sign-in.
                  onDoubleClick={(event) => {
                    if (event.target instanceof Element && event.target.closest("h2")) router.push("/admin/login");
                  }}
                >
                  {/* An ice-blue wash in the top corner, so the card reads as part of the blue page. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(120%_100%_at_100%_0%,var(--color-brand-50),transparent_70%)]"
                  />

                  {/* The page's heading for screen readers; the step's title is the visible one. */}
                  <h1 className="sr-only">Bing Chun Account</h1>

                  {/* Keyed by step, so each new step slides in. The steps tell the scene how the form is going. */}
                  <LoginMoodContext value={react}>
                    <div
                      key={welcome ? "done" : step.name}
                      className="relative transition-[opacity,translate] duration-500 ease-out starting:translate-y-3 starting:opacity-0"
                    >
                      {welcome ? (
                        <div role="status" className="flex flex-col items-center py-8 text-center tall:py-12">
                          <LoaderCircle className="size-9 animate-spin text-brand-600" aria-hidden="true" />
                          <p className="mt-5 font-display-condensed text-[1.75rem] leading-none text-brand-950 uppercase">
                            {welcome.isNew ? `Welcome to Bing Chun, ${welcome.name}!` : `Welcome back, ${welcome.name}!`}
                          </p>
                          <p className="mt-2 text-sm text-slate-500">Taking you to the homepage…</p>
                        </div>
                      ) : step.name === "phone" ? (
                        <PhoneStep digits={digits} onDigitsChange={setDigits} onSubmit={submitPhone} autoFocus={returned} invited={!!referralCode} />
                      ) : step.name === "deleted" ? (
                        <DeletedStep
                          phone={step.phone}
                          onChoose={(intent) => chooseDeleted(step.phone, intent)}
                          onDifferentNumber={() => backToPhone(true)}
                        />
                      ) : step.name === "otp" ? (
                        <OtpStep
                          phone={step.phone}
                          onVerify={(code) => verify(step.phone, code, step.intent)}
                          onResend={() => sendCode(step.phone, step.intent)}
                          onBack={() => backToPhone()}
                        />
                      ) : (
                        <ProfileStep
                          phone={step.phone}
                          onSubmit={saveName}
                          onDifferentNumber={() => {
                            logout();
                            backToPhone(true);
                          }}
                        />
                      )}
                    </div>
                  </LoginMoodContext>
                </div>
              </div>
            </div>
          </Container>
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
