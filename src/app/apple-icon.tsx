import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
        <svg width="130" height="130" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="20" fill="#5FD0EB" />
          <path d="M8 22c4-9 13-11 24-6-5 1-8 3-10 6 3-1 6-1 9 1-5 7-14 8-23-1z" fill="#fff" />
        </svg>
      </div>
    ),
    size,
  );
}
