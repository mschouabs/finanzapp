import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "FinanzApp - Tus finanzas personales",
  description: "ControlÃ¡ tus ingresos, gastos e inversiones",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
