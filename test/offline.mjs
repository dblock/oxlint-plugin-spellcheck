import net from "node:net";
import tls from "node:tls";

function forbidden() {
  throw new Error(
    "Runtime network access is forbidden in spellcheck acceptance tests.",
  );
}

net.Socket.prototype.connect = forbidden;
tls.connect = forbidden;
globalThis.fetch = forbidden;
