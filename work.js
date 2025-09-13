// ===== Configuration =====
const GITHUB = {
  user: "surya1358",
  repo: "poli",
  token: "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",
  branch: "main", // change if your default branch is different
};

// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);
const setStatus = (msg) => ($("#status").textContent = msg);

function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function nowIso() {
  return new Date().toISOString();
}
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
      "Authorization": `Bearer ${GITHUB.token}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "location-uploader-test", // helps some proxies / clearer logs
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
    ...options,
  });
  return res;
}

// Sanity check: repo + branch reachable with this token
async function checkRepoAccess() {
  const url = `https://api.github.com/repos/${encodeURIComponent(GITHUB.user)}/${encodeURIComponent(GITHUB.repo)}/branches/${encodeURIComponent(GITHUB.branch)}`;
  try {
    const res = await githubFetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Repo/branch check failed (${res.status}): ${body.message || res.statusText}`);
    }
  } catch (e) {
    throw new Error(`Network or permission issue reaching GitHub: ${e.message}`);
  }
}

// Create a new file in location/
async function saveToGitHub(path, jsonObj) {
  const url = `https://api.github.com/repos/${encodeURIComponent(GITHUB.user)}/${encodeURIComponent(GITHUB.repo)}/contents/${encodeURIComponent(path)}`;
  const payload = {
    message: `Save location from browser at ${nowIso()}`,
    content: toBase64(JSON.stringify(jsonObj, null, 2)),
    branch: GITHUB.branch,
  };

  const res = await githubFetch(url, {
    method: "PUT",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });

  // If fetch itself failed, the catch above would’ve fired; at this point we have a response.
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Common: 401 (bad token/scope), 404 (no access/repo), 409 (branch protection)
    throw new Error(`GitHub API error (${res.status}): ${data.message || JSON.stringify(data)}`);
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
      setStatus("Checking repo access…");
      await checkRepoAccess();

      setStatus("Got location. Saving to GitHub…");
      const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = pos.coords;
      const timestamp = new Date(pos.timestamp).toISOString();

      const record = {
        type: "Feature",
        geometry: { type: "Point", coordinates: [longitude, latitude] },
        properties: {
          timestamp,
          accuracy,
          altitude,
          altitudeAccuracy,
          heading,
          speed,
          links: {
            openStreetMap: `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`,
            googleMaps: `https://maps.google.com/?q=${latitude},${longitude}`,
          },
          userAgent: navigator.userAgent,
        },
      };

      const filename = makeFilename(latitude, longitude);
      const path = `location/${filename}`;
      const result = await saveToGitHub(path, record);

      const htmlUrl = result?.content?.html_url || null;
      setStatus(htmlUrl
        ? `Saved!\nFile: ${path}\nView on GitHub: ${htmlUrl}`
        : `Saved!\nFile: ${path}`);
    } catch (err) {
      console.error(err);
      // “Failed to fetch” (TypeError) never has a status; make it explicit
      setStatus(`Failed to save to GitHub:\n${err.message}\n\nTips:\n• Serve from http://localhost or https\n• Check PAT scopes (Contents: Read+Write)\n• Confirm branch name (“${GITHUB.branch}”)`);
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
  const btn = $("#share-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    btn.disabled = true;
    shareLocation().finally(() => { btn.disabled = false; });
  });
});
