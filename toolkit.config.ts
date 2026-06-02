import { ShutdownTimerFeature } from "./src/features/shutdown-timer";
import { AlarmClockFeature } from "./src/features/alarm-clock";
import { HomeFeature } from "./src/features/home";
import { ComingSoonFeature1, ComingSoonFeature2 } from "./src/features/coming-soon";

export interface SubModuleConfig {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  path: string;
  component: React.ComponentType;
}

export interface FeatureConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  isLabelOnly?: boolean;
  routes?: Array<{
    path: string;
    component: React.ComponentType;
  }>;
  subModules?: SubModuleConfig[];
}

export const features: FeatureConfig[] = [
  {
    id: HomeFeature.id,
    name: HomeFeature.name,
    description: HomeFeature.description,
    icon: HomeFeature.icon,
    enabled: true,
    routes: [
      {
        path: HomeFeature.path,
        component: HomeFeature.component,
      },
    ],
  },
  {
    ...AlarmClockFeature,
    enabled: true,
  },
  {
    id: ShutdownTimerFeature.id,
    name: ShutdownTimerFeature.name,
    description: ShutdownTimerFeature.description,
    icon: ShutdownTimerFeature.icon,
    enabled: true,
    routes: [
      {
        path: ShutdownTimerFeature.routes[0].path,
        component: ShutdownTimerFeature.routes[0].component,
      },
    ],
  },
  {
    id: "coming-soon-group",
    name: "Coming Soon",
    description: "Features coming soon to Computer Toolkit",
    icon: "terminal",
    enabled: true,
    isLabelOnly: true,
    subModules: [
      {
        id: ComingSoonFeature1.id,
        name: ComingSoonFeature1.name,
        description: ComingSoonFeature1.description,
        icon: ComingSoonFeature1.icon,
        path: ComingSoonFeature1.path,
        component: ComingSoonFeature1.component,
      },
      {
        id: ComingSoonFeature2.id,
        name: ComingSoonFeature2.name,
        description: ComingSoonFeature2.description,
        icon: ComingSoonFeature2.icon,
        path: ComingSoonFeature2.path,
        component: ComingSoonFeature2.component,
      },
    ],
  },
];
