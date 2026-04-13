const state = {
  apiReady: false,
  mode: "landing",
  session: null,
  eventSource: null,
  map: null,
  tileLayers: {},
  currentTileLayer: null,
  layerControl: null,
  scaleControl: null,
  mapActionControl: null,
  hostMarker: null,
  targetMarker: null,
  hostAccuracyCircle: null,
  targetAccuracyCircle: null,
  routeLine: null,
  targetTrail: null,
  hostWatchId: null,
  targetWatchId: null,
  latestHostLocation: null,
  latestTargetLocation: null,
  activity: [],
  routeProfile: "driving",
  followTarget: true,
};

const elements = {
  appConnectionBadge: document.getElementById("appConnectionBadge"),
  currentModeBadge: document.getElementById("currentModeBadge"),
  globalStatus: document.getElementById("globalStatus"),
  landingView: document.getElementById("landingView"),
  hostView: document.getElementById("hostView"),
  targetView: document.getElementById("targetView"),
  createSessionForm: document.getElementById("createSessionForm"),
  hostNameInput: document.getElementById("hostNameInput"),
  targetNameInput: document.getElementById("targetNameInput"),
  targetEmailInput: document.getElementById("targetEmailInput"),
  hostNameValue: document.getElementById("hostNameValue"),
  targetNameValue: document.getElementById("targetNameValue"),
  targetEmailValue: document.getElementById("targetEmailValue"),
  sessionIdValue: document.getElementById("sessionIdValue"),
  shareLinkOutput: document.getElementById("shareLinkOutput"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  newSessionBtn: document.getElementById("newSessionBtn"),
  startHostTrackingBtn: document.getElementById("startHostTrackingBtn"),
  stopHostTrackingBtn: document.getElementById("stopHostTrackingBtn"),
  centerTargetBtn: document.getElementById("centerTargetBtn"),
  followTargetBtn: document.getElementById("followTargetBtn"),
  fitMarkersBtn: document.getElementById("fitMarkersBtn"),
  openStreetViewBtn: document.getElementById("openStreetViewBtn"),
  mapStyleSelect: document.getElementById("mapStyleSelect"),
  routeProfileSelect: document.getElementById("routeProfileSelect"),
  getDirectionsBtn: document.getElementById("getDirectionsBtn"),
  targetLatitudeValue: document.getElementById("targetLatitudeValue"),
  targetLongitudeValue: document.getElementById("targetLongitudeValue"),
  targetAccuracyValue: document.getElementById("targetAccuracyValue"),
  targetUpdatedValue: document.getElementById("targetUpdatedValue"),
  routeDistanceValue: document.getElementById("routeDistanceValue"),
  routeDurationValue: document.getElementById("routeDurationValue"),
  routeStepsList: document.getElementById("routeStepsList"),
  activityList: document.getElementById("activityList"),
  targetGreeting: document.getElementById("targetGreeting"),
  targetViewHostName: document.getElementById("targetViewHostName"),
  targetViewTargetName: document.getElementById("targetViewTargetName"),
  targetViewTargetEmail: document.getElementById("targetViewTargetEmail"),
  targetSharingState: document.getElementById("targetSharingState"),
  startTargetSharingBtn: document.getElementById("startTargetSharingBtn"),
  stopTargetSharingBtn: document.getElementById("stopTargetSharingBtn"),
  selfLatitudeValue: document.getElementById("selfLatitudeValue"),
  selfLongitudeValue: document.getElementById("selfLongitudeValue"),
  selfAccuracyValue: document.getElementById("selfAccuracyValue"),
  selfUpdatedValue: document.getElementById("selfUpdatedValue"),
};

document.addEventListener("DOMContentLoaded", () => {
  initializeMap();
  bindEvents();
  void bootstrapApplication();
});

function initializeMap() {
  state.map = L.map("map", { zoomControl: true }).setView([9.082, 8.6753], 5);

  state.tileLayers = {
    street: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }),
    satellite: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri',
      },
    ),
    terrain: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap',
    }),
  };

  state.currentTileLayer = state.tileLayers.street;
  state.currentTileLayer.addTo(state.map);

  state.layerControl = L.control.layers(
    {
      Street: state.tileLayers.street,
      Satellite: state.tileLayers.satellite,
      Terrain: state.tileLayers.terrain,
    },
    {},
    { position: "topright", collapsed: false },
  ).addTo(state.map);

  state.scaleControl = L.control.scale({ imperial: false, position: "bottomleft" }).addTo(state.map);

  state.mapActionControl = createMapActionControl();
  state.mapActionControl.addTo(state.map);

  state.targetTrail = L.polyline([], {
    color: "#ef4444",
    weight: 4,
    opacity: 0.8,
  }).addTo(state.map);

  state.routeLine = L.polyline([], {
    color: "#22c55e",
    weight: 5,
    opacity: 0.85,
    dashArray: "10 8",
  }).addTo(state.map);

  state.map.on("baselayerchange", (event) => {
    const nextStyle = Object.entries(state.tileLayers).find(([, layer]) => layer === event.layer)?.[0] || "street";
    if (elements.mapStyleSelect) {
      elements.mapStyleSelect.value = nextStyle;
    }
  });
}

