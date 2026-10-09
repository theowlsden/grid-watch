/// <reference path="../pb_data/types.d.ts" />
// Keeps the Telegram bot's restricted account in step with the environment on every start
// (spec 7.3): PB_BOT_EMAIL and PB_BOT_PASSWORD. Changing the password in Coolify and
// restarting rotates it. The account can only write news (see the collection rules).
// The container entrypoint applies migrations before serving, so the collection exists here.

onBootstrap((e) => {
  e.next();
  const email = $os.getenv("PB_BOT_EMAIL");
  const password = $os.getenv("PB_BOT_PASSWORD");
  if (!email || !password) return;
  if (password.length < 16) {
    console.log("bots: PB_BOT_PASSWORD must be at least 16 characters; bot account not changed");
    return;
  }
  let collection;
  try {
    collection = e.app.findCollectionByNameOrId("bots");
  } catch (_) {
    console.log("bots: collection missing (migrations not applied yet); bot account not changed");
    return;
  }
  let record;
  try {
    record = e.app.findAuthRecordByEmail("bots", email);
  } catch (_) {
    record = new Record(collection);
    record.setEmail(email);
    record.set("name", "telegram");
    record.setVerified(true);
  }
  record.setPassword(password);
  e.app.save(record);
  console.log(`bots: account ${email} ready`);
});
