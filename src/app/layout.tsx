import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";

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
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
};

/* Inter: cifras parejas y legibles (antes se pedía pero nunca se cargaba) */
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

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
        </ThemeProvider>
      </body>
    </html>
  )
}