function bindEvents() {
  elements.createSessionForm?.addEventListener("submit", handleCreateSession);
  elements.copyLinkBtn?.addEventListener("click", copyShareLink);
  elements.newSessionBtn?.addEventListener("click", resetToLanding);
  elements.startHostTrackingBtn?.addEventListener("click", startHostTracking);
  elements.stopHostTrackingBtn?.addEventListener("click", stopHostTracking);
  elements.centerTargetBtn?.addEventListener("click", centerOnTarget);
  elements.followTargetBtn?.addEventListener("click", toggleLiveFollow);
  elements.fitMarkersBtn?.addEventListener("click", fitMapToRelevantBounds);
  elements.openStreetViewBtn?.addEventListener("click", openStreetView);
  elements.mapStyleSelect?.addEventListener("change", (event) => {
    switchMapStyle(event.target.value);
  });
  elements.routeProfileSelect?.addEventListener("change", (event) => {
    state.routeProfile = event.target.value;
  });
  elements.getDirectionsBtn?.addEventListener("click", fetchDirections);
  elements.startTargetSharingBtn?.addEventListener("click", startTargetSharing);
  elements.stopTargetSharingBtn?.addEventListener("click", stopTargetSharing);
}

async function bootstrapApplication() {
  updateModeBadge("Initializing");

  const healthy = await checkApiHealth();
  if (!healthy) {
    showView("landing");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const sessionId = params.get("session");

  if (mode === "host" && sessionId) {
    await loadHostSession(sessionId, params.get("hostKey"));
    return;
  }

  if (mode === "target" && sessionId) {
    await loadTargetSession(sessionId, params.get("token"));
    return;
  }

  showView("landing");
  setGlobalStatus("Create a session to generate a unique target link.", "info");
}

async function checkApiHealth() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) {
      throw new Error("Health check failed");
    }

    state.apiReady = true;
    updateConnectionBadge("Online", "success");
    return true;
  } catch {
    state.apiReady = false;
    updateConnectionBadge("Offline", "danger");
    setGlobalStatus("Backend server is not running. Start the Node server from the README instructions.", "danger");
    return false;
  }
}

function showView(mode) {
  state.mode = mode;
  elements.landingView.classList.toggle("hidden", mode !== "landing");
  elements.hostView.classList.toggle("hidden", mode !== "host");
  elements.targetView.classList.toggle("hidden", mode !== "target");

  updateModeBadge(mode.charAt(0).toUpperCase() + mode.slice(1));

  if (mode === "host") {
    window.setTimeout(() => state.map.invalidateSize(), 120);
  }
}

function updateConnectionBadge(label, tone = "muted") {
  elements.appConnectionBadge.textContent = label;
  elements.appConnectionBadge.className = `badge badge-${tone}`;
}

function updateModeBadge(label) {
  elements.currentModeBadge.textContent = label;
  elements.currentModeBadge.className = "badge badge-muted";
}

function setGlobalStatus(message, tone = "info") {
  elements.globalStatus.textContent = message;
  elements.globalStatus.className = `status-banner status-${tone}`;
}

