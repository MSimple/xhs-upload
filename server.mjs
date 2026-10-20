import http from "node:http";
import next from "next";

const args = process.argv.slice(2);
const dev = args.includes("--dev") || process.env.NODE_ENV === "development";
const hostIndex = args.indexOf("--host");
const host =
  (hostIndex >= 0 ? args[hostIndex + 1] : "") ||
  process.env.HOST ||
  "127.0.0.1";
const portIndex = args.indexOf("--port");
const port = Number(
  (portIndex >= 0 ? args[portIndex + 1] : "") || process.env.PORT || 3000
);
const token = (process.env.XHS_ACCESS_TOKEN || "").trim();

const app = next({ dev, hostname: host, port });

function isLoopback(address) {
  if (!address) return false;
  const value = address.replace(/^::ffff:/, "");
  return value === "127.0.0.1" || value === "::1" || value === "localhost";
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

function securityHeaders() {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
  return {
    "Content-Security-Policy": csp,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=()",
  };
}

function sendJson(res, status, message) {
  const body = JSON.stringify({ error: message });
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

await app.prepare();
const handle = app.getRequestHandler();
const upgradeHandler = app.getUpgradeHandler();

const server = http.createServer(async (req, res) => {
  try {
    for (const [key, value] of Object.entries(securityHeaders())) {
      res.setHeader(key, value);
    }

    const url = new URL(req.url || "/", "http://localhost");
    let pathname = url.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      // use raw path
    }
    const isApi = pathname.startsWith("/api/");
    const isNextAsset =
      pathname.startsWith("/_next/") ||
      pathname === "/icon.svg" ||
      pathname === "/favicon.ico" ||
      pathname === "/robots.txt";
    const isAuthPath =
      pathname === "/login" || pathname.startsWith("/api/auth/");
    const local = isLoopback(req.socket.remoteAddress);
    const cookies = parseCookies(req.headers.cookie);
    const authenticated = Boolean(token) && cookies.xhs_access === token;

    if (!token && !local) {
      if (isApi) return sendJson(res, 403, "服务默认只允许本机访问。远程访问请设置 XHS_ACCESS_TOKEN。");
      res.statusCode = 403;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end(
        "服务默认只允许本机访问。需要手机或局域网访问时，请设置环境变量 XHS_ACCESS_TOKEN 后重启服务。"
      );
    }

    if (token && !authenticated && !isAuthPath && !isNextAsset) {
      if (isApi) return sendJson(res, 401, "需要访问令牌，请先登录");
      const nextPath = `${pathname}${url.search || ""}`;
      res.statusCode = 307;
      res.setHeader(
        "Location",
        `/login?next=${encodeURIComponent(nextPath)}`
      );
      res.setHeader("Cache-Control", "no-store");
      return res.end();
    }

    if (isApi && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method || "")) {
      const origin = req.headers.origin;
      if (origin) {
        try {
          const originUrl = new URL(origin);
          if (originUrl.host !== req.headers.host) {
            return sendJson(res, 403, "请求来源校验失败");
          }
        } catch {
          return sendJson(res, 403, "请求来源校验失败");
        }
      }
      const fetchSite = req.headers["sec-fetch-site"];
      if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
        return sendJson(res, 403, "跨站请求已被拒绝");
      }
    }

    await handle(req, res);
  } catch (error) {
    console.error("[server] request failed:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("服务器内部错误");
    } else {
      res.destroy();
    }
  }
});

server.on("upgrade", (req, socket, head) => {
  try {
    upgradeHandler(req, socket, head);
  } catch (error) {
    console.error("[server] upgrade failed:", error);
    socket.destroy();
  }
});

server.listen(port, host, () => {
  console.log(
    `[server] 薯光工坊已启动：http://${host}:${port}（${
      dev ? "development" : "production"
    }）`
  );
  if (token) {
    console.log("[server] 访问令牌已启用：远程访问需要 XHS_ACCESS_TOKEN");
  } else {
    console.log("[server] 未设置 XHS_ACCESS_TOKEN：仅允许本机访问");
  }
});
