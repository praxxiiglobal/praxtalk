import { ImageResponse } from "next/og";

/**
 * 180×180 apple-touch-icon. Same mark as app/icon.tsx (PraxTalk
 * green-on-yellow disc with the PraxTalk speech-tail), scaled up.
 * Without this file Next 16 returns 404 for /apple-icon and the
 * webmanifest entry pointing at it logs a console warning.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0F1A12",
          borderRadius: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: 999,
            background: "#E0AE3F",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            width: 0,
            height: 0,
            borderTop: "44px solid transparent",
            borderRight: "44px solid #0F1A12",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