async function handleCreateSession(event) {
  event.preventDefault();

  const payload = {
    hostName: elements.hostNameInput.value.trim(),
    targetName: elements.targetNameInput.value.trim(),
    targetEmail: elements.targetEmailInput.value.trim(),
  };

  setGlobalStatus("Creating secure tracking session…", "info");

  try {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unable to create session");
    }

    state.session = data;
    renderHostSession(data);
    showView("host");
    setGlobalStatus("Tracking session created successfully. Share the generated link with the target device.", "success");
    addActivity(`Session created for ${data.targetName}.`, "Host");
    window.history.replaceState({}, "", data.hostLink);
    connectHostStream();
  } catch (error) {
    setGlobalStatus(error.message || "Failed to create session.", "danger");
  }
}

function renderHostSession(session) {
  elements.hostNameValue.textContent = session.hostName;
  elements.targetNameValue.textContent = session.targetName;
  elements.targetEmailValue.textContent = session.targetEmail;
  elements.sessionIdValue.textContent = session.id;
  elements.shareLinkOutput.value = session.shareLink;

  resetRouteUi();
  renderActivity();
  refreshFollowButton();
  updateStreetViewButtonState();

  if (session.latestTargetLocation) {
    updateTargetMetrics(session.latestTargetLocation);
    plotTargetLocation(session.latestTargetLocation);
  }
}

async function loadHostSession(sessionId, hostKey) {
  if (!hostKey) {
    showView("landing");
    setGlobalStatus("Missing host access key in the URL.", "danger");
    return;
  }

  setGlobalStatus("Loading host dashboard…", "info");

  try {
    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}?hostKey=${encodeURIComponent(hostKey)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to load host session");
    }

    state.session = data;
    state.activity = Array.isArray(data.activity) ? data.activity.slice(0, 12) : [];
    showView("host");
    renderHostSession(data);
    setGlobalStatus("Host dashboard connected. Waiting for target updates.", "success");
    connectHostStream();
  } catch (error) {
    showView("landing");
    setGlobalStatus(error.message || "Unable to load host session.", "danger");
  }
}

function connectHostStream() {
  if (!state.session?.id || !state.session?.hostKey) {
    return;
  }

  if (state.eventSource) {
    state.eventSource.close();
  }

  const streamUrl = `/api/sessions/${encodeURIComponent(state.session.id)}/stream?hostKey=${encodeURIComponent(state.session.hostKey)}`;
  state.eventSource = new EventSource(streamUrl);

  state.eventSource.addEventListener("open", () => {
    updateConnectionBadge("Live stream connected", "success");
  });

  state.eventSource.addEventListener("snapshot", (event) => {
    const payload = safeJsonParse(event.data);
    if (!payload) {
      return;
    }

    if (payload.latestTargetLocation) {
      updateTargetMetrics(payload.latestTargetLocation);
      plotTargetLocation(payload.latestTargetLocation);
    }

    if (Array.isArray(payload.activity)) {
      state.activity = payload.activity.slice(0, 12);
      renderActivity();
    }
  });

  state.eventSource.addEventListener("target-location", (event) => {
    const payload = safeJsonParse(event.data);
    if (!payload) {
      return;
    }

    updateTargetMetrics(payload);
    plotTargetLocation(payload);
    addActivity(`Target location updated (${formatCoordinate(payload.latitude)}, ${formatCoordinate(payload.longitude)}).`, "Target");
    setGlobalStatus("Received a live location update from the target device.", "success");
  });

  state.eventSource.addEventListener("target-status", (event) => {
    const payload = safeJsonParse(event.data);
    if (!payload) {
      return;
    }

    addActivity(payload.message, "Target");
    setGlobalStatus(payload.message, payload.sharing ? "success" : "warning");
  });

  state.eventSource.onerror = () => {
    updateConnectionBadge("Reconnecting…", "warning");
  };
}

async function loadTargetSession(sessionId, token) {
  if (!token) {
    showView("landing");
    setGlobalStatus("Missing target access token in the URL.", "danger");
    return;
  }

  setGlobalStatus("Loading target sharing page…", "info");

  try {
    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to load target session");
    }

    state.session = data;
    showView("target");
    renderTargetSession(data);
    setGlobalStatus("Target sharing page ready. Grant location permission to begin streaming coordinates.", "info");
  } catch (error) {
    showView("landing");
    setGlobalStatus(error.message || "Unable to load target page.", "danger");
  }
}

