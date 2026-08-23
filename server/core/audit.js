import { AuditLog } from "#modules/audit/auditLog.model.js";

// Fire-and-forget audit write — an audit failure must never fail the action,
// but it should be loud in the logs.
export function audit(ctx, action, target = {}, before = undefined, after = undefined) {
  AuditLog.create({
    accountId: ctx.accountId,
    businessId: ctx.businessId,
    branchId: ctx.branchId,
    actorId: ctx.userId,
    actorName: ctx.actorName,
    action,
    target,
    before,
    after,
  }).catch((err) => console.error("AUDIT WRITE FAILED:", action, err.message));
}
