import {
  AlertTriangle,
  Activity,
  Bot,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
  MapPin,
  Plane,
  Radio,
  Router,
  Satellite,
  Settings,
  TerminalSquare,
  Wifi,
} from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "@xterm/xterm/css/xterm.css";

const DEFAULT_API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`;
const API_BASE = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE;
const WS_BASE = API_BASE.replace(/^http/, "ws");

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "chat", label: "AI Chat", icon: Bot },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "adsb", label: "ADS-B Tracker", icon: Satellite },
  { id: "vuhf", label: "V/UHF Monitor", icon: Radio },
  { id: "settings", label: "Settings", icon: Settings },
];

function formatBytes(value = 0) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function MetricCard({ icon: Icon, label, value, detail, percent }) {
  return (
    <section className="metric-card">
      <div className="metric-header">
        <span className="metric-icon">
          <Icon size={20} />
        </span>
        <span>{label}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
      {typeof percent === "number" && (
        <div className="meter" aria-label={`${label} usage`}>
          <span style={{ width: `${Math.min(percent, 100)}%` }} />
        </div>
      )}
    </section>
  );
}

function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadStats() {
      try {
        const response = await fetch(`${API_BASE}/api/system/stats`);
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const data = await response.json();
        if (!ignore) {
          setStats(data);
          setError("");
        }
      } catch (err) {
        if (!ignore) setError(err.message);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadStats();
    const interval = window.setInterval(loadStats, 5000);
    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, []);

  const primaryInterface = useMemo(() => {
    const interfaces = stats?.network?.interfaces ?? [];
    return interfaces.find((item) => item.ipv4?.length) ?? interfaces[0];
  }, [stats]);

  if (loading) {
    return <div className="panel">Establishing telemetry link...</div>;
  }

  if (error) {
    return (
      <div className="panel alert-panel">
        <h2>Telemetry offline</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="dashboard-grid">
      <section className="command-strip">
        <div>
          <p className="eyebrow">Node</p>
          <h1>{stats.hostname}</h1>
          <span>{stats.platform}</span>
        </div>
        <div className="status-pill">
          <Activity size={16} />
          Live
        </div>
      </section>

      <MetricCard
        icon={Cpu}
        label="CPU"
        value={`${stats.cpu.percent.toFixed(1)}%`}
        detail={`${stats.cpu.cores_physical ?? "-"} physical / ${stats.cpu.cores_logical ?? "-"} logical cores`}
        percent={stats.cpu.percent}
      />
      <MetricCard
        icon={MemoryStick}
        label="RAM"
        value={`${stats.memory.percent.toFixed(1)}%`}
        detail={`${stats.memory.used_gib} GiB used / ${stats.memory.total_gib} GiB`}
        percent={stats.memory.percent}
      />
      <MetricCard
        icon={HardDrive}
        label="Disk"
        value={`${stats.disk.percent.toFixed(1)}%`}
        detail={`${stats.disk.free_gib} GiB free on ${stats.disk.mount}`}
        percent={stats.disk.percent}
      />
      <MetricCard
        icon={Router}
        label="Uptime"
        value={stats.uptime.display}
        detail={`Booted ${new Date(stats.uptime.boot_time).toLocaleString()}`}
      />

      <section className="wide-panel">
        <div className="section-title">
          <Wifi size={19} />
          Network
        </div>
        <div className="network-grid">
          <div>
            <span className="label">Primary interface</span>
            <strong>{primaryInterface?.name ?? "Unavailable"}</strong>
            <p>{primaryInterface?.ipv4?.join(", ") || "No IPv4 address detected"}</p>
          </div>
          <div>
            <span className="label">Received</span>
            <strong>{formatBytes(stats.network.total.bytes_recv)}</strong>
            <p>{stats.network.total.packets_recv.toLocaleString()} packets</p>
          </div>
          <div>
            <span className="label">Sent</span>
            <strong>{formatBytes(stats.network.total.bytes_sent)}</strong>
            <p>{stats.network.total.packets_sent.toLocaleString()} packets</p>
          </div>
        </div>
      </section>

      <section className="wide-panel">
        <div className="section-title">
          <Activity size={19} />
          Load Average
        </div>
        <div className="load-row">
          <span>1 min: {stats.cpu.load_average.one}</span>
          <span>5 min: {stats.cpu.load_average.five}</span>
          <span>15 min: {stats.cpu.load_average.fifteen}</span>
        </div>
      </section>
    </div>
  );
}

function PlaceholderPage({ title, icon: Icon, detail }) {
  return (
    <section className="panel placeholder">
      <Icon size={34} />
      <h1>{title}</h1>
      <p>{detail}</p>
    </section>
  );
}

function formatValue(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return `${Math.round(value).toLocaleString()}${suffix}`;
  return `${value}${suffix}`;
}

function AircraftMap({ aircraft, receiver }) {
  const mapRef = useRef(null);
  const mapNodeRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return undefined;

    mapRef.current = L.map(mapNodeRef.current, {
      attributionControl: false,
      zoomControl: true,
    }).setView([39.8283, -98.5795], 4);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 12,
      attribution: "OpenStreetMap",
    }).addTo(mapRef.current);
    layerRef.current = L.layerGroup().addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;

    layerRef.current.clearLayers();
    const positionedAircraft = aircraft.filter((item) => item.lat !== null && item.lon !== null);

    if (receiver) {
      L.circleMarker([receiver.lat, receiver.lon], {
        radius: 6,
        color: "#a3e635",
        fillColor: "#a3e635",
        fillOpacity: 0.85,
      })
        .bindTooltip("Receiver")
        .addTo(layerRef.current);
    }

    positionedAircraft.forEach((item) => {
      const heading = Number(item.heading) || 0;
      const marker = L.marker([item.lat, item.lon], {
        icon: L.divIcon({
          className: "aircraft-marker",
          html: `<span style="transform: rotate(${heading}deg)">▲</span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).bindTooltip(`${item.callsign} ${formatValue(item.altitude, " ft")}`);
      marker.addTo(layerRef.current);
    });

    const boundsPoints = [
      ...positionedAircraft.map((item) => [item.lat, item.lon]),
      ...(receiver ? [[receiver.lat, receiver.lon]] : []),
    ];

    if (boundsPoints.length > 1) {
      mapRef.current.fitBounds(boundsPoints, { padding: [28, 28], maxZoom: 9 });
    } else if (boundsPoints.length === 1) {
      mapRef.current.setView(boundsPoints[0], 8);
    }
  }, [aircraft, receiver]);

  return <div ref={mapNodeRef} className="adsb-map" />;
}

