import Script from "next/script";

const GA_MEASUREMENT_ID = "G-QJLG879G82";

/**
 * The Google tag, loaded after the page is interactive.
 *
 * Mounted by `AppProviders` and nowhere else, so it rides with the app's own
 * route trees and never with `/learn` — an activity frame firing its own
 * pageviews would double-count every session.
 */
export function GoogleAnalytics() {
  return (
    <>
      {/* Google tag (gtag.js) */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>
    </>
  );
}
