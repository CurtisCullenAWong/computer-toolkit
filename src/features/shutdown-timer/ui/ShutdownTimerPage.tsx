import { useState, useEffect, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { invoke } from "@tauri-apps/api/core";
import { Play, Pause, XCircle, Check, Laptop, Hourglass, AlertTriangle, Loader2 } from "lucide-react";

type TimerStatus = "idle" | "running" | "paused" | "finished" | "triggering";
const WARNING_THRESHOLD_SECONDS = 10;

// Format HH:MM:SS from total seconds — pure function outside component
const formatTime = (totalSecs: number): string => {
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const safeInvoke = async <T,>(cmd: string, args?: Record<string, any>): Promise<T> => {
  if ((window as any).__TAURI_INTERNALS__) {
    return await invoke<T>(cmd, args);
  }
  // Browser mock
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (cmd === "shutdown_after") {
    const secs = args?.seconds ?? 0;
    return (secs === 0
      ? "Shutdown initiated immediately."
      : `Shutdown scheduled in ${secs} seconds. Run 'shutdown /a' to cancel.`) as T;
  }
  if (cmd === "cancel_shutdown") {
    return "Scheduled shutdown cancelled successfully." as T;
  }
  throw new Error(`Mock: "${cmd}" not implemented`);
};

export default function ShutdownTimerPage() {
  const [inputHours, setInputHours] = useState(0);
  const [inputMinutes, setInputMinutes] = useState(1);
  const [inputSeconds, setInputSeconds] = useState(0);

  const [status, setStatus] = useState<TimerStatus>("idle");
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);

  // Command feedback
  const [commandMessage, setCommandMessage] = useState("");
  const [commandError, setCommandError] = useState("");

  const timerIntervalRef = useRef<number | null>(null);
  const targetTimeRef = useRef<number>(0);
  const pausedTimeLeftRef = useRef<number>(0);
  const warningAudioContextRef = useRef<AudioContext | null>(null);
  const warningSecondRef = useRef<number | null>(null);

  // SVG circular progress — derived values
  const radius = 95;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    totalDuration > 0
      ? circumference - (timeLeft / totalDuration) * circumference
      : circumference;

  const clearTick = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const stopWarningAudio = useCallback(() => {
    warningSecondRef.current = null;
    if (warningAudioContextRef.current) {
      void warningAudioContextRef.current.close();
      warningAudioContextRef.current = null;
    }
  }, []);

  const playWarningSound = useCallback(async () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      let audioContext = warningAudioContextRef.current;
      if (!audioContext) {
        audioContext = new AudioCtx();
        warningAudioContextRef.current = audioContext;
      }

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(1040, audioContext.currentTime);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.45, audioContext.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.28);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.32);
    } catch (err) {
      console.warn("[Shutdown] Warning sound could not be played.", err);
    }
  }, []);

  const handleSliderChange = useCallback((val: number[]) => {
    const minutesVal = val[0];
    setInputHours(Math.floor(minutesVal / 60));
    setInputMinutes(minutesVal % 60);
    setInputSeconds(0);
  }, []);

  const startTimer = useCallback(() => {
    const totalSecs = inputHours * 3600 + inputMinutes * 60 + inputSeconds;
    if (totalSecs <= 0) return;
    setCommandMessage("");
    setCommandError("");
    setTotalDuration(totalSecs);
    setTimeLeft(totalSecs);
    setStatus("running");
    targetTimeRef.current = Date.now() + totalSecs * 1000;
  }, [inputHours, inputMinutes, inputSeconds]);

  const pauseTimer = useCallback(() => {
    if (status !== "running") return;
    setStatus("paused");
    pausedTimeLeftRef.current = Math.max(0, Math.ceil((targetTimeRef.current - Date.now()) / 1000));
    clearTick();
  }, [status, clearTick]);

  const resumeTimer = useCallback(() => {
    if (status !== "paused") return;
    setStatus("running");
    targetTimeRef.current = Date.now() + pausedTimeLeftRef.current * 1000;
  }, [status]);

  const resetTimer = useCallback(async () => {
    clearTick();
    stopWarningAudio();
    setStatus("idle");
    setTimeLeft(0);
    setTotalDuration(0);
    setCommandMessage("");
    setCommandError("");
    // Best-effort cancel any pending OS shutdown
    try {
      const msg = await safeInvoke<string>("cancel_shutdown");
      console.log("[Shutdown] Cancel result:", msg);
    } catch (e) {
      console.warn("[Shutdown] cancel_shutdown error (may be none pending):", e);
    }
  }, [clearTick, stopWarningAudio]);

  const triggerShutdown = useCallback(async () => {
    clearTick();
    stopWarningAudio();
    setStatus("triggering");
    setCommandMessage("");
    setCommandError("");
    try {
      const result = await safeInvoke<string>("shutdown_after", { seconds: 0 });
      setCommandMessage(result);
      setStatus("finished");
    } catch (e: any) {
      setCommandError(e?.message ?? "Shutdown command failed. Check permissions.");
      setStatus("finished");
    }
  }, [clearTick, stopWarningAudio]);

  // Ticking effect — only when "running"
  useEffect(() => {
    if (status !== "running") return;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((targetTimeRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining > 0 && remaining <= WARNING_THRESHOLD_SECONDS && warningSecondRef.current !== remaining) {
        warningSecondRef.current = remaining;
        void playWarningSound();
      }
      if (remaining <= 0) {
        triggerShutdown();
      }
    };

    tick();
    timerIntervalRef.current = window.setInterval(tick, 1000);
    return clearTick;
  }, [status, triggerShutdown, clearTick, playWarningSound]);

  useEffect(() => {
    return () => {
      clearTick();
      stopWarningAudio();
    };
  }, [clearTick, stopWarningAudio]);

  const totalInputSecs = inputHours * 3600 + inputMinutes * 60 + inputSeconds;
  const warningActive = status === "running" && timeLeft > 0 && timeLeft <= WARNING_THRESHOLD_SECONDS;

  return (
    <div className="w-full min-h-full flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl shadow-xl border border-border bg-card/60 text-card-foreground rounded-2xl flex flex-col min-h-144">

        <CardHeader className="p-6 pb-0 shrink-0 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight flex items-center justify-center gap-2">
            <Laptop className="w-6 h-6 text-(--accent-color)" />
            Laptop Shutdown Timer
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            Configure a countdown to automatically shut down your computer.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 pt-6 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-center flex-1">

          {/* Left Column: Circular Progress Countdown */}
          <div className="flex flex-col items-center justify-center w-full min-h-0 py-2 md:py-6">
            <div className="relative w-60 h-60 flex items-center justify-center aspect-square select-none max-w-full mx-auto">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 240 240">
                <circle
                  className="fill-none stroke-muted"
                  strokeWidth="4.5"
                  cx="120"
                  cy="120"
                  r={radius}
                />
                <circle
                  className={`fill-none transition-all duration-1000 ease-linear ${warningActive ? "stroke-amber-400" : "stroke-primary"}`}
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  cx="120"
                  cy="120"
                  r={radius}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {status === "triggering" ? (
                  <Loader2 className="w-10 h-10 text-(--accent-color) animate-spin" />
                ) : (
                  <span className={`text-4xl font-extrabold tracking-tight tabular-nums font-mono ${warningActive ? "text-amber-400" : "text-foreground"}`}>
                    {status === "idle"
                      ? formatTime(totalInputSecs)
                      : formatTime(timeLeft)}
                  </span>
                )}
                <span className={`text-xs font-semibold uppercase tracking-wider mt-2 flex items-center gap-1.5 ${warningActive ? "text-amber-400" : "text-muted-foreground"}`}>
                  <Hourglass className={`w-3.5 h-3.5 ${warningActive ? "text-amber-400" : "text-(--accent-color)"}`} />
                  {status === "idle" && "Set Countdown"}
                  {status === "running" && !warningActive && "Ticking"}
                  {warningActive && `Warning: shutdown in ${timeLeft}s`}
                  {status === "paused" && "Paused"}
                  {status === "triggering" && "Shutting down..."}
                  {status === "finished" && "Completed"}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Inputs and Controls */}
          <div className="flex flex-col justify-center w-full gap-5 md:pr-2">
            {status === "idle" ? (
              <div className="flex flex-col gap-5">
                {/* Quick Slider Setup */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-sm font-semibold text-muted-foreground">
                    <span>Quick Select (Minutes)</span>
                    <span className="font-bold text-(--accent-color)">{inputHours * 60 + inputMinutes} min</span>
                  </div>
                  <Slider
                    defaultValue={[1]}
                    max={240}
                    min={1}
                    step={1}
                    value={[inputHours * 60 + inputMinutes]}
                    onValueChange={handleSliderChange}
                    className="py-1.5 cursor-pointer"
                  />
                </div>

                {/* Grid Inputs */}
                <div className="grid grid-cols-3 gap-4 w-full">
                  <div className="flex flex-col gap-1.5 text-center">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Hours</span>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      className="text-center font-semibold font-mono"
                      value={inputHours}
                      onChange={(e) => setInputHours(Math.max(0, Math.min(23, Number(e.target.value))))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 text-center">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Minutes</span>
                    <Input
                      type="number"
                      min={0}
                      max={59}
                      className="text-center font-semibold font-mono"
                      value={inputMinutes}
                      onChange={(e) => setInputMinutes(Math.max(0, Math.min(59, Number(e.target.value))))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 text-center">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Seconds</span>
                    <Input
                      type="number"
                      min={0}
                      max={59}
                      className="text-center font-semibold font-mono"
                      value={inputSeconds}
                      onChange={(e) => setInputSeconds(Math.max(0, Math.min(59, Number(e.target.value))))}
                    />
                  </div>
                </div>

                <Button
                  size="default"
                  className="w-full font-bold mt-2"
                  onClick={startTimer}
                  disabled={totalInputSecs <= 0}
                >
                  Start Countdown
                </Button>
              </div>
            ) : (
              /* Action Buttons (When Ticking, Paused, Triggering, or Finished) */
              <div className="flex flex-col gap-3 w-full justify-center">
                {warningActive && (
                  <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 animate-pulse">
                    <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0 text-amber-400" />
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold uppercase tracking-wider text-[11px]">Final warning</span>
                      <span className="text-xs text-amber-100/90">Shutdown will execute when the timer reaches zero.</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-4 w-full">
                  {status === "running" && (
                    <Button variant="outline" className="flex-1 font-bold flex items-center gap-1.5" onClick={pauseTimer}>
                      <Pause className="w-4 h-4 text-(--accent-color)" />
                      Pause
                    </Button>
                  )}
                  {status === "paused" && (
                    <Button className="flex-1 font-bold flex items-center gap-1.5" onClick={resumeTimer}>
                      <Play className="w-4 h-4" />
                      Resume
                    </Button>
                  )}
                  {(status === "running" || status === "paused" || status === "finished") && (
                    <Button variant="destructive" className="flex-1 font-bold flex items-center gap-1.5" onClick={resetTimer}>
                      <XCircle className="w-4 h-4" />
                      Cancel & Reset
                    </Button>
                  )}
                </div>

                {status === "triggering" && (
                  <div className="text-center text-xs font-semibold text-muted-foreground flex items-center gap-1.5 justify-center animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Sending shutdown command to OS...
                  </div>
                )}

                {status === "finished" && commandMessage && !commandError && (
                  <div className="text-center text-xs font-semibold text-emerald-500 flex items-center gap-1.5 justify-center animate-[fade-in_0.2s_ease-out]">
                    <Check className="w-3.5 h-3.5" />
                    {commandMessage}
                  </div>
                )}

                {status === "finished" && commandError && (
                  <div className="flex items-center gap-1.5 text-red-500 text-xs font-bold bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl animate-[fade-in_0.15s_ease-out]">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{commandError}</span>
                  </div>
                )}
              </div>
            )}
          </div>

        </CardContent>
      </Card>
    </div>
  );
}