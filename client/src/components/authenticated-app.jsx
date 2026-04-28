import { LogOut, Menu, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  API_BASE_URL,
  applyRecommendation,
  createRecommendation,
  downloadRecommendationReport,
  downloadReport,
  fitDemandModel,
  getCompetitorMarket,
  getCustomerSegments,
  getDashboardSummary,
  getDataQualitySummary,
  getHealthStatus,
  getInsightReadiness,
  getProductDuplicates,
  getProductIntelligence,
  getProductRelationships,
  getProducts,
  getRecommendationPerformance,
  getRecommendations,
  getSeasonalitySummary,
  getWorkspaceSettings,
  mergeProducts,
  planScenarios,
  resetWorkspaceData,
  setActiveImportBatch,
  simulatePrice,
  updateWorkspaceSettings,
  uploadSalesCsv
} from "../lib/api";
import { defaultSettings, getObjectiveLabel, objectiveOptions, sidebarItems } from "../config/navigation";
import { formatSegmentName } from "../utils/formatters";
import { StatusPill } from "./common";
import {
  CustomerSegmentsPanel,
  CompetitorMarketPanel,
  DashboardPanel,
  DataQualityPanel,
  HistoryPanel,
  HomeOverview,
  AppShell,
  PlaceholderPanel,
  PriceSimulatorPanel,
  PricingInsightsPanel,
  ProductIntelligencePanel,
  ProductMatchingPanel,
  ProductRelationshipsPanel,
  ProductsTable,
  RecommendationPanel,
  RecommendationPerformancePanel,
  ReportsExportPanel,
  SalesDataPanel,
  ScenarioPlannerPanel,
  SeasonalityPanel,
  SettingsPanel,
  Sidebar,
  WorkspaceTabs
} from "./workspaces";

