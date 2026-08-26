import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinanzApp - Tus finanzas personales",
  description: "Controlá tus ingresos, gastos e inversiones",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50">{children}</body>
    </html>
  )
}
