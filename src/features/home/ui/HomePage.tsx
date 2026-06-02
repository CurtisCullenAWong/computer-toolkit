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
      if (cmd === "toggle_gpu") {
        return (args?.enable
          ? "Dedicated GPU has been enabled successfully."
          : "Dedicated GPU has been disabled successfully.") as T;
      }
      if (cmd === "detect_gpu") {
        return "NVIDIA GeForce RTX 3060 Laptop GPU (Mock)" as T;
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

    // 5. Read alarms count from localStorage (local only, no IPC needed)
    const savedAlarms = localStorage.getItem("alarms");
    if (savedAlarms) {
      try {
        const parsed = JSON.parse(savedAlarms);
        if (Array.isArray(parsed)) {
          setActiveAlarmsCount(parsed.filter((a: any) => a.enabled).length);
        }
      } catch (e) {
        console.error("Error parsing alarms count", e);
      }
    }

    runGpuDetection();
    runGpuPreferenceCheck();
    runAutostartCheck();
    runMinimizeOnCloseCheck();
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
    } catch {
      setGpuMessage("Error: Failed to toggle GPU device state.");
    } finally {
      setGpuLoading(false);
    }
  }, [pendingGpuState]);

  const cancelGpuToggle = useCallback(() => {
    setShowConfirmModal(false);
  }, []);

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 select-none overflow-y-auto pr-2 pb-5 xl:grid-cols-3">
      {/* GPU Toggler Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-card border border-border shadow-2xl rounded-2xl p-6 animate-[fade-in_0.15s_ease-out]">
            <CardHeader className="p-0 pb-3 flex flex-row items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <CardTitle className="text-base font-bold">Confirm GPU Toggle</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex flex-col gap-5">
              <p className="text-xs text-(--text-secondary) leading-relaxed">
                {pendingGpuState
                  ? "Enable the dedicated GPU device for high-performance tasks?"
                  : "Disable the dedicated GPU device to conserve power?"}
              </p>
              <p className="text-[10px] text-(--text-secondary) opacity-70 leading-relaxed">
                The switch takes effect immediately. A brief screen flicker may occur.
              </p>
              <div className="flex gap-2 justify-end">
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
                  onCheckedChange={triggerGpuToggle}
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

            {/* Shutdown Timer shortcut */}
            <button
              onClick={() => navigate("/shutdown-timer")}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-(--border-color) bg-(--bg-primary) hover:bg-(--bg-sidebar-hover) transition-all text-left cursor-pointer group min-h-18"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-(--accent-light) text-(--accent-color)">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-(--text-primary)">Shutdown Timer</h4>
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
