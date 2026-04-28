import Script from "next/script";

export const metadata = {
  title: "Widget demo · PraxTalk",
  robots: { index: false, follow: false },
};

/**
 * Internal demo page — embeds the widget on a fake "customer site"
 * so we can test the visitor → operator flow end-to-end.
 *
 * Visit /widget-demo?ws=ws_xxxxxxxxxxxx with your workspace's widgetId
 * (find it in the dashboard inbox empty-state, or in the Convex
 * `workspaces` table).
 */
export default async function WidgetDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ ws?: string }>;
}) {
  const { ws } = await searchParams;

  return (
    <div className="min-h-screen bg-[#fdfaee] text-ink">
      <div className="mx-auto max-w-[720px] px-6 py-20">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-rule-2 bg-paper-2 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
          fake customer site
        </div>
        <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em]">
          Pretend customer website
        </h1>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-[1.55] text-muted">
          This page imitates a third-party site that has installed the
          PraxTalk embed snippet. The chat bubble in the bottom-right corner
          is the widget. Click it, send a message, then switch to{" "}
          <a href="/app" className="font-medium text-ink underline-offset-4 hover:underline">
            /app
          </a>{" "}
          to see it land live.
        </p>

        <div className="mt-10 rounded-2xl border border-rule-2 bg-paper p-6">
          {ws ? (
            <p className="text-sm text-ink">
              Loading widget for workspace:{" "}
              <code className="rounded bg-paper-2 px-2 py-0.5 font-mono text-[12px]">
                {ws}
              </code>
            </p>
          ) : (
            <p className="text-sm text-muted">
              Pass your workspace id as{" "}
              <code className="rounded bg-paper-2 px-2 py-0.5 font-mono text-[12px]">
                ?ws=ws_xxxxxxxxxxxx
              </code>
              . Find it in your dashboard inbox empty-state.
            </p>
          )}
        </div>
      </div>

      {ws && (
        <Script
          src="/widget.js"
          data-workspace-id={ws}
          strategy="afterInteractive"
        />
      )}
    </div>
  );
}
