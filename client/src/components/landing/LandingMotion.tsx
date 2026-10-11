"use client";

// Drives the landing page's scroll motion (styles in globals.css, "Landing motion"):
// - [data-reveal] / [data-reveal-stagger] blocks ease in once when they enter the view;
// - the header gets data-scrolled="true" once the page has scrolled, for its shadow.
// Renders nothing. The boot script only hides reveal blocks when this is going to run.
import { useEffect } from "react";

// Signals the boot script's safety timer that reveals are being handled.
declare global {
  interface Window {
    afritaskRevealStarted?: boolean;
  }
}

export default function LandingMotion() {
  useEffect(() => {
    window.afritaskRevealStarted = true;
    const root = document.documentElement;

    let observer: IntersectionObserver | null = null;
    if (root.classList.contains("reveal-ready")) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add("is-revealed");
            // Once only — scrolling back up doesn't replay anything.
            observer?.unobserve(entry.target);
          }
        },
        // Start a little before the block is fully in view, so it's settled as you read it.
        { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
      );
      document.querySelectorAll("[data-reveal], [data-reveal-stagger]").forEach((element) => observer!.observe(element));
    }

    const header = document.querySelector<HTMLElement>(".landing-header");
    const updateHeader = () => header?.setAttribute("data-scrolled", window.scrollY > 8 ? "true" : "false");
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });

    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", updateHeader);
    };
  }, []);

  return null;
}
