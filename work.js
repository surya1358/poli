// ===== Configuration (hardcoded for your test) =====
const GITHUB = {
  user: "surya1358",
  repo: "poli",
  // You said to hardcode it here for testing:
  token: "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",
  branch: "main", // change if your default branch is different
};

// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);
const setStatus = (msg) => ($("#status").textContent = msg);

function toBase64(str) {
  // Safe base64 for UTF-8 strings
  return btoa(unescape(encodeURIComponent(str)));
}

function nowIso() {
  return new Date().toISOString();
}

// Create a unique filename for each capture
function makeFilename(lat, lon) {
  // Example: 2025-09-13T12-34-56.789Z_12.9716_77.5946.json
  const ts = nowIso().replace(/[:]/g, "-");
  const latStr = Number(lat).toFixed(6);
  const lonStr = Number(lon).toFixed(6);
  return `${ts}_${latStr}_${lonStr}.json`;
}

// Save a JSON blob to GitHub via the Contents API (creates a new file)
async function saveToGitHub(path, jsonObj) {
  const url = `https://api.github.com/repos/${encodeURIComponent(GITHUB.user)}/${encodeURIComponent(GITHUB.repo)}/contents/${encodeURIComponent(path)}`;

  const payload = {
    message: `Save location from browser at ${nowIso()}`,
    content: toBase64(JSON.stringify(jsonObj, null, 2)),
    branch: GITHUB.branch,
  };

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${GITHUB.token}`, // works with classic or fine-grained PATs
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      // Optional but good practice:
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    // Bubble up a readable error
    const msg = data && (data.message || JSON.stringify(data));
    throw new Error(`GitHub API error (${res.status}): ${msg}`);
  }
  return data; // contains 'content' and 'commit'
}

// ===== Main flow =====
async function shareLocation() {
  setStatus("Requesting your location…");

  if (!("geolocation" in navigator)) {
    setStatus("Geolocation is not supported by your browser.");
    return;
  }

  // Ask for current position
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      setStatus("Got location. Preparing to save to GitHub…");

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
          // Handy links for sanity-checking:
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

      // Show a simple confirmation with the path that was created
      const htmlUrl = result?.content?.html_url || null;
      setStatus(
        htmlUrl
          ? `Saved!\nFile: ${path}\nView on GitHub: ${htmlUrl}`
          : `Saved!\nFile: ${path}`
      );
    } catch (err) {
      console.error(err);
      setStatus(`Failed to save to GitHub:\n${err.message}`);
    }
  }, (err) => {
    // Geolocation error handler
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

// Wire up the button
document.addEventListener("DOMContentLoaded", () => {
  const btn = $("#share-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    // Avoid double clicks
    btn.disabled = true;
    shareLocation().finally(() => {
      btn.disabled = false;
    });
  });
});
