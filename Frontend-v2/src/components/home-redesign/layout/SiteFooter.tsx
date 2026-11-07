import { Clock, Mail, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/home-redesign/ui/Container";
import { Wordmark } from "@/components/home-redesign/ui/Wordmark";
import { FooterMotion } from "./FooterMotion";
import { cn } from "@/components/home-redesign/lib/cn";
import { contactInfo, footerNav, socialLinks } from "@/components/home-redesign/config/site";

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current">
      <path d="M15.12 5.32H17V2.14A26.11 26.11 0 0 0 14.26 2c-2.72 0-4.58 1.66-4.58 4.7v2.62H6.61v3.56h3.07V22h3.68v-9.12h3.06l.46-3.56h-3.52V7.05c0-1.03.28-1.73 1.76-1.73Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5 fill-none stroke-current"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.25" />
      <circle cx="17.5" cy="6.5" r="0.75" className="fill-current" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current">
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.6 2.6 0 0 1-2.59-2.6 2.6 2.6 0 0 1 3.37-2.48V9.66a5.69 5.69 0 0 0-.78-.05A5.73 5.73 0 0 0 4.14 15.3a5.73 5.73 0 0 0 5.72 5.7 5.73 5.73 0 0 0 5.72-5.7V9.01a7.35 7.35 0 0 0 4.28 1.37V7.29s-1.88.09-3.26-1.47Z" />
    </svg>
  );
}

// Colours are !important: the app's light theme restyles every `footer a` (globals.css), which would win otherwise.
const linkClass =
  "font-medium text-brand-900/80! decoration-sun-400 decoration-2 underline-offset-[6px] transition-colors hover:text-brand-600! hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600";

/** One contact line: a small brand-blue icon beside the text, nudged down to sit on the first line. */
function ContactItem({ icon: Icon, children }: { icon: typeof Phone; children: ReactNode }) {
  return (
    <li data-footer-item className="flex gap-3">
      <Icon className="mt-0.5 size-4.5 shrink-0 text-brand-500" aria-hidden="true" />
      <span className="font-medium text-brand-900/80">{children}</span>
    </li>
  );
}

const socialIcons = { Facebook: FacebookIcon, Instagram: InstagramIcon, TikTok: TikTokIcon };

/**
 * Site-wide footer on an ice-blue band: brand column, two link columns and a contact column, a thin divider row,
 * and an oversized faint "BING CHUN" wordmark behind the links, standing on that divider.
 * Phones (below sm) leave out the two link columns (the header's menu carries the main links there) and
 * use tighter spacing throughout, with a smaller wordmark so it still clears the contact lines.
 */