export function AuthenticatedApp({ session, onLogout }) {
  const [activePanel, setActivePanel] = useState("home");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [health, setHealth] = useState(null);
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");
  const [productError, setProductError] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadState, setUploadState] = useState("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadSummary, setUploadSummary] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedSegment, setSelectedSegment] = useState("all");
  const [modelState, setModelState] = useState("idle");
  const [modelMessage, setModelMessage] = useState("");
  const [latestModel, setLatestModel] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [readinessState, setReadinessState] = useState("idle");
  const [readinessMessage, setReadinessMessage] = useState("");
  const [simulatorProductId, setSimulatorProductId] = useState("");
  const [simulatorSegment, setSimulatorSegment] = useState("all");
  const [simulatorPrice, setSimulatorPrice] = useState("");
  const [simulatorCompetitorPrice, setSimulatorCompetitorPrice] = useState("");
  const [simulationState, setSimulationState] = useState("idle");
  const [simulationMessage, setSimulationMessage] = useState("");
  const [simulationResult, setSimulationResult] = useState(null);
  const [recommendationProductId, setRecommendationProductId] = useState("");
  const [recommendationSegment, setRecommendationSegment] = useState("all");
  const [recommendationObjective, setRecommendationObjective] = useState("profit");
  const [recommendationMinPrice, setRecommendationMinPrice] = useState("");
  const [recommendationMaxPrice, setRecommendationMaxPrice] = useState("");
  const [recommendationStep, setRecommendationStep] = useState("");
  const [recommendationCompetitorPrice, setRecommendationCompetitorPrice] = useState("");
  const [recommendationState, setRecommendationState] = useState("idle");
  const [recommendationMessage, setRecommendationMessage] = useState("");
  const [recommendationResult, setRecommendationResult] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardState, setDashboardState] = useState("idle");
  const [dashboardMessage, setDashboardMessage] = useState("");
  const [resetState, setResetState] = useState("idle");
  const [resetMessage, setResetMessage] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [historyState, setHistoryState] = useState("idle");
  const [historyMessage, setHistoryMessage] = useState("");
  const [exportState, setExportState] = useState("idle");
  const [exportMessage, setExportMessage] = useState("");
  const [settings, setSettings] = useState(defaultSettings);
  const [settingsForm, setSettingsForm] = useState(defaultSettings);
  const [settingsState, setSettingsState] = useState("idle");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [dataQuality, setDataQuality] = useState(null);
  const [dataQualityState, setDataQualityState] = useState("idle");
  const [dataQualityMessage, setDataQualityMessage] = useState("");
  const [productIntelligence, setProductIntelligence] = useState(null);
  const [productIntelligenceState, setProductIntelligenceState] = useState("idle");
  const [productIntelligenceMessage, setProductIntelligenceMessage] = useState("");
  const [customerSegments, setCustomerSegments] = useState([]);
  const [customerSegmentsState, setCustomerSegmentsState] = useState("idle");
  const [customerSegmentsMessage, setCustomerSegmentsMessage] = useState("");
  const [competitorMarket, setCompetitorMarket] = useState(null);
  const [competitorMarketState, setCompetitorMarketState] = useState("idle");
  const [competitorMarketMessage, setCompetitorMarketMessage] = useState("");
  const [seasonality, setSeasonality] = useState(null);
  const [seasonalityState, setSeasonalityState] = useState("idle");
  const [seasonalityMessage, setSeasonalityMessage] = useState("");
  const [relationships, setRelationships] = useState(null);
  const [relationshipsState, setRelationshipsState] = useState("idle");
  const [relationshipsMessage, setRelationshipsMessage] = useState("");
  const [scenarioProductId, setScenarioProductId] = useState("");
  const [scenarioSegment, setScenarioSegment] = useState("all");
  const [scenarioPrices, setScenarioPrices] = useState(["", "", ""]);
  const [scenarioCompetitorPrice, setScenarioCompetitorPrice] = useState("");
  const [scenarioState, setScenarioState] = useState("idle");
  const [scenarioMessage, setScenarioMessage] = useState("");
  const [scenarioResult, setScenarioResult] = useState(null);
  const [productDuplicates, setProductDuplicates] = useState(null);
  const [productDuplicatesState, setProductDuplicatesState] = useState("idle");
  const [productDuplicatesMessage, setProductDuplicatesMessage] = useState("");
  const [recommendationPerformance, setRecommendationPerformance] = useState(null);
  const [recommendationPerformanceState, setRecommendationPerformanceState] = useState("idle");
  const [recommendationPerformanceMessage, setRecommendationPerformanceMessage] = useState("");

  const activeItem = sidebarItems.find((item) => item.id === activePanel) || sidebarItems[0];
  const currency = settings.currency || "USD";

  async function refreshProducts() {
    const payload = await getProducts();
    setProducts(payload.data || []);
  }

  async function refreshDashboard() {
    setDashboardState("loading");
    setDashboardMessage("Refreshing performance dashboard.");

    try {
      const payload = await getDashboardSummary();
      setDashboardData(payload.data);
      setDashboardState("success");
      setDashboardMessage("");
    } catch (err) {
      setDashboardState("error");
      setDashboardMessage(err.message);
    }
  }

  async function refreshHistory() {
    setHistoryState("loading");
    setHistoryMessage("Loading recommendation history.");

    try {
      const payload = await getRecommendations();
      setRecommendations(payload.data || []);
      setHistoryState("success");
      setHistoryMessage("");
    } catch (err) {
      setHistoryState("error");
      setHistoryMessage(err.message);
    }
  }

  async function refreshReadiness() {
    setReadinessState("loading");
    setReadinessMessage("Checking which products have enough repeated sales rows.");

    try {
      const payload = await getInsightReadiness();
      setReadiness(payload.data);
      setReadinessState("success");
      setReadinessMessage("");
    } catch (err) {
      setReadinessState("error");
      setReadinessMessage(err.message);
    }
  }

  async function refreshDataQuality() {
    setDataQualityState("loading");
    setDataQualityMessage("Checking import quality and model readiness.");

    try {
      const payload = await getDataQualitySummary();
      setDataQuality(payload.data);
      setDataQualityState("success");
      setDataQualityMessage("");
    } catch (err) {
      setDataQualityState("error");
      setDataQualityMessage(err.message);
    }
  }

  async function handleSetActiveImportBatch(importBatchId) {
    setDataQualityState("loading");
    setDataQualityMessage("Updating the active modeling dataset.");

    try {
      await setActiveImportBatch(importBatchId);
      await Promise.all([refreshDataQuality(), refreshReadiness()]);
      setLatestModel(null);
      setSimulationResult(null);
      setRecommendationResult(null);
      setDataQualityState("success");
      setDataQualityMessage(importBatchId ? "Selected import batch is now used for modeling." : "All imported sales rows are now used for modeling.");
    } catch (err) {
      setDataQualityState("error");
      setDataQualityMessage(err.message);
    }
  }

  async function refreshProductIntelligence() {
    setProductIntelligenceState("loading");
    setProductIntelligenceMessage("Reviewing product-level performance.");

    try {
      const payload = await getProductIntelligence();
      setProductIntelligence(payload.data);
      setProductIntelligenceState("success");
      setProductIntelligenceMessage("");
    } catch (err) {
      setProductIntelligenceState("error");
      setProductIntelligenceMessage(err.message);
    }
  }

  async function refreshCustomerSegments() {
    setCustomerSegmentsState("loading");
    setCustomerSegmentsMessage("Comparing customer groups.");

    try {
      const payload = await getCustomerSegments();
      setCustomerSegments(payload.data || []);
      setCustomerSegmentsState("success");
      setCustomerSegmentsMessage("");
    } catch (err) {
      setCustomerSegmentsState("error");
      setCustomerSegmentsMessage(err.message);
    }
  }

  async function refreshCompetitorMarket() {
    setCompetitorMarketState("loading");
    setCompetitorMarketMessage("Checking competitor price coverage.");

    try {
      const payload = await getCompetitorMarket();
      setCompetitorMarket(payload.data);
      setCompetitorMarketState("success");
      setCompetitorMarketMessage("");
    } catch (err) {
      setCompetitorMarketState("error");
      setCompetitorMarketMessage(err.message);
    }
  }

  async function refreshSeasonality() {
    setSeasonalityState("loading");
    setSeasonalityMessage("Checking seasonal and promotional demand patterns.");

    try {
      const payload = await getSeasonalitySummary();
      setSeasonality(payload.data);
      setSeasonalityState("success");
      setSeasonalityMessage("");
    } catch (err) {
      setSeasonalityState("error");
      setSeasonalityMessage(err.message);
    }
  }

  async function refreshRelationships() {
    setRelationshipsState("loading");
    setRelationshipsMessage("Checking product relationship signals.");

    try {
      const payload = await getProductRelationships();
      setRelationships(payload.data);
      setRelationshipsState("success");
      setRelationshipsMessage("");
    } catch (err) {
      setRelationshipsState("error");
      setRelationshipsMessage(err.message);
    }
  }

  async function refreshProductDuplicates() {
    setProductDuplicatesState("loading");
    setProductDuplicatesMessage("Checking product names, SKUs, and aliases for duplicate signals.");

    try {
      const payload = await getProductDuplicates();
      setProductDuplicates(payload.data);
      setProductDuplicatesState("success");
      setProductDuplicatesMessage("");
    } catch (err) {
      setProductDuplicatesState("error");
      setProductDuplicatesMessage(err.message);
    }
  }

  async function refreshRecommendationPerformance() {
    setRecommendationPerformanceState("loading");
    setRecommendationPerformanceMessage("Loading predicted vs actual recommendation outcomes.");

    try {
      const payload = await getRecommendationPerformance();
      setRecommendationPerformance(payload.data);
      setRecommendationPerformanceState("success");
      setRecommendationPerformanceMessage("");
    } catch (err) {
      setRecommendationPerformanceState("error");
      setRecommendationPerformanceMessage(err.message);
    }
  }

  async function handleResetData() {
    const confirmed = window.prompt(
      "Type RESET to delete all imported sales rows, products, pricing insights, and recommendations from this local workspace. Your CSV files will not be deleted."
    );

    if (confirmed !== "RESET") {
      setResetState("idle");
      setResetMessage("Reset cancelled. No data was deleted.");
      return;
    }

    setResetState("running");
    setResetMessage("");

    try {
      const payload = await resetWorkspaceData();
      await Promise.all([refreshProducts(), refreshDashboard(), refreshHistory(), refreshReadiness()]);
      setLatestModel(null);
      setReadiness(null);
      setSimulationResult(null);
      setRecommendationResult(null);
      setScenarioResult(null);
      setDataQuality(null);
      setProductIntelligence(null);
      setCustomerSegments([]);
      setCompetitorMarket(null);
      setSeasonality(null);
      setRelationships(null);
      setProductDuplicates(null);
      setRecommendationPerformance(null);
      setUploadSummary(null);
      setSelectedProductId("");
      setSimulatorProductId("");
      setRecommendationProductId("");
      setResetState("success");
      setResetMessage(
        `Reset complete. Deleted ${payload.data.deleted.salesRows} sales rows, ${payload.data.deleted.products} products, ${payload.data.deleted.pricingInsights} pricing insights, and ${payload.data.deleted.recommendations} recommendations.`
      );
    } catch (err) {
      setResetState("error");
      setResetMessage(err.message);
    }
  }

  useEffect(() => {
    let isMounted = true;

    getHealthStatus()
      .then((data) => {
        if (!isMounted) return;
        setHealth(data);
        setStatus("online");
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message);
        setStatus("offline");
      });

    getProducts()
      .then((payload) => {
        if (!isMounted) return;
        setProducts(payload.data || []);
      })
      .catch((err) => {
        if (!isMounted) return;
        setProductError(err.message);
      });

    getWorkspaceSettings()
      .then((payload) => {
        if (!isMounted) return;
        const nextSettings = { ...defaultSettings, ...(payload.data || {}) };
        setSettings(nextSettings);
        setSettingsForm(nextSettings);
        setRecommendationObjective(nextSettings.defaultObjective || "profit");
      })
      .catch(() => {
        if (!isMounted) return;
        setSettings(defaultSettings);
        setSettingsForm(defaultSettings);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (activePanel === "home" || activePanel === "dashboard" || activePanel === "performanceWorkspace") {
      refreshDashboard();
    }

    if (activePanel === "insights" || activePanel === "modelsWorkspace") {
      refreshReadiness();
    }

    if (activePanel === "dataQuality" || activePanel === "dataWorkspace") {
      refreshDataQuality();
    }

    if (activePanel === "productIntelligence" || activePanel === "productsWorkspace") {
      refreshProductIntelligence();
    }

    if (activePanel === "segments" || activePanel === "productsWorkspace") {
      refreshCustomerSegments();
    }

    if (activePanel === "market" || activePanel === "productsWorkspace") {
      refreshCompetitorMarket();
    }

    if (activePanel === "seasonality" || activePanel === "modelsWorkspace") {
      refreshSeasonality();
    }

    if (activePanel === "relationships" || activePanel === "productsWorkspace") {
      refreshRelationships();
    }

    if (activePanel === "dataWorkspace") {
      refreshProductDuplicates();
    }

    if (activePanel === "history" || activePanel === "exports" || activePanel === "performanceWorkspace") {
      refreshHistory();
    }

    if (activePanel === "performanceWorkspace") {
      refreshRecommendationPerformance();
    }
  }, [activePanel]);

  async function handleUpload(event) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!selectedFile) {
      setUploadState("error");
      setUploadMessage("Choose a CSV file before uploading.");
      return;
    }

    setUploadState("uploading");
    setUploadMessage("");
    setUploadSummary(null);

    try {
      const payload = await uploadSalesCsv(selectedFile);
      await Promise.all([refreshProducts(), refreshDashboard(), refreshDataQuality(), refreshProductIntelligence(), refreshCustomerSegments(), refreshCompetitorMarket(), refreshSeasonality(), refreshRelationships(), refreshProductDuplicates()]);
      await refreshReadiness();
      setUploadState("success");
      setUploadSummary(payload.data);
      setUploadMessage(
        `Imported ${payload.data.importedRows} sales rows across ${payload.data.productsDetected ?? 0} products. ${payload.data.duplicateRowsSkipped ?? 0} duplicate rows skipped.`
      );
      setSelectedFile(null);
      form.reset();
    } catch (err) {
      setUploadState("error");
      setUploadMessage(err.message);
    }
  }

  async function handleFitModel(event) {
    event.preventDefault();

    if (!selectedProductId) {
      setModelState("error");
      setModelMessage("Choose a product before creating a pricing insight.");
      return;
    }

    setModelState("running");
    setModelMessage("");

    try {
      const payload = await fitDemandModel({
        productId: selectedProductId,
        segment: selectedSegment
      });
      setLatestModel(payload.data);
      await Promise.all([refreshProducts(), refreshDashboard(), refreshReadiness()]);
      setModelState("success");
      setModelMessage(
        payload.data.canFitModel === false || payload.data.resultMode === "Business Summary Only"
          ? `Showing business summary for ${payload.data.product.name}. A demand model was not fitted because the data is not diverse enough.`
          : `Created insight for ${payload.data.product.name} for ${payload.data.segmentLabel || formatSegmentName(payload.data.segment)} from ${payload.data.recordsUsed} records.`
      );
    } catch (err) {
      setModelState("error");
      setModelMessage(err.message);
    }
  }

  async function handleSimulatePrice(event) {
    event.preventDefault();

    if (!simulatorProductId) {
      setSimulationState("error");
      setSimulationMessage("Choose a product before running a price test.");
      return;
    }

    if (!simulatorPrice || Number(simulatorPrice) <= 0) {
      setSimulationState("error");
      setSimulationMessage("Enter a test price greater than zero.");
      return;
    }

    setSimulationState("running");
    setSimulationMessage("");
    setSimulationResult(null);

    try {
      const payload = await simulatePrice({
        productId: simulatorProductId,
        segment: simulatorSegment,
        price: Number(simulatorPrice),
        competitorPrice: simulatorCompetitorPrice === "" ? undefined : Number(simulatorCompetitorPrice)
      });
      setSimulationResult(payload.data);
      await Promise.all([refreshProducts(), refreshDashboard()]);
      setSimulationState("success");
      setSimulationMessage(`Price test ready for ${payload.data.product.name}.`);
    } catch (err) {
      setSimulationState("error");
      setSimulationMessage(err.message);
    }
  }

  async function handlePlanScenarios(event) {
    event.preventDefault();

    if (!scenarioProductId) {
      setScenarioState("error");
      setScenarioMessage("Choose a product before comparing scenarios.");
      return;
    }

    const prices = scenarioPrices.map((price) => Number(price)).filter((price) => Number.isFinite(price) && price > 0);

    if (!prices.length) {
      setScenarioState("error");
      setScenarioMessage("Enter at least one scenario price greater than zero.");
      return;
    }

    setScenarioState("running");
    setScenarioMessage("");
    setScenarioResult(null);

    try {
      const payload = await planScenarios({
        productId: scenarioProductId,
        segment: scenarioSegment,
        prices,
        competitorPrice: scenarioCompetitorPrice === "" ? undefined : Number(scenarioCompetitorPrice)
      });
      setScenarioResult(payload.data);
      setScenarioState("success");
      setScenarioMessage(`Compared ${payload.data.scenarios.length} scenario${payload.data.scenarios.length === 1 ? "" : "s"} for ${payload.data.product?.name || "the selected product"}.`);
    } catch (err) {
      setScenarioState("error");
      setScenarioMessage(err.message);
    }
  }

  async function handleCreateRecommendation(event) {
    event.preventDefault();

    if (!recommendationProductId) {
      setRecommendationState("error");
      setRecommendationMessage("Choose a product before asking for a recommendation.");
      return;
    }

    setRecommendationState("running");
    setRecommendationMessage("");
    setRecommendationResult(null);

    try {
      const payload = await createRecommendation({
        productId: recommendationProductId,
        segment: recommendationSegment,
        objective: recommendationObjective,
        minPrice: recommendationMinPrice === "" ? undefined : Number(recommendationMinPrice),
        maxPrice: recommendationMaxPrice === "" ? undefined : Number(recommendationMaxPrice),
        step: recommendationStep === "" ? undefined : Number(recommendationStep),
        competitorPrice: recommendationCompetitorPrice === "" ? undefined : Number(recommendationCompetitorPrice)
      });
      setRecommendationResult(payload.data);
      await Promise.all([refreshProducts(), refreshHistory(), refreshDashboard()]);
      setRecommendationState("success");
      setRecommendationMessage(`Recommended price ready for ${payload.data.product.name}.`);
    } catch (err) {
      setRecommendationState("error");
      setRecommendationMessage(err.message);
    }
  }

  async function handleApplyRecommendation(recommendation) {
    const defaultPrice = recommendation.recommendedPrice || "";
    const today = new Date().toISOString().slice(0, 10);
    const appliedPrice = window.prompt("Applied price", defaultPrice);

    if (appliedPrice === null) return;

    const startDate = window.prompt("Start date for measuring actual sales (YYYY-MM-DD)", today);
    if (startDate === null) return;

    const endDate = window.prompt("End date for measuring actual sales (YYYY-MM-DD)", today);
    if (endDate === null) return;

    const expectedTarget = window.prompt("Expected profit target", recommendation.expectedProfit || "");
    if (expectedTarget === null) return;

    setHistoryState("loading");
    setHistoryMessage("Measuring actual sales against this recommendation.");

    try {
      await applyRecommendation({
        recommendationId: recommendation._id,
        appliedPrice: Number(appliedPrice),
        startDate,
        endDate,
        expectedTarget: expectedTarget === "" ? undefined : Number(expectedTarget)
      });
      await Promise.all([refreshHistory(), refreshRecommendationPerformance(), refreshDashboard()]);
      setHistoryState("success");
      setHistoryMessage("Recommendation outcome measured.");
    } catch (err) {
      setHistoryState("error");
      setHistoryMessage(err.message);
    }
  }

  async function handleMergeProducts(masterProductId, duplicateProductId) {
    if (!masterProductId || !duplicateProductId) {
      setProductDuplicatesState("error");
      setProductDuplicatesMessage("Missing master or duplicate product id.");
      return;
    }

    const confirmed = window.confirm("Merge this duplicate into the master product? Sales rows, models, and recommendations will point to the master product.");
    if (!confirmed) return;

    setProductDuplicatesState("merging");
    setProductDuplicatesMessage("Merging duplicate product into the master record.");

    try {
      await mergeProducts({ masterProductId, duplicateProductId });
      await Promise.all([refreshProducts(), refreshProductDuplicates(), refreshDataQuality(), refreshProductIntelligence(), refreshRelationships(), refreshDashboard()]);
      setProductDuplicatesState("success");
      setProductDuplicatesMessage("Duplicate product merged.");
    } catch (err) {
      setProductDuplicatesState("error");
      setProductDuplicatesMessage(err.message);
    }
  }

  async function handleDownloadReport(reportType = "recommendationsCsv", filename = "pricing-recommendations.csv", params = {}) {
    setExportState("running");
    setExportMessage("");

    try {
      const blob = reportType === "recommendationsCsv"
        ? await downloadRecommendationReport()
        : await downloadReport(reportType, params);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportState("success");
      setExportMessage("Report is ready.");
    } catch (err) {
      setExportState("error");
      setExportMessage(err.message);
    }
  }

  async function handleSaveSettings(event) {
    event.preventDefault();
    setSettingsState("saving");
    setSettingsMessage("");

    try {
      const payload = await updateWorkspaceSettings(settingsForm);
      const nextSettings = { ...defaultSettings, ...(payload.data || {}) };
      setSettings(nextSettings);
      setSettingsForm(nextSettings);
      setRecommendationObjective(nextSettings.defaultObjective || "profit");
      setSettingsState("success");
      setSettingsMessage("Workspace settings saved.");
    } catch (err) {
      setSettingsState("error");
      setSettingsMessage(err.message);
    }
  }

  const databaseStatus = health?.database?.status || "unknown";
  const totalSalesRecords = products.reduce((total, product) => total + (product.salesRecords || 0), 0);
  const totalFittedModels = products.reduce((total, product) => total + (product.fittedModels || 0), 0);
  const segmentOptions = useMemo(() => {
    const seen = new Set(["all"]);
    const options = [{ value: "all", label: "All customers" }];

    for (const segment of dashboardData?.segments || []) {
      if (!segment.segment || seen.has(segment.segment)) continue;
      seen.add(segment.segment);
      options.push({
        value: segment.segment,
        label: segment.label || formatSegmentName(segment.segment)
      });
    }

    return options;
  }, [dashboardData]);

  const panelContent = useMemo(() => {
    if (activePanel === "home") {
      return (
        <HomeOverview
          currency={currency}
          dashboardData={dashboardData}
          dashboardMessage={dashboardMessage}
          dashboardState={dashboardState}
          error={error}
          handleResetData={handleResetData}
          refreshDashboard={refreshDashboard}
          resetMessage={resetMessage}
          resetState={resetState}
          setActivePanel={setActivePanel}
          status={status}
          totalFittedModels={totalFittedModels}
          totalSalesRecords={totalSalesRecords}
        />
      );
    }

    if (activePanel === "dataWorkspace") {
      return (
        <WorkspaceTabs
          tabs={[
            {
              id: "sales",
              label: "Sales Data",
              content: (
                <SalesDataPanel
                  handleDownloadPanelReport={handleDownloadReport}
                  handleUpload={handleUpload}
                  selectedFile={selectedFile}
                  setSelectedFile={setSelectedFile}
                  uploadState={uploadState}
                  uploadMessage={uploadMessage}
                  uploadSummary={uploadSummary}
                  totalSalesRecords={totalSalesRecords}
                />
              )
            },
            {
              id: "quality",
              label: "Data Quality",
              content: (
                <DataQualityPanel
                  currency={currency}
                  dataQuality={dataQuality}
                  handleSetActiveImportBatch={handleSetActiveImportBatch}
                  message={dataQualityMessage}
                  refreshDataQuality={refreshDataQuality}
                  state={dataQualityState}
                />
              )
            },
            {
              id: "matching",
              label: "Product Matching",
              content: (
                <ProductMatchingPanel
                  duplicatesData={productDuplicates}
                  duplicatesMessage={productDuplicatesMessage}
                  duplicatesState={productDuplicatesState}
                  handleMergeProducts={handleMergeProducts}
                  refreshProductDuplicates={refreshProductDuplicates}
                />
              )
            }
          ]}
        />
      );
    }

    if (activePanel === "productsWorkspace") {
      return (
        <WorkspaceTabs
          tabs={[
            {
              id: "products",
              label: "Product Table",
              content: <ProductsTable currency={currency} products={products} productError={productError} />
            },
            {
              id: "intelligence",
              label: "Product Intelligence",
              content: (
                <ProductIntelligencePanel
                  currency={currency}
                  message={productIntelligenceMessage}
                  productIntelligence={productIntelligence}
                  refreshProductIntelligence={refreshProductIntelligence}
                  state={productIntelligenceState}
                />
              )
            },
            {
              id: "segments",
              label: "Customer Segments",
              content: (
                <CustomerSegmentsPanel
                  currency={currency}
                  message={customerSegmentsMessage}
                  refreshCustomerSegments={refreshCustomerSegments}
                  segments={customerSegments}
                  state={customerSegmentsState}
                />
              )
            },
            {
              id: "market",
              label: "Market View",
              content: (
                <CompetitorMarketPanel
                  currency={currency}
                  market={competitorMarket}
                  message={competitorMarketMessage}
                  refreshCompetitorMarket={refreshCompetitorMarket}
                  state={competitorMarketState}
                />
              )
            },
            {
              id: "relationships",
              label: "Relationships",
              content: (
                <ProductRelationshipsPanel
                  message={relationshipsMessage}
                  refreshRelationships={refreshRelationships}
                  relationships={relationships}
                  state={relationshipsState}
                />
              )
            }
          ]}
        />
      );
    }

    if (activePanel === "modelsWorkspace") {
      return (
        <WorkspaceTabs
          tabs={[
            {
              id: "insights",
              label: "Pricing Insights",
              content: (
                <PricingInsightsPanel
                  products={products}
                  segmentOptions={segmentOptions}
                  readiness={readiness}
                  readinessState={readinessState}
                  readinessMessage={readinessMessage}
                  refreshReadiness={refreshReadiness}
                  selectedProductId={selectedProductId}
                  selectedSegment={selectedSegment}
                  setSelectedProductId={setSelectedProductId}
                  setSelectedSegment={setSelectedSegment}
                  handleFitModel={handleFitModel}
                  modelState={modelState}
                  modelMessage={modelMessage}
                  latestModel={latestModel}
                />
              )
            },
            {
              id: "seasonality",
              label: "Seasonality",
              content: (
                <SeasonalityPanel
                  currency={currency}
                  message={seasonalityMessage}
                  refreshSeasonality={refreshSeasonality}
                  seasonality={seasonality}
                  state={seasonalityState}
                />
              )
            }
          ]}
        />
      );
    }

    if (activePanel === "decisionsWorkspace") {
      return (
        <WorkspaceTabs
          tabs={[
            {
              id: "simulator",
              label: "Price Simulator",
              content: (
                <PriceSimulatorPanel
                  products={products}
                  segmentOptions={segmentOptions}
                  currency={currency}
                  simulatorProductId={simulatorProductId}
                  setSimulatorProductId={setSimulatorProductId}
                  simulatorSegment={simulatorSegment}
                  setSimulatorSegment={setSimulatorSegment}
                  simulatorPrice={simulatorPrice}
                  setSimulatorPrice={setSimulatorPrice}
                  simulatorCompetitorPrice={simulatorCompetitorPrice}
                  setSimulatorCompetitorPrice={setSimulatorCompetitorPrice}
                  simulationState={simulationState}
                  simulationMessage={simulationMessage}
                  simulationResult={simulationResult}
                  handleSimulatePrice={handleSimulatePrice}
                />
              )
            },
            {
              id: "scenario",
              label: "Scenario Planner",
              content: (
                <ScenarioPlannerPanel
                  currency={currency}
                  handlePlanScenarios={handlePlanScenarios}
                  products={products}
                  scenarioCompetitorPrice={scenarioCompetitorPrice}
                  scenarioMessage={scenarioMessage}
                  scenarioPrices={scenarioPrices}
                  scenarioProductId={scenarioProductId}
                  scenarioResult={scenarioResult}
                  scenarioSegment={scenarioSegment}
                  scenarioState={scenarioState}
                  segmentOptions={segmentOptions}
                  setScenarioCompetitorPrice={setScenarioCompetitorPrice}
                  setScenarioPrices={setScenarioPrices}
                  setScenarioProductId={setScenarioProductId}
                  setScenarioSegment={setScenarioSegment}
                />
              )
            },
            {
              id: "recommendations",
              label: "Recommendations",
              content: (
                <RecommendationPanel
                  products={products}
                  segmentOptions={segmentOptions}
                  currency={currency}
                  recommendationProductId={recommendationProductId}
                  setRecommendationProductId={setRecommendationProductId}
                  recommendationSegment={recommendationSegment}
                  setRecommendationSegment={setRecommendationSegment}
                  recommendationObjective={recommendationObjective}
                  setRecommendationObjective={setRecommendationObjective}
                  recommendationMinPrice={recommendationMinPrice}
                  setRecommendationMinPrice={setRecommendationMinPrice}
                  recommendationMaxPrice={recommendationMaxPrice}
                  setRecommendationMaxPrice={setRecommendationMaxPrice}
                  recommendationStep={recommendationStep}
                  setRecommendationStep={setRecommendationStep}
                  recommendationCompetitorPrice={recommendationCompetitorPrice}
                  setRecommendationCompetitorPrice={setRecommendationCompetitorPrice}
                  recommendationState={recommendationState}
                  recommendationMessage={recommendationMessage}
                  recommendationResult={recommendationResult}
                  handleCreateRecommendation={handleCreateRecommendation}
                />
              )
            }
          ]}
        />
      );
    }

    if (activePanel === "performanceWorkspace") {
      return (
        <WorkspaceTabs
          tabs={[
            {
              id: "dashboard",
              label: "Dashboard",
              content: (
                <DashboardPanel
                  dashboardData={dashboardData}
                  dashboardState={dashboardState}
                  dashboardMessage={dashboardMessage}
                  currency={currency}
                  refreshDashboard={refreshDashboard}
                />
              )
            },
            {
              id: "history",
              label: "Recommendation History",
              content: (
                <HistoryPanel
                  recommendations={recommendations}
                  historyState={historyState}
                  historyMessage={historyMessage}
                  currency={currency}
                  refreshHistory={refreshHistory}
                  handleApplyRecommendation={handleApplyRecommendation}
                />
              )
            },
            {
              id: "outcomes",
              label: "Recommendation Outcomes",
              content: (
                <RecommendationPerformancePanel
                  currency={currency}
                  message={recommendationPerformanceMessage}
                  performance={recommendationPerformance}
                  refreshRecommendationPerformance={refreshRecommendationPerformance}
                  state={recommendationPerformanceState}
                />
              )
            }
          ]}
        />
      );
    }

    if (activePanel === "products") {
      return <ProductsTable currency={currency} products={products} productError={productError} />;
    }

    if (activePanel === "sales") {
      return (
        <SalesDataPanel
          handleDownloadPanelReport={handleDownloadReport}
          handleUpload={handleUpload}
          selectedFile={selectedFile}
          setSelectedFile={setSelectedFile}
          uploadState={uploadState}
          uploadMessage={uploadMessage}
          uploadSummary={uploadSummary}
          totalSalesRecords={totalSalesRecords}
        />
      );
    }

    if (activePanel === "dataQuality") {
      return (
        <DataQualityPanel
          currency={currency}
          dataQuality={dataQuality}
          handleSetActiveImportBatch={handleSetActiveImportBatch}
          message={dataQualityMessage}
          refreshDataQuality={refreshDataQuality}
          state={dataQualityState}
        />
      );
    }

    if (activePanel === "productIntelligence") {
      return (
        <ProductIntelligencePanel
          currency={currency}
          message={productIntelligenceMessage}
          productIntelligence={productIntelligence}
          refreshProductIntelligence={refreshProductIntelligence}
          state={productIntelligenceState}
        />
      );
    }

    if (activePanel === "segments") {
      return (
        <CustomerSegmentsPanel
          currency={currency}
          message={customerSegmentsMessage}
          refreshCustomerSegments={refreshCustomerSegments}
          segments={customerSegments}
          state={customerSegmentsState}
        />
      );
    }

    if (activePanel === "market") {
      return (
        <CompetitorMarketPanel
          currency={currency}
          market={competitorMarket}
          message={competitorMarketMessage}
          refreshCompetitorMarket={refreshCompetitorMarket}
          state={competitorMarketState}
        />
      );
    }

    if (activePanel === "seasonality") {
      return (
        <SeasonalityPanel
          currency={currency}
          message={seasonalityMessage}
          refreshSeasonality={refreshSeasonality}
          seasonality={seasonality}
          state={seasonalityState}
        />
      );
    }

    if (activePanel === "relationships") {
      return (
        <ProductRelationshipsPanel
          message={relationshipsMessage}
          refreshRelationships={refreshRelationships}
          relationships={relationships}
          state={relationshipsState}
        />
      );
    }

    if (activePanel === "insights") {
      return (
        <PricingInsightsPanel
          products={products}
          segmentOptions={segmentOptions}
          readiness={readiness}
          readinessState={readinessState}
          readinessMessage={readinessMessage}
          refreshReadiness={refreshReadiness}
          selectedProductId={selectedProductId}
          selectedSegment={selectedSegment}
          setSelectedProductId={setSelectedProductId}
          setSelectedSegment={setSelectedSegment}
          handleFitModel={handleFitModel}
          modelState={modelState}
          modelMessage={modelMessage}
          latestModel={latestModel}
        />
      );
    }

    if (activePanel === "simulator") {
      return (
        <PriceSimulatorPanel
          products={products}
          segmentOptions={segmentOptions}
          currency={currency}
          simulatorProductId={simulatorProductId}
          setSimulatorProductId={setSimulatorProductId}
          simulatorSegment={simulatorSegment}
          setSimulatorSegment={setSimulatorSegment}
          simulatorPrice={simulatorPrice}
          setSimulatorPrice={setSimulatorPrice}
          simulatorCompetitorPrice={simulatorCompetitorPrice}
          setSimulatorCompetitorPrice={setSimulatorCompetitorPrice}
          simulationState={simulationState}
          simulationMessage={simulationMessage}
          simulationResult={simulationResult}
          handleSimulatePrice={handleSimulatePrice}
        />
      );
    }

    if (activePanel === "scenarioPlanner") {
      return (
        <ScenarioPlannerPanel
          currency={currency}
          handlePlanScenarios={handlePlanScenarios}
          products={products}
          scenarioCompetitorPrice={scenarioCompetitorPrice}
          scenarioMessage={scenarioMessage}
          scenarioPrices={scenarioPrices}
          scenarioProductId={scenarioProductId}
          scenarioResult={scenarioResult}
          scenarioSegment={scenarioSegment}
          scenarioState={scenarioState}
          segmentOptions={segmentOptions}
          setScenarioCompetitorPrice={setScenarioCompetitorPrice}
          setScenarioPrices={setScenarioPrices}
          setScenarioProductId={setScenarioProductId}
          setScenarioSegment={setScenarioSegment}
        />
      );
    }

    if (activePanel === "recommendations") {
      return (
        <RecommendationPanel
          products={products}
          segmentOptions={segmentOptions}
          currency={currency}
          recommendationProductId={recommendationProductId}
          setRecommendationProductId={setRecommendationProductId}
          recommendationSegment={recommendationSegment}
          setRecommendationSegment={setRecommendationSegment}
          recommendationObjective={recommendationObjective}
          setRecommendationObjective={setRecommendationObjective}
          recommendationMinPrice={recommendationMinPrice}
          setRecommendationMinPrice={setRecommendationMinPrice}
          recommendationMaxPrice={recommendationMaxPrice}
          setRecommendationMaxPrice={setRecommendationMaxPrice}
          recommendationStep={recommendationStep}
          setRecommendationStep={setRecommendationStep}
          recommendationCompetitorPrice={recommendationCompetitorPrice}
          setRecommendationCompetitorPrice={setRecommendationCompetitorPrice}
          recommendationState={recommendationState}
          recommendationMessage={recommendationMessage}
          recommendationResult={recommendationResult}
          handleCreateRecommendation={handleCreateRecommendation}
        />
      );
    }

    if (activePanel === "dashboard") {
      return (
        <DashboardPanel
          dashboardData={dashboardData}
          dashboardState={dashboardState}
          dashboardMessage={dashboardMessage}
          currency={currency}
          refreshDashboard={refreshDashboard}
        />
      );
    }

    if (activePanel === "history") {
      return (
        <HistoryPanel
          recommendations={recommendations}
          historyState={historyState}
          historyMessage={historyMessage}
          currency={currency}
          refreshHistory={refreshHistory}
          handleApplyRecommendation={handleApplyRecommendation}
        />
      );
    }

    if (activePanel === "exports") {
      return (
        <ReportsExportPanel
          recommendations={recommendations}
          exportState={exportState}
          exportMessage={exportMessage}
          handleDownloadReport={handleDownloadReport}
        />
      );
    }

    return (
      <SettingsPanel
        settingsForm={settingsForm}
        setSettingsForm={setSettingsForm}
        settingsState={settingsState}
        settingsMessage={settingsMessage}
        handleSaveSettings={handleSaveSettings}
        resetState={resetState}
        resetMessage={resetMessage}
        handleResetData={handleResetData}
      />
    );
  }, [
    activePanel,
    currency,
    competitorMarket,
    competitorMarketMessage,
    competitorMarketState,
    customerSegments,
    customerSegmentsMessage,
    customerSegmentsState,
    dataQuality,
    dataQualityMessage,
    dataQualityState,
    dashboardData,
    dashboardMessage,
    dashboardState,
    databaseStatus,
    error,
    exportMessage,
    exportState,
    historyMessage,
    historyState,
    health,
    latestModel,
    modelMessage,
    modelState,
    productDuplicates,
    productDuplicatesMessage,
    productDuplicatesState,
    productError,
    productIntelligence,
    productIntelligenceMessage,
    productIntelligenceState,
    products,
    recommendationCompetitorPrice,
    recommendationMaxPrice,
    recommendationMessage,
    recommendationMinPrice,
    recommendationObjective,
    recommendationPerformance,
    recommendationPerformanceMessage,
    recommendationPerformanceState,
    recommendationProductId,
    recommendationResult,
    recommendationSegment,
    recommendationState,
    recommendationStep,
    recommendations,
    readiness,
    readinessMessage,
    readinessState,
    selectedFile,
    selectedProductId,
    selectedSegment,
    segmentOptions,
    resetMessage,
    resetState,
    scenarioCompetitorPrice,
    scenarioMessage,
    scenarioPrices,
    scenarioProductId,
    scenarioResult,
    scenarioSegment,
    scenarioState,
    seasonality,
    seasonalityMessage,
    seasonalityState,
    relationships,
    relationshipsMessage,
    relationshipsState,
    settingsForm,
    settingsMessage,
    settingsState,
    simulationMessage,
    simulationResult,
    simulationState,
    simulatorCompetitorPrice,
    simulatorPrice,
    simulatorProductId,
    simulatorSegment,
    status,
    totalFittedModels,
    totalSalesRecords,
    uploadMessage,
    uploadSummary,
    uploadState
  ]);

  return (
    <AppShell
      activeItem={{ ...activeItem, id: activePanel }}
      apiBaseUrl={API_BASE_URL}
      databaseStatus={databaseStatus}
      error={error}
      health={health}
      isSidebarOpen={isSidebarOpen}
      onLogout={onLogout}
      session={session}
      setActivePanel={setActivePanel}
      setIsSidebarOpen={setIsSidebarOpen}
      settings={settings}
      status={status}
    >
      {panelContent}
    </AppShell>
  );
}
