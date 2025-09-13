// ===== Configuration =====
const GITHUB = {
  user: "surya1358",
  repo: "poli",
  token: "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",
  branch: "main",
};

// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);
const setStatus = (msg) => ($("#status").textContent = msg);
const SAFE_TOKEN = (GITHUB.token || "").trim();

function toBase64(str) { return btoa(unescape(encodeURIComponent(str))); }
function nowIso() { return new Date().toISOString(); }
function makeFilename(lat, lon) {
  const ts = nowIso().replace(/:/g, "-");
  return `${ts}_${Number(lat).toFixed(6)}_${Number(lon).toFixed(6)}.json`;
}

async function githubFetch(url, options = {}) {
  const res = await fetch(url, {
    method: "GET",
    mode: "cors",
    cache: "no-store",
    credentials: "omit",
    headers: {
      // Use 'token' to avoid rare edge cases with some proxies
      "Authorization": `token ${SAFE_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "location-uploader-test",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
    ...options,
  });
  return res;
}

// Optional: prove the token is valid and see which user it maps to.
// (If this fails with 401, the PAT is invalid or revoked.)
async function whoAmI() {
  const res = await githubFetch("https://api.github.com/user");
  // This endpoint often works even without 'user' scope for PATs; it just returns limited info.
  return { ok: res.ok, status: res.status, login: res.ok ? (await res.json()).login : null };
}

async function checkRepoAccess() {
  const url = `https://api.github.com/repos/${encodeURIComponent(GITHUB.user)}/${encodeURIComponent(GITHUB.repo)}/branches/${encodeURIComponent(GITHUB.branch)}`;
  const res = await githubFetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const seenScopes = res.headers.get("x-oauth-scopes");
    const neededScopes = res.headers.get("x-accepted-oauth-scopes");
    throw new Error(`Repo/branch check failed (${res.status}): ${body.message || res.statusText}
Seen scopes: ${seenScopes || "(none)"} | Needed: ${neededScopes || "(unspecified)"}`);
  }
}

async function saveToGitHub(path, jsonObj) {
  const url = `https://api.github.com/repos/${encodeURIComponent(GITHUB.user)}/${encodeURIComponent(GITHUB.repo)}/contents/${encodeURIComponent(path)}`;
  const res = await githubFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Save location from browser at ${nowIso()}`,
      content: toBase64(JSON.stringify(jsonObj, null, 2)),
      branch: GITHUB.branch,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const seenScopes = res.headers.get("x-oauth-scopes");
    const neededScopes = res.headers.get("x-accepted-oauth-scopes");
    throw new Error(`GitHub API error (${res.status}): ${data.message || JSON.stringify(data)}
Seen scopes: ${seenScopes || "(none)"} | Needed: ${neededScopes || "(unspecified)"}`);
  }
  return data;
}

// ===== Main flow =====
async function shareLocation() {
  setStatus("Requesting your location…");

  if (!("geolocation" in navigator)) {
    setStatus("Geolocation is not supported by your browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      // Optional identity check — helpful while debugging 401
      const me = await whoAmI();
      if (!me.ok) {
        throw new Error(`Token failed on /user (${me.status}). It’s invalid/expired, or has no access.`);
      }

      setStatus(`Token OK (as ${me.login}). Checking repo access…`);
      await checkRepoAccess();

      setStatus("Got location. Saving to GitHub…");
      const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = pos.coords;
      const record = {
        type: "Feature",
        geometry: { type: "Point", coordinates: [longitude, latitude] },
        properties: {
          timestamp: new Date(pos.timestamp).toISOString(),
          accuracy, altitude, altitudeAccuracy, heading, speed,
          links: {
            openStreetMap: `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`,
            googleMaps: `https://maps.google.com/?q=${latitude},${longitude}`,
          },
          userAgent: navigator.userAgent,
        },
      };

      const path = `location/${makeFilename(latitude, longitude)}`;
      const result = await saveToGitHub(path, record);
      const htmlUrl = result?.content?.html_url || null;
      setStatus(htmlUrl ? `Saved!\nFile: ${path}\nView on GitHub: ${htmlUrl}` : `Saved!\nFile: ${path}`);
    } catch (err) {
      console.error(err);
      setStatus(`Failed to save to GitHub:\n${err.message}\n\nFix checklist:\n• Classic PAT: add 'repo' scope\n• Fine-grained PAT: repo 'poli' + Contents: Read & Write\n• Make sure token isn't expired/revoked\n• Remove any trailing spaces/newlines from the token\n• Confirm branch name (“${GITHUB.branch}”)`);
    }
  }, (err) => {
    const messages = {
      1: "Permission denied. Please allow location access and try again.",
      2: "Position unavailable. Try moving to an open area or check your connection.",
      3: "Location request timed out. Please try again.",
    };
    setStatus(messages[err.code] || `Geolocation error: ${err.message}`);
  }, {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0,
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector("#share-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    btn.disabled = true;
    shareLocation().finally(() => { btn.disabled = false; });
  });
});
