import { Droplets } from "lucide-react";
import { lazyPage } from "@/lib/lazyPage";
import { defineBusinessUI } from "../types";

export default defineBusinessUI({
  key: "water",
  icon: Droplets,
  routes: [{ path: "production", feature: "verticals", Page: lazyPage(() => import("./Production"), "Production") }],
  ai: {
    screens: {
      production: { label: "Production", prompts: ["How is our leakage trend?", "Are we using raw materials faster than usual?", "Will we have enough finished stock for demand?"] },
    },
    prompts: {
      dashboard: ["What is our leakage rate?", "Do we have enough raw materials for this week?"],
      "ask-ai": ["Is production efficient?", "Which customers owe us?"],
    },
  },
});
