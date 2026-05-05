/**
 * SSRF host filter shared between Atlas KB ingest (convex/atlas.ts)
 * and outbound webhook delivery (convex/webhooks.ts). Synchronous —
 * checks IP literals + well-known cloud metadata hostnames. Hostnames
 * that resolve to private IPs via DNS are NOT caught here; the
 * caller is expected to do a DoH-based resolve+filter before issuing
 * the actual fetch.
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
