import { Fraunces, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";

export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  // Variable axes: wght + opsz + SOFT + WONK
  // wonk=1 is applied at ≥40px via CSS (see globals.css); next/font loads the full variable file
  axes: ["SOFT", "WONK"],
});

export const switzer = localFont({
  src: "../public/fonts/switzer/Switzer-Variable.woff2",
  variable: "--font-switzer",
  display: "swap",
  weight: "100 900",
});

export const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});
