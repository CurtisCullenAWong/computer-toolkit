import AlarmClockPage from "./ui/AlarmClockPage";

export const AlarmClockFeature = {
    id: "alarm-clock",
    name: "Alarm Clock",
    description: "Set alarms that trigger system actions",
    icon: "alarm",

    routes: [
        {
            path: "/alarm-clock",
            component: AlarmClockPage,
        },
    ],
};