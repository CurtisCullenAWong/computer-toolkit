import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  Cpu,
  Clock,
  ChevronRight,
  Shield,
  Activity,
  Loader2,
  AlertTriangle,
  Terminal,
  Minimize2,
  Trash2,
  Wind,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

const safeInvoke = async <T,>(cmd: string, args?: Record<string, any>): Promise<T> => {
  try {
    if ((window as any).__TAURI_INTERNALS__) {
      return await invoke<T>(cmd, args);
    } else {
      console.warn(`[Tauri Mock] invoke("${cmd}") called in browser with args:`, args);
      // Minimal delay to simulate IPC roundtrip (no artificial loading inflation)
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (cmd === "is_admin") {
        return true as T;
      }
      if (cmd === "relaunch_as_admin") {
        console.log("Relaunching as admin mock executed");
        return null as T;
      }
      if (cmd === "toggle_gpu") {
        return (args?.enable
          ? "Dedicated GPU has been enabled successfully."
          : "Dedicated GPU has been disabled successfully.") as T;
      }
      if (cmd === "detect_gpu") {
        return "none" as T;
      }
      if (cmd === "get_gpu_preference") {
        return false as T;
      }
      if (cmd === "get_autostart") {
        return false as T;
      }
      if (cmd === "set_autostart") {
        return (args?.enable
          ? "Successfully added to Windows startup."
          : "Successfully removed from Windows startup.") as T;
      }
      if (cmd === "get_minimize_on_close") {
        return false as T;
      }
      if (cmd === "set_minimize_on_close") {
        return (args?.enable
          ? "Minimize on close enabled."
          : "Minimize on close disabled.") as T;
      }
      if (cmd === "scan_junk_folders") {
        return {
          temp_files_count: 1420,
          temp_files_size: 348000000,
          prefetch_logs_count: 480,
          prefetch_logs_size: 185000000,
          app_cache_count: 120,
          app_cache_size: 15400000,
          is_admin: true,
        } as T;
      }
      if (cmd === "clean_junk_folders") {
        const cleanTemp = args?.cleanTemp ?? args?.clean_temp ?? true;
        const cleanPrefetchLogs = args?.cleanPrefetchLogs ?? args?.clean_prefetch_logs ?? true;
        const cleanAppCache = args?.cleanAppCache ?? args?.clean_app_cache ?? true;
        let deletedCount = 0;
        let deletedSize = 0;
        let skippedCount = 0;
        let skippedSize = 0;
        if (cleanTemp) {
          deletedCount += 1350;
          deletedSize += 320000000;
          skippedCount += 70;
          skippedSize += 28000000;
        }
        if (cleanPrefetchLogs) {
          deletedCount += 460;
          deletedSize += 178000000;
          skippedCount += 20;
          skippedSize += 7000000;
        }
        if (cleanAppCache) {
          deletedCount += 118;
          deletedSize += 15000000;
          skippedCount += 2;
          skippedSize += 400000;
        }
        return {
          deleted_count: deletedCount,
          deleted_size: deletedSize,
          skipped_count: skippedCount,
          skipped_size: skippedSize,
        } as T;
      }
      if (cmd === "read_alarms") {
        return (localStorage.getItem("alarms") ?? "[]") as T;
      }
      if (cmd === "write_alarms") {
        const json = args?.alarmsJson ?? args?.alarms_json ?? "[]";
        localStorage.setItem("alarms", json);
        return null as T;
      }
      throw new Error(`Mock command "${cmd}" not implemented`);
    }
  } catch (err) {
    console.error(`Error invoking command "${cmd}":`, err);
    throw err;
  }
};

