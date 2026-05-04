import {
  BrainCircuit,
  BotMessageSquare,
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
  { id: "home", label: "Home", description: "Executive snapshot of revenue, readiness, and next actions.", icon: Home, status: "ready" },
  { id: "pricingAssistant", label: "Pricing Assistant", description: "Capture shopkeeper pricing decisions through a simple chat-style assistant.", icon: BotMessageSquare, status: "ready" },
  { id: "dataWorkspace", label: "Sales Data", description: "Upload CSV files, review data quality, and control the active dataset.", icon: Upload, status: "ready" },
  { id: "productsWorkspace", label: "Products", description: "Manage product readiness, pricing context, customer groups, and market signals.", icon: Package, status: "ready" },
  { id: "modelsWorkspace", label: "Pricing Insights", description: "Create trusted price-response insights from model-ready product groups.", icon: TrendingUp, status: "ready" },
  { id: "decisionsWorkspace", label: "Price Decisions", description: "Simulate prices, compare scenarios, and generate guarded recommendations.", icon: Target, status: "ready" },
  { id: "performanceWorkspace", label: "Performance Dashboard", description: "Track revenue movement, segment performance, and recommendation outcomes.", icon: LineChart, status: "ready" },
  { id: "exports", label: "Reports & Export", description: "Download examiner-ready reports with assumptions, formulas, and limitations.", icon: FileDown, status: "ready" },
  { id: "settings", label: "Settings", description: "Configure branding, currency, report defaults, access, and demo controls.", icon: Settings, status: "ready" }
];

export const mlSidebarItems = [
  { id: "mlDecisionSpace", label: "ML Decision Space", description: "Review the trained decision-quality assistant and model evidence.", icon: BrainCircuit, status: "ready" },
  { id: "pricingAssistant", label: "Pricing Assistant", description: "Capture shopkeeper pricing decisions through a simple chat-style assistant.", icon: BotMessageSquare, status: "ready" },
  { id: "exports", label: "Reports & Export", description: "Download examiner-ready reports with assumptions, formulas, and limitations.", icon: FileDown, status: "ready" },
  { id: "settings", label: "Settings", description: "Configure branding, currency, report defaults, access, and demo controls.", icon: Settings, status: "ready" }
];

export const allSidebarItems = [...sidebarItems, ...mlSidebarItems.filter((item) => !sidebarItems.some((existing) => existing.id === item.id))];

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
