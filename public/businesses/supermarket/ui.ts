import { Store } from "lucide-react";
import { defineBusinessUI } from "../types";

export default defineBusinessUI({
  key: "supermarket",
  icon: Store,
  routes: [],
  ai: {
    prompts: { dashboard: ["Which best-sellers are about to run out?", "What should I discount before it expires?"] },
  },
});
