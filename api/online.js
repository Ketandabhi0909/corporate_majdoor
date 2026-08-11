const TIMEOUT_SEC = 40;
const STATS_KEY = "cm:stats";
const ONLINE_KEY = "cm:online";

function emptyStats() {
  return { total_views: 0, all_users: {}, days: {} };
}

function todayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function weekStart(today) {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - (dow - 1));
  return dt.toISOString().slice(0, 10);
}

function summarize(stats, from, to) {
  let views = 0;
  const users = {};
  for (const [day, row] of Object.entries(stats.days || {})) {
    if (day < from || day > to) continue;
    views += Number(row.views || 0);
    for (const uid of Object.keys(row.users || {})) {
      if (row.users[uid]) users[uid] = true;
    }
  }
  return { views, users: Object.keys(users).length };
}

function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(command) {
  const env = redisEnv();
  if (!env) return null;
  const isPipeline = Array.isArray(command[0]);
  const endpoint = isPipeline ? `${env.url.replace(/\/$/, "")}/pipeline` : env.url;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Redis error");
  return data.result;
}

function memoryStore() {
  if (!globalThis.__cmStore) {
    globalThis.__cmStore = { online: {}, stats: emptyStats() };
  }
  return globalThis.__cmStore;
}

async function loadState() {
  if (redisEnv()) {
    const [onlineRaw, statsRaw] = await Promise.all([
      redis(["GET", ONLINE_KEY]),
      redis(["GET", STATS_KEY]),
    ]);
    return {
      online: onlineRaw ? JSON.parse(onlineRaw) : {},
      stats: statsRaw ? JSON.parse(statsRaw) : emptyStats(),
    };
  }
  const mem = memoryStore();
  return {
    online: { ...mem.online },
    stats: JSON.parse(JSON.stringify(mem.stats)),
  };
}

async function saveState(online, stats) {
  if (redisEnv()) {
    await redis([
      ["SET", ONLINE_KEY, JSON.stringify(online)],
      ["SET", STATS_KEY, JSON.stringify(stats)],
    ]);
    return;
  }
  const mem = memoryStore();
  mem.online = online;
  mem.stats = stats;
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      try {
        const params = new URLSearchParams(body);
        body = Object.fromEntries(params.entries());
      } catch {
        body = {};
      }
    }
  }
  if (!body || typeof body !== "object") {
    const q = req.query || {};
    body = { id: q.id, leave: q.leave, hit: q.hit };
  }
  return body;
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const body = parseBody(req);
  const id = String(body.id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const leave = Boolean(body.leave === true || body.leave === "1" || body.leave === 1);
  const hit = Boolean(body.hit === true || body.hit === "1" || body.hit === 1);

  if (!id || id.length > 64) {
    res.status(200).json({ online: 0, error: "invalid id" });
    return;
  }

  try {
    const state = await loadState();
    let { online, stats } = state;
    if (!online || typeof online !== "object") online = {};
    if (!stats || typeof stats !== "object") stats = emptyStats();
    if (!stats.days) stats.days = {};
    if (!stats.all_users) stats.all_users = {};

    const now = Math.floor(Date.now() / 1000);
    for (const [uid, last] of Object.entries(online)) {
      if (!Number.isFinite(Number(last)) || now - Number(last) > TIMEOUT_SEC) {
        delete online[uid];
      }
    }

    if (leave) delete online[id];
    else online[id] = now;

    const today = todayISO();
    if (hit && !leave) {
      stats.total_views = Number(stats.total_views || 0) + 1;
      stats.all_users[id] = true;
      if (!stats.days[today]) stats.days[today] = { views: 0, users: {} };
      stats.days[today].views = Number(stats.days[today].views || 0) + 1;
      stats.days[today].users[id] = true;
    }

    await saveState(online, stats);

    const ws = weekStart(today);
    const monthStart = today.slice(0, 8) + "01";
    const yearStart = today.slice(0, 4) + "-01-01";

    res.status(200).json({
      online: Object.keys(online).length,
      id,
      today: summarize(stats, today, today),
      week: summarize(stats, ws, today),
      month: summarize(stats, monthStart, today),
      year: summarize(stats, yearStart, today),
      total: {
        views: Number(stats.total_views || 0),
        users: Object.keys(stats.all_users || {}).length,
      },
    });
  } catch (err) {
    res.status(200).json({ online: 1, error: String(err.message || err) });
  }
};
