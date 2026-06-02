import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import {
  Sun,
  Moon,
  Monitor,
  AlarmClock,
  Power,
  Terminal,
  Palette,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  Settings,
  Home,
} from "lucide-react";
import { features } from "./features";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Theme = "light" | "dark" | "system";
type ThemeColor = "indigo" | "emerald" | "rose" | "ocean" | "violet";

interface PresetPalette {
  id: ThemeColor;
  name: string;
}

const PRESET_PALETTES: PresetPalette[] = [
  { id: "indigo", name: "Warm Amber" },
  { id: "emerald", name: "Steel Slate" },
  { id: "rose", name: "Deep Teal" },
  { id: "ocean", name: "Soft Coral" },
  { id: "violet", name: "Rich Plum" },
];

// Pure function — no component closure deps, defined outside to avoid re-creation
const getPresetColors = (id: ThemeColor, dark: boolean): string[] => {
  switch (id) {
    case "indigo":
      return dark
        ? ["#f59e0b", "#d97706", "#1a1612", "#231e18"]
        : ["#d97706", "#b45309", "#fafaf8", "#f5f4f0"];
    case "emerald":
      return dark
        ? ["#60a5fa", "#818cf8", "#12151c", "#1a1f2b"]
        : ["#3b82f6", "#6366f1", "#f4f6f9", "#eaecf0"];
    case "rose":
      return dark
        ? ["#14b8a6", "#10b981", "#0d1412", "#141e1c"]
        : ["#0d9488", "#059669", "#f5fafa", "#eaf4f3"];
    case "ocean":
      return dark
        ? ["#f87060", "#fb923c", "#171210", "#201917"]
        : ["#e55c3f", "#d97706", "#faf8f6", "#f2eeea"];
    case "violet":
      return dark
        ? ["#a78bfa", "#818cf8", "#100e18", "#181422"]
        : ["#7c3aed", "#6d28d9", "#faf8ff", "#f2eeff"];
  }
};

const getIcon = (iconName: string, className = "w-5 h-5") => {
  switch (iconName) {
    case "home":
      return <Home className={className} />;
    case "alarm":
    case "alarm-clock":
      return <AlarmClock className={className} />;
    case "power":
      return <Power className={className} />;
    case "folder":
      return <Folder className={className} />;
    case "file-text":
      return <FileText className={className} />;
    case "settings":
      return <Settings className={className} />;
    case "terminal":
      return <Terminal className={className} />;
    default:
      return <Terminal className={className} />;
  }
};

