import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // Stable install identity: without an explicit id the browser derives it
    // from start_url, which would silently change if start_url ever does.
    id: "/",
    name: "Householder",
    short_name: "Householder",
    description: "Shared shopping lists for your household",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0709",
    theme_color: "#0d0709",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