export default function HomePage() {
  const navigate = useNavigate();



  // GPU state — initialized from registry (not localStorage) via get_gpu_preference
  const [gpuEnabled, setGpuEnabled] = useState(false);
  const [gpuLoading, setGpuLoading] = useState(true); // start true: loading from registry
  const [gpuMessage, setGpuMessage] = useState("");
  const [detectedGpu, setDetectedGpu] = useState("Detecting display hardware...");
  const isGpuDetected = detectedGpu.toLowerCase().includes("nvidia");

  // Confirmation Modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingGpuState, setPendingGpuState] = useState(false);
  const [showAdminPromptModal, setShowAdminPromptModal] = useState(false);

  // Autostart state
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(true); // start true: loading from registry
  const [autostartMessage, setAutostartMessage] = useState("");

  // Minimize on close state
  const [minimizeOnClose, setMinimizeOnClose] = useState(false);
  const [minimizeOnCloseLoading, setMinimizeOnCloseLoading] = useState(true);
  const [minimizeOnCloseMessage, setMinimizeOnCloseMessage] = useState("");

  // Summary counts
  const [activeAlarmsCount, setActiveAlarmsCount] = useState(0);

  // Cleaner state
  const [cleanerState, setCleanerState] = useState<'idle' | 'scanning' | 'scanned' | 'cleaning' | 'finished'>('idle');
  const [cleanTemp, setCleanTemp] = useState(true);
  const [cleanPrefetchLogs, setCleanPrefetchLogs] = useState(true);
  const [cleanAppCache, setCleanAppCache] = useState(true);
  const [scanResults, setScanResults] = useState<any>(null);
  const [cleanResults, setCleanResults] = useState<any>(null);
  const [isAdminUser, setIsAdminUser] = useState(true);

  useEffect(() => {


    // 1. Detect GPU hardware
    const runGpuDetection = async () => {
      try {
        const result = await safeInvoke<string | null>("detect_gpu");
        setDetectedGpu(result ?? "Generic Display Adapter / Intel HD Graphics");
      } catch {
        setDetectedGpu("Generic Display Adapter / Intel HD Graphics");
      }
    };

    // 2. Read actual GPU preference from registry (real state, not localStorage)
    const runGpuPreferenceCheck = async () => {
      try {
        const isHighPerf = await safeInvoke<boolean>("get_gpu_preference");
        setGpuEnabled(isHighPerf);
      } catch {
        setGpuEnabled(false);
      } finally {
        setGpuLoading(false);
      }
    };

    // 3. Query autostart registry
    const runAutostartCheck = async () => {
      try {
        const result = await safeInvoke<boolean>("get_autostart");
        setAutostartEnabled(result);
      } catch (e) {
        console.error("Failed to query autostart registry state", e);
      } finally {
        setAutostartLoading(false);
      }
    };

    // 4. Query minimize-on-close preference
    const runMinimizeOnCloseCheck = async () => {
      try {
        const result = await safeInvoke<boolean>("get_minimize_on_close");
        setMinimizeOnClose(result);
      } catch (e) {
        console.error("Failed to query minimize-on-close state", e);
      } finally {
        setMinimizeOnCloseLoading(false);
      }
    };

    // 5. Read alarms from backend file persistence
    const runAlarmsCheck = async () => {
      try {
        const alarmsJson = await safeInvoke<string>("read_alarms");
        if (alarmsJson) {
          const parsed = JSON.parse(alarmsJson);
          if (Array.isArray(parsed)) {
            setActiveAlarmsCount(parsed.filter((a: any) => a.enabled).length);
          }
        }
      } catch (e) {
        console.error("Failed to query persist alarms", e);
      }
    };

    // 6. Check administrator status
    const runAdminCheck = async () => {
      try {
        const admin = await safeInvoke<boolean>("is_admin");
        setIsAdminUser(admin);
      } catch (e) {
        console.error("Failed to check admin status", e);
      }
    };


    runGpuDetection();
    runGpuPreferenceCheck();
    runAutostartCheck();
    runMinimizeOnCloseCheck();
    runAdminCheck();
    runAlarmsCheck();
  }, []);

  // Handle autostart toggle — loading reflects actual registry write
  const handleAutostartToggle = useCallback(async (checked: boolean) => {
    setAutostartLoading(true);
    setAutostartMessage("");
    try {
      const response = await safeInvoke<string>("set_autostart", { enable: checked });
      setAutostartEnabled(checked);
      setAutostartMessage(response);
    } catch {
      setAutostartMessage("Error: Failed to configure Windows startup registry.");
    } finally {
      setAutostartLoading(false);
    }
  }, []);

  // Handle minimize-on-close toggle
  const handleMinimizeOnCloseToggle = useCallback(async (checked: boolean) => {
    setMinimizeOnCloseLoading(true);
    setMinimizeOnCloseMessage("");
    try {
      const response = await safeInvoke<string>("set_minimize_on_close", { enable: checked });
      setMinimizeOnClose(checked);
      setMinimizeOnCloseMessage(response);
    } catch {
      setMinimizeOnCloseMessage("Error: Failed to save window preference.");
    } finally {
      setMinimizeOnCloseLoading(false);
    }
  }, []);

  // Cleaner functions
  const formatSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleScan = useCallback(async () => {
    setCleanerState("scanning");
    setScanResults(null);
    try {
      const results = await safeInvoke<any>("scan_junk_folders");
      setScanResults(results);
      setIsAdminUser(results.is_admin);
      setCleanerState("scanned");
    } catch (e) {
      console.error("Scanning failed", e);
      setCleanerState("idle");
    }
  }, []);

  const handleClean = useCallback(async () => {
    setCleanerState("cleaning");
    setCleanResults(null);
    try {
      const results = await safeInvoke<any>("clean_junk_folders", {
        cleanTemp: cleanTemp,
        clean_temp: cleanTemp,
        cleanPrefetchLogs: cleanPrefetchLogs,
        clean_prefetch_logs: cleanPrefetchLogs,
        cleanAppCache: cleanAppCache,
        clean_app_cache: cleanAppCache,
      });
      setCleanResults(results);
      setCleanerState("finished");
    } catch (e) {
      console.error("Cleaning failed", e);
      setCleanerState("scanned");
    }
  }, [cleanTemp, cleanPrefetchLogs, cleanAppCache]);

  const handleResetCleaner = useCallback(() => {
    setCleanerState("idle");
    setScanResults(null);
    setCleanResults(null);
  }, []);

  // Open confirmation dialog before switching GPU
  const triggerGpuToggle = useCallback((checked: boolean) => {
    setPendingGpuState(checked);
    setShowConfirmModal(true);
  }, []);

  // Switch GPU execution — loading reflects actual hardware enabling/disabling via pnputil
  const executeGpuToggle = useCallback(async () => {
    setShowConfirmModal(false);
    setGpuLoading(true);
    setGpuMessage("");
    try {
      await safeInvoke<string>("toggle_gpu", { enable: pendingGpuState });
      setGpuEnabled(pendingGpuState);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes("REQUIRES_ADMIN")) {
        setShowAdminPromptModal(true);
      } else {
        setGpuMessage("Error: Failed to toggle GPU device state.");
      }
    } finally {
      setGpuLoading(false);
    }
  }, [pendingGpuState]);

  const cancelGpuToggle = useCallback(() => {
    setShowConfirmModal(false);
  }, []);

  const handleGpuSwitchChange = useCallback((checked: boolean) => {
    triggerGpuToggle(checked);
  }, [triggerGpuToggle]);

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 select-none overflow-y-auto p-1 pr-2 pb-5 xl:grid-cols-3 h-full">
      {/* Admin Elevation Prompt Modal */}
      {showAdminPromptModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-card border border-border shadow-2xl rounded-2xl p-6 animate-[fade-in_0.15s_ease-out]">
            <CardHeader className="p-0 pb-3 flex flex-row items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
                <Shield className="w-5.5 h-5.5" />
              </div>
              <CardTitle className="text-lg font-bold">Administrator Rights Required</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex flex-col gap-4">
              <p className="text-sm text-(--text-primary) font-medium leading-relaxed">
                Toggling the dedicated GPU requires Administrator privileges to enable/disable the device driver.
              </p>
              <p className="text-xs text-(--text-secondary) opacity-80 leading-relaxed">
                Would you like to relaunch the application as Administrator to proceed with this action?
              </p>
              <div className="flex gap-2 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowAdminPromptModal(false)}
                  className="font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    setShowAdminPromptModal(false);
                    try {
                      await safeInvoke("relaunch_as_admin");
                    } catch (err) {
                      console.error("Failed to relaunch as admin:", err);
                    }
                  }}
                  className="font-bold text-xs bg-red-600 hover:bg-red-700 text-white border-0"
                >
                  Relaunch as Admin
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* GPU Toggler Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-card border border-border shadow-2xl rounded-2xl p-6 animate-[fade-in_0.15s_ease-out]">
            <CardHeader className="p-0 pb-3 flex flex-row items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <AlertTriangle className="w-5.5 h-5.5" />
              </div>
              <CardTitle className="text-lg font-bold">Confirm GPU Toggle</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex flex-col gap-4">
              <p className="text-sm text-(--text-primary) font-medium leading-relaxed">
                {pendingGpuState
                  ? "Are you sure you want to enable the dedicated GPU device?"
                  : "Are you sure you want to disable the dedicated GPU device?"}
              </p>
              <div className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-3 rounded-lg leading-relaxed flex flex-col gap-1.5">
                <span className="font-bold text-amber-700 dark:text-amber-300">Safety Warning:</span>
                <span>
                  Please be absolutely sure of what you are doing. Verify whether your hardware has a MUX switch (hardware GPU switcher); toggling this device on certain hardware can cause a permanent black screen or system instability.
                </span>
              </div>
              <p className="text-xs text-(--text-secondary) opacity-80 leading-relaxed">
                The switch takes effect immediately. A brief screen flicker may occur.
              </p>
              <div className="flex gap-2 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={cancelGpuToggle}
                  className="font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  onClick={executeGpuToggle}
                  className="font-bold text-xs bg-(--accent-color) text-white hover:bg-(--accent-hover) border-0"
                >
                  Apply
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* LEFT COLUMN: System Utility Dashboard (Spans 2 columns) */}
      <div className="flex flex-col gap-4 xl:col-span-2">

        {/* GPU Toggle Card */}
        <Card className="border border-border bg-card/60 backdrop-blur-md shadow-sm rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
            <Cpu className="w-24 h-24 text-primary" />
          </div>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-lg font-bold flex items-center gap-2.5">
              <Cpu className="w-5 h-5 text-(--accent-color)" />
              Dedicated GPU Switcher
            </CardTitle>
            <CardDescription className="text-xs">
              Toggle the dedicated graphics card state.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 flex flex-col gap-3.5">
            {/* System Detected hardware status */}
            <div className="text-[10px] text-muted-foreground bg-black/5 dark:bg-white/5 border border-border/40 px-3 py-1.5 rounded-lg select-text font-semibold flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-(--accent-color)" />
              <span>Detected GPU: {detectedGpu}</span>
            </div>

            <div className="flex items-center justify-between bg-(--bg-primary) p-4 rounded-xl border border-(--border-color)">
              <div>
                <h4 className="text-sm font-semibold text-(--text-primary)">
                  {gpuLoading
                    ? "Checking state..."
                    : !isGpuDetected
                      ? "Dedicated GPU: Not Detected"
                      : gpuEnabled ? "Dedicated GPU: Enabled" : "Dedicated GPU: Disabled"}
                </h4>
                <p className="text-xs text-(--text-secondary) mt-0.5">
                  {gpuLoading
                    ? "Querying hardware..."
                    : !isGpuDetected
                      ? "Compatible hardware not found."
                      : gpuEnabled
                        ? "Dedicated GPU is active."
                        : "Dedicated GPU is disabled."}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {gpuLoading && <Loader2 className="w-4 h-4 text-(--accent-color) animate-spin" />}
                <Switch
                  checked={gpuEnabled}
                  disabled={gpuLoading || !isGpuDetected}
                  onCheckedChange={handleGpuSwitchChange}
                />
              </div>
            </div>

            {gpuMessage && (
              <div className="text-xs px-3.5 py-2.5 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 font-medium animate-[fade-in_0.2s_ease-out]">
                {gpuMessage}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Windows Autostart Card */}
        <Card className="border border-border bg-card/60 backdrop-blur-md shadow-sm rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
            <Shield className="w-24 h-24 text-primary" />
          </div>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-lg font-bold flex items-center gap-2.5">
              <Shield className="w-5 h-5 text-(--accent-color)" />
              Windows Auto Launch
            </CardTitle>
            <CardDescription className="text-xs">
              Configure Computer Toolkit to automatically run upon launching Windows.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 flex flex-col gap-3.5">
            {/* Autostart Toggle */}
            <div className="flex items-center justify-between bg-(--bg-primary) p-3.5 rounded-xl border border-(--border-color)">
              <div>
                <h4 className="text-sm font-semibold text-(--text-primary)">
                  {autostartLoading ? "Checking startup registry..." : "Launch on Windows Startup"}
                </h4>
                <p className="text-xs text-(--text-secondary) mt-0.5">
                  {autostartLoading
                    ? "Reading registry state..."
                    : "Registers the app in the Windows startup registry."}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {autostartLoading && <Loader2 className="w-4 h-4 text-(--accent-color) animate-spin" />}
                <Switch
                  checked={autostartEnabled}
                  disabled={autostartLoading}
                  onCheckedChange={handleAutostartToggle}
                />
              </div>
            </div>

            {autostartMessage && (
              <div className="text-xs px-3.5 py-2.5 rounded-lg bg-(--accent-light)/60 text-(--text-primary) font-medium border border-(--accent-color)/10 animate-[fade-in_0.2s_ease-out]">
                {autostartMessage}
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-(--border-color)" />

            {/* Minimize on Close Toggle */}
            <div className="flex items-center justify-between bg-(--bg-primary) p-3.5 rounded-xl border border-(--border-color)">
              <div className="flex items-start gap-3">
                <Minimize2 className="w-4 h-4 text-(--accent-color) mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-(--text-primary)">
                    {minimizeOnCloseLoading ? "Loading preference..." : "Minimize on Close"}
                  </h4>
                  <p className="text-xs text-(--text-secondary) mt-0.5">
                    {minimizeOnCloseLoading
                      ? "Reading preference..."
                      : "Hides the window instead of exiting when the close button is clicked."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {minimizeOnCloseLoading && <Loader2 className="w-4 h-4 text-(--accent-color) animate-spin" />}
                <Switch
                  checked={minimizeOnClose}
                  disabled={minimizeOnCloseLoading}
                  onCheckedChange={handleMinimizeOnCloseToggle}
                />
              </div>
            </div>

            {minimizeOnCloseMessage && (
              <div className="text-xs px-3.5 py-2.5 rounded-lg bg-(--accent-light)/60 text-(--text-primary) font-medium border border-(--accent-color)/10 animate-[fade-in_0.2s_ease-out]">
                {minimizeOnCloseMessage}
              </div>
            )}
          </CardContent>
        </Card>

        {/* One-Click System Cleaner Card */}
        <Card className="border border-border bg-card/60 backdrop-blur-md shadow-sm rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-5 opacity-5 pointer-events-none">
            <Trash2 className="w-16 h-16 text-primary" />
          </div>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Trash2 className="w-4.5 h-4.5 text-(--accent-color)" />
              One-Click System Cleaner
            </CardTitle>
            <CardDescription className="text-[11px]">
              Optimize Windows by cleaning caches, temp files, and logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 flex flex-col gap-3">
            {/* Cleaner categories */}
            <div className="flex flex-col gap-2">
              
              {/* Category 1: Temp Folders */}
              <div className="flex items-center justify-between bg-(--bg-primary) p-2.5 rounded-xl border border-(--border-color)">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-(--text-primary)">
                      System & User Temp
                    </span>
                    <span className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">
                      Safe
                    </span>
                  </div>
                  <p className="text-[10px] text-(--text-secondary) leading-tight">
                    Clears temporary directory cache created by Windows and apps.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0 ml-3">
                  {(cleanerState === "scanning" || cleanerState === "cleaning") && cleanTemp ? (
                    <Loader2 className="w-3.5 h-3.5 text-(--accent-color) animate-spin" />
                  ) : (
                    scanResults && (
                      <span className="text-[11px] font-bold text-(--text-secondary)">
                        {formatSize(scanResults.temp_files_size)}
                      </span>
                    )
                  )}
                  <Switch
                    checked={cleanTemp}
                    disabled={cleanerState === "scanning" || cleanerState === "cleaning" || cleanerState === "finished"}
                    onCheckedChange={setCleanTemp}
                  />
                </div>
              </div>

              {/* Category 2: Prefetch & Logs */}
              <div className="flex items-center justify-between bg-(--bg-primary) p-2.5 rounded-xl border border-(--border-color)">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-(--text-primary)">
                      Windows Prefetch & Logs
                    </span>
                    <span className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                      {!isAdminUser && <ShieldAlert className="w-2.5 h-2.5 text-amber-500" />}
                      Advanced
                    </span>
                  </div>
                  <p className="text-[10px] text-(--text-secondary) leading-tight">
                    Clears Windows Prefetch optimization logs and system log files.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0 ml-3">
                  {(cleanerState === "scanning" || cleanerState === "cleaning") && cleanPrefetchLogs ? (
                    <Loader2 className="w-3.5 h-3.5 text-(--accent-color) animate-spin" />
                  ) : (
                    scanResults && (
                      <span className="text-[11px] font-bold text-(--text-secondary)">
                        {formatSize(scanResults.prefetch_logs_size)}
                      </span>
                    )
                  )}
                  <Switch
                    checked={cleanPrefetchLogs}
                    disabled={cleanerState === "scanning" || cleanerState === "cleaning" || cleanerState === "finished"}
                    onCheckedChange={setCleanPrefetchLogs}
                  />
                </div>
              </div>

              {/* Category 3: App Cache & Data */}
              <div className="flex items-center justify-between bg-(--bg-primary) p-2.5 rounded-xl border border-(--border-color)">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-(--text-primary)">
                      App Cache & Logs
                    </span>
                    <span className="text-[9px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-bold">
                      Toolkit
                    </span>
                  </div>
                  <p className="text-[10px] text-(--text-secondary) leading-tight">
                    Clears logs and temporary folder data for Computer Toolkit app.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0 ml-3">
                  {(cleanerState === "scanning" || cleanerState === "cleaning") && cleanAppCache ? (
                    <Loader2 className="w-3.5 h-3.5 text-(--accent-color) animate-spin" />
                  ) : (
                    scanResults && (
                      <span className="text-[11px] font-bold text-(--text-secondary)">
                        {formatSize(scanResults.app_cache_size)}
                      </span>
                    )
                  )}
                  <Switch
                    checked={cleanAppCache}
                    disabled={cleanerState === "scanning" || cleanerState === "cleaning" || cleanerState === "finished"}
                    onCheckedChange={setCleanAppCache}
                  />
                </div>
              </div>

            </div>

            {/* Actions & Result details */}
            <div className="mt-1">
              {cleanerState === "idle" && (
                <Button
                  onClick={handleScan}
                  disabled={!cleanTemp && !cleanPrefetchLogs && !cleanAppCache}
                  className="w-full font-bold text-xs bg-(--accent-color) text-white hover:bg-(--accent-hover) border-0 py-2 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Wind className="w-3.5 h-3.5" />
                  Scan System
                </Button>
              )}

              {cleanerState === "scanning" && (
                <Button
                  disabled
                  className="w-full font-bold text-xs bg-(--accent-light) text-(--accent-color) border border-(--accent-color)/20 py-2 flex items-center justify-center gap-2"
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Scanning Directories...
                </Button>
              )}

              {cleanerState === "scanned" && scanResults && (
                <div className="flex flex-col gap-3 animate-[fade-in_0.2s_ease-out]">
                  {/* Summary of findings */}
                  <div className="bg-(--accent-light)/40 border border-(--accent-color)/10 p-2.5 rounded-xl text-center flex justify-around items-center">
                    <div>
                      <span className="text-[9px] text-(--text-secondary) block leading-tight">Total Junk Detected</span>
                      <span className="text-lg font-black text-(--accent-color) block mt-0.5">
                        {formatSize(
                          (cleanTemp ? scanResults.temp_files_size : 0) +
                          (cleanPrefetchLogs ? scanResults.prefetch_logs_size : 0) +
                          (cleanAppCache ? scanResults.app_cache_size : 0)
                        )}
                      </span>
                    </div>
                    <div className="border-l border-(--border-color) h-8" />
                    <div>
                      <span className="text-[9px] text-(--text-secondary) block leading-tight">Total Files</span>
                      <span className="text-lg font-black text-(--text-primary) block mt-0.5">
                        {(cleanTemp ? scanResults.temp_files_count : 0) +
                         (cleanPrefetchLogs ? scanResults.prefetch_logs_count : 0) +
                         (cleanAppCache ? scanResults.app_cache_count : 0)}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleResetCleaner}
                      className="flex-1 font-bold text-xs cursor-pointer py-1.5"
                    >
                      Cancel
                    </Button>
                    {!isAdminUser && cleanPrefetchLogs ? (
                      <Button
                        onClick={async () => {
                          try {
                            await safeInvoke("relaunch_as_admin");
                          } catch (err) {
                            console.error("Failed to relaunch as admin:", err);
                          }
                        }}
                        className="flex-2 font-bold text-xs bg-amber-600 hover:bg-amber-700 text-white border-0 cursor-pointer flex items-center justify-center gap-1.5 py-1.5"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        Clean & Relaunch as Admin
                      </Button>
                    ) : (
                      <Button
                        onClick={handleClean}
                        disabled={
                          (!cleanTemp || scanResults.temp_files_size === 0) &&
                          (!cleanPrefetchLogs || scanResults.prefetch_logs_size === 0) &&
                          (!cleanAppCache || scanResults.app_cache_size === 0)
                        }
                        className="flex-2 font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0 cursor-pointer flex items-center justify-center gap-1.5 py-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Clean System
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {cleanerState === "cleaning" && (
                <Button
                  disabled
                  className="w-full font-bold text-xs bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 py-2 flex items-center justify-center gap-2"
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Cleaning Cache Files...
                </Button>
              )}

              {cleanerState === "finished" && cleanResults && (
                <div className="flex flex-col gap-2.5 text-center animate-[fade-in_0.3s_ease-out]">
                  <div className="flex flex-col items-center justify-center gap-1">
                    <div className="p-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-(--text-primary)">
                        System Cache Cleaned!
                      </h4>
                      <p className="text-[10px] text-(--text-secondary) mt-0.5">
                        Freed <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{formatSize(cleanResults.deleted_size)}</span> of disk space.
                      </p>
                    </div>
                  </div>

                  <div className="bg-(--bg-primary) border border-(--border-color) p-2.5 rounded-xl text-left flex flex-col gap-1 text-[10px]">
                    <div className="flex justify-between text-(--text-secondary) font-semibold">
                      <span>Files Deleted:</span>
                      <span className="text-(--text-primary)">{cleanResults.deleted_count} files</span>
                    </div>
                    {cleanResults.skipped_count > 0 && (
                      <>
                        <div className="border-t border-(--border-color)/40 my-0.5" />
                        <div className="flex justify-between text-(--text-secondary) font-semibold">
                          <span>Files Skipped (In Use):</span>
                          <span className="text-amber-600 dark:text-amber-400">
                            {cleanResults.skipped_count} files ({formatSize(cleanResults.skipped_size)})
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <Button
                    onClick={handleResetCleaner}
                    className="w-full font-bold text-xs bg-(--accent-color) text-white hover:bg-(--accent-hover) border-0 py-2 cursor-pointer"
                  >
                    Done
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RIGHT COLUMN: Quick Navigation & Stats (Spans 1 column) */}
      <div className="flex flex-col gap-4 xl:self-start h-fit">

        {/* Title / Shortcuts Header */}
        <Card className="border border-border bg-card/60 backdrop-blur-md shadow-sm rounded-2xl">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Activity className="w-4.5 h-4.5 text-(--accent-color)" />
              Quick Navigation Hub
            </CardTitle>
            <CardDescription className="text-xs">
              Quickly jump to specialized modules.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2.5">

            {/* Alarm Clock shortcut */}
            <button
              onClick={() => navigate("/alarm-clock")}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-(--border-color) bg-(--bg-primary) hover:bg-(--bg-sidebar-hover) transition-all text-left cursor-pointer group min-h-18"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-(--accent-light) text-(--accent-color)">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-(--text-primary)">Alarm Clock</h4>
                  <p className="text-[10px] text-(--text-secondary)">
                    {activeAlarmsCount > 0 ? `${activeAlarmsCount} pending alarms active` : "Manage alarms and actions"}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-(--text-secondary) opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Power Timer shortcut */}
            <button
              onClick={() => navigate("/shutdown-timer")}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-(--border-color) bg-(--bg-primary) hover:bg-(--bg-sidebar-hover) transition-all text-left cursor-pointer group min-h-18"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-(--accent-light) text-(--accent-color)">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-(--text-primary)">Power Timer</h4>
                  <p className="text-[10px] text-(--text-secondary)">Countdown sleep utilities</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-(--text-secondary) opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Coming Soon 1 shortcut */}
            <button
              onClick={() => navigate("/coming-soon-1")}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-(--border-color) bg-(--bg-primary) hover:bg-(--bg-sidebar-hover) transition-all text-left cursor-pointer group min-h-18"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-(--accent-light) text-(--accent-color)">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-(--text-primary)">Coming Soon 1</h4>
                  <p className="text-[10px] text-(--text-secondary)">Upcoming system module</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-(--text-secondary) opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Coming Soon 2 shortcut */}
            <button
              onClick={() => navigate("/coming-soon-2")}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-(--border-color) bg-(--bg-primary) hover:bg-(--bg-sidebar-hover) transition-all text-left cursor-pointer group min-h-18"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-(--accent-light) text-(--accent-color)">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-(--text-primary)">Coming Soon 2</h4>
                  <p className="text-[10px] text-(--text-secondary)">Upcoming utility module</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-(--text-secondary) opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </button>

          </CardContent>
        </Card>

      </div>
    </div>
  );
}
