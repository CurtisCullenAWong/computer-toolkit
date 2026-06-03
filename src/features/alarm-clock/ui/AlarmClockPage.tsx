import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

const safeInvoke = async <T,>(cmd: string, args?: Record<string, any>): Promise<T> => {
  try {
    if ((window as any).__TAURI_INTERNALS__) {
      return await invoke<T>(cmd, args);
    } else {
      console.warn(`[Tauri Mock] invoke("${cmd}") called in browser with args:`, args);
      await new Promise((resolve) => setTimeout(resolve, 120));
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

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Clock,
  Calendar,
  Bell,
  Music,
  Play,
  Pause,
  Trash2,
  UploadCloud,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import {
  getAllAudioFiles,
  saveAudioFile,
  deleteAudioFile,
  getCachedObjectUrl,
  revokeCachedObjectUrl,
  AudioFile,
} from "../utils/db";

interface Alarm {
  id: string;
  time: string; // "HH:MM" 24h format
  label: string;
  enabled: boolean;
  soundId: string;
}

interface PresetTime12h {
  hour: number;
  minute: number;
  period: "AM" | "PM";
}

const PRESET_TIMES_12H: PresetTime12h[] = [
  { hour: 6, minute: 0, period: "AM" },
  { hour: 8, minute: 0, period: "AM" },
  { hour: 9, minute: 30, period: "AM" },
  { hour: 12, minute: 0, period: "PM" },
  { hour: 1, minute: 30, period: "PM" },
  { hour: 5, minute: 30, period: "PM" },
  { hour: 8, minute: 0, period: "PM" },
  { hour: 10, minute: 30, period: "PM" },
];

// Pure helpers — outside component to avoid re-creation
const format12hTo24h = (h: number, m: number, period: "AM" | "PM"): string => {
  let hr = h;
  if (period === "PM" && hr < 12) hr += 12;
  if (period === "AM" && hr === 12) hr = 0;
  return `${String(hr).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const parse24hTo12h = (timeStr: string) => {
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return { hour: h, minute: m, period };
};

const format24hTo12hString = (timeStr: string): string => {
  const { hour, minute, period } = parse24hTo12h(timeStr);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
};

const formatDate = (date: Date): string =>
  date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

export default function AlarmClockPage() {
  const [currentTime, setCurrentTime] = useState(new Date());

  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [selectedSoundId, setSelectedSoundId] = useState<string>("beep");

  // New Alarm Input State (12h format)
  const [newAlarmHour, setNewAlarmHour] = useState(8);
  const [newAlarmMinute, setNewAlarmMinute] = useState(0);
  const [newAlarmPeriod, setNewAlarmPeriod] = useState<"AM" | "PM">("AM");
  const [newAlarmLabel, setNewAlarmLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Audio preview
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Active alarm
  const [triggeredAlarm, setTriggeredAlarm] = useState<Alarm | null>(null);
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const alarmUrlRef = useRef<string | null>(null);
  const synthIntervalRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Inline delete confirmation (replaces browser confirm())
  const [pendingDeleteAudioId, setPendingDeleteAudioId] = useState<string | null>(null);

  // ─── Initial Load (audio files and persistent alarms) ──
  useEffect(() => {
    const loadData = async () => {
      try {
        const files = await getAllAudioFiles();
        setAudioFiles(files);
      } catch (err) {
        console.error("Failed to load audio files from DB", err);
      }
    };
    const loadAlarms = async () => {
      try {
        const alarmsJson = await safeInvoke<string>("read_alarms");
        if (alarmsJson) {
          const parsed = JSON.parse(alarmsJson);
          if (Array.isArray(parsed)) {
            setAlarms(parsed);
          }
        }
      } catch (err) {
        console.error("Failed to load alarms from file", err);
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
    loadAlarms();
  }, []);

  // Save alarms to backend file persistence on change
  useEffect(() => {
    if (isLoaded) {
      const saveAlarms = async () => {
        try {
          await safeInvoke("write_alarms", { alarmsJson: JSON.stringify(alarms) });
        } catch (err) {
          console.error("Failed to save alarms to file", err);
        }
      };
      saveAlarms();
    }
  }, [alarms, isLoaded]);

  // ─── Clock Tick + Alarm Check ─────────────────────────────────────────────
  // Combined into one interval: clock updates AND alarm check happen together,
  // avoiding a separate useEffect re-run on every tick.
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(now);

      // Check alarm only at the top of each minute (seconds === 0)
      if (now.getSeconds() === 0) {
        const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        setTriggeredAlarm((prev) => {
          if (prev) return prev; // already triggered
          setAlarms((currentAlarms) => {
            const match = currentAlarms.find((a) => a.enabled && a.time === timeStr);
            if (match) {
              // Trigger outside render using setTimeout to avoid setState-in-setState
              setTimeout(() => triggerAlarmById(match), 0);
            }
            return currentAlarms;
          });
          return prev;
        });
      }
    };

    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — alarm trigger via functional updater + setTimeout

  // ─── Synth Beep ──────────────────────────────────────────────────────────
  const stopSynthBeep = useCallback(() => {
    if (synthIntervalRef.current) {
      clearInterval(synthIntervalRef.current);
      synthIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  const startSynthBeep = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const playBeep = () => {
        if (!audioCtxRef.current) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      };

      playBeep();
      synthIntervalRef.current = window.setInterval(playBeep, 1000);
    } catch (err) {
      console.error("Synthesizer audio error", err);
    }
  }, []);

  // ─── Preview ───────────────────────────────────────────────────────────────
  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.onended = null;
      previewAudioRef.current = null;
    }
    // Do NOT revoke previewUrlRef — it's a cached URL managed by db.ts
    previewUrlRef.current = null;
    setPlayingPreviewId(null);
  }, []);

  const togglePreview = useCallback((file: AudioFile) => {
    if (playingPreviewId === file.id) {
      stopPreview();
      return;
    }
    stopPreview();

    const url = getCachedObjectUrl(file);
    previewUrlRef.current = url;
    const audio = new Audio(url);
    audio.play()
      .then(() => {
        previewAudioRef.current = audio;
        setPlayingPreviewId(file.id);
        audio.onended = () => {
          setPlayingPreviewId(null);
          previewUrlRef.current = null;
          previewAudioRef.current = null;
        };
      })
      .catch((err) => {
        console.error("Error playing preview", err);
        previewUrlRef.current = null;
      });
  }, [playingPreviewId, stopPreview]);

  // Cleanup preview on unmount
  useEffect(() => () => stopPreview(), [stopPreview]);

  // ─── Alarm Trigger / Dismiss ───────────────────────────────────────────────
  const dismissAlarm = useCallback(() => {
    // Stop custom audio — do NOT revoke the URL, it's cached in db.ts
    if (alarmAudioRef.current) {
      alarmAudioRef.current.pause();
      alarmAudioRef.current.onended = null;
      alarmAudioRef.current = null;
    }
    alarmUrlRef.current = null;
    stopSynthBeep();

    setAlarms((prev) =>
      prev.map((a) =>
        a.id === (triggeredAlarm?.id ?? "") ? { ...a, enabled: false } : a
      )
    );
    setTriggeredAlarm(null);
  }, [triggeredAlarm, stopSynthBeep]);

  const triggerAlarmById = useCallback((alarm: Alarm) => {
    stopPreview();
    setTriggeredAlarm(alarm);

    // Capture audioFiles at call time via a ref to avoid stale closure
    setAudioFiles((currentFiles) => {
      if (alarm.soundId === "beep") {
        startSynthBeep();
      } else {
        const soundFile = currentFiles.find((f) => f.id === alarm.soundId);
        if (soundFile) {
          // Use cached URL — no revokeObjectURL needed here
          const url = getCachedObjectUrl(soundFile);
          alarmUrlRef.current = url;
          const audio = new Audio(url);
          audio.loop = true;
          audio.play()
            .then(() => { alarmAudioRef.current = audio; })
            .catch((err) => {
              console.error("Failed to play custom alarm sound, falling back to beep", err);
              alarmUrlRef.current = null;
              startSynthBeep();
            });
        } else {
          startSynthBeep();
        }
      }
      return currentFiles; // no state mutation
    });
  }, [stopPreview, startSynthBeep]);

  // ─── File Management ──────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      try {
        const saved = await saveAudioFile(files[i]);
        setAudioFiles((prev) => [...prev, saved]);
        setSelectedSoundId(saved.id);
      } catch (err) {
        console.error("Failed to save audio file", err);
      }
    }
    e.target.value = "";
  }, []);

  const confirmDeleteAudio = useCallback(async () => {
    if (!pendingDeleteAudioId) return;
    const id = pendingDeleteAudioId;
    setPendingDeleteAudioId(null);
    try {
      await deleteAudioFile(id);
      // Revoke and remove the cached object URL for this file
      revokeCachedObjectUrl(id);
      setAudioFiles((prev) => prev.filter((f) => f.id !== id));
      if (selectedSoundId === id) setSelectedSoundId("beep");
      setAlarms((prev) =>
        prev.map((alarm) =>
          alarm.soundId === id ? { ...alarm, soundId: "beep" } : alarm
        )
      );
    } catch (err) {
      console.error("Failed to delete audio file", err);
    }
  }, [pendingDeleteAudioId, selectedSoundId]);

  // ─── Alarm Creation ───────────────────────────────────────────────────────
  const handleAdjustTime = useCallback((mins: number) => {
    let totalMinutes = (newAlarmHour % 12) * 60 + newAlarmMinute;
    if (newAlarmPeriod === "PM") totalMinutes += 12 * 60;
    totalMinutes += mins;
    if (totalMinutes < 0) totalMinutes += 24 * 60;

    let nextHour = Math.floor(totalMinutes / 60) % 24;
    const nextMinute = totalMinutes % 60;
    const nextPeriod: "AM" | "PM" = nextHour >= 12 ? "PM" : "AM";
    nextHour = nextHour % 12;
    if (nextHour === 0) nextHour = 12;

    setNewAlarmHour(nextHour);
    setNewAlarmMinute(nextMinute);
    setNewAlarmPeriod(nextPeriod);
    setError(null);
  }, [newAlarmHour, newAlarmMinute, newAlarmPeriod]);

  const handleAddAlarm = useCallback(() => {
    const alarmTime24h = format12hTo24h(newAlarmHour, newAlarmMinute, newAlarmPeriod);
    if (alarms.some((a) => a.time === alarmTime24h)) {
      setError(`An alarm for ${format24hTo12hString(alarmTime24h)} already exists.`);
      return;
    }
    setError(null);
    const newAlarm: Alarm = {
      id: crypto.randomUUID(),
      time: alarmTime24h,
      label: newAlarmLabel.trim() || "Alarm",
      enabled: true,
      soundId: selectedSoundId,
    };
    setAlarms((prev) => [...prev, newAlarm].sort((a, b) => a.time.localeCompare(b.time)));
    setNewAlarmLabel("");

    // Auto-increment by 15 minutes
    let totalMinutes = (newAlarmHour % 12) * 60 + newAlarmMinute;
    if (newAlarmPeriod === "PM") totalMinutes += 12 * 60;
    totalMinutes += 15;
    let nextHour = Math.floor(totalMinutes / 60) % 24;
    let nextMinute = totalMinutes % 60;
    let nextPeriod: "AM" | "PM" = nextHour >= 12 ? "PM" : "AM";
    nextHour = nextHour % 12;
    if (nextHour === 0) nextHour = 12;

    let check24h = format12hTo24h(nextHour, nextMinute, nextPeriod);
    let loops = 0;
    while (alarms.some((a) => a.time === check24h) && loops < 96) {
      totalMinutes += 15;
      nextHour = Math.floor(totalMinutes / 60) % 24;
      nextMinute = totalMinutes % 60;
      nextPeriod = nextHour >= 12 ? "PM" : "AM";
      nextHour = nextHour % 12;
      if (nextHour === 0) nextHour = 12;
      check24h = format12hTo24h(nextHour, nextMinute, nextPeriod);
      loops++;
    }
    setNewAlarmHour(nextHour);
    setNewAlarmMinute(nextMinute);
    setNewAlarmPeriod(nextPeriod);
  }, [newAlarmHour, newAlarmMinute, newAlarmPeriod, newAlarmLabel, selectedSoundId, alarms]);

  const handleDeleteAlarm = useCallback((id: string) => {
    setAlarms((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleToggleAlarm = useCallback((id: string) => {
    setAlarms((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
    );
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col gap-3 select-none overflow-hidden p-1">
      {/* Alarm Trigger Fullscreen Overlay */}
      {triggeredAlarm && (
        <div className="alarm-trigger-overlay">
          <AlertTriangle className="w-16 h-16 animate-bounce text-white mb-4" />
          <div className="alarm-trigger-title">ALARM ACTIVE</div>
          <div className="alarm-trigger-message text-lg">
            {triggeredAlarm.label} ({format24hTo12hString(triggeredAlarm.time)})
          </div>
          <button className="alarm-dismiss-btn flex items-center gap-2 mt-4" onClick={dismissAlarm}>
            Dismiss Alarm
          </button>
        </div>
      )}

      {/* Delete Audio Confirmation Modal (replaces browser confirm()) */}
      {pendingDeleteAudioId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-sm bg-card border border-border shadow-2xl rounded-2xl p-6 animate-[fade-in_0.15s_ease-out]">
            <CardHeader className="p-0 pb-3 flex flex-row items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
                <Trash2 className="w-5 h-5" />
              </div>
              <CardTitle className="text-base font-bold">Delete Sound?</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex flex-col gap-4">
              <p className="text-xs text-(--text-secondary) leading-relaxed">
                This will permanently remove the sound file. Any alarms using it will revert to the default beep.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" className="font-bold text-xs" onClick={() => setPendingDeleteAudioId(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="font-bold text-xs"
                  onClick={confirmDeleteAudio}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top Section: Compact Clock and Date */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3 rounded-2xl border border-border bg-card/60 select-none shadow-sm gap-2 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 w-full sm:w-auto">
          <Clock className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-(--accent-color)" />
          <span className="min-w-0 whitespace-nowrap text-[clamp(1.1rem,4.2vw,2rem)] font-extrabold tracking-tight text-foreground tabular-nums font-mono leading-none">
            {currentTime.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: true,
            })}
          </span>
        </div>
        <div className="w-full sm:w-auto text-[11px] sm:text-sm font-semibold text-muted-foreground flex items-center gap-2 sm:justify-end text-right sm:text-left sm:ml-4">
          <Calendar className="w-4 h-4 text-(--accent-color)/80" />
          {formatDate(currentTime)}
        </div>
      </div>

      {/* Grid: 1 col on mobile, 2 col on md, 3 col on xl */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 w-full flex-1 min-h-0">

        {/* Column 1: Set New Alarm */}
        <Card className="shadow-md border border-border rounded-2xl flex flex-col bg-card/60 overflow-hidden min-h-0">
          <CardHeader className="p-4 pb-2 shrink-0">
            <CardTitle className="text-base font-bold flex items-center gap-2.5">
              <Clock className="w-4.5 h-4.5 text-(--accent-color)" />
              Set New Alarm
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Schedule a custom alarm event.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pb-3 pt-2.5 flex flex-col gap-3 flex-1 min-h-0 justify-between overflow-y-auto alarm-scrollbar">

            <div className="flex flex-col gap-3">
              {/* Label input (top row) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-muted-foreground">Label</label>
                <Input
                  type="text"
                  placeholder="Wake up!"
                  className="font-medium h-9 px-3 rounded-xl w-full text-xs"
                  value={newAlarmLabel}
                  onChange={(e) => setNewAlarmLabel(e.target.value)}
                />
              </div>

              {/* Time input (second row) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-muted-foreground">Time (12h)</label>
                <div className="flex w-full flex-col gap-1.5 bg-(--bg-primary) px-2 py-1.5 sm:px-2.5 rounded-xl border border-(--border-color)">
                  <div className="grid grid-cols-[minmax(3rem,1fr)_auto_minmax(3rem,1fr)] items-center gap-1.5 lg:grid-cols-[minmax(3.5rem,1fr)_auto_minmax(3.5rem,1fr)_auto]">
                    <select
                      value={newAlarmHour}
                      onChange={(e) => { setNewAlarmHour(Number(e.target.value)); setError(null); }}
                      className="min-w-[48px] w-full bg-transparent text-sm font-bold font-mono focus:outline-none cursor-pointer text-center py-1 text-foreground appearance-none"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                        <option key={h} value={h} className="bg-popover text-foreground">{String(h).padStart(2, "0")}</option>
                      ))}
                    </select>
                    <span className="text-muted-foreground font-semibold font-mono">:</span>
                    <select
                      value={newAlarmMinute}
                      onChange={(e) => { setNewAlarmMinute(Number(e.target.value)); setError(null); }}
                      className="min-w-[48px] w-full bg-transparent text-sm font-bold font-mono focus:outline-none cursor-pointer text-center py-1 text-foreground appearance-none"
                    >
                      {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                        <option key={m} value={m} className="bg-popover text-foreground">{String(m).padStart(2, "0")}</option>
                      ))}
                    </select>
                    <div className="hidden lg:grid grid-cols-2 w-21 bg-(--bg-sidebar-hover) rounded-lg p-0.5 border border-border/10 shrink-0 select-none">
                      <button
                        type="button"
                        onClick={() => { setNewAlarmPeriod("AM"); setError(null); }}
                        className={`h-7 text-[10px] font-extrabold rounded-md transition-all cursor-pointer ${
                          newAlarmPeriod === "AM"
                            ? "bg-(--accent-color) text-white shadow-sm"
                            : "bg-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >AM</button>
                      <button
                        type="button"
                        onClick={() => { setNewAlarmPeriod("PM"); setError(null); }}
                        className={`h-7 text-[10px] font-extrabold rounded-md transition-all cursor-pointer ${
                          newAlarmPeriod === "PM"
                            ? "bg-(--accent-color) text-white shadow-sm"
                            : "bg-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >PM</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:hidden w-full bg-(--bg-sidebar-hover) rounded-lg p-0.5 border border-border/10 shrink-0 select-none">
                    <button
                      type="button"
                      onClick={() => { setNewAlarmPeriod("AM"); setError(null); }}
                      className={`h-7 text-[10px] font-extrabold rounded-md transition-all cursor-pointer ${
                        newAlarmPeriod === "AM"
                          ? "bg-(--accent-color) text-white shadow-sm"
                          : "bg-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >AM</button>
                    <button
                      type="button"
                      onClick={() => { setNewAlarmPeriod("PM"); setError(null); }}
                      className={`h-7 text-[10px] font-extrabold rounded-md transition-all cursor-pointer ${
                        newAlarmPeriod === "PM"
                          ? "bg-(--accent-color) text-white shadow-sm"
                          : "bg-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >PM</button>
                  </div>
                </div>
              </div>

              {/* Preset Times */}
              <div className="flex flex-col gap-1.5 mt-1">
                <label className="text-xs font-bold text-muted-foreground">Preset Times</label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-1">
                  {PRESET_TIMES_12H.map((preset, idx) => {
                    const presetTime24h = format12hTo24h(preset.hour, preset.minute, preset.period);
                    const currentInput24h = format12hTo24h(newAlarmHour, newAlarmMinute, newAlarmPeriod);
                    const isSelected = currentInput24h === presetTime24h;
                    const isDuplicate = alarms.some((a) => a.time === presetTime24h);
                    return (
                      <Button
                        key={idx}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        className={`h-7 font-semibold font-mono text-[10px] px-1 transition-all ${
                          isDuplicate ? "opacity-50 border-dashed text-muted-foreground" : ""
                        }`}
                        onClick={() => {
                          setNewAlarmHour(preset.hour);
                          setNewAlarmMinute(preset.minute);
                          setNewAlarmPeriod(preset.period);
                          setError(null);
                        }}
                        title={isDuplicate ? "Alarm already exists for this time" : `Set to ${preset.hour}:${String(preset.minute).padStart(2, "0")} ${preset.period}`}
                      >
                        {preset.hour}:{String(preset.minute).padStart(2, "0")} {preset.period}
                      </Button>
                    );
                  })}
                </div>

                {/* Adjust Controls */}
                <div className="flex items-center justify-between mt-0.5 text-xs bg-(--bg-primary)/50 p-1.5 rounded-xl border border-border/30">
                  <span className="font-bold text-muted-foreground">Adjust Input Time</span>
                  <div className="flex gap-1">
                    <Button type="button" variant="outline" className="font-bold text-[10px] h-7 px-2" onClick={() => handleAdjustTime(-15)} title="Subtract 15 minutes">-15m</Button>
                    <Button type="button" variant="outline" className="font-bold text-[10px] h-7 px-2" onClick={() => handleAdjustTime(15)} title="Add 15 minutes">+15m</Button>
                  </div>
                </div>
              </div>

              {/* Sound Selector */}
              <div className="flex flex-col gap-1 mt-1.5">
                <label className="text-xs font-bold text-muted-foreground">Alarm Sound</label>
                <Select value={selectedSoundId} onValueChange={setSelectedSoundId}>
                  <SelectTrigger size="sm" className="w-full font-semibold rounded-xl border-border min-w-[140px] text-xs">
                    <SelectValue placeholder="Select sound" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover text-foreground">
                    <SelectItem value="beep" className="text-xs font-semibold">
                      <div className="flex items-center gap-2">
                        <Bell className="w-3.5 h-3.5 text-(--accent-color)/80" />
                        <span>Default Beep</span>
                      </div>
                    </SelectItem>
                    {audioFiles.map((file) => (
                      <SelectItem key={file.id} value={file.id} className="text-xs font-semibold">
                        <div className="flex items-center gap-2">
                          <Music className="w-3.5 h-3.5 text-(--accent-color)/80" />
                          <span>{file.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 mt-auto">
              {error && (
                <div className="flex items-center gap-1.5 text-red-500 text-[11px] font-bold bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl animate-[fade-in_0.15s_ease-out]">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <Button className="w-full font-bold h-10 rounded-xl cursor-pointer" onClick={handleAddAlarm}>
                Create Alarm
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Column 2: Custom Alarm Sounds */}
        <Card className="shadow-md border border-border rounded-2xl flex flex-col bg-card/60 overflow-hidden min-h-0">
          <CardHeader className="p-4 pb-2 shrink-0">
            <CardTitle className="text-base font-bold flex items-center gap-2.5">
              <Music className="w-4.5 h-4.5 text-(--accent-color)" />
              Custom Alarm Sounds
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Upload your audio tracks to play when alarms trigger.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-3 flex flex-col gap-3 flex-1 min-h-0 justify-start">
            <div className="import-zone shrink-0 flex flex-col items-center justify-center py-5 sm:py-6 border-dashed border-2 rounded-xl bg-black/5 hover:bg-black/10 transition-all cursor-pointer relative">
              <UploadCloud className="w-8 h-8 sm:w-9 sm:h-9 text-(--accent-color) mb-1" />
              <p className="text-xs sm:text-sm font-semibold text-foreground text-center px-2">
                Click or Drag Custom Sounds Here
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 text-center">
                Supports MP3, WAV, M4A, OGG
              </p>
              <input
                type="file"
                accept="audio/*"
                multiple
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>

            <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 shrink-0">
                <Music className="w-3.5 h-3.5 text-(--accent-color)" />
                Your Tracks ({audioFiles.length})
              </h4>

              {audioFiles.length === 0 ? (
                <div className="flex-1 flex items-center justify-center border border-dashed rounded-xl bg-muted/10 p-6 text-center text-xs text-muted-foreground">
                  No custom sounds uploaded yet.
                </div>
              ) : (
                <div className="audio-list flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-1.5 alarm-scrollbar">
                  {audioFiles.map((file) => (
                    <div
                      key={file.id}
                        className={`audio-item flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-2 rounded-lg border transition-all duration-150 ${
                        selectedSoundId === file.id
                          ? "border-(--accent-color) bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)]"
                          : "border-border hover:bg-muted/10"
                      }`}
                      onClick={() => setSelectedSoundId(file.id)}
                    >
                      <div className="audio-item-info flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                        {selectedSoundId === file.id ? (
                          <ChevronRight className="w-3.5 h-3.5 text-(--accent-color) shrink-0" />
                        ) : (
                          <Music className="w-3.5 h-3.5 text-(--accent-color)/60 shrink-0" />
                        )}
                        <span className="audio-item-name text-xs font-semibold truncate text-foreground" title={file.name}>
                          {file.name}
                        </span>
                      </div>
                      <div className="audio-item-actions flex items-center gap-2 shrink-0 self-end sm:self-auto">
                        <Button
                          size="xs"
                          variant={playingPreviewId === file.id ? "default" : "secondary"}
                          className="font-semibold flex items-center gap-1 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); togglePreview(file); }}
                        >
                          {playingPreviewId === file.id ? (
                            <><Pause className="w-3 h-3" /><span>Stop</span></>
                          ) : (
                            <><Play className="w-3 h-3" /><span>Play</span></>
                          )}
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="hover:bg-destructive/10 text-muted-foreground cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); setPendingDeleteAudioId(file.id); }}
                          title="Delete sound"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500/70" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Column 3: Active Alarms */}
        <Card className="shadow-md border border-border rounded-2xl flex flex-col bg-card/60 overflow-hidden min-h-0 md:col-span-2 xl:col-span-1">
          <CardHeader className="p-4 pb-2 shrink-0">
            <CardTitle className="text-base font-bold flex items-center gap-2.5">
              <Bell className="w-4.5 h-4.5 text-(--accent-color)" />
              Active Alarms ({alarms.length})
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Toggle and manage active scheduled alarms.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-3 flex flex-col gap-3 flex-1 min-h-0 justify-start">
            {alarms.length === 0 ? (
              <div className="flex-1 flex items-center justify-center border border-dashed rounded-xl bg-muted/10 p-6 text-center text-xs text-muted-foreground">
                No alarms scheduled.
              </div>
            ) : (
              <div className="alarm-list flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pr-1.5 alarm-scrollbar">
                {alarms.map((alarm) => {
                  const soundFile = audioFiles.find((f) => f.id === alarm.soundId);
                  const soundName = alarm.soundId === "beep" ? "System Beep" : soundFile ? soundFile.name : "Unknown Sound";
                  return (
                    <div key={alarm.id} className="alarm-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border border-border bg-black/10 rounded-xl hover:bg-black/15 transition-all">
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-sm sm:text-base font-bold tracking-tight text-foreground font-mono">
                            {format24hTo12hString(alarm.time)}
                          </span>
                          <span className="text-xs font-semibold text-muted-foreground truncate max-w-30 sm:max-w-20" title={alarm.label}>
                            ({alarm.label})
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1.5 truncate mt-0.5">
                          <Music className="w-3 h-3 text-(--accent-color)/70 shrink-0" />
                          {soundName}
                        </span>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-2.5">
                        <Switch
                          checked={alarm.enabled}
                          onCheckedChange={() => handleToggleAlarm(alarm.id)}
                        />
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="hover:bg-destructive/10 text-muted-foreground cursor-pointer"
                          onClick={() => handleDeleteAlarm(alarm.id)}
                          title="Delete alarm"
                        >
                          <Trash2 className="w-4 h-4 text-red-500/70" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}