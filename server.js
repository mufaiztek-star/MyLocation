const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const sessions = new Map();

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `localhost:${PORT}`}`);
  const pathname = requestUrl.pathname;

  try {
    if (pathname === "/api/health" && request.method === "GET") {
      return sendJson(response, 200, { ok: true, uptime: process.uptime() });
    }

    if (pathname === "/api/sessions" && request.method === "POST") {
      return handleCreateSession(request, response, requestUrl);
    }

    const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch && request.method === "GET") {
      return handleGetSession(response, requestUrl, decodeURIComponent(sessionMatch[1]));
    }

    const sessionStreamMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/stream$/);
    if (sessionStreamMatch && request.method === "GET") {
      return handleStream(response, requestUrl, decodeURIComponent(sessionStreamMatch[1]));
    }

    const sessionLocationMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/location$/);
    if (sessionLocationMatch && request.method === "POST") {
      return handleTargetLocation(request, response, requestUrl, decodeURIComponent(sessionLocationMatch[1]));
    }

    const sessionStatusMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/target-status$/);
    if (sessionStatusMatch && request.method === "POST") {
      return handleTargetStatus(request, response, requestUrl, decodeURIComponent(sessionStatusMatch[1]));
    }

    if (pathname === "/" || pathname === "/index.html") {
      return serveStaticFile(response, path.join(ROOT, "index.html"));
    }

    if (["/app.js", "/style.css", "/README.md"].includes(pathname)) {
      return serveStaticFile(response, path.join(ROOT, pathname.slice(1)));
    }

    return sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Location Tracker server running at http://localhost:${PORT}`);
});

setInterval(() => {
  const expirationMs = 1000 * 60 * 60 * 24;
  for (const [sessionId, session] of sessions.entries()) {
    if (Date.now() - session.createdAt > expirationMs) {
      for (const client of session.clients) {
        client.end();
      }
      sessions.delete(sessionId);
    }
  }
}, 1000 * 60 * 10);

async function handleCreateSession(request, response, requestUrl) {
  const body = await readJson(request);
  const hostName = String(body.hostName || "").trim();
  const targetName = String(body.targetName || "").trim();
  const targetEmail = String(body.targetEmail || "").trim();

  if (!hostName || !targetName || !targetEmail) {
    return sendJson(response, 400, { error: "Host name, target name, and target email are required." });
  }

  const id = crypto.randomUUID();
  const hostKey = crypto.randomBytes(18).toString("hex");
  const targetToken = crypto.randomBytes(18).toString("hex");
  const origin = getOrigin(requestUrl, request);

  const session = {
    id,
    hostKey,
    targetToken,
    hostName,
    targetName,
    targetEmail,
    createdAt: Date.now(),
    targetSharing: false,
    latestTargetLocation: null,
    activity: [],
    clients: new Set(),
  };

  addSessionActivity(session, `${hostName} created a tracking session for ${targetName}.`, "Host");
  sessions.set(id, session);

  return sendJson(response, 201, serializeHostSession(session, origin));
}

function handleGetSession(response, requestUrl, sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return sendJson(response, 404, { error: "Session not found." });
  }

  const origin = `${requestUrl.protocol}//${requestUrl.host}`;
  const hostKey = requestUrl.searchParams.get("hostKey");
  const token = requestUrl.searchParams.get("token");

  if (hostKey && hostKey === session.hostKey) {
    return sendJson(response, 200, serializeHostSession(session, origin));
  }

  if (token && token === session.targetToken) {
    return sendJson(response, 200, serializeTargetSession(session));
  }

  return sendJson(response, 403, { error: "Invalid session credentials." });
}

