# Location Tracker

This project is now a host/target real-time tracking system with a simple UI and a lightweight Node.js backend.

## What it does

- A host creates a tracking session by entering their name plus the target person's name and email.
- The app generates a unique target link.
- The host shares that link with the target person.
- When the target opens the link and grants location access, the browser continuously sends the target device coordinates to the host dashboard.
- The host dashboard updates the map in real time and can also calculate directions from the host device to the target device.

## Main features

- Unique session link generation
- Dedicated host and target views
- Continuous target location streaming
- Real-time host dashboard updates using Server-Sent Events (SSE)
- Host-side location sharing for distance and route calculation
- Directions using OSRM and maps using Leaflet + OpenStreetMap
- Lightweight in-memory backend with no external npm packages required

## Files

- `server.js` – backend HTTP server, session management, SSE stream, static file serving
- `index.html` – redesigned UI for landing, host, and target modes
- `style.css` – responsive dark UI styling
- `app.js` – frontend logic for session creation, streaming, tracking, and routing

## Run locally

Start the local backend:

```bash
node server.js
```

Then open:

```text
http://localhost:3000
```

## Notes

- Sessions are stored in memory, so restarting the server clears active sessions.
- To let another device open the generated link, the server must be reachable from that device on your network or internet.
- Routing uses the public OSRM demo service, so route generation needs internet access.