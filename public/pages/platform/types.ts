export type Overview = {
  viewer: { name: string; platformRole: string };
  totals: {
    accounts: number; sandboxes: number; businesses: number; users: number; branches: number;
    newAccounts30d: number; activeBusinesses7d: number; revenue30d: number; txns30d: number;
  };
  byType: { typeKey: string; label: string; count: number }[];
  byPlan: Record<string, number>;
};
