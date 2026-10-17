import type { Metadata, Viewport } from "next";
import { Poppins, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "pApAmA — Food Token Platform",
  description: "Turn donations into meals: fund, distribute, redeem, and settle food tokens.",
  // Declaring `icons` suppresses Next's file-convention tags for icon.png and
  // apple-icon.png, so they have to be named here — but NOT favicon.ico, which
  // the convention still emits on its own, and emits better: it fingerprints
  // the URL, which is the only thing that reliably busts the famously sticky
  // favicon cache when the artwork changes. Listing it again here would just
  // add a second, unhashed tag competing with that one.
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

// viewport-fit=cover lets env(safe-area-inset-*) resolve to real values on
// notched phones, so the donor mobile bottom nav clears the home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
