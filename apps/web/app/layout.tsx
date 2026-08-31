import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Product Knowledge Base",
  description: "Internal verification UI for catalog search and enrichment",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <a href="/" className="brand">
              Product Knowledge Base
            </a>
            <nav>
              <a href="/search">Search</a>
              <a href="/review">Review</a>
              <a href="/refresh">Refresh</a>
              <a href="/ingest">Ingest</a>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
