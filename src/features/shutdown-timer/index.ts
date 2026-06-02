import ShutdownTimerPage from "./ui/ShutdownTimerPage";

export const ShutdownTimerFeature = {
    id: "shutdown-timer",
    name: "Power Timer",
    description: "Shutdown, sleep, or restart your PC after a countdown",
    icon: "power",

    routes: [
        {
            path: "/shutdown-timer",
            component: ShutdownTimerPage,
        },
    ],
};