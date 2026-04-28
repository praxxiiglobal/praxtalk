import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0F1A12",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            background: "#E0AE3F",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 2,
            bottom: 2,
            width: 0,
            height: 0,
            borderTop: "8px solid transparent",
            borderRight: "8px solid #0F1A12",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
