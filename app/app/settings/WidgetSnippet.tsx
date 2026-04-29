import Link from "next/link";
import { Card } from "../PageHeader";

/**
 * Widget snippet now lives per-brand at `/app/brands` — each brand has
 * its own widgetId and theming, so there isn't a single "workspace"
 * snippet anymore. This card just nudges operators to the right place.
 */
export function WidgetSnippet() {
  return (
    <Card title="Widget snippets">
      <p className="text-sm leading-[1.55] text-muted">
        Each brand has its own widget snippet. Open{" "}
        <Link
          href="/app/brands"
          className="font-medium text-ink underline-offset-2 hover:underline"
        >
          /app/brands
        </Link>{" "}
        to copy the embed code for any brand.
      </p>
    </Card>
  );
}
