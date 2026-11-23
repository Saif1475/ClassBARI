import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Instanton Campus",
    short_name: "Instanton",
    description: "Classes, fees, exams and parent updates in one app.",
    start_url: "/login",
    scope: "/",
    lang: "en",
    orientation: "portrait",
    categories: ["education"],
    display: "standalone",
    background_color: "#eef7f4",
    theme_color: "#006a60",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
