// server/config/mailer.js
const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    // 자격 증명이 없으면 콘솔로 폴백 (개발 편의)
    return null;
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return transporter;
}

/**
 * 메일 발송. SMTP 자격 증명이 없으면 콘솔에 출력(개발 폴백).
 */
async function sendMail({ to, subject, html, text }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || "no-reply@petdate.app";
  const t = getTransporter();

  if (!t) {
    console.log("[MAIL:DEV] SMTP 미설정 — 콘솔 출력");
    console.log("  to:", to);
    console.log("  subject:", subject);
    console.log("  text:", text || "(html only)");
    return { dev: true };
  }

  return t.sendMail({ from, to, subject, html, text });
}

/** 6-digit verification code email */
function buildCodeEmail({ code, purpose }) {
  const title =
    purpose === "reset_password" ? "Password reset code" : "Email verification code";
  const text = `${title}: ${code}\nEnter it within 10 minutes. If you didn't request this, please ignore this email.`;
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 8px;font-size:18px;color:#0f172a">${title}</h2>
    <p style="margin:0 0 16px;color:#475569;font-size:14px">Enter the code below within 10 minutes.</p>
    <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#059669;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:16px;text-align:center">
      ${code}
    </div>
    <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">If you didn't request this, please ignore this email.</p>
  </div>`;
  return { subject: `[PetDate] ${title}`, text, html };
}

module.exports = { sendMail, buildCodeEmail };
