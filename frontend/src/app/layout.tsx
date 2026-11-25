import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "WorkSphere", description: "Multi-tenant project management and workflow automation" };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
