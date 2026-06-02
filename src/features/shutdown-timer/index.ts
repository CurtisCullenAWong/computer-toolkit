import ShutdownTimerPage from "./ui/ShutdownTimerPage";

export const ShutdownTimerFeature = {
    id: "shutdown-timer",
    name: "Shutdown Timer",
    description: "Shutdown your PC after a countdown",
    icon: "power",

    routes: [
        {
            path: "/shutdown-timer",
            component: ShutdownTimerPage,
        },
    ],
};