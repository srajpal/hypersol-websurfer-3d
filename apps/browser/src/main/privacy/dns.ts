import type { DnsMode } from '../../shared/settings';
import type { DnsStatus } from '../../shared/privacy';
import { discardBody, readLimited } from '../favicon';

/** The encrypted DNS resolver (ARCHITECTURE.md section 4): Quad9, a non-profit with a no-logging policy. */
export const QUAD9 = 'https://dns.quad9.net/dns-query';

/** How long the reachability check waits for the resolver. */
export const PROBE_TIMEOUT_MS = 5000;
/** The name the reachability check asks about: the resolver's own. */
const PROBE_NAME = 'dns.quad9.net';

/** A DNS question for a name's IPv4 addresses, in the wire format DNS over HTTPS carries (RFC 8484). */
export function dnsQuery(name: string): Uint8Array {
  const labels = name.split('.').filter(Boolean);
  const bytes: number[] = [0, 0, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0]; // id 0, recursion desired, one question
  for (const label of labels) {
    const chars = [...new TextEncoder().encode(label)];
    if (chars.length === 0 || chars.length > 63) throw new Error(`Bad DNS name: ${name}`);
    bytes.push(chars.length, ...chars);
  }
  bytes.push(0, 0, 1, 0, 1); // end of name, type A, class IN
  return new Uint8Array(bytes);
}

export function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** True if the bytes are a DNS answer to one question (not, say, a captive portal's web page). */
export function isDnsAnswer(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const isResponse = (bytes[2]! & 0x80) !== 0;
  const questions = (bytes[4]! << 8) | bytes[5]!;
  return isResponse && questions === 1;
}

export type Fetcher = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

/**
 * Encrypted DNS. Applies the setting (Secure: the resolver only; Automatic:
 * the resolver where possible, else the network's own DNS), and after a
 * lookup fails in Secure mode, checks whether the resolver can be reached
 * at all, so a network that blocks it gets its own explanation and the
 * choice to use the network's DNS until the app closes.
 */
export class DnsControl {
  private mode: DnsMode = 'secure';
  private networkForSession = false;

  constructor(
    /** Puts a mode into effect (Electron's app.configureHostResolver). */
    private readonly apply: (mode: 'secure' | 'automatic', resolver: string) => void,
    private readonly fetcher: Fetcher,
    private readonly resolver = QUAD9,
    /** Where the reachability check asks; null skips the check (tests without their own resolver). */
    private readonly probeUrl: string | null = resolver,
  ) {}

  get effective(): 'secure' | 'automatic' {
    return this.networkForSession ? 'automatic' : this.mode;
  }

  status(): DnsStatus {
    return { resolver: this.resolver, effective: this.effective, networkForSession: this.networkForSession };
  }

  /** Applies the saved setting; "use this network's DNS" still holds until the app closes. */
  setMode(mode: DnsMode): void {
    this.mode = mode;
    this.apply(this.effective, this.resolver);
  }

  /** "Use this network's DNS for now": Automatic until the app closes. */
  useNetwork(): DnsStatus {
    this.networkForSession = true;
    this.apply(this.effective, this.resolver);
    return this.status();
  }

  /** After a failed lookup: 'blocked' if the resolver cannot be reached. */
  async check(): Promise<'reachable' | 'blocked' | 'not-secure'> {
    if (this.effective !== 'secure') return 'not-secure';
    if (this.probeUrl === null) return 'reachable';
    const url = `${this.probeUrl}?dns=${base64Url(dnsQuery(PROBE_NAME))}`;
    try {
      const response = await this.fetcher(url, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        headers: { accept: 'application/dns-message' },
      });
      if (!response.ok) {
        await discardBody(response);
        return 'blocked';
      }
      return isDnsAnswer(await readLimited(response, 64 * 1024)) ? 'reachable' : 'blocked';
    } catch {
      return 'blocked';
    }
  }
}
