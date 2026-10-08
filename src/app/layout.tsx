import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FINORA — Seu dinheiro, com clareza",
  description:
    "Gestão financeira, caixinhas CDI e investimentos com informações transparentes.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
