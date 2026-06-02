import { useState } from "react";
import { Settings, Volume2, Shield, HelpCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export default function SettingsPage() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [devMode, setDevMode] = useState(false);

  return (
    <div className="flex flex-col max-w-4xl w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl shadow-sm p-6 overflow-y-auto">
      <div className="flex items-center gap-2.5 border-b border-[var(--border-color)] pb-4 mb-6">
        <div className="p-2 rounded-lg bg-[var(--accent-light)] text-[var(--accent-color)]">
          <Settings className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Application Settings</h2>
          <p className="text-xs text-[var(--text-secondary)]">Manage system settings and alarm preferences.</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Alarms and Audio */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] opacity-80 mb-3 flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-[var(--accent-color)]" />
            Alarms & Sound
          </h3>
          <div className="space-y-4 bg-[var(--bg-primary)] p-4 rounded-xl border border-[var(--border-color)]">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Alarm Sound</h4>
                <p className="text-xs text-[var(--text-secondary)]">Play an audible sound when alarm is triggered.</p>
              </div>
              <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
            </div>
            <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-4">
              <div>
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Show Notifications</h4>
                <p className="text-xs text-[var(--text-secondary)]">Display system banners for pending timer notifications.</p>
              </div>
              <Switch checked={notifications} onCheckedChange={setNotifications} />
            </div>
          </div>
        </div>

        {/* Security & System */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] opacity-80 mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--accent-color)]" />
            Security & Execution
          </h3>
          <div className="space-y-4 bg-[var(--bg-primary)] p-4 rounded-xl border border-[var(--border-color)]">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Developer Mode</h4>
                <p className="text-xs text-[var(--text-secondary)]">Enable advanced debugging capabilities and raw terminal logs.</p>
              </div>
              <Switch checked={devMode} onCheckedChange={setDevMode} />
            </div>
          </div>
        </div>

        {/* Information Section */}
        <div className="bg-[var(--accent-light)]/40 border border-[var(--accent-color)]/10 rounded-xl p-4 flex gap-3">
          <HelpCircle className="w-5 h-5 text-[var(--accent-color)] shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">About Computer Toolkit</h4>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              This toolkit is a desktop integration utility built with Tauri, React, and Tailwind CSS.
              It allows managing alarms, countdowns, and running scheduled OS tasks. Version 0.1.0.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
