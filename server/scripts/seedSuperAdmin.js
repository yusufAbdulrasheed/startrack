import mongoose from "mongoose";
import { connectDb } from "#core/db.js";
import { config } from "#core/config.js";
import { hashPassword } from "#modules/auth/auth.service.js";
import { User } from "#modules/auth/user.model.js";
import { Account } from "#modules/auth/account.model.js";
import { Membership } from "#modules/auth/membership.model.js";
import { Business } from "#modules/business/business.model.js";
import { Branch } from "#modules/business/branch.model.js";

const DEV_EMAIL = "superadmin@startrack.test";
const DEV_PASSWORD = "StarTrack-Admin-2026";

const email = (process.env.SEED_ADMIN_EMAIL || DEV_EMAIL).trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD || DEV_PASSWORD;
const resetPassword = process.argv.includes("--reset-password");

if (config.isProd && !process.env.SEED_ADMIN_PASSWORD) {
  console.error("✗ Refusing to seed a super admin in production with the default password. Set SEED_ADMIN_PASSWORD.");
  process.exit(1);
}

// The password above is public in the repo. It is only acceptable on a database
// that lives on this machine; anything remote (Atlas) must be given a real one.
const isLocalDb = !config.mongoUri || /(\/\/|@)(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(config.mongoUri);
if (!isLocalDb && !process.env.SEED_ADMIN_PASSWORD) {
  console.error("✗ MONGODB_URI points at a remote database. Refusing to seed with the default password — set SEED_ADMIN_PASSWORD.");
  process.exit(1);
}

await connectDb();

try {
  let user = await User.findOne({ email });

  if (user) {
    user.platformRole = "overseer";
    user.status = "active";
    user.emailVerified = true;
    if (resetPassword) user.passwordHash = await hashPassword(password);
    await user.save();
    console.log(`✓ Existing user ${email} is now a platform overseer${resetPassword ? " (password reset)" : ""}.`);
  } else {
    user = await User.create({
      name: "StarTrack Admin",
      email,
      passwordHash: await hashPassword(password),
      platformRole: "overseer",
      emailVerified: true,
    });

    // A login needs a home: every user belongs to an account with a business and
    // a branch. This one is StarTrack's own, and sits on full access (no
    // subscription) so it never lapses or gets plan-gated.
    const account = await Account.create({ name: "StarTrack HQ", ownerUserId: user._id, plan: "business" });
    const business = await Business.create({ accountId: account._id, name: "StarTrack HQ", typeKey: "restaurant" });
    const branch = await Branch.create({ accountId: account._id, businessId: business._id, name: "Head Office" });
    await Membership.create({ userId: user._id, accountId: account._id, businessId: business._id, branchId: branch._id, role: "owner" });
    console.log(`✓ Created platform overseer ${email}.`);
  }

  console.log("  Sign in at /login — you will be taken to /admin.");
  if (!process.env.SEED_ADMIN_PASSWORD && !config.isProd) console.log("  (development defaults — see server/scripts/seedSuperAdmin.js)");
} finally {
  await mongoose.disconnect();
}