function renderTargetSession(session) {
  elements.targetGreeting.textContent = `${session.hostName} wants to receive your live device location.`;
  elements.targetViewHostName.textContent = session.hostName;
  elements.targetViewTargetName.textContent = session.targetName;
  elements.targetViewTargetEmail.textContent = session.targetEmail;
  elements.targetSharingState.textContent = session.targetSharing ? "Sharing live" : "Idle";
}

async function copyShareLink() {
  if (!elements.shareLinkOutput.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(elements.shareLinkOutput.value);
    setGlobalStatus("Unique target link copied to clipboard.", "success");
  } catch {
    setGlobalStatus("Unable to copy the link in this browser. Select and copy it manually.", "warning");
  }
}

function resetToLanding() {
  disconnectStreams();
  stopHostTracking(false);
  void stopTargetSharing(false);
  state.session = null;
  state.activity = [];
  state.latestTargetLocation = null;
  state.latestHostLocation = null;
  clearMapLayers();
  elements.createSessionForm.reset();
  window.history.replaceState({}, "", "/");
  showView("landing");
  setGlobalStatus("Ready to create a new tracking session.", "info");
}

function disconnectStreams() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
}

function clearMapLayers() {
  state.targetTrail.setLatLngs([]);
  state.routeLine.setLatLngs([]);
  [state.hostMarker, state.targetMarker, state.hostAccuracyCircle, state.targetAccuracyCircle].forEach((layer) => {
    if (layer && state.map.hasLayer(layer)) {
      state.map.removeLayer(layer);
    }
  });

  state.hostMarker = null;
  state.targetMarker = null;
  state.hostAccuracyCircle = null;
  state.targetAccuracyCircle = null;
  resetRouteUi();
  updateStreetViewButtonState();
}

function updateTargetMetrics(location) {
  state.latestTargetLocation = location;
  elements.targetLatitudeValue.textContent = formatCoordinate(location.latitude);
  elements.targetLongitudeValue.textContent = formatCoordinate(location.longitude);
  elements.targetAccuracyValue.textContent = `${Math.round(location.accuracy)} m`;
  elements.targetUpdatedValue.textContent = formatDateTime(location.timestamp || location.updatedAt);
  updateStreetViewButtonState();
}

function plotTargetLocation(location) {
  const latLng = [location.latitude, location.longitude];

  if (!state.targetMarker) {
    state.targetMarker = createMarker(latLng, "#ef4444", "Target");
  } else {
    state.targetMarker.setLatLng(latLng);
  }

  if (!state.targetAccuracyCircle) {
    state.targetAccuracyCircle = createAccuracyCircle(latLng, location.accuracy, "#ef4444");
  } else {
    state.targetAccuracyCircle.setLatLng(latLng);
    state.targetAccuracyCircle.setRadius(location.accuracy);
  }

  state.targetTrail.addLatLng(latLng);

  if (state.followTarget) {
    state.map.panTo(latLng, {
      animate: true,
      duration: 1,
    });

    if ((state.map.getZoom() || 0) < 15) {
      state.map.setZoom(15);
    }
  }
}

