import { ImageResponse } from "next/og";

export const alt = "PraxTalk — Conversations that close themselves";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#F1EFE3",
          color: "#0F1A12",
          padding: 80,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* subtle radial accent in top-right */}
        <div
          style={{
            position: "absolute",
            top: -200,
            right: -200,
            width: 700,
            height: 700,
            borderRadius: 999,
            background:
              "radial-gradient(circle, rgba(224,174,63,0.22), transparent 60%)",
            display: "flex",
          }}
        />

        {/* brand row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#0F1A12",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                background: "#E0AE3F",
              }}
            />
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            PraxTalk
          </div>
        </div>

        {/* headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div
            style={{
              fontSize: 96,
              fontWeight: 600,
              letterSpacing: "-0.045em",
              lineHeight: 0.95,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Conversations that</span>
            <span>
              close{" "}
              <span style={{ color: "#E0AE3F" }}>themselves.</span>
            </span>
          </div>
          <div
            style={{
              fontSize: 28,
              color: "rgba(15,26,18,0.58)",
              maxWidth: 900,
              lineHeight: 1.4,
            }}
          >
            AI-native customer messaging. One inbox for chat, email, WhatsApp,
            voice and in-app — Atlas resolves the rest.
          </div>
        </div>

        {/* footer row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 18,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgba(15,26,18,0.58)",
            borderTop: "1px solid rgba(15,26,18,0.10)",
            paddingTop: 20,
          }}
        >
          <span>praxtalk.com</span>
          <span style={{ color: "#4D7A45" }}>● Open beta · 2026</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
