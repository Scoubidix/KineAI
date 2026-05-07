"use client";

import Script from "next/script";

const GA_MEASUREMENT_ID = "G-GBTWG7QZGL";
const COOKIE_NAME = "cookie_consent";

function getInitialConsent(): "granted" | "denied" {
  if (typeof document === "undefined") return "denied";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE_NAME}=`));
  return match?.split("=")[1] === "granted" ? "granted" : "denied";
}

export default function Analytics() {
  const initialConsent = getInitialConsent();

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;

          gtag('consent', 'default', {
            analytics_storage: '${initialConsent}',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            wait_for_update: 500
          });

          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', {
            anonymize_ip: true,
            allow_google_signals: false,
            allow_ad_personalization_signals: false
          });
        `}
      </Script>
    </>
  );
}
