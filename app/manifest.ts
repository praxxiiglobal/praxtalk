import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PraxTalk",
    short_name: "PraxTalk",
    description:
      "AI-native customer messaging — one inbox for chat, email, WhatsApp, voice and in-app.",
    start_url: "/app",
    display: "standalone",
    background_color: "#F1EFE3",
    theme_color: "#0F1A12",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
