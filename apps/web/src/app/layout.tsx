import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Sora } from "next/font/google";
import "./globals.css";

const display = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display-loaded",
});

const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body-loaded",
});

export const metadata: Metadata = {
  title: "Cool Meals Leads · Dashboard",
  description:
    "Panel interno MVP: pipeline, distribuidores y conocimiento",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${display.variable} ${body.variable}`}>
        <style>{`
          :root {
            --font-display: var(--font-display-loaded), "Sora", sans-serif;
            --font-body: var(--font-body-loaded), "Plus Jakarta Sans", sans-serif;
          }
        `}</style>
        {children}
      </body>
    </html>
  );
}
