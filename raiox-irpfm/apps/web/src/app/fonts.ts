import localFont from "next/font/local";

/** IBM Plex Sans (OFL-1.1), the same typeface as the client PDF. */
export const plex = localFont({
  variable: "--font-plex",
  display: "swap",
  src: [
    {
      path: "../../node_modules/@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../node_modules/@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../node_modules/@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../node_modules/@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
});
