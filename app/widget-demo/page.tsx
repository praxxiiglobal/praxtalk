/**
 * Internal demo page — embeds the widget on a fake "customer site"
 * so we can test the visitor → operator flow end-to-end.
 *
 * Visit /widget-demo?ws=ws_xxxxxxxxxxxx with your workspace's widgetId.
 * (Find it in the dashboard inbox empty-state, or in the Convex
 * `workspaces` table.)
 */
export default async function WidgetDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ ws?: string }>;
}) {
  const { ws } = await searchParams;

  return (
    <html lang="en">
      <head>
        <title>Widget demo · PraxTalk</title>
        <meta name="robots" content="noindex" />
        <style>{`
          body { margin: 0; font-family: system-ui, sans-serif; background: #f6f5ed; color: #2a2a26; }
          .wrap { max-width: 720px; margin: 80px auto; padding: 0 24px; }
          h1 { font-size: 36px; letter-spacing: -0.02em; margin: 0 0 16px; }
          p { line-height: 1.55; color: #5a5a52; }
          code { background: #ebe8d8; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
          .card { margin-top: 32px; padding: 24px; border-radius: 16px; background: #fff; border: 1px solid rgba(0,0,0,0.06); }
        `}</style>
      </head>
      <body>
        <div className="wrap">
          <h1>Pretend customer website</h1>
          <p>
            This is a sample page that loads the PraxTalk widget. The chat
            bubble in the bottom-right corner is the embeddable widget.
            Click it, send a message, and watch it appear live in your{" "}
            <a href="/app">/app</a> inbox.
          </p>
          <div className="card">
            {ws ? (
              <p>
                Loading widget for workspace: <code>{ws}</code>
              </p>
            ) : (
              <p>
                Pass your workspace id as <code>?ws=ws_xxxxxxxxxxxx</code>.
                Find it in your dashboard inbox empty-state.
              </p>
            )}
          </div>
        </div>
        {ws && (
          <script
            src="/widget.js"
            data-workspace-id={ws}
            defer
          />
        )}
      </body>
    </html>
  );
}