export default function AppLayout() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("theme") as Theme) || "system";
  });

  const [themeColor, setThemeColor] = useState<ThemeColor>(() => {
    return (localStorage.getItem("themeColor") as ThemeColor) || "indigo";
  });

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });

  const location = useLocation();
  const [isDarkActive, setIsDarkActive] = useState(false);

  // Memoize enabled features — stable across renders unless features config changes
  const enabledFeatures = useMemo(() => features.filter((f) => f.enabled), []);

  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    enabledFeatures.forEach((f) => {
      if (f.subModules?.some((sm) => location.pathname.startsWith(sm.path))) {
        initial[f.id] = true;
      }
    });
    return initial;
  });

  // Tooltip state
  const [hoveredCoords, setHoveredCoords] = useState<{ top: number; left: number } | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string>("");

  // Floating menu state for collapsed parent modules
  const [activeFloatingParent, setActiveFloatingParent] = useState<typeof features[0] | null>(null);
  const [floatingCoords, setFloatingCoords] = useState<{ top: number; left: number } | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = () => {
      let dark = false;
      if (theme === "dark") {
        dark = true;
      } else if (theme === "light") {
        dark = false;
      } else {
        dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      }

      if (dark) {
        root.classList.add("dark");
        root.classList.remove("light");
        setIsDarkActive(true);
      } else {
        root.classList.add("light");
        root.classList.remove("dark");
        setIsDarkActive(false);
      }
    };

    applyTheme();
    localStorage.setItem("theme", theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = () => applyTheme();
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;

    root.classList.forEach((className) => {
      if (className.startsWith("theme-")) {
        root.classList.remove(className);
      }
    });

    root.classList.add(`theme-${themeColor}`);
    localStorage.setItem("themeColor", themeColor);
  }, [themeColor]);

  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", String(isCollapsed));
  }, [isCollapsed]);

  // Cleanup floating menu timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Auto-expand active feature parent
  useEffect(() => {
    enabledFeatures.forEach((f) => {
      if (f.subModules?.some((sm) => location.pathname.startsWith(sm.path))) {
        setExpandedParents((prev) => ({ ...prev, [f.id]: true }));
      }
    });
  }, [location.pathname, enabledFeatures]);

  const { headerName, headerDesc } = useMemo(() => {
    const feature = enabledFeatures.find((f) => {
      if (f.routes && f.routes.length > 0 && location.pathname.startsWith(f.routes[0].path)) return true;
      if (f.subModules && f.subModules.some((sm) => location.pathname.startsWith(sm.path))) return true;
      return false;
    });

    let name = "";
    let desc = "";
    if (feature) {
      if (feature.isLabelOnly && feature.subModules) {
        const activeSub = feature.subModules.find((sm) => location.pathname.startsWith(sm.path));
        if (activeSub) {
          name = activeSub.name;
          desc = activeSub.description || feature.description;
        } else {
          name = feature.name;
          desc = feature.description;
        }
      } else {
        name = feature.name;
        desc = feature.description;
      }
    }
    return { activeFeature: feature, headerName: name, headerDesc: desc };
  }, [enabledFeatures, location.pathname]);

  const cycleTheme = useCallback(() => {
    const themes: Theme[] = ["light", "dark", "system"];
    setTheme((prev) => themes[(themes.indexOf(prev) + 1) % themes.length]);
  }, []);

  const cycleThemeColor = useCallback(() => {
    const colors: ThemeColor[] = ["indigo", "emerald", "rose", "ocean", "violet"];
    setThemeColor((prev) => colors[(colors.indexOf(prev) + 1) % colors.length]);
  }, []);

  // Tooltip handlers
  const handleMouseEnter = useCallback((e: React.MouseEvent, label: string) => {
    if (!isCollapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredCoords({ top: rect.top + rect.height / 2, left: rect.right });
    setHoveredLabel(label);
  }, [isCollapsed]);

  const handleMouseLeave = useCallback(() => {
    setHoveredLabel("");
    setHoveredCoords(null);
  }, []);

  // Floating submenu handlers for collapsed mode
  const handleParentMouseEnter = useCallback((e: React.MouseEvent, feature: typeof features[0]) => {
    if (!isCollapsed) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setFloatingCoords({ top: rect.top, left: rect.right });
    setActiveFloatingParent(feature);
  }, [isCollapsed]);

  const handleParentMouseLeave = useCallback(() => {
    if (!isCollapsed) return;
    closeTimeoutRef.current = setTimeout(() => {
      setActiveFloatingParent(null);
    }, 150);
  }, [isCollapsed]);

  const handleMenuMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const handleMenuMouseLeave = useCallback(() => {
    setActiveFloatingParent(null);
  }, []);

  const toggleParent = useCallback((id: string) => {
    setExpandedParents((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Build routing mappings — memoized so routes don't change reference every render
  const routesToRegister = useMemo(() => {
    const routes: Array<{ path: string; component: React.ComponentType; key: string }> = [];
    enabledFeatures.forEach((f) => {
      if (f.subModules) {
        f.subModules.forEach((sm) => {
          routes.push({ key: sm.id, path: sm.path, component: sm.component });
        });
      } else if (f.routes && f.routes.length > 0) {
        routes.push({ key: f.id, path: f.routes[0].path, component: f.routes[0].component });
      }
    });
    return routes;
  }, [enabledFeatures]);

  return (
    <div className="flex h-screen w-screen bg-(--bg-primary) overflow-hidden select-none">
      {/* Custom Global Tooltip */}
      {isCollapsed && hoveredLabel && hoveredCoords && (
        <div
          style={{ top: hoveredCoords.top, left: hoveredCoords.left }}
          className="fixed z-9999 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-popover text-foreground border border-border shadow-md pointer-events-none select-none -translate-y-1/2 ml-2 transition-all duration-150 animate-[fade-in_0.15s_ease-out] whitespace-nowrap"
        >
          {hoveredLabel}
        </div>
      )}

      {/* Floating Submenu for Collapsed Parent Feature */}
      {isCollapsed && activeFloatingParent && floatingCoords && (
        <div
          style={{ top: floatingCoords.top, left: floatingCoords.left }}
          onMouseEnter={handleMenuMouseEnter}
          onMouseLeave={handleMenuMouseLeave}
          className="fixed z-9998 ml-2 w-48 bg-popover border border-border rounded-xl shadow-lg p-2 flex flex-col gap-1 transition-all duration-150 animate-[fade-in_0.15s_ease-out]"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-(--text-sidebar) opacity-60 border-b border-border/45 mb-1">
            {activeFloatingParent.name}
          </div>
          {activeFloatingParent.subModules?.map((sm) => (
            <NavLink
              key={sm.id}
              to={sm.path}
              onClick={() => setActiveFloatingParent(null)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium text-xs transition-all duration-150 ${isActive
                  ? "text-(--text-sidebar-active) bg-(--accent-color)"
                  : "text-(--text-sidebar) hover:text-(--text-sidebar-title) hover:bg-(--bg-sidebar-hover)"
                }`
              }
            >
              {sm.icon ? getIcon(sm.icon, "w-4 h-4") : <FileText className="w-4 h-4" />}
              <span className="truncate">{sm.name}</span>
            </NavLink>
          ))}
        </div>
      )}

      {/* Sidebar */}
      <div
        className={`${isCollapsed ? "w-19" : "w-65"
          } bg-(--bg-sidebar) text-(--text-sidebar) flex flex-col justify-between border-r border-(--border-color) p-4 shrink-0 transition-all duration-300 ease-in-out relative`}
      >
        <div className="flex flex-col gap-6 overflow-y-auto overflow-x-hidden flex-1 scrollbar-thin">
          {/* Header & Logo */}
          <div className="flex items-center justify-between min-h-10 mb-2">
            {!isCollapsed ? (
              <>
                <h2 className="text-lg font-bold text-(--text-sidebar-title) flex items-center gap-3 tracking-tight truncate">
                  <Terminal className="w-6 h-6 text-(--accent-color) shrink-0" />
                  <span className="truncate">Computer Toolkit</span>
                </h2>
                <button
                  onClick={() => setIsCollapsed(true)}
                  className="p-1.5 rounded-lg hover:bg-(--bg-sidebar-hover) text-(--text-sidebar) hover:text-(--text-sidebar-title) transition-all cursor-pointer shrink-0"
                  title="Collapse Sidebar"
                >
                  <ChevronLeft className="w-4.5 h-4.5" />
                </button>
              </>
            ) : (
              <div className="w-full flex flex-col items-center gap-4">
                <button
                  onClick={() => setIsCollapsed(false)}
                  className="p-1.5 rounded-lg hover:bg-(--bg-sidebar-hover) text-(--text-sidebar) hover:text-(--text-sidebar-title) transition-all cursor-pointer"
                  title="Expand Sidebar"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="border-b border-(--border-color) w-8 my-1" />
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1.5 grow">
            {enabledFeatures.map((f) => {
              // Option A: Item is Label Only (has submodules)
              if (f.isLabelOnly) {
                const isExpanded = expandedParents[f.id];
                const hasActiveChild = f.subModules?.some((sm) => location.pathname.startsWith(sm.path));

                if (!isCollapsed) {
                  return (
                    <div key={f.id} className="flex flex-col gap-1">
                      <button
                        onClick={() => toggleParent(f.id)}
                        className={`flex items-center justify-between w-full px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-150 cursor-pointer ${hasActiveChild
                          ? "text-(--text-sidebar-title) bg-(--bg-sidebar-hover)/60"
                          : "text-(--text-sidebar) hover:text-(--text-sidebar-title) hover:bg-(--bg-sidebar-hover)"
                          }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          {getIcon(f.icon, "w-5 h-5 shrink-0")}
                          <span className="truncate">{f.name}</span>
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""
                            }`}
                        />
                      </button>

                      {isExpanded && (
                        <div className="flex flex-col gap-1 ml-4 pl-4 border-l border-(--border-color) mt-0.5">
                          {f.subModules?.map((sm) => (
                            <NavLink
                              key={sm.id}
                              to={sm.path}
                              className={({ isActive }) =>
                                `flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium text-xs transition-all duration-150 ${isActive
                                  ? "text-(--text-sidebar-active) bg-(--accent-color)"
                                  : "text-(--text-sidebar) hover:text-(--text-sidebar-title) hover:bg-(--bg-sidebar-hover)"
                                }`
                              }
                            >
                              {sm.icon ? getIcon(sm.icon, "w-4 h-4 shrink-0") : <FileText className="w-4 h-4 shrink-0" />}
                              <span className="truncate">{sm.name}</span>
                            </NavLink>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                } else {
                  // Collapsed mode for parent feature
                  return (
                    <button
                      key={f.id}
                      onMouseEnter={(e) => handleParentMouseEnter(e, f)}
                      onMouseLeave={handleParentMouseLeave}
                      className={`flex items-center justify-center w-full aspect-square rounded-xl transition-all duration-150 cursor-pointer relative ${hasActiveChild
                        ? "text-(--text-sidebar-active) bg-(--accent-color)"
                        : "text-(--text-sidebar) hover:text-(--text-sidebar-title) hover:bg-(--bg-sidebar-hover)"
                        }`}
                    >
                      {getIcon(f.icon, "w-5 h-5")}
                      <div className="absolute right-1 bottom-1 w-1.5 h-1.5 rounded-full bg-foreground/40" />
                    </button>
                  );
                }
              }

              // Option B: Regular Feature Item (with direct route)
              const path = f.routes?.[0]?.path || "";
              if (!isCollapsed) {
                return (
                  <NavLink
                    key={f.id}
                    to={path}
                    className={({ isActive }) =>
                      `flex items-center gap-3.5 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-150 ${isActive
                        ? "text-(--text-sidebar-active) bg-(--accent-color)"
                        : "text-(--text-sidebar) hover:text-(--text-sidebar-title) hover:bg-(--bg-sidebar-hover)"
                      }`
                    }
                  >
                    {getIcon(f.icon, "w-5 h-5 shrink-0")}
                    <span className="truncate">{f.name}</span>
                  </NavLink>
                );
              } else {
                // Collapsed mode for normal feature item
                return (
                  <NavLink
                    key={f.id}
                    to={path}
                    onMouseEnter={(e) => handleMouseEnter(e, f.name)}
                    onMouseLeave={handleMouseLeave}
                    className={({ isActive }) =>
                      `flex items-center justify-center w-full aspect-square rounded-xl transition-all duration-150 ${isActive
                        ? "text-(--text-sidebar-active) bg-(--accent-color)"
                        : "text-(--text-sidebar) hover:text-(--text-sidebar-title) hover:bg-(--bg-sidebar-hover)"
                      }`
                    }
                  >
                    {getIcon(f.icon, "w-5 h-5")}
                  </NavLink>
                );
              }
            })}
          </nav>
        </div>

        {/* Configurations Panel */}
        <div className="flex flex-col gap-4 border-t border-(--border-color) pt-4 mt-auto">
          {!isCollapsed ? (
            <>
              {/* Accent Presets Dropdown */}
              <div className="flex flex-col gap-2">
                <div className="text-[10px] uppercase font-bold tracking-wider text-(--text-sidebar) opacity-60 flex items-center gap-1.5 select-none">
                  <Palette className="w-3.5 h-3.5" />
                  Accent Preset
                </div>
                <Select value={themeColor} onValueChange={(val) => setThemeColor(val as ThemeColor)}>
                  <SelectTrigger className="w-full h-9 font-semibold text-xs border-(--border-color) bg-(--bg-select-trigger) text-(--text-select-trigger) hover:bg-(--bg-select-trigger-hover) transition-all select-none">
                    <SelectValue placeholder="Select Accent" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-foreground">
                    {PRESET_PALETTES.map((preset) => {
                      const colors = getPresetColors(preset.id, isDarkActive);
                      return (
                        <SelectItem
                          key={preset.id}
                          value={preset.id}
                          className="text-xs font-semibold cursor-pointer data-highlighted:text-slate-950 dark:data-highlighted:text-slate-950"
                        >
                          <div className="flex items-center justify-between gap-4 w-full min-w-37.5">
                            {/* Force a highly readable text color shift on hover/highlight */}
                            <span className="data-highlighted:text-slate-950 mix-blend-difference invert dark:invert-0 font-bold">
                              {preset.name}
                            </span>
                            <div className="flex gap-1 border border-black/40 dark:border-white/40 rounded p-0.5 bg-black/40 dark:bg-black/60 shrink-0 shadow-md">
                              {colors.map((c, idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    backgroundColor: c,
                                  }}
                                  className="w-2.5 h-2.5 rounded-full ring-1 ring-white/90 dark:ring-white/50 border border-black/20"
                                />
                              ))}
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Theme Switcher */}
              <div className="flex flex-col gap-2">
                <div className="text-[10px] uppercase font-bold tracking-wider text-(--text-sidebar) opacity-60 select-none">Theme</div>
                <div className="flex bg-(--bg-sidebar-hover) rounded-lg p-1 gap-0.5">
                  <button
                    onClick={() => setTheme("light")}
                    className={`flex-1 py-1.5 px-1 text-xs font-semibold rounded-md flex justify-center items-center gap-1 transition-all duration-150 cursor-pointer ${theme === "light"
                      ? "bg-(--theme-btn-active-bg) text-(--theme-btn-active-text) shadow-sm"
                      : "bg-transparent text-(--text-sidebar) hover:text-(--text-sidebar-title) hover:bg-(--bg-sidebar-hover)"
                      }`}
                    title="Light Mode"
                  >
                    <Sun className={`w-3.5 h-3.5 mr-1 ${theme === "light" ? "text-current" : "text-amber-500"}`} />
                    Light
                  </button>
                  <button
                    onClick={() => setTheme("dark")}
                    className={`flex-1 py-1.5 px-1 text-xs font-semibold rounded-md flex justify-center items-center gap-1 transition-all duration-150 cursor-pointer ${theme === "dark"
                      ? "bg-(--theme-btn-active-bg) text-(--theme-btn-active-text) shadow-sm"
                      : "bg-transparent text-(--text-sidebar) hover:text-(--text-sidebar-title) hover:bg-(--bg-sidebar-hover)"
                      }`}
                    title="Dark Mode"
                  >
                    <Moon className={`w-3.5 h-3.5 mr-1 ${theme === "dark" ? "text-current" : "text-indigo-500 dark:text-indigo-300"}`} />
                    Dark
                  </button>
                  <button
                    onClick={() => setTheme("system")}
                    className={`flex-1 py-1.5 px-1 text-xs font-semibold rounded-md flex justify-center items-center gap-1 transition-all duration-150 cursor-pointer ${theme === "system"
                      ? "bg-(--theme-btn-active-bg) text-(--theme-btn-active-text) shadow-sm"
                      : "bg-transparent text-(--text-sidebar) hover:text-(--text-sidebar-title) hover:bg-(--bg-sidebar-hover)"
                      }`}
                    title="System Settings"
                  >
                    <Monitor className={`w-3.5 h-3.5 mr-1 ${theme === "system" ? "text-current" : "text-slate-500 dark:text-slate-400"}`} />
                    System
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Collapsed Panel Controls (Cycles theme / presets on click) */
            <div className="flex flex-col gap-2 items-center">
              <button
                onClick={cycleThemeColor}
                onMouseEnter={(e) => handleMouseEnter(e, `Accent: ${PRESET_PALETTES.find((p) => p.id === themeColor)?.name || ""} (Click to cycle)`)}
                onMouseLeave={handleMouseLeave}
                className="flex items-center justify-center w-10 h-10 rounded-xl hover:bg-(--bg-sidebar-hover) text-(--text-sidebar) hover:text-(--text-sidebar-title) transition-all cursor-pointer border border-(--border-color)/50"
              >
                <Palette className="w-5 h-5 text-(--accent-color)" />
              </button>

              <button
                onClick={cycleTheme}
                onMouseEnter={(e) => handleMouseEnter(e, `Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)} (Click to cycle)`)}
                onMouseLeave={handleMouseLeave}
                className="flex items-center justify-center w-10 h-10 rounded-xl hover:bg-(--bg-sidebar-hover) text-(--text-sidebar) hover:text-(--text-sidebar-title) transition-all cursor-pointer border border-(--border-color)/50"
              >
                {theme === "light" && <Sun className="w-5 h-5 text-amber-500" />}
                {theme === "dark" && <Moon className="w-5 h-5 text-indigo-400" />}
                {theme === "system" && <Monitor className="w-5 h-5 text-slate-400" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden py-6 px-8 bg-(--bg-primary)">
        {headerName && (
          <div className="mb-5 select-text animate-[fade-in_0.2s_ease-out]">
            <h1 className="text-3xl font-extrabold tracking-tight text-(--text-primary) mb-1">
              {headerName}
            </h1>
            <p className="text-sm text-(--text-secondary)">{headerDesc}</p>
          </div>
        )}

        <div className="grow min-h-0 select-text overflow-y-auto">
          <Routes>
            {routesToRegister.map((r) => {
              const Component = r.component;
              return (
                <Route
                  key={r.key}
                  path={r.path}
                  element={<Component />}
                />
              );
            })}
            {routesToRegister.length > 0 ? (
              <Route
                path="*"
                element={<Navigate to={routesToRegister[0].path} replace />}
              />
            ) : (
              <Route
                path="*"
                element={
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <Terminal className="w-12 h-12 text-(--accent-color) opacity-60 mb-4 animate-pulse" />
                    <h3 className="text-lg font-bold text-(--text-primary) mb-1">No Features Enabled</h3>
                    <p className="text-xs text-(--text-secondary) max-w-xs">
                      Please enable at least one feature in <code className="px-1.5 py-0.5 rounded bg-(--bg-sidebar-hover) text-(--text-primary) font-mono">toolkit.config.ts</code> to get started.
                    </p>
                  </div>
                }
              />
            )}
          </Routes>
        </div>
      </div>
    </div>
  );
}