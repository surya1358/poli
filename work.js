// ===== Configuration (user/repo/branch) =====
const GITHUB = {
  user: "surya1358",
  repo: "poli",
  branch: "main", // change if your default branch is different
};

// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);
const setStatus = (msg) => ($("#status").textContent = msg);

function toBase64(str) { return btoa(unescape(encodeURIComponent(str))); }
function nowIso() { return new Date().toISOString(); }
function makeFilename(lat, lon) {
  const ts = nowIso().replace(/:/g, "-");
  return `${ts}_${Number(lat).toFixed(6)}_${Number(lon).toFixed(6)}.json`;
}

async function githubFetch(url, token, options = {}) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `token ${token.trim()}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
    ...options,
  });
  return res;
}

async function saveToGitHub(path, jsonObj, token) {
  const url = `https://api.github.com/repos/${encodeURIComponent(GITHUB.user)}/${encodeURIComponent(GITHUB.repo)}/contents/${encodeURIComponent(path)}`;

  const payload = {
    message: `Save location from browser at ${nowIso()}`,
    content: toBase64(JSON.stringify(jsonObj, null, 2)),
    branch: GITHUB.branch,
  };

  const res = await githubFetch(url, token, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`GitHub API error (${res.status}): ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

// ===== Main flow =====
async function shareLocation() {
  const tokenInput = $("#token");
  const token = tokenInput.value;
  if (!token) {
    setStatus("Please enter your GitHub token first.");
    return;
  }

  setStatus("Requesting your location…");

  if (!("geolocation" in navigator)) {
    setStatus("Geolocation is not supported by your browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      setStatus("Got location. Saving to GitHub…");

      const { latitude, longitude, accuracy } = pos.coords;
      const record = {
        type: "Feature",
        geometry: { type: "Point", coordinates: [longitude, latitude] },
        properties: {
          timestamp: new Date(pos.timestamp).toISOString(),
          accuracy,
          links: {
            osm: `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`,
            gmaps: `https://maps.google.com/?q=${latitude},${longitude}`,
          },
        },
      };

      const path = `location/${makeFilename(latitude, longitude)}`;
      const result = await saveToGitHub(path, record, token);
      const htmlUrl = result?.content?.html_url || null;
      setStatus(htmlUrl ? `Saved!\n${htmlUrl}` : `Saved!\nFile: ${path}`);
    } catch (err) {
      console.error(err);
      setStatus(`Failed to save to GitHub:\n${err.message}`);
    }
  }, (err) => {
    const messages = {
      1: "Permission denied. Allow location access and try again.",
      2: "Position unavailable. Try again later.",
      3: "Location request timed out. Try again.",
    };
    setStatus(messages[err.code] || `Geolocation error: ${err.message}`);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  $("#share-btn").addEventListener("click", shareLocation);
});
