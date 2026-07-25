import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caja Simplificada",
  description: "Libreta de entradas y salidas con cierre dominical",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
