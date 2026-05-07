"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";

const COOKIE_NAME = "cookie_consent";
const COOKIE_MAX_AGE_DAYS = 180;

type ConsentValue = "granted" | "denied";

function readConsent(): ConsentValue | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const value = match.split("=")[1];
  return value === "granted" || value === "denied" ? value : null;
}

function writeConsent(value: ConsentValue) {
  if (typeof document === "undefined") return;
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  const isHttps = window.location.protocol === "https:";
  const secureFlag = isHttps ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=${value}; max-age=${maxAge}; path=/; SameSite=Lax${secureFlag}`;
}

function updateGtagConsent(value: ConsentValue) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("consent", "update", {
    analytics_storage: value === "granted" ? "granted" : "denied",
  });
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const existing = readConsent();
    if (!existing) {
      setVisible(true);
    }
  }, []);

  const handleChoice = (value: ConsentValue) => {
    writeConsent(value);
    updateGtagConsent(value);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Consentement aux cookies"
      className="fixed bottom-0 left-0 right-0 z-[60] border-t border-border bg-background/95 backdrop-blur-sm shadow-lg"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <Cookie
            className="mt-0.5 h-5 w-5 shrink-0 text-teal-600"
            aria-hidden="true"
          />
          <div className="text-sm text-foreground">
            <p className="font-semibold">Vos préférences de confidentialité</p>
            <p className="mt-1 text-muted-foreground">
              Nous utilisons des cookies pour améliorer votre expérience et
              mesurer l&apos;audience du site. Vous pouvez accepter ou refuser, et
              modifier votre choix à tout moment.{" "}
              <a
                href="/legal/politique-confidentialite.html"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                En savoir plus
              </a>
              .
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 sm:gap-3">
          <Button
            variant="outline"
            onClick={() => handleChoice("denied")}
            className="flex-1 sm:flex-none"
          >
            Refuser
          </Button>
          <Button
            onClick={() => handleChoice("granted")}
            className="flex-1 bg-teal-600 text-white hover:bg-teal-700 sm:flex-none"
          >
            Accepter
          </Button>
        </div>
      </div>
    </div>
  );
}
