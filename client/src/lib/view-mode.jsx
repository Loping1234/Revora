import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "dp-di-view-mode";

const ViewModeContext = createContext({ detailed: false, setDetailed: () => {} });

/**
 * Global provider for the Simple / Detailed view toggle.
 * Persists the choice in localStorage.
 */
export function ViewModeProvider({ children }) {
  const [detailed, setDetailed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "detailed";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, detailed ? "detailed" : "simple");
    } catch {
      /* storage not available */
    }
  }, [detailed]);

  return (
    <ViewModeContext.Provider value={{ detailed, setDetailed }}>
      {children}
    </ViewModeContext.Provider>
  );
}

/**
 * Hook that returns the current view mode and setter.
 * - `detailed === false` → Simple View (hide optional explanations)
 * - `detailed === true`  → Detailed View (show everything)
 */
export function useViewMode() {
  return useContext(ViewModeContext);
}
