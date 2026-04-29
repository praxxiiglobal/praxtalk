"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { useSelectedBrand } from "../useSelectedBrand";
import { Card } from "../PageHeader";

type Channel = "web_chat" | "email" | "whatsapp" | "voice";

const channelLabels: Record<Channel, string> = {
  web_chat: "Web chat",
  email: "Email",
  whatsapp: "WhatsApp",
  voice: "Voice",
};

const channelColors: Record<Channel, string> = {
  web_chat: "bg-ink",
  email: "bg-accent-deep",
  whatsapp: "bg-good",
  voice: "bg-warn",
};

export function AnalyticsView() {
  const { sessionToken } = useDashboardAuth();
  const selectedBrand = useSelectedBrand();
  const data = useQuery(api.analytics.overview, {
    sessionToken,
    brandId: selectedBrand ?? undefined,
    days: 14,
  });

  if (!data) {
    return (
      <Card>
        <div className="py-8 text-center text-sm text-muted">Loading…</div>
      </Card>
    );
  }

  const {
    totals,
    volumePerDay,
    channelMix,
    atlasBreakdown,
  } = data;

  const conversationDelta =
    totals.conversationsPrev === 0
      ? totals.conversations === 0
        ? 0
        : 100
      : Math.round(
          ((totals.conversations - totals.conversationsPrev) /
            totals.conversationsPrev) *
            100,
        );

  const totalReplies = totals.atlasAutoReplied + totals.operatorReplied;
  const aiPct = Math.round(totals.atlasResolutionRate * 100);

  const stats = [
    {
      label: "Conversations",
      value: totals.conversations.toLocaleString(),
      delta:
        totals.conversationsPrev === 0
          ? "no prior data"
          : `${conversationDelta >= 0 ? "+" : ""}${conversationDelta}% vs prev 14d`,
      positive: conversationDelta >= 0,
    },
    {
      label: "AI resolution rate",
      value: totalReplies === 0 ? "—" : `${aiPct}%`,
      delta:
        totalReplies === 0
          ? "no replies yet"
          : `${totals.atlasAutoReplied} of ${totalReplies} replies`,
      positive: aiPct >= 50,
    },
    {
      label: "Median first response",
      value: formatDuration(totals.medianFirstResponseSeconds),
      delta:
        totals.medianFirstResponseSeconds === null
          ? "no data"
          : "across replied conversations",
      positive: true,
    },
    {
      label: "Atlas auto-replies",
      value: totals.atlasAutoReplied.toLocaleString(),
      delta:
        totals.atlasAutoReplied === 0
          ? "Atlas hasn't run"
          : `${atlasBreakdown.drafted} drafts pending`,
      positive: totals.atlasAutoReplied > 0,
    },
  ];

  const maxVolume = Math.max(...volumePerDay.map((d) => d.conversations), 1);
  const channelTotal = channelMix.reduce((s, c) => s + c.count, 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-rule bg-paper p-5"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              {s.label}
            </div>
            <div className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-ink">
              {s.value}
            </div>
            <div
              className={
                "mt-1 font-mono text-[11px] " +
                (s.positive ? "text-good" : "text-muted")
              }
            >
              {s.delta}
            </div>
          </div>
        ))}
      </div>

      <Card
        title="Conversation volume"
        description="Last 14 days. Each bar is one day's new conversations."
      >
        {totals.conversations === 0 ? (
          <div className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-muted">
            No conversations in the last 14 days yet. Once your widget is
            embedded and visitors send messages, you'll see volume land here.
          </div>
        ) : (
          <>
            <div className="flex h-44 items-end gap-1.5 sm:gap-2">
              {volumePerDay.map((d, i) => {
                const h = (d.conversations / maxVolume) * 100;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-t-md bg-ink/85 transition hover:bg-ink"
                    style={{ height: `${Math.max(h, 2)}%` }}
                    title={`${new Date(d.day).toLocaleDateString()}: ${d.conversations} conversations`}
                  />
                );
              })}
            </div>
            <div className="mt-3 flex justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              <span>14d ago</span>
              <span>today</span>
            </div>
          </>
        )}
      </Card>

      <Card
        title="Channel mix"
        description="Where conversations originate. Live counts from the channel field on every conversation."
      >
        {channelTotal === 0 ? (
          <div className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-muted">
            No conversations yet — channel mix will populate as messages
            arrive on web chat, email, WhatsApp, and voice.
          </div>
        ) : (
          <div className="space-y-3">
            {channelMix.map((c) => (
              <div key={c.channel}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-ink">{channelLabels[c.channel as Channel]}</span>
                  <span className="font-mono text-[12px] text-muted">
                    {c.count} · {Math.round(c.pct * 100)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-paper-2">
                  <div
                    className={"h-full " + channelColors[c.channel as Channel]}
                    style={{ width: `${Math.max(c.pct * 100, 1)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Atlas resolution breakdown"
        description="Every Atlas run in the last 14 days, by outcome."
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat
            label="Auto-replied"
            value={atlasBreakdown.autoReplied.toLocaleString()}
            tone="good"
          />
          <Stat
            label="Drafted"
            value={atlasBreakdown.drafted.toLocaleString()}
            tone="default"
          />
          <Stat
            label="Skipped (no config)"
            value={atlasBreakdown.skippedNoConfig.toLocaleString()}
            tone="muted"
          />
          <Stat
            label="Failed"
            value={atlasBreakdown.failed.toLocaleString()}
            tone="warn"
          />
        </div>
      </Card>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "default" | "muted";
}) {
  const toneCls =
    tone === "good"
      ? "text-good"
      : tone === "warn"
        ? "text-warn"
        : tone === "muted"
          ? "text-muted"
          : "text-ink";
  return (
    <div className="rounded-xl border border-rule bg-paper-2/40 p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
        {label}
      </div>
      <div
        className={"mt-1 text-2xl font-semibold tracking-[-0.02em] " + toneCls}
      >
        {value}
      </div>
    </div>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
