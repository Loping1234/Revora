import {
  FileDown,
  Home,
  LineChart,
  Package,
  Settings,
  Target,
  TrendingUp,
  Upload
} from "lucide-react";

export const sidebarItems = [
  { id: "home", label: "Home", icon: Home, status: "ready" },
  { id: "dataWorkspace", label: "Data Workspace", icon: Upload, status: "ready" },
  { id: "productsWorkspace", label: "Products", icon: Package, status: "ready" },
  { id: "modelsWorkspace", label: "Pricing Models", icon: TrendingUp, status: "ready" },
  { id: "decisionsWorkspace", label: "Price Decisions", icon: Target, status: "ready" },
  { id: "performanceWorkspace", label: "Performance", icon: LineChart, status: "ready" },
  { id: "exports", label: "Reports & Export", icon: FileDown, status: "ready" },
  { id: "settings", label: "Settings", icon: Settings, status: "ready" }
];

export const objectiveOptions = [
  { value: "profit", label: "Best profit" },
  { value: "revenue", label: "Best revenue" },
  { value: "clear_inventory", label: "Clear inventory" },
  { value: "match_competitor", label: "Match competitor" }
];

export const defaultSettings = {
  companyName: "Pricing Manager",
  currency: "USD",
  themeColor: "#020617",
  appearanceMode: "light",
  defaultObjective: "profit",
  reportName: "Pricing Recommendation Report"
};

export function getObjectiveLabel(objective) {
  return objectiveOptions.find((item) => item.value === objective)?.label || "Best profit";
}
