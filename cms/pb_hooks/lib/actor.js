// Shared helper for the hooks. PocketBase runs each hook handler in its own context, so
// helpers must be loaded inside the handler: require(`${__hooks}/lib/actor.js`).

/** Who made the change: the admin's email, or "bot:<name>" for the Telegram bot account. */
function actor(e) {
  if (!e.auth) return "";
  return e.auth.collection().name === "bots" ? `bot:${e.auth.get("name") || e.auth.email()}` : e.auth.email();
}

function isBot(e) {
  return !!e.auth && e.auth.collection().name === "bots";
}

module.exports = { actor, isBot };
