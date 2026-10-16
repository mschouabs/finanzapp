import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import InstalarApp from "@/components/ui/InstalarApp";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#080D13',
};

export const metadata: Metadata = {
  title: "FinanzApp - Tus finanzas personales",
  description: "Controlá tus ingresos, gastos e inversiones",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "FinanzApp", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
};

/* Geist: grotesca geométrica con cifras tabulares parejas. Se mantiene la variable --font-inter para no tocar el resto del CSS. */
const inter = Geist({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

// Aplica el tema guardado antes del primer paint para evitar el flash de color.
const themeInitScript = `
(function () {
  try {
    var t = localStorage.getItem('userTheme');
    document.documentElement.setAttribute('data-theme', t === 'rosa' ? 'rosa' : 'dark');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'rosa' ? '#FDF6F9' : '#080D13');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ThemeProvider>
          {children}
          <InstalarApp />
        </ThemeProvider>
      </body>
    </html>
  )
}
