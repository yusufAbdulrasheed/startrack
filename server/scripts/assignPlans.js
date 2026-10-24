import mongoose from "mongoose";
import { connectDb } from "#core/db.js";
import { User } from "#modules/auth/user.model.js";
import { Account } from "#modules/auth/account.model.js";
import { Business } from "#modules/business/business.model.js";
import { DEMOS } from "#modules/auth/demoShops.js";
import { PLANS } from "#shared/plans.js";
import { SHOWCASE_PLANS, SHOWCASE_OWNER_PASSWORD, showcaseSubscription } from "./showcasePlans.js";

/**
 * Puts each seeded showcase business on its plan (see showcasePlans.js) and
 * prints every login, so each plan can be tried with a real account.
 *
 *   node server/scripts/assignPlans.js            apply the plans
 *   node server/scripts/assignPlans.js --dry      only show what's there
 *   node server/scripts/assignPlans.js --legacy   give everyone full access again
 *   add --days=N to change how long the plan stays valid (default 365)
 */
const dry = process.argv.includes("--dry");
const legacy = process.argv.includes("--legacy");
const days = Number(process.argv.find((a) => a.startsWith("--days="))?.slice(7)) || 365;

async function main() {
  await connectDb();
  const rows = [];
  for (const typeKey of Object.keys(DEMOS)) {
    const email = `${typeKey}.owner@startrack.demo`;
    const user = await User.findOne({ email });
    const account = user && (await Account.findOne({ ownerUserId: user._id }));
    const business = account && (await Business.findOne({ accountId: account._id }));
    if (!user || !account || !business) {
      rows.push({ typeKey, email, missing: true });
      continue;
    }
    const plan = SHOWCASE_PLANS[typeKey];
    if (!dry) {
      if (legacy) {
        account.subscription = undefined;
        account.plan = "business";
      } else {
        account.plan = plan;
        account.subscription = showcaseSubscription(plan, days);
      }
      await account.save();
    }
    const now = account.subscription?.plan ? `${account.subscription.plan} until ${account.subscription.currentPeriodEnd?.toISOString().slice(0, 10)}` : "full access (early account)";
    rows.push({ typeKey, email, business: business.name, code: business.code, plan, now });
  }

  const label = legacy ? "full access" : "plan";
  console.log("\n" + "=".repeat(86));
  console.log(dry ? "Seeded showcase accounts (nothing changed)" : legacy ? "Seeded showcase accounts restored to full access" : "Seeded showcase accounts, now on their plans");
  console.log("=".repeat(86));
  for (const k of ["free", "pro", "business"]) {
    const group = rows.filter((r) => !r.missing && r.plan === k);
    if (!group.length) continue;
    console.log(`\n${PLANS[k].name.toUpperCase()}`);
    for (const r of group) {
      console.log(`  ${r.business}  (${DEMOS[r.typeKey].label})`);
      console.log(`      login  ${r.email}  /  ${SHOWCASE_OWNER_PASSWORD}`);
      console.log(`      till   business code ${r.code}, PIN 1111 (staff) or 2222 (manager)`);
      console.log(`      ${label}: ${r.now}`);
    }
  }
  const missing = rows.filter((r) => r.missing);
  if (missing.length) {
    console.log(`\nNot seeded yet: ${missing.map((m) => m.typeKey).join(", ")}  (run: npm run seed:showcase)`);
  }
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((e) => { console.error("assignPlans failed:", e.message); process.exit(1); });
