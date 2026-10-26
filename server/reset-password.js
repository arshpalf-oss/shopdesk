// Local recovery only. Requires direct access to the database and a terminal.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync } from "node:crypto";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const filename =
  process.env.DB_PATH || path.join(root, "data", "shop-desk.sqlite");
if (!fs.existsSync(filename)) {
  console.error(
    "No clinic database found. Run the application and complete first-run setup.",
  );
  process.exit(1);
}
if (!process.stdin.isTTY) {
  console.error(
    "For safety, password recovery must be run interactively in a local terminal.",
  );
  process.exit(1);
}
const { db, getMeta, setMeta } = await import("./db.js");
function secret(prompt) {
  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = process.stdin.isRaw;
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const cleanup = () => {
      process.stdin.removeListener("data", listener);
      process.stdin.setRawMode(!!wasRaw);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const listener = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          cleanup();
          reject(new Error("Cancelled. No changes made."));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else if (ch >= " " && value.length < 128) {
          value += ch;
          process.stdout.write("*");
        }
      }
    };
    process.stdin.on("data", listener);
  });
}
try {
  if (!getMeta("auth"))
    throw new Error("This clinic has not completed first-run setup.");
  console.log("Local owner recovery for: " + getMeta("settings").name);
  console.log(
    "This changes the owner password and signs out every active session. Clinic data is not changed.\n",
  );
  const password = await secret("New owner password (8–128 characters): ");
  if (password.length < 8)
    throw new Error(
      "Password must contain at least 8 characters. No changes made.",
    );
  const confirm = await secret("Confirm new password: ");
  if (password !== confirm)
    throw new Error("Passwords do not match. No changes made.");
  const salt = randomBytes(16).toString("hex");
  db.transaction(() => {
    setMeta(
      "auth",
      `${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
    );
    db.prepare("DELETE FROM sessions").run();
  })();
  console.log("\nOwner password updated. Sign in with the new password.");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  db.close();
}
