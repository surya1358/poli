// ===== Config =====
const GITHUB = { user: "surya1358", repo: "poli", branch: "main" };

// ===== Helpers =====
const $ = (s) => document.querySelector(s);
const setStatus = (m) => ($("#status").textContent = m);
const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
const nowIso = () => new Date().toISOString();
const makeFilename = (lat, lon) => `${nowIso().replace(/:/g,"-")}_${(+lat).toFixed(6)}_${(+lon).toFixed(6)}.json`;

function authHeader(tokenRaw) {
  const t = (tokenRaw || "").trim();
  if (!t) return null;
  // Fine-grained tokens prefer Bearer; classic works with token
  return t.startsWith("github_pat_") ? `Bearer ${t}` : `token ${t}`;
}

async function gh(url, token, options = {}) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": authHeader(token),
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
    ...options,
  });
  return res;
}

async function whoAmI(token) {
  const r = await gh("https://api.github.com/user", token);
  const scopes = r.headers.get("x-oauth-scopes") || "(none)";
  const needed = r.headers.get("x-accepted-oauth-scopes") || "(unspecified)";
  if (!r.ok) {
    throw new Error(`Token failed on /user (${r.status}). Scopes seen: ${scopes}. Needed: ${needed}.`);
  }
  const data = await r.json();
  return { login: data.login, scopes };
}

async function checkRepoAccess(token) {
  const url = `https://api.github.com/repos/${encodeURIComponent(GITHUB.user)}/${encodeURIComponent(GITHUB.repo)}/branches/${encodeURIComponent(GITHUB.branch)}`;
  const r = await gh(url, token);
  const scopes = r.headers.get("x-oauth-scopes") || "(none)";
  const needed = r.headers.get("x-accepted-oauth-scopes") || "(unspecified)";
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(`Repo/branch check failed (${r.status}): ${body.message || r.statusText}
Seen scopes: ${scopes} | Needed: ${needed}`);
  }
}

async function saveToGitHub(path, jsonObj, token) {
  const url = `https://api.github.com/repos/${encodeURIComponent(GITHUB.user)}/${encodeURIComponent(GITHUB.repo)}/contents/${encodeURIComponent(path)}`;
  const r = await gh(url, token, {
    method: "PUT",
    body: JSON.stringify({
      message: `Save location at ${nowIso()}`,
      content: b64(JSON.stringify(jsonObj, null, 2)),
      branch: GITHUB.branch,
    }),
  });
  const data = await r.json().catch(() => ({}));
  const scopes = r.headers.get("x-oauth-scopes") || "(none)";
  const needed = r.headers.get("x-accepted-oauth-scopes") || "(unspecified)";
  if (!r.ok) {
    throw new Error(`GitHub API error (${r.status}): ${data.message || JSON.stringify(data)}
Seen scopes: ${scopes} | Needed: ${needed}`);
  }
  return data;
}

// ===== Main =====
async function shareLocation() {
  const token = ($("#token").value || "").trim();
  if (!token) return setStatus("Please enter your GitHub token first.");

  if (!("geolocation" in navigator)) {
    setStatus("Geolocation is not supported by your browser.");
    return;
  }

  setStatus("Validating token…");
  try {
    const me = await whoAmI(token);
    setStatus(`Token OK (as ${me.login}). Checking repo access…`);
    await checkRepoAccess(token);
  } catch (e) {
    setStatus(`Failed to save to GitHub:\n${e.message}\n\nFix checklist:\n• Fine-grained: add repo 'poli' + Contents: Read & Write\n• Classic: add 'repo' scope\n• Regenerate if expired/revoked\n• Ensure token owner = repo owner (${GITHUB.user})`);
    return;
  }

  setStatus("Requesting your location…");
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      setStatus("Got location. Saving to GitHub…");
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
      const result = await saveToGitHub(path, record, token);
      const htmlUrl = result?.content?.html_url;
      setStatus(htmlUrl ? `Saved!\n${htmlUrl}` : `Saved!\nFile: ${path}`);
    } catch (e) {
      setStatus(`Failed to save to GitHub:\n${e.message}`);
    }
  }, (err) => {
    const map = {1:"Permission denied.", 2:"Position unavailable.", 3:"Timed out."};
    setStatus(map[err.code] || `Geolocation error: ${err.message}`);
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}

document.addEventListener("DOMContentLoaded", () => {
  $("#share-btn").addEventListener("click", shareLocation);
});
