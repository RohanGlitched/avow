import localFont from "next/font/local";

export const bodoni = localFont({
  src: [
    { path: "./fonts/BodoniModa-opsz.woff2", style: "normal", weight: "400 900" },
    { path: "./fonts/BodoniModa-opsz-italic.woff2", style: "italic", weight: "400 900" },
  ],
  variable: "--font-bodoni",
  display: "swap",
  fallback: ["Didot", "Georgia", "serif"],
});

export const archivo = localFont({
  src: [{ path: "./fonts/Archivo-wdth.woff2", style: "normal", weight: "100 900" }],
  variable: "--font-archivo",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  fallback: ["system-ui", "Helvetica", "Arial", "sans-serif"],
});
