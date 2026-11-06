"use client";

/**
 * Last-resort boundary when the root layout itself fails. It replaces the
 * whole document, so it cannot rely on global CSS — styles are inline.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          background: "#f7fbfb",
          color: "#14282b",
        }}
      >
        <title>Something went wrong · iSmile CRM</title>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <p style={{ fontWeight: 600, color: "#1f7f86", margin: 0 }}>iSmile CRM</p>
          <h1 style={{ fontSize: 20, margin: "16px 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#4b6266", margin: "0 0 20px" }}>
            The application hit an unexpected problem. Please try again in a moment.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={() => retry()}
              style={{ background: "#1f7f86", color: "#fff", border: 0, borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}
            >
              Try again
            </button>
            {/* Plain anchor on purpose: the router may be what failed. */}
            <a href="/dashboard" style={{ border: "1px solid #cfe0e1", borderRadius: 8, padding: "8px 14px", color: "inherit", textDecoration: "none" }}>
              Reload dashboard
            </a>
          </div>
          {digest ? <p style={{ fontFamily: "monospace", fontSize: 12, color: "#6b8084", marginTop: 20 }}>Reference: {digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
