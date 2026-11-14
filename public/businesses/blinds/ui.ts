import { Blinds } from "lucide-react";
import { defineBusinessUI } from "../types";

export default defineBusinessUI({
  key: "blinds",
  icon: Blinds,
  routes: [],
  ai: {
    prompts: { dashboard: ["Which jobs are past their promised date?", "Which fabrics are running low?"] },
  },
});