function createMarker(latLng, color, label) {
  const icon = L.divIcon({
    className: "map-pin-wrapper",
    html: `<span class="map-pin" style="background:${color}"></span><span class="sr-only">${label}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

  return L.marker(latLng, { icon }).addTo(state.map);
}

function createAccuracyCircle(latLng, radius, color) {
  return L.circle(latLng, {
    radius,
    color,
    fillColor: color,
    fillOpacity: 0.12,
    weight: 2,
  }).addTo(state.map);
}

function startHostTracking() {
  if (!navigator.geolocation) {
    setGlobalStatus("This browser does not support geolocation for host tracking.", "danger");
    return;
  }

  if (state.hostWatchId !== null) {
    return;
  }

  state.hostWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const location = normalizeCoords(position);
      state.latestHostLocation = location;
      plotHostLocation(location);
      elements.startHostTrackingBtn.disabled = true;
      elements.stopHostTrackingBtn.disabled = false;
      addActivity(`Host location updated (${formatCoordinate(location.latitude)}, ${formatCoordinate(location.longitude)}).`, "Host");
      setGlobalStatus("Host location sharing is active for routing and distance calculations.", "success");
    },
    handleGeoError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
  );

  setGlobalStatus("Starting host location tracking…", "info");
}

function plotHostLocation(location) {
  const latLng = [location.latitude, location.longitude];

  if (!state.hostMarker) {
    state.hostMarker = createMarker(latLng, "#3b82f6", "Host");
  } else {
    state.hostMarker.setLatLng(latLng);
  }

  if (!state.hostAccuracyCircle) {
    state.hostAccuracyCircle = createAccuracyCircle(latLng, location.accuracy, "#3b82f6");
  } else {
    state.hostAccuracyCircle.setLatLng(latLng);
    state.hostAccuracyCircle.setRadius(location.accuracy);
  }
}

function stopHostTracking(notify = true) {
  if (state.hostWatchId !== null) {
    navigator.geolocation.clearWatch(state.hostWatchId);
    state.hostWatchId = null;
  }

  elements.startHostTrackingBtn.disabled = false;
  elements.stopHostTrackingBtn.disabled = true;

  if (notify && state.mode === "host") {
    setGlobalStatus("Host tracking stopped.", "warning");
  }
}

function centerOnTarget() {
  if (!state.latestTargetLocation) {
    setGlobalStatus("No target location available yet.", "warning");
    return;
  }

  state.map.flyTo([state.latestTargetLocation.latitude, state.latestTargetLocation.longitude], 16, {
    animate: true,
    duration: 1,
  });
}

async function fetchDirections() {
  if (!state.latestHostLocation) {
    setGlobalStatus("Start host tracking first so the app knows the host device location.", "warning");
    return;
  }

  if (!state.latestTargetLocation) {
    setGlobalStatus("No target location is available yet for routing.", "warning");
    return;
  }

  setGlobalStatus("Requesting route between host and target…", "info");

  const from = `${state.latestHostLocation.longitude},${state.latestHostLocation.latitude}`;
  const to = `${state.latestTargetLocation.longitude},${state.latestTargetLocation.latitude}`;

  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/${encodeURIComponent(state.routeProfile)}/${from};${to}?overview=full&geometries=geojson&steps=true`,
    );
    const data = await response.json();

    if (!response.ok || data.code !== "Ok" || !data.routes?.length) {
      throw new Error("No route data available");
    }

    renderRoute(data.routes[0]);
    setGlobalStatus("Route loaded successfully.", "success");
  } catch {
    setGlobalStatus("Unable to load directions right now. Check network access and try again.", "danger");
  }
}

function renderRoute(route) {
  const latLngs = route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]);
  state.routeLine.setLatLngs(latLngs);

  const bounds = L.latLngBounds(latLngs);
  state.map.fitBounds(bounds, { padding: [30, 30] });

  elements.routeDistanceValue.textContent = formatDistance(route.distance);
  elements.routeDurationValue.textContent = formatDuration(route.duration);

  const steps = route.legs?.[0]?.steps || [];
  if (!steps.length) {
    elements.routeStepsList.className = "detail-list empty-list";
    elements.routeStepsList.innerHTML = "<li>No route steps available.</li>";
    return;
  }

  elements.routeStepsList.className = "detail-list";
  elements.routeStepsList.innerHTML = steps
    .slice(0, 8)
    .map((step) => {
      const instruction = buildStepInstruction(step);
      return `<li><strong>${instruction}</strong><span>${formatDistance(step.distance)} · ${formatDuration(step.duration)}</span></li>`;
    })
    .join("");
}

function buildStepInstruction(step) {
  const modifier = step.maneuver?.modifier ? `${capitalize(step.maneuver.modifier)} ` : "";
  const name = step.name ? `onto ${step.name}` : "to the next road";

  if (step.maneuver?.type === "arrive") {
    return "Arrive at the target location";
  }

  return `${capitalize(step.maneuver?.type || "continue")} ${modifier}${name}`.replace(/\s+/g, " ").trim();
}

