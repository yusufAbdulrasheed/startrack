import { Smartphone } from "lucide-react";
import { lazyPage } from "@/lib/lazyPage";
import { defineBusinessUI } from "../types";

export default defineBusinessUI({
  key: "electronics",
  icon: Smartphone,
  routes: [{ path: "serials", feature: "verticals", Page: lazyPage(() => import("./Serials"), "Serials") }],
  ai: {
    screens: { serials: { label: "Serial numbers", prompts: ["Which warranties end soon?", "Which models are down to the last few units?"] } },
    prompts: { dashboard: ["Which repairs are overdue?", "Which warranties end soon?"] },
  },
});
