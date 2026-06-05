import {
  Activity,
  Bot,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
  Radio,
  Router,
  Satellite,
  Settings,
  TerminalSquare,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

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

function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const activeItem = navItems.find((item) => item.id === activePage) ?? navItems[0];

  const pages = {
    dashboard: <DashboardPage />,
    chat: <PlaceholderPage title="AI Chat" icon={Bot} detail="Chat interface shell reserved for future model integration." />,
    terminal: <PlaceholderPage title="Terminal" icon={TerminalSquare} detail="Remote terminal controls will be added after auth and command policy are defined." />,
    adsb: <PlaceholderPage title="ADS-B Tracker" icon={Satellite} detail="Placeholder for aircraft tracking, receivers, and map overlays." />,
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