async function startTargetSharing() {
  if (!navigator.geolocation) {
    setGlobalStatus("This browser does not support geolocation on the target device.", "danger");
    return;
  }

  if (state.targetWatchId !== null) {
    return;
  }

  const sessionId = state.session?.id;
  const token = state.session?.targetToken;
  if (!sessionId || !token) {
    setGlobalStatus("Target session details are incomplete.", "danger");
    return;
  }

  await sendTargetStatus(true);

  state.targetWatchId = navigator.geolocation.watchPosition(
    async (position) => {
      const payload = normalizeCoords(position);
      updateSelfMetrics(payload);
      try {
        await sendTargetLocation(payload);
      } catch {
        setGlobalStatus("Unable to send location to the host right now.", "danger");
        return;
      }
      elements.targetSharingState.textContent = "Sharing live";
      elements.startTargetSharingBtn.disabled = true;
      elements.stopTargetSharingBtn.disabled = false;
      setGlobalStatus("Your live location is now being sent to the host dashboard.", "success");
    },
    async (error) => {
      handleGeoError(error);
      await stopTargetSharing();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
  );

  setGlobalStatus("Waiting for target device location permission…", "info");
}

async function sendTargetLocation(location) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(state.session.id)}/location?token=${encodeURIComponent(state.session.targetToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(location),
  });

  if (!response.ok) {
    throw new Error("Failed to send target location");
  }
}

