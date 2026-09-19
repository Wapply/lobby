import { networkInterfaces } from "node:os";

/** Returns the first non-internal IPv4 address (the LAN IP). */
export function getLanIp(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

/**
 * Are the given remote address and this host on the same machine?
 * Used to decide whether the folder picker opens on the client's own
 * filesystem (local) or on the server's (remote).
 */
export function isLocalClient(remoteAddr: string | undefined): boolean {
  if (!remoteAddr) return false;
  const ip = remoteAddr.replace(/^::ffff:/, "");
  return ip === "127.0.0.1" || ip === "::1" || ip === getLanIp();
}