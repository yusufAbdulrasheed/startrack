/**
 * Blinds — what the AI assistant knows about this business.
 *
 * `brief` states how the business actually makes money, the words its owner
 * uses and the mistakes a generic retail assistant would make here. This
 * business has no screens of its own, so `modules` is empty; `snapshot` names
 * the platform screens whose data rides along with the whole-business overview.
 */
export const ai = {
  brief: `WINDOW BLINDS & CURTAINS (made to order). The product is a custom item priced per square metre (width × height); selling one consumes its components (fabric, rail, brackets, chain) per the recipe, so what runs out is COMPONENTS, not finished blinds. Work is tracked as Job tickets with stages (received → in progress → ready → collected), a promised date and a deposit; balance is paid on collection. Watch: fabric and rail stock vs demand, jobs past their promised date, jobs ready but uncollected, unpaid balances, margin per square metre, offcut waste. A returned custom item gets money back but no restock (the fabric is cut).`,
  modules: {},
  snapshot: ["jobs"],
};
