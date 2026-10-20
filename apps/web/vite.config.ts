import os from 'node:os';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Virtual adapters (Docker, WSL, VirtualBox, VPN…) that phones on the Wi-Fi can't reach. */
const VIRTUAL_IFACE =
  /vethernet|virtualbox|vmware|vmnet|docker|br-|veth|wsl|hyper-v|tailscale|zerotier|utun|tun|tap/i;

/** Home Wi-Fi is almost always 192.168.x, then 10.x, then 172.16–31.x. */
function lanScore(address: string): number {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  return 3;
}

/**
 * IPv4 addresses of this PC on the local network, best first. Injected into the web app so the
 * host lobby QR code can point phones at the PC when the host page was opened on `localhost`.
 */
function lanHosts(): string[] {
  const found: { address: string; score: number }[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      const score = lanScore(a.address) + (VIRTUAL_IFACE.test(name) ? 10 : 0);
      found.push({ address: a.address, score });
    }
  }
  return found.sort((a, b) => a.score - b.score).map((f) => f.address);
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '../..',
  server: { port: 5173 },
  define: { __LAN_HOSTS__: JSON.stringify(lanHosts()) },
});
