// ===== Config =====
const GITHUB = { user: "surya1358", repo: "poli", branch: "main" };

// ===== Utilities =====
const $ = (s) => document.querySelector(s);
const setStatus = (m) => ($("#status").textContent = m);
const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
const nowIso = () => new Date().toISOString();
const makeFilename = (lat, lon) =>
  `${nowIso().replace(/:/g,"-")}_${(+lat).toFixed(6)}_${(+lon).toFixed(6)}.json`;

function authHeader(tokenRaw) {
  const t = (tokenRaw || "").trim();
  if (!t) return null;
  return t.startsWith("github_pat_") ? `Bearer ${t}` : `token ${t}`;
}

async function gh(url, token, options = {}) {
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Authorization": authHeader(token),
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return res;
}

// Probe token *optionally* to give clearer guidance, but do it AFTER permission request
async function checkToken(token) {
  const r = await gh("https://api.github.com/user", token);
  if (!r.ok) {
    const scopes = r.headers.get("x-oauth-scopes") || "(none)";
    const needed = r.headers.get("x-accepted-oauth-scopes") || "(unspecified)";
    throw new Error(
      `Token failed on /user (${r.status}). It’s invalid/expired, or lacks access.\n` +
      `Seen scopes: ${scopes} | Needed: ${needed}`
    );
  }
  const data = await r.json();
  return data.login;
}

async function saveToGitHub(path, jsonObj, token) {
  const url = `https://api.github.com/repos/${encodeURIComponent(GITHUB.user)}/${encodeURIComponent(GITHUB.repo)}/contents/${encodeURIComponent(path)}`;
  const r = await gh(url, token, {
    method: "PUT",
    body: {
      message: `Save location at ${nowIso()}`,
      content: b64(JSON.stringify(jsonObj, null, 2)),
      branch: GITHUB.branch,
    },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const scopes = r.headers.get("x-oauth-scopes") || "(none)";
    const needed = r.headers.get("x-accepted-oauth-scopes") || "(unspecified)";
    throw new Error(`GitHub API error (${r.status}): ${data.message || JSON.stringify(data)}
Seen scopes: ${scopes} | Needed: ${needed}`);
  }
  return data;
}

// ===== Geolocation permission helpers =====
async function updatePermissionState() {
  try {
    if (!navigator.permissions) {
      $("#perm-state").textContent = "unsupported (will prompt on click)";
      return;
    }
    const status = await navigator.permissions.query({ name: "geolocation" });
    $("#perm-state").textContent = status.state; // "granted" | "prompt" | "denied"
    status.onchange = () => { $("#perm-state").textContent = status.state; };
  } catch {
    $("#perm-state").textContent = "unknown";
  }
}

function requestPermissionExplicitly() {
  // The official way to trigger permission is to call a geolocation method in response to a user gesture.
  // This gets a quick one-time reading just to force the browser prompt.
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => resolve("granted-or-prompt-resolved"),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
    );
  });
}

// ===== Main flow =====
async function shareLocation() {
  const token = ($("#token").value || "").trim();
  if (!token) { setStatus("Please paste your GitHub token first."); return; }

  // Ensure we’re on https or localhost; geolocation is blocked on insecure origins.
  const isSecure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!isSecure) {
    setStatus("This page must be served over https or http://localhost for geolocation to work.");
    return;
  }

  setStatus("Requesting your location (the browser should prompt)…");
  if (!("geolocation" in navigator)) {
    setStatus("Geolocation is not supported by your browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      // Optional token sanity check AFTER permission so you see the location prompt first
      setStatus("Location received. Validating token…");
      const login = await checkToken(token);
      setStatus(`Token OK (as ${login}). Saving to GitHub…`);

      const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = pos.coords;
      const record = {
        type: "Feature",
        geometry: { type: "Point", coordinates: [longitude, latitude] },
        properties: {
          timestamp: new Date(pos.timestamp).toISOString(),
          accuracy, altitude, altitudeAccuracy, heading, speed,
          links: {
            osm: `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`,
            gmaps: `https://maps.google.com/?q=${latitude},${longitude}`,
          },
          userAgent: navigator.userAgent,
        },
      };

      const path = `location/${makeFilename(latitude, longitude)}`;
      const res = await saveToGitHub(path, record, token);
      const htmlUrl = res?.content?.html_url;
      setStatus(htmlUrl ? `Saved!\n${htmlUrl}` : `Saved!\nFile: ${path}`);
    } catch (e) {
      setStatus(`Failed to save to GitHub:\n${e.message}\n\nChecklist:\n• Classic PAT: add 'repo' scope\n• Fine-grained PAT: repo 'poli' + Contents: Read & Write\n• Token owner is ${GITHUB.user} (or has access)\n• Token not expired/revoked`);
    }
  }, (err) => {
    const map = {1:"Permission denied. Allow location access and try again in Site settings.",
                 2:"Position unavailable. Try again with better signal.",
                 3:"Timed out. Try again."};
    setStatus(map[err.code] || `Geolocation error: ${err.message}`);
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}

// ===== Wire-up =====
document.addEventListener("DOMContentLoaded", () => {
  $("#perm-btn").addEventListener("click", async () => {
    try {
      setStatus("Requesting permission…");
      await requestPermissionExplicitly();
      setStatus("Permission flow completed. You can now click “Share location”.");
    } catch (e) {
      setStatus(`Permission request failed: ${e.message}\nTip: Check browser Site settings → Location.`);
    } finally {
      updatePermissionState();
    }
  });

  $("#share-btn").addEventListener("click", shareLocation);
  updatePermissionState();
});
