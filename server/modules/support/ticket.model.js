import mongoose from "mongoose";

/**
 * A help-desk ticket — separate from Job Tickets (server/modules/jobs/),
 * which is a work-order/billing workflow. This is a plain "something needs
 * looking into, track it to resolution" thread. Staff-raised only for now:
 * there's no customer login anywhere in this app (Customer is CRM-lite, no
 * credentials — see customer.model.js), so a ticket is filed BY a staff
 * member, optionally ABOUT a customer, not submitted directly by one.
 */
const commentSchema = new mongoose.Schema(
  {
    byId: { type: mongoose.Schema.Types.ObjectId, required: true },
    byName: { type: String, required: true },
    body: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ticketSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, default: null },
    ticketNo: { type: String, required: true },

    subject: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    category: { type: String, enum: ["complaint", "question", "billing", "technical", "other"], default: "other" },
    priority: { type: String, enum: ["low", "normal", "high"], default: "normal" },
    status: { type: String, enum: ["open", "in_progress", "resolved", "closed"], default: "open" },

    // Optional — "a customer called in about X" vs. a purely internal issue.
    customerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    customerName: { type: String, default: "" },
    customerPhone: { type: String, default: "" },

    raisedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
    },
    assignedToId: { type: mongoose.Schema.Types.ObjectId, default: null },
    assignedToName: { type: String, default: "" },

    comments: { type: [commentSchema], default: [] },

    // "platform" once escalated to StarTrack's own support staff — see
    // platform.routes.js's GET /tickets, gated by the same platformRole
    // check every other platform-overseer route already uses.
    scope: { type: String, enum: ["business", "platform"], default: "business" },
    escalatedAt: { type: Date, default: null },

    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ticketSchema.index({ businessId: 1, status: 1, createdAt: -1 });
ticketSchema.index({ businessId: 1, ticketNo: 1 }, { unique: true });
ticketSchema.index({ scope: 1, status: 1, createdAt: -1 });

export const Ticket = mongoose.model("Ticket", ticketSchema);