function AdsbPage() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadAircraft() {
      try {
        const response = await fetch(`${API_BASE}/api/adsb/aircraft`);
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const data = await response.json();
        if (!ignore) {
          setSnapshot(data);
          setError("");
        }
      } catch (err) {
        if (!ignore) setError(err.message);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadAircraft();
    const interval = window.setInterval(loadAircraft, 5000);
    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, []);

  const aircraft = snapshot?.aircraft ?? [];
  const positionedCount = aircraft.filter((item) => item.lat !== null && item.lon !== null).length;

  if (loading) {
    return <div className="panel">Scanning for ADS-B feed...</div>;
  }

  return (
    <div className="adsb-layout">
      {(error || !snapshot?.service_available) && (
        <section className="setup-warning">
          <AlertTriangle size={19} />
          <div>
            <strong>ADS-B service not detected</strong>
            <p>
              Start readsb or dump1090 and expose an aircraft JSON endpoint, or set
              {" "}ADSB_JSON_URL in Docker Compose.
            </p>
            {error && <p>{error}</p>}
          </div>
        </section>
      )}

      <section className="command-strip">
        <div>
          <p className="eyebrow">ADS-B Feed</p>
          <h1>{snapshot?.service_available ? `${aircraft.length} Aircraft` : "Awaiting Receiver"}</h1>
          <span>{snapshot?.source ?? "No readsb/dump1090 endpoint connected"}</span>
        </div>
        <div className="status-pill">
          <Plane size={16} />
          {positionedCount} mapped
        </div>
      </section>

      <section className="adsb-map-panel">
        <div className="section-title">
          <MapPin size={19} />
          Aircraft Positions
        </div>
        <AircraftMap aircraft={aircraft} receiver={snapshot?.receiver} />
      </section>

      <section className="adsb-table-panel">
        <div className="section-title">
          <Satellite size={19} />
          Aircraft Table
        </div>
        <div className="table-wrap">
          <table className="aircraft-table">
            <thead>
              <tr>
                <th>Callsign</th>
                <th>Altitude</th>
                <th>Speed</th>
                <th>Heading</th>
                <th>Distance</th>
              </tr>
            </thead>
            <tbody>
              {aircraft.length === 0 ? (
                <tr>
                  <td colSpan="5">No aircraft currently available.</td>
                </tr>
              ) : (
                aircraft.map((item) => (
                  <tr key={item.hex || `${item.callsign}-${item.seen}`}>
                    <td>
                      <strong>{item.callsign}</strong>
                      <span>{item.hex ?? "No hex"}</span>
                    </td>
                    <td>{formatValue(item.altitude, " ft")}</td>
                    <td>{formatValue(item.speed, " kt")}</td>
                    <td>{formatValue(item.heading, " deg")}</td>
                    <td>{item.distance_nm === null ? "-" : `${item.distance_nm} nm`}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TerminalPage() {
  const terminalRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return undefined;

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 14,
      theme: {
        background: "#07110f",
        foreground: "#dfffee",
        cursor: "#a3e635",
        selectionBackground: "#155e75",
        black: "#020617",
        brightBlack: "#475569",
        red: "#f87171",
        brightRed: "#fecaca",
        green: "#86efac",
        brightGreen: "#bbf7d0",
        yellow: "#fde047",
        brightYellow: "#fef08a",
        blue: "#38bdf8",
        brightBlue: "#7dd3fc",
        magenta: "#c084fc",
        brightMagenta: "#e9d5ff",
        cyan: "#5eead4",
        brightCyan: "#99f6e4",
        white: "#e2e8f0",
        brightWhite: "#f8fafc",
      },
    });
    const fitAddon = new FitAddon();
    const socket = new WebSocket(`${WS_BASE}/ws/terminal`);

    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current);

    const sendResize = () => {
      fitAddon.fit();
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "resize",
            cols: terminal.cols,
            rows: terminal.rows,
          })
        );
      }
    };

    socket.addEventListener("open", () => {
      setConnected(true);
      terminal.writeln("Connected to backend shell.");
      sendResize();
    });

    socket.addEventListener("message", (event) => {
      terminal.write(event.data);
    });

    socket.addEventListener("close", () => {
      setConnected(false);
      terminal.writeln("\r\nConnection closed.");
    });

    socket.addEventListener("error", () => {
      terminal.writeln("\r\nTerminal WebSocket error.");
    });

    const dataDisposable = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data }));
      }
    });

    const resizeObserver = new ResizeObserver(sendResize);
    resizeObserver.observe(terminalRef.current);
    window.setTimeout(sendResize, 0);

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      socket.close();
      terminal.dispose();
    };
  }, []);

  return (
    <section className="terminal-panel">
      <div className="terminal-warning">
        <AlertTriangle size={17} />
        Do not expose this terminal publicly without strong access controls.
        <span className={connected ? "terminal-status online" : "terminal-status"}>{connected ? "Connected" : "Offline"}</span>
      </div>
      <div ref={terminalRef} className="terminal-host" />
    </section>
  );
}

function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const activeItem = navItems.find((item) => item.id === activePage) ?? navItems[0];

  const pages = {
    dashboard: <DashboardPage />,
    chat: <PlaceholderPage title="AI Chat" icon={Bot} detail="Chat interface shell reserved for future model integration." />,
    terminal: <TerminalPage />,
    adsb: <AdsbPage />,
    vuhf: <PlaceholderPage title="V/UHF Monitor" icon={Radio} detail="Placeholder for VHF and UHF monitoring workflows." />,
    settings: <PlaceholderPage title="Settings" icon={Settings} detail="Configuration controls for refresh cadence, node labels, and integrations." />,
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">LD</span>
          <div>
            <strong>Linux Dash</strong>
            <small>Tactical Ops Console</small>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={item.id === activePage ? "nav-item active" : "nav-item"}
                onClick={() => setActivePage(item.id)}
                type="button"
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">Console</span>
            <h2>{activeItem.label}</h2>
          </div>
          <span className="clock">{new Date().toLocaleDateString()}</span>
        </header>
        {pages[activePage]}
      </main>
    </div>
  );
}

export default App;
