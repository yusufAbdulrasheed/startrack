import { Egg } from "lucide-react";
import { lazyPage } from "@/lib/lazyPage";
import { defineBusinessUI } from "../types";

export default defineBusinessUI({
  key: "poultry",
  icon: Egg,
  routes: [
    { path: "cohorts", feature: "verticals", Page: lazyPage(() => import("./Cohorts"), "Cohorts") },
    { path: "vaccinations", feature: "verticals", Page: lazyPage(() => import("./Vaccinations"), "Vaccinations") },
  ],
  ai: {
    screens: {
      cohorts: { label: "Batches", prompts: ["Is any batch's mortality worrying?", "Which batch is ready to harvest?", "How much feed is each batch using?"] },
      vaccinations: { label: "Vaccination & medication", prompts: ["What's overdue?", "What's due in the next two weeks?"] },
    },
    prompts: {
      dashboard: ["Is any flock's mortality worrying?", "Is any vaccination overdue?"],
      "ask-ai": ["How are the flocks doing?", "What's due for vaccination?"],
    },
  },
});
