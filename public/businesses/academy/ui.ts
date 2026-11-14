import { GraduationCap } from "lucide-react";
import { lazyPage } from "@/lib/lazyPage";
import { defineBusinessUI } from "../types";

export default defineBusinessUI({
  key: "academy",
  icon: GraduationCap,
  routes: [{ path: "academy", feature: "verticals", Page: lazyPage(() => import("./Academy"), "Academy") }],
  ai: {
    screens: {
      academy: {
        label: "Academy",
        prompts: ["Who owes tuition, and how much?", "Which classes have empty seats?", "Which course earns the most?", "How is attendance and are students dropping off?"],
      },
    },
    prompts: {
      dashboard: ["How much tuition is still owed?", "Which class needs more students?"],
      "ask-ai": ["Who owes tuition?", "Which class has the most empty seats?"],
      customers: ["Which students owe tuition?", "Which students haven't been active lately?"],
      expenses: ["How do tutor and running costs compare with tuition income?"],
    },
  },
});
