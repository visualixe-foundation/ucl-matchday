import type { Metadata, Viewport } from "next";
import { Oswald, Inter } from "next/font/google";
import "./globals.css";
import MobileNav from "./components/MobileNav";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display"
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  title: {
    default: "Matchday — UEFA Champions League",
    template: "%s · Matchday"
  },
  description:
    "Fixtures, live scores, standings, lineups and highlights for the UEFA Champions League.",
  applicationName: "UCL Matchday",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "UCL Matchday"
  },
  openGraph: {
    title: "Matchday — UEFA Champions League",
    description:
      "Fixtures, live scores, standings and highlights for the Champions League.",
    siteName: "UCL Matchday",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Matchday — UEFA Champions League",
    description:
      "Fixtures, live scores, standings and highlights for the Champions League."
  }
};

export const viewport: Viewport = {
  themeColor: "#0b1f17",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${oswald.variable} ${inter.variable}`}>
        <header className="site-header">
          <div className="wrap site-header__inner">
            <a href="/" className="wordmark">
              Matchday <span className="wordmark__sub">Champions League</span>
            </a>
            <nav className="site-nav">
              <a href="/">Fixtures &amp; Scores</a>
              <a href="/standings">Standings</a>
              <a href="/results">Highlights</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap site-footer__inner">
            <p className="site-footer__copy">
              © {new Date().getFullYear()}{" "}
              <a
                href="https://visualixe-foundation.vercel.app/"
                className="site-footer__link"
                target="_blank"
                rel="noopener noreferrer"
              >
                Visualixe Foundation
              </a>
              . All rights reserved.
            </p>
            <p className="site-footer__tagline">Built with purpose</p>
            <p className="site-footer__credit">
              Scores via Highlightly. Not affiliated with UEFA.
            </p>
          </div>
        </footer>
        <MobileNav />
      </body>
    </html>
  );
}
