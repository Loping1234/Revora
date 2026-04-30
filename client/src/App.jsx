import { useEffect, useState } from "react";
import { getStoredSession, setStoredSession } from "./lib/api";
import { AuthenticatedApp } from "./components/authenticated-app";
import { AppErrorBoundary } from "./components/common";
import { LoginScreen } from "./components/workspaces";

function App() {
  const [session, setSession] = useState(() => getStoredSession());

  function handleLogout() {
    setStoredSession(null);
    setSession(null);
  }

  useEffect(() => {
    function handleSessionExpired() {
      handleLogout();
    }

    window.addEventListener("dp-di-session-expired", handleSessionExpired);
    return () => window.removeEventListener("dp-di-session-expired", handleSessionExpired);
  }, []);

  if (!session) {
    return (
      <AppErrorBoundary>
        <LoginScreen onLogin={setSession} />
      </AppErrorBoundary>
    );
  }

  return (
    <AppErrorBoundary>
      <AuthenticatedApp onLogout={handleLogout} session={session} />
    </AppErrorBoundary>
  );
}

export default App;
