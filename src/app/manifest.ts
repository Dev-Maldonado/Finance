import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "FINORA — Seu dinheiro, com clareza", short_name: "FINORA", lang: "pt-BR",
    description: "Seu espaço financeiro: contas, cartões, caixinhas e investimentos.",
    start_url: "/", scope: "/", display: "standalone", background_color: "#f7f8fc", theme_color: "#f7f8fc",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
