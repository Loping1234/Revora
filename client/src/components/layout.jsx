import {
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  LogOut,
  Menu,
  ShieldCheck,
  UserRound,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { login } from "../lib/api";
import { useViewMode } from "../lib/view-mode";
import { sidebarItems } from "../config/navigation";
import {
  StatusPill
} from "./common";

export function Sidebar({ activePanel, setActivePanel, isOpen, setIsOpen, settings }) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 w-72 overflow-y-auto border-r border-slate-200 bg-white px-4 py-5 transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:translate-x-0 ${
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
      <div className="min-h-0 flex-1 overflow-auto pr-1">{active?.content}</div>
    </div>
  );
}

function ViewModeToggle() {
  const { detailed, setDetailed } = useViewMode();

  return (
    <button
      aria-label={detailed ? "Switch to Simple View" : "Switch to Detailed View"}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        detailed
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
      onClick={() => setDetailed(!detailed)}
      type="button"
    >
      {detailed ? <Eye size={13} /> : <EyeOff size={13} />}
      {detailed ? "Detailed View" : "Simple View"}
    </button>
  );
}

export function AppShell({
  activeItem,
  apiBaseUrl,
  children,
  databaseStatus,
  datasetSummary,
  error,
  health,
  isSidebarOpen,
  onLogout,
  session,
  setActivePanel,
  setIsSidebarOpen,
  settings,
  status
}) {
  return (
    <main className={`h-screen overflow-hidden bg-slate-50 text-slate-950 ${settings.appearanceMode === "dark" ? "theme-dark" : ""}`}>
      {isSidebarOpen && <div className="fixed inset-0 z-20 bg-slate-950/30 lg:hidden" onClick={() => setIsSidebarOpen(false)} />}

      <div className="grid h-screen min-h-0 lg:grid-cols-[288px_1fr]">
        <Sidebar activePanel={activeItem.id} isOpen={isSidebarOpen} setActivePanel={setActivePanel} setIsOpen={setIsSidebarOpen} settings={settings} />

        <section className="flex h-screen min-w-0 flex-col overflow-hidden px-5 py-4 sm:px-8 lg:px-8">
          <header className="shrink-0 border-b border-slate-200 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  aria-label="Open sidebar"
                  className="mt-1 rounded-md border border-slate-200 bg-white p-2 text-slate-600 lg:hidden"
                  onClick={() => setIsSidebarOpen(true)}
                  type="button"
                >
                  <Menu size={18} />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase text-slate-500">Pricing Management</p>
                  <h1 className="mt-1 truncate text-2xl font-semibold tracking-normal">{activeItem.label}</h1>
                  {activeItem.description && <p className="mt-1 max-w-3xl text-sm text-slate-500">{activeItem.description}</p>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {datasetSummary && (
                  <div className={`hidden max-w-xs rounded-md border px-3 py-1.5 text-xs sm:block ${datasetSummary.warning ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600"}`}>
                    <p className="truncate font-medium">{datasetSummary.label}</p>
                    <p className="mt-0.5 truncate">{datasetSummary.detail}</p>
                  </div>
                )}
                <div className="hidden items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 sm:flex">
                  <UserRound size={14} />
                  <span>{session.user.name}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium capitalize">{session.user.role}</span>
                </div>
                <StatusPill state={status} />
                <ViewModeToggle />
                <details className="relative">
                  <summary className="list-none rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    Details
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg">
                    <p className="truncate">Service: {apiBaseUrl}</p>
                    <p className="mt-2">Data connection: {databaseStatus}</p>
                    <p className="mt-2">Last checked: {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : "Pending"}</p>
                    <p className="mt-2">{error || "No system errors reported"}</p>
                  </div>
                </details>
                <button
                  aria-label="Logout"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  onClick={onLogout}
                  type="button"
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          </header>

          <div className="mt-4 min-h-0 flex-1 overflow-auto pr-1">{children}</div>
        </section>
      </div>
    </main>
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
    setPassword(nextRole === "admin" ? "admin123" : nextRole === "analyst" ? "analyst123" : "manager123");
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
          <div className="mt-6 grid max-w-xl gap-3 sm:grid-cols-3">
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
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <UserRound className="text-slate-700" size={20} />
              <p className="mt-3 text-sm font-semibold">Manager</p>
              <p className="mt-1 text-sm text-slate-500">View dashboards, reports, recommendations, and outcomes.</p>
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

          <div className="mt-6 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {["admin", "analyst", "manager"].map((item) => (
              <button
                className={`h-10 rounded-md text-sm font-medium ${role === item ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white"}`}
                key={item}
                onClick={() => handleRoleChange(item)}
                type="button"
              >
                {item === "admin" ? "Admin" : item === "analyst" ? "Analyst" : "Manager"}
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