async function sendTargetStatus(sharing) {
  if (!state.session?.id || !state.session?.targetToken) {
    return;
  }

  try {
    await fetch(`/api/sessions/${encodeURIComponent(state.session.id)}/target-status?token=${encodeURIComponent(state.session.targetToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sharing }),
    });
  } catch {
    // ignore transient status update failures
  }
}

async function stopTargetSharing(notifyServer = true) {
  if (state.targetWatchId !== null) {
    navigator.geolocation.clearWatch(state.targetWatchId);
    state.targetWatchId = null;
  }

  elements.startTargetSharingBtn.disabled = false;
  elements.stopTargetSharingBtn.disabled = true;
  elements.targetSharingState.textContent = "Stopped";

  if (notifyServer && state.mode === "target") {
    await sendTargetStatus(false);
    setGlobalStatus("Target location sharing stopped.", "warning");
  }
}

function updateSelfMetrics(location) {
  elements.selfLatitudeValue.textContent = formatCoordinate(location.latitude);
  elements.selfLongitudeValue.textContent = formatCoordinate(location.longitude);
  elements.selfAccuracyValue.textContent = `${Math.round(location.accuracy)} m`;
  elements.selfUpdatedValue.textContent = formatDateTime(location.timestamp);
}

function addActivity(message, source = "System") {
  state.activity.unshift({ message, source, timestamp: Date.now() });
  state.activity = state.activity.slice(0, 12);
  renderActivity();
}

function renderActivity() {
  if (!elements.activityList) {
    return;
  }

  if (!state.activity.length) {
    elements.activityList.className = "detail-list empty-list";
    elements.activityList.innerHTML = "<li>No activity yet.</li>";
    return;
  }

  elements.activityList.className = "detail-list";
  elements.activityList.innerHTML = state.activity
    .map((entry) => `<li><strong>${entry.source}</strong><span>${entry.message}</span><small>${formatDateTime(entry.timestamp)}</small></li>`)
    .join("");
}

function resetRouteUi() {
  elements.routeDistanceValue.textContent = "—";
  elements.routeDurationValue.textContent = "—";
  elements.routeStepsList.className = "detail-list empty-list";
  elements.routeStepsList.innerHTML = "<li>No route calculated yet.</li>";
  state.routeLine.setLatLngs([]);
}

function toggleLiveFollow() {
  state.followTarget = !state.followTarget;
  refreshFollowButton();

  if (state.followTarget && state.latestTargetLocation) {
    centerOnTarget();
  }
}

function refreshFollowButton() {
  if (!elements.followTargetBtn) {
    return;
  }

  elements.followTargetBtn.textContent = `Live follow: ${state.followTarget ? "On" : "Off"}`;
  elements.followTargetBtn.className = `btn ${state.followTarget ? "btn-secondary" : "btn-ghost"}`;

  const floatingToggle = document.querySelector("[data-map-action='follow']");
  if (floatingToggle) {
    floatingToggle.textContent = state.followTarget ? "Follow on" : "Follow off";
    floatingToggle.classList.toggle("active", state.followTarget);
  }
}

function switchMapStyle(styleName) {
  const nextLayer = state.tileLayers[styleName] || state.tileLayers.street;

  if (state.currentTileLayer === nextLayer) {
    return;
  }

  if (state.currentTileLayer) {
    state.map.removeLayer(state.currentTileLayer);
  }

  state.currentTileLayer = nextLayer;
  state.currentTileLayer.addTo(state.map);
  setGlobalStatus(`Map style switched to ${capitalize(styleName)} view.`, "info");
}

function fitMapToRelevantBounds() {
  const layers = [];

  if (state.hostMarker) {
    layers.push(state.hostMarker);
  }

  if (state.targetMarker) {
    layers.push(state.targetMarker);
  }

  const routePoints = state.routeLine.getLatLngs();
  if (routePoints.length) {
    layers.push(state.routeLine);
  }

  const trailPoints = state.targetTrail.getLatLngs();
  if (trailPoints.length > 1) {
    layers.push(state.targetTrail);
  }

  if (!layers.length) {
    setGlobalStatus("No map markers are available yet to fit on the map.", "warning");
    return;
  }

  const group = L.featureGroup(layers);
  state.map.fitBounds(group.getBounds(), { padding: [36, 36], animate: true });
}

function updateStreetViewButtonState() {
  if (elements.openStreetViewBtn) {
    elements.openStreetViewBtn.disabled = !state.latestTargetLocation;
  }

  const streetViewBtn = document.querySelector("[data-map-action='streetview']");
  if (streetViewBtn) {
    streetViewBtn.disabled = !state.latestTargetLocation;
  }
}

function openStreetView() {
  if (!state.latestTargetLocation) {
    setGlobalStatus("No target location is available yet for street view.", "warning");
    return;
  }

  const { latitude, longitude } = state.latestTargetLocation;
  const url = `https://www.google.com/maps?q=&layer=c&cbll=${latitude},${longitude}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function normalizeCoords(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude,
    altitudeAccuracy: position.coords.altitudeAccuracy,
    heading: position.coords.heading,
    speed: position.coords.speed,
    timestamp: position.timestamp,
  };
}

function handleGeoError(error) {
  const messages = {
    1: "Location permission was denied.",
    2: "Location information is unavailable.",
    3: "Location request timed out.",
  };

  setGlobalStatus(messages[error.code] || "An unexpected geolocation error occurred.", "danger");
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatCoordinate(value) {
  return Number(value).toFixed(6);
}

function formatDateTime(value) {
  return new Date(value).toLocaleString();
}

function formatDistance(meters) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }

  return `${Math.round(meters)} m`;
}

function formatDuration(seconds) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return `${minutes} min`;
  }

  return `${hours} hr ${minutes} min`;
}

function capitalize(value) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function createMapActionControl() {
  const MapActionControl = L.Control.extend({
    options: {
      position: "topleft",
    },
    onAdd() {
      const container = L.DomUtil.create("div", "leaflet-bar leaflet-control map-action-control");
      container.innerHTML = `
        <button type="button" class="map-control-btn active" data-map-action="follow">Follow on</button>
        <button type="button" class="map-control-btn" data-map-action="fit">Fit</button>
        <button type="button" class="map-control-btn" data-map-action="target">Target</button>
        <button type="button" class="map-control-btn" data-map-action="streetview" disabled>Street View</button>
      `;

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      container.querySelector("[data-map-action='follow']")?.addEventListener("click", toggleLiveFollow);
      container.querySelector("[data-map-action='fit']")?.addEventListener("click", fitMapToRelevantBounds);
      container.querySelector("[data-map-action='target']")?.addEventListener("click", centerOnTarget);
      container.querySelector("[data-map-action='streetview']")?.addEventListener("click", openStreetView);

      return container;
    },
  });

  return new MapActionControl();
}