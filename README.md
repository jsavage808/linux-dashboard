# Linux Tactical Dashboard

A full-stack Linux dashboard web app with a FastAPI backend and a React + Tailwind frontend.

## Features

- Dashboard metrics for CPU, RAM, disk, uptime, and network traffic
- Sidebar navigation for Dashboard, AI Chat, Terminal, ADS-B Tracker, V/UHF Monitor, and Settings
- System API endpoints under `/api/system`
- Browser terminal using xterm.js and a FastAPI WebSocket at `/ws/terminal`
- ADS-B tracker table and Leaflet map reading local readsb/dump1090 JSON
- Dark tactical operations UI
- Docker Compose setup for local Ubuntu deployment
- Placeholder page for the V/UHF workflow

## Project Structure

```text
linux-dashboard/
  backend/
    app/
      main.py
      routes/adsb.py
      routes/system.py
      routes/terminal.py
      services/adsb.py
      services/system_stats.py
    Dockerfile
    requirements.txt
  frontend/
    src/
      App.jsx
      main.jsx
      styles.css
    Dockerfile
    package.json
  docker-compose.yml
```

## Run On Ubuntu With Docker Compose

1. Install Docker and the Compose plugin:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

2. Optional: allow your user to run Docker without `sudo`.

```bash
sudo usermod -aG docker "$USER"
newgrp docker
```

3. Start the app:

```bash
cd linux-dashboard
docker compose up --build
```

4. Open the frontend:

```text
http://localhost:5173
```

The backend API will be available at:

```text
http://localhost:8000/api/system/stats
```

The terminal WebSocket is available at:

```text
ws://localhost:8000/ws/terminal
```

The ADS-B endpoint is available at:

```text
http://localhost:8000/api/adsb/aircraft
```

## ADS-B Setup

The backend tries common local readsb/dump1090 URLs through Docker's host gateway:

```text
http://host.docker.internal:8080/data/aircraft.json
http://host.docker.internal:8080/dump1090-fa/data/aircraft.json
http://host.docker.internal:8080/tar1090/data/aircraft.json
```

If your receiver exposes JSON somewhere else, create a `.env` file beside `docker-compose.yml`:

```bash
ADSB_JSON_URL=http://host.docker.internal:8080/data/aircraft.json
ADSB_RECEIVER_LAT=35.1234
ADSB_RECEIVER_LON=-97.1234
```

`ADSB_RECEIVER_LAT` and `ADSB_RECEIVER_LON` are used to calculate aircraft distance in nautical miles when aircraft latitude and longitude are present.

## Local Development Without Docker

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Notes

- The V/UHF Monitor page is still a placeholder.
- Docker containers report stats from inside their runtime environment. For direct host metrics, run the backend on the host or add host mounts and permissions appropriate for your deployment.
- Security warning: the browser terminal is an interactive shell. Do not expose it publicly without authentication, authorization, HTTPS, and strict network controls.
- The backend Docker image creates and runs as the non-root `appuser`; the terminal shell inherits that unprivileged user.
