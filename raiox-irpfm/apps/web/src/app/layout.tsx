import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { plex } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Raio-X IRPFM", template: "%s · Raio-X IRPFM" },
  description: "Simulação do impacto da Lei 15.270/2025 na base de clientes do escritório.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#12343b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={plex.variable}>
      <body className="min-h-dvh font-sans">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
