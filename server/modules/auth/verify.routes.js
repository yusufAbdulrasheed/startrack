import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { User } from "#modules/auth/user.model.js";
import { VerificationCode } from "#modules/auth/verificationCode.model.js";
import { hashPassword, checkPassword } from "#modules/auth/auth.service.js";
import { rateLimit } from "#core/rateLimit.js";
import { sendMail, emailShell } from "#core/mailer.js";
import { sendSms } from "#core/sms.js";
import { badRequest, notFound, conflict, HttpError } from "#core/httpError.js";

export const verifyRouter = Router();

const CODE_TTL_MS = 10 * 60 * 1000;
const REQUEST_LIMIT = { max: 3, windowMs: 15 * 60 * 1000 };
const CONFIRM_LIMIT = { max: 8, windowMs: 15 * 60 * 1000 };

const genCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

function purposeFor(channel) {
  return channel === "email" ? "verify_email" : "verify_phone";
}

/**
 * Fire-and-forget helper reused by auth.routes.js's register handler so a
 * code is already in the inbox the first time the UI shows the nag banner.
 * Never throws — verification is additive, never allowed to break sign-up.
 */
export async function requestVerification(userId, channel) {
  try {
    const user = await User.findById(userId);
    if (!user) return;
    const target = channel === "email" ? user.email : user.phone;
    if (!target) return;

    const code = genCode();
    await VerificationCode.create({
      userId: user._id,
      channel,
      target,
      purpose: purposeFor(channel),
      codeHash: await hashPassword(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });

    if (channel === "email") {
      await sendMail({
        to: target,
        subject: "Verify your email — StarTrack",
        html: emailShell({
          businessName: "StarTrack",
          heading: "Verify your email",
          intro: `Your verification code is below. It expires in 10 minutes.`,
          sections: [`<div style="font-size:28px;font-weight:800;letter-spacing:4px;text-align:center;margin:12px 0">${code}</div>`],
          footNote: "If you didn't request this, you can ignore this email.",
        }),
      });
    } else {
      await sendSms({ to: target, message: `Your StarTrack verification code is ${code}. It expires in 10 minutes.` });
    }
  } catch (err) {
    console.error("requestVerification failed:", err.message);
  }
}

const channelSchema = z.object({ channel: z.enum(["email", "sms"]) });

// POST /api/verify/request — send (or resend) a code for the given channel.
verifyRouter.post("/request", async (req, res) => {
  const parsed = channelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: "Choose email or sms." });
  const { channel } = parsed.data;

  if (!rateLimit(`verify:request:${channel}:${req.auth.userId}`, REQUEST_LIMIT)) {
    return res.status(429).json({ error: "rate_limited", message: "Too many codes requested. Wait a bit and try again." });
  }

  const user = await User.findById(req.auth.userId);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (channel === "email" && user.emailVerified) return res.json({ ok: true, alreadyVerified: true });
  if (channel === "sms" && user.phoneVerified) return res.json({ ok: true, alreadyVerified: true });
  if (channel === "sms" && !user.phone) {
    return res.status(400).json({ error: "no_phone", message: "Add a phone number first." });
  }

  await requestVerification(user._id, channel);
  res.json({ ok: true, channel });
});

const confirmSchema = z.object({ channel: z.enum(["email", "sms"]), code: z.string().min(4).max(8) });

// POST /api/verify/confirm — check a code, mark the channel verified.
verifyRouter.post("/confirm", async (req, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: "Enter the code you were sent." });
  const { channel, code } = parsed.data;

  if (!rateLimit(`verify:confirm:${req.auth.userId}`, CONFIRM_LIMIT)) {
    return res.status(429).json({ error: "rate_limited", message: "Too many attempts. Wait a bit and try again." });
  }

  try {
    const entry = await VerificationCode.findOne({
      userId: req.auth.userId,
      purpose: purposeFor(channel),
      consumedAt: null,
    }).sort({ createdAt: -1 });
    if (!entry) throw notFound("No pending code — request a new one.", "no_code");
    if (entry.expiresAt < new Date()) throw conflict("That code has expired — request a new one.", "expired");
    if (entry.attempts >= entry.maxAttempts) throw conflict("Too many wrong attempts — request a new code.", "too_many_attempts");

    const ok = await checkPassword(code, entry.codeHash);
    if (!ok) {
      entry.attempts += 1;
      await entry.save();
      throw badRequest("Incorrect code.", "bad_code");
    }

    entry.consumedAt = new Date();
    await entry.save();
    await User.updateOne(
      { _id: req.auth.userId },
      { $set: channel === "email" ? { emailVerified: true } : { phoneVerified: true } }
    );

    res.json({ ok: true, channel });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
    throw err;
  }
});
