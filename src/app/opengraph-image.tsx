import { ImageResponse } from "next/og";

export const alt = "Instanton Campus — Run your education institute in one app";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#006a60", color: "white" }}>
        <div style={{ fontSize: 44, fontWeight: 800, opacity: 0.85 }}>Instanton Campus</div>
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.1, marginTop: 24 }}>Run your education institute in one app</div>
        <div style={{ fontSize: 34, marginTop: 28, opacity: 0.85 }}>Classes · Fees · Exams · Parent updates</div>
      </div>
    ),
    size,
  );
}
