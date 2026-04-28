import {
  BarChart3,
  BadgeDollarSign,
  Boxes,
  Calculator,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Database,
  FileDown,
  Gauge,
  GitBranch,
  History,
  LineChart,
  Menu,
  Package,
  PieChart,
  Settings,
  ShieldCheck,
  Target,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { login } from "../lib/api";
import { objectiveOptions, sidebarItems } from "../config/navigation";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSegmentName,
  getConfidenceLabel,
  getPriceSensitivityLabel
} from "../utils/formatters";
import {
  getReadinessStyles,
  getReliabilityStyles,
  getResultModeStyles
} from "../utils/statusStyles";
import {
  HorizontalBars,
  MiniRevenueTrend,
  SummaryCard,
  WarningPanel
} from "./common";

export function Sidebar({ activePanel, setActivePanel, isOpen, setIsOpen, settings }) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 w-72 overflow-y-auto border-r border-slate-200 bg-white px-4 py-5 transition-transform lg:static lg:h-screen lg:w-72 lg:translate-x-0 ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white" style={{ backgroundColor: settings.themeColor || "#020617" }}>
            <BarChart3 size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold">{settings.companyName || "Pricing Manager"}</p>
            <p className="text-xs text-slate-500">Revenue workspace</p>
          </div>
        </div>
        <button
          aria-label="Close sidebar"
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
          onClick={() => setIsOpen(false)}
          type="button"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="mt-8 grid gap-1">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePanel === item.id;

          return (
            <button
              key={item.id}
              className={`flex min-h-10 items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${
                isActive ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
              onClick={() => {
                setActivePanel(item.id);
                setIsOpen(false);
              }}
              type="button"
            >
              <span className="flex items-center gap-3">
                <Icon size={17} />
                <span>{item.label}</span>
              </span>
              {item.status === "ready" && <CheckCircle2 size={15} />}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function WorkspaceTabs({ tabs }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || "");
  const active = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id || "");
    }
  }, [activeTab, tabs]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button
              className={`h-10 rounded-md px-3 text-sm font-medium ${
                active?.id === tab.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div>{active?.content}</div>
    </div>
  );
}

export function PlaceholderPanel({ icon: Icon, title, primary, secondary }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white">
        <Icon size={20} />
      </div>
      <h2 className="mt-5 text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{primary}</p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{secondary}</p>
    </section>
  );
}

export function LoginScreen({ onLogin }) {
  const [role, setRole] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [loginState, setLoginState] = useState("idle");
  const [loginMessage, setLoginMessage] = useState("");

  async function handleLogin(event) {
    event.preventDefault();
    setLoginState("running");
    setLoginMessage("");

    try {
      const session = await login({ role, password });
      setLoginState("success");
      onLogin(session);
    } catch (err) {
      setLoginState("error");
      setLoginMessage(err.message);
    }
  }

  function handleRoleChange(nextRole) {
    setRole(nextRole);
    setPassword(nextRole === "admin" ? "admin123" : "analyst123");
    setLoginMessage("");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-950">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl items-center gap-6 lg:grid-cols-[1fr_420px]">
        <div>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-950 text-white">
            <BarChart3 size={24} />
          </div>
          <p className="mt-8 text-sm font-medium uppercase text-slate-500">Pricing Management</p>
          <h1 className="mt-2 max-w-2xl text-4xl font-semibold tracking-normal text-slate-950">Sign in to your pricing workspace</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
            Use the demo roles to show an examiner that uploads, resets, settings, simulations, and reports are controlled by authenticated access.
          </p>
          <div className="mt-6 grid max-w-xl gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <ShieldCheck className="text-slate-700" size={20} />
              <p className="mt-3 text-sm font-semibold">Admin</p>
              <p className="mt-1 text-sm text-slate-500">Upload CSVs, reset workspace data, and edit settings.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <UserRound className="text-slate-700" size={20} />
              <p className="mt-3 text-sm font-semibold">Analyst</p>
              <p className="mt-1 text-sm text-slate-500">View insights, simulate prices, create recommendations, and export reports.</p>
            </div>
          </div>
        </div>

        <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={handleLogin}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Login</h2>
              <p className="text-sm text-slate-500">Local demo access</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {["admin", "analyst"].map((item) => (
              <button
                className={`h-10 rounded-md text-sm font-medium ${role === item ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white"}`}
                key={item}
                onClick={() => handleRoleChange(item)}
                type="button"
              >
                {item === "admin" ? "Admin" : "Analyst"}
              </button>
            ))}
          </div>

          <label className="mt-5 grid gap-2 text-sm font-medium text-slate-700">
            Password
            <input
              className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>

          <button
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={loginState === "running"}
            type="submit"
          >
            {loginState === "running" ? "Signing in" : "Sign in"}
          </button>

          {loginMessage && <p className="mt-3 text-sm text-rose-700">{loginMessage}</p>}
          <p className="mt-4 text-xs leading-5 text-slate-500">Demo passwords are configurable in the backend environment file before deployment.</p>
        </form>
      </section>
    </main>
  );
}