export function SiteFooter() {
  return (
    // FooterMotion reveals the content on scroll; the `data-footer-*` attributes are its hooks. The border and
    // background are !important to beat the app's light-theme `footer` rule (globals.css).
    <FooterMotion className="relative isolate overflow-hidden border-t-0! bg-brand-50! text-brand-900">
      {/* White wave from the page above into the footer, echoing the hero's bottom wave. */}
      <svg
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[clamp(2rem,4vw,4.5rem)] w-full text-snow"
        viewBox="0 0 1440 100"
        preserveAspectRatio="none"
      >
        <path
          fill="currentColor"
          d="M0 0H1440V26C1320 32 1180 63 1010 72C820 82 700 55 520 38C330 20 180 30 0 58Z"
        />
      </svg>

      {/* Phones: the bottom padding also clears the bottom nav (--bottom-nav-space is 0 from md up). */}
      <Container className="pt-20 pb-[calc(var(--bottom-nav-space)+1.5rem)] max-sm:pt-14 max-sm:pb-[calc(var(--bottom-nav-space)+1.25rem)] sm:pt-24">
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 max-sm:gap-y-8 sm:grid-cols-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div data-footer-col className="col-span-2 sm:col-span-3 lg:col-span-1">
            <div data-footer-item>
              {/* A link, so its colour is !important too (see linkClass). */}
              <Wordmark className="text-brand-700!" />
            </div>
            <p data-footer-item className="mt-4 max-w-xs text-lg text-brand-900/80 max-sm:mt-3 max-sm:text-base">
              A little happiness in every sip.
            </p>
            <ul className="mt-5 flex gap-3 max-sm:mt-4">
              {socialLinks.map(({ label, href }) => {
                const Icon = socialIcons[label];
                return (
                  <li key={label} data-footer-item>
                    <a
                      href={href}
                      aria-label={`Bing Chun on ${label}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid size-11 place-items-center rounded-full bg-white text-brand-600! shadow-sm ring-1 ring-brand-100 transition-colors ring-inset hover:bg-brand-600 hover:text-snow! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      <Icon />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          {footerNav.map((group) => (
            <nav key={group.title} aria-label={group.title} data-footer-col className="max-sm:hidden">
              <h2 data-footer-item className="text-sm font-semibold tracking-[0.2em] text-brand-500 uppercase">{group.title}</h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {group.links.map(({ label, href }) => (
                  <li key={label} data-footer-item>
                    <Link
                      href={href}
                      className={linkClass}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/* Full width until lg: its lines are too long for a half or third column. */}
          <div data-footer-col className="col-span-2 sm:col-span-3 lg:col-span-1">
            <h2 data-footer-item className="text-sm font-semibold tracking-[0.2em] text-brand-500 uppercase">
              Contact Us
            </h2>
            <address className="not-italic">
              <ul className="mt-4 flex flex-col gap-2.5 max-sm:mt-3 max-sm:gap-2">
                <ContactItem icon={MapPin}>{contactInfo.location}</ContactItem>
                <ContactItem icon={Mail}>
                  <a href={`mailto:${contactInfo.email}`} className={cn(linkClass, "break-all")}>
                    {contactInfo.email}
                  </a>
                </ContactItem>
                <ContactItem icon={Phone}>
                  Inquiries:{" "}
                  <a href={contactInfo.inquiries.href} className={cn(linkClass, "whitespace-nowrap")}>
                    {contactInfo.inquiries.label}
                  </a>
                </ContactItem>
                <ContactItem icon={Phone}>
                  Franchise:{" "}
                  {contactInfo.franchise.map(({ label, href }, i) => (
                    <span key={href}>
                      {i > 0 && " / "}
                      <a href={href} className={cn(linkClass, "whitespace-nowrap")}>
                        {label}
                      </a>
                    </span>
                  ))}
                </ContactItem>
                <ContactItem icon={Clock}>{contactInfo.hours}</ContactItem>
              </ul>
            </address>
          </div>
        </div>

        <div className="relative mt-14 pt-5 text-sm text-brand-900/70 max-sm:mt-12 max-sm:pt-4">
          {/* The divider, as its own element so the reveal can draw it across without stretching the text. */}
          <span data-footer-line aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-brand-200/70" />
          {/* Oversized faint wordmark behind the content, standing on the divider. Bottom-full puts its line
              box on the line; the 0.17em shift drops the baseline onto it (this font's baseline sits 0.17em
              above the box bottom at leading-none). -z-10 stays above the footer's background thanks to
              the footer's `isolate`. */}
          <p
            aria-hidden="true"
            data-footer-watermark
            className="font-display-condensed pointer-events-none absolute inset-x-0 bottom-full -z-10 translate-y-[0.17em] text-center text-[clamp(5rem,21vw,20rem)] leading-none whitespace-nowrap text-brand-100 uppercase select-none max-sm:text-[4rem]"
          >
            Bing Chun
          </p>
          {/* Mascot peeking over the divider, paws resting on the line. Every few seconds it ducks behind
              the line and pops back up with a wiggle (mascot-peek). The window is the PNG cropped at the
              line (row 290 of 408), so whatever drops below it is hidden, as if behind the divider. */}
          <div className="pointer-events-none absolute right-2 bottom-full aspect-[612/290] w-28 overflow-hidden sm:right-6 sm:w-36">
            <Image
              src="/images/order-now-mascot.png"
              alt=""
              width={612}
              height={408}
              sizes="144px"
              data-footer-mascot
              className="block w-full max-w-none origin-[50%_70%] animate-mascot-peek"
            />
          </div>
          <p data-footer-copyright>© {new Date().getFullYear()} Bing Chun Sri Lanka</p>
        </div>
      </Container>
    </FooterMotion>
  );
}
