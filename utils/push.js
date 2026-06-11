// server/utils/push.js — Expo push notifications (best-effort, never throws)
const User = require("../models/User");

const EXPO_URL = "https://exp.host/--/api/v2/push/send";

async function sendExpoPush(tokens, { title, body, data }) {
  const messages = (tokens || [])
    .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken"))
    .map((to) => ({ to, title, body, data: data || {}, sound: "default" }));
  if (!messages.length) return;
  try {
    await fetch(EXPO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    // best-effort: ignore network/Expo errors
  }
}

/** Send a notification to one user (respects settings.push). */
async function pushToUser(userId, payload) {
  try {
    const u = await User.findById(userId).select("pushTokens settings").lean();
    if (!u || u.settings?.push === false) return;
    if (u.pushTokens?.length) await sendExpoPush(u.pushTokens, payload);
  } catch (e) {
    // ignore
  }
}

module.exports = { sendExpoPush, pushToUser };