function handleStream(response, requestUrl, sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return sendJson(response, 404, { error: "Session not found." });
  }

  const hostKey = requestUrl.searchParams.get("hostKey");
  if (!hostKey || hostKey !== session.hostKey) {
    return sendJson(response, 403, { error: "Invalid host key." });
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  response.write(": connected\n\n");
  session.clients.add(response);

  writeEvent(response, "snapshot", {
    latestTargetLocation: session.latestTargetLocation,
    activity: session.activity.slice(0, 12),
  });

  const heartbeat = setInterval(() => {
    response.write(": heartbeat\n\n");
  }, 25000);

  response.on("close", () => {
    clearInterval(heartbeat);
    session.clients.delete(response);
  });
}

async function handleTargetLocation(request, response, requestUrl, sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return sendJson(response, 404, { error: "Session not found." });
  }

  const token = requestUrl.searchParams.get("token");
  if (!token || token !== session.targetToken) {
    return sendJson(response, 403, { error: "Invalid target token." });
  }

  const body = await readJson(request);
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const accuracy = Number(body.accuracy);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) {
    return sendJson(response, 400, { error: "Latitude, longitude, and accuracy must be numeric." });
  }

  session.latestTargetLocation = {
    latitude,
    longitude,
    accuracy,
    altitude: numberOrNull(body.altitude),
    altitudeAccuracy: numberOrNull(body.altitudeAccuracy),
    heading: numberOrNull(body.heading),
    speed: numberOrNull(body.speed),
    timestamp: body.timestamp || Date.now(),
    updatedAt: Date.now(),
  };

  session.targetSharing = true;
  addSessionActivity(session, `${session.targetName} shared a live location update.`, "Target");
  broadcast(session, "target-location", session.latestTargetLocation);

  return sendJson(response, 200, { ok: true });
}

async function handleTargetStatus(request, response, requestUrl, sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return sendJson(response, 404, { error: "Session not found." });
  }

  const token = requestUrl.searchParams.get("token");
  if (!token || token !== session.targetToken) {
    return sendJson(response, 403, { error: "Invalid target token." });
  }

  const body = await readJson(request);
  const sharing = Boolean(body.sharing);
  session.targetSharing = sharing;

  const message = sharing
    ? `${session.targetName} granted permission and started sharing live location.`
    : `${session.targetName} stopped sharing live location.`;

  addSessionActivity(session, message, "Target");
  broadcast(session, "target-status", { sharing, message, updatedAt: Date.now() });

  return sendJson(response, 200, { ok: true });
}

function serializeHostSession(session, origin) {
  return {
    id: session.id,
    hostKey: session.hostKey,
    targetToken: session.targetToken,
    hostName: session.hostName,
    targetName: session.targetName,
    targetEmail: session.targetEmail,
    targetSharing: session.targetSharing,
    latestTargetLocation: session.latestTargetLocation,
    activity: session.activity.slice(0, 12),
    hostLink: `${origin}/?mode=host&session=${encodeURIComponent(session.id)}&hostKey=${encodeURIComponent(session.hostKey)}`,
    shareLink: `${origin}/?mode=target&session=${encodeURIComponent(session.id)}&token=${encodeURIComponent(session.targetToken)}`,
  };
}

function serializeTargetSession(session) {
  return {
    id: session.id,
    targetToken: session.targetToken,
    hostName: session.hostName,
    targetName: session.targetName,
    targetEmail: session.targetEmail,
    targetSharing: session.targetSharing,
  };
}

function addSessionActivity(session, message, source) {
  session.activity.unshift({
    message,
    source,
    timestamp: Date.now(),
  });
  session.activity = session.activity.slice(0, 20);
}

function broadcast(session, event, payload) {
  for (const client of session.clients) {
    writeEvent(client, event, payload);
  }
}

function writeEvent(response, event, payload) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function getOrigin(requestUrl, request) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = forwardedProto || requestUrl.protocol.replace(":", "") || "http";
  return `${protocol}://${request.headers.host}`;
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": MIME_TYPES[".json"] });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function serveStaticFile(response, filePath) {
  if (!fs.existsSync(filePath)) {
    return sendJson(response, 404, { error: "File not found." });
  }

  const extension = path.extname(filePath);
  response.writeHead(200, { "Content-Type": MIME_TYPES[extension] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
}