/**
 * SSRF host filter shared between Atlas KB ingest (convex/atlas.ts)
 * and outbound webhook delivery (convex/webhooks.ts). The synchronous
 * `isPrivateHost` checks IP literals + well-known cloud metadata
 * hostnames; the async `isDohSafe` resolves the hostname through
 * Cloudflare DoH and rejects if any A/AAAA record points at a
 * private range (DNS rebinding defence). Both legs run before any
 * fetch.
 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost") return true;
  if (h === "metadata.google.internal") return true;
  if (h === "metadata.azure.com") return true;

  // IPv4 literal — block private ranges + link-local + loopback + null.
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 0) return true;                                  // 0.0.0.0/8
    if (a === 10) return true;                                 // 10.0.0.0/8
    if (a === 127) return true;                                // loopback
    if (a === 169 && b === 254) return true;                   // link-local incl. AWS/GCP metadata
    if (a === 172 && b >= 16 && b <= 31) return true;          // RFC1918
    if (a === 192 && b === 168) return true;                   // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true;         // CGNAT
    return false;
  }

  // IPv6 — strip brackets if present, then run the same checks against
  // the unbracketed literal. URL.hostname returns "::1" without brackets
  // on Node, so we must NOT key off the leading "[".
  const v6 = h.startsWith("[") ? h.slice(1, h.lastIndexOf("]")) : h;
  if (v6.includes(":")) {
    if (v6 === "::" || v6 === "::1") return true;
    if (v6.startsWith("fe80:") || v6.startsWith("fe80::")) return true;
    // Unique-local: fc00::/7 covers fc.. and fd..
    if (/^fc[0-9a-f]{0,2}:/i.test(v6) || /^fd[0-9a-f]{0,2}:/i.test(v6)) {
      return true;
    }
    // IPv4-mapped IPv6 form ::ffff:127.0.0.1
    const mapped = v6.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
    if (mapped && isPrivateHost(mapped[1])) return true;
  }
  return false;
}

/**
 * Resolve `hostname` via Cloudflare DNS-over-HTTPS and refuse if any
 * A/AAAA record points at a private range. This catches the case
 * isPrivateHost can't — a public-looking name (`evil.example.com`)
 * whose authoritative DNS returns a private IP.
 *
 * Fail-closed on resolver error or "no records" so a transient blip
 * doesn't accidentally allow unsafe fetches. Callers should pass a
 * cache when they make many calls within a single action lifetime
 * (the Atlas crawler hits dozens of URLs against the same host).
 * Webhook deliveries don't share a cache between calls so they
 * resolve fresh, which is correct for DNS-rebinding defence anyway.
 */
export async function isDohSafe(
  hostname: string,
  cache?: Map<string, boolean>,
): Promise<boolean> {
  // IP literals are already filtered by isPrivateHost; skip DoH for
  // those (Cloudflare DoH refuses non-name queries anyway).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  if (hostname.startsWith("[")) return true;
  if (cache) {
    const cached = cache.get(hostname);
    if (cached !== undefined) return cached;
  }

  let aOk = false;
  let aaaaOk = false;
  type DnsAnswer = { type?: number; data?: string };
  let aAnswers: DnsAnswer[] = [];
  let aaaaAnswers: DnsAnswer[] = [];
  try {
    const [aRes, aaaaRes] = await Promise.all([
      fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
        {
          headers: { accept: "application/dns-json" },
          signal: AbortSignal.timeout(5_000),
        },
      ),
      fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=AAAA`,
        {
          headers: { accept: "application/dns-json" },
          signal: AbortSignal.timeout(5_000),
        },
      ),
    ]);
    if (aRes.ok) {
      aOk = true;
      const j = (await aRes.json()) as { Answer?: DnsAnswer[] };
      aAnswers = j.Answer ?? [];
    }
    if (aaaaRes.ok) {
      aaaaOk = true;
      const j = (await aaaaRes.json()) as { Answer?: DnsAnswer[] };
      aaaaAnswers = j.Answer ?? [];
    }
  } catch (err) {
    console.warn("[ssrf-doh] resolver error for", hostname, "— refusing", err);
    return false;
  }

  if (!aOk && !aaaaOk) {
    console.warn("[ssrf-doh] both A+AAAA non-ok for", hostname, "— refusing");
    return false;
  }

  const ips: string[] = [];
  for (const ans of [...aAnswers, ...aaaaAnswers]) {
    if (typeof ans.data === "string") ips.push(ans.data);
  }
  if (ips.length === 0) {
    console.warn("[ssrf-doh] no DNS records for", hostname);
    return false;
  }
  for (const ip of ips) {
    if (isPrivateHost(ip) || isPrivateHost(`[${ip}]`)) {
      console.warn("[ssrf-doh] refused", hostname, "→", ip);
      cache?.set(hostname, false);
      return false;
    }
  }
  cache?.set(hostname, true);
  return true;
}
