import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getState } from "@/lib/data";
import { curvePoints, noteRosette, pathD } from "@/lib/rosette";
import { denom, splitStatement } from "@/lib/format";

export const runtime = "nodejs";
export const alt = "Avow: an AI trader on HSK Chain that must swear a falsifiable note before every trade";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  const s = await getState();
  const n = s.notes.find((x) => x.status === "outstanding") ?? s.notes[0];
  const dir = join(process.cwd(), "app", "_og");
  const [bodoni, bodoniItalic, archivo] = await Promise.all([
    readFile(join(dir, "BodoniModa-500.woff")),
    readFile(join(dir, "BodoniModa-500-italic.woff")),
    readFile(join(dir, "Archivo-500.woff")),
  ]);
  const spec = noteRosette(n?.hash ?? "0x00");
  const tones = ["#2b3a57", "#173c30", "#173c30", "#7b6a93", "#2b3a57"];
  const groups = spec.curves
    .map((c, i) => {
      const d = pathD(curvePoints({ ...c, n: Math.min(c.n, 900) }));
      const uses = Array.from({ length: c.copies }, (_, k) => `<path d="${d}" transform="rotate(${(c.rot + k * c.step).toFixed(2)})"/>`).join("");
      return `<g stroke="${tones[i]}" stroke-width="1.1" fill="none">${uses}</g>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-500 -500 1000 1000" width="400" height="400">${groups}</svg>`;
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const d = n ? denom(n.notionalUsd) : { whole: "0", cents: "00" };
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#edf0e8", padding: 28 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            border: "2px solid #173c30",
            outline: "1px solid #173c30",
            background: "#f3f5ee",
            padding: "34px 44px",
            position: "relative",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", marginRight: 40 }}>
            <img src={src} width={400} height={400} alt="" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontFamily: "Archivo", fontSize: 24, color: "#b3341c", letterSpacing: 3 }}>{n?.serial ?? "AVW·000000"}</div>
                <div style={{ fontFamily: "BodoniItalic", fontSize: 64, color: "#173c30", marginTop: 4 }}>Avow</div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", color: "#173c30", fontFamily: "Bodoni" }}>
                <span style={{ fontSize: 34, marginTop: 10 }}>$</span>
                <span style={{ fontSize: 110, lineHeight: 1 }}>{d.whole}</span>
                <span style={{ fontSize: 38, marginTop: 10, textDecoration: "underline" }}>{d.cents}</span>
              </div>
            </div>
            <div style={{ fontFamily: "Bodoni", fontSize: 36, lineHeight: 1.3, color: "#173c30" }}>{n ? splitStatement(n.statement).oath : "Avow swears before it trades."}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Archivo", fontSize: 20, color: "#56645b" }}>
              <span>An AI trader that must swear before it trades</span>
              <span style={{ color: "#2f7d5b" }}>HSK Chain</span>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Bodoni", data: bodoni, style: "normal", weight: 500 },
        { name: "BodoniItalic", data: bodoniItalic, style: "italic", weight: 500 },
        { name: "Archivo", data: archivo, style: "normal", weight: 500 },
      ],
    },
  );
}
