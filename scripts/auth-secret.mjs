import {
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const KEY_RE = /^[ \t]*AUTH_SECRET[ \t]*=[ \t]*(.*)$/m;
const LOG_PREFIX = "[ensure-auth-secret]";

export function generateSecret() {
  return randomBytes(33).toString("base64");
}

/**
 * @param {string} existing
 * @param {string} newSecret
 * @returns {{ content: string, changed: boolean }}
 */
export function nextEnvFile(existing, newSecret) {
  const match = existing.match(KEY_RE);
  const value = match?.[1]
    ?.replace(/^['"](.*)['"]$/, "$1")
    .trim();
  if (value) return { content: existing, changed: false };

  const newLine = `AUTH_SECRET=${newSecret}`;
  if (match) {
    return { content: existing.replace(KEY_RE, newLine), changed: true };
  }
  const sep = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  return { content: `${existing}${sep}${newLine}\n`, changed: true };
}

/**
 * @param {{ cwd: string, log?: (message: string) => void }} opts
 */
export function ensureAuthSecret(opts) {
  const log = opts.log ?? (() => {});
  const envLocal = resolve(opts.cwd, ".env.local");
  const envExample = resolve(opts.cwd, ".env.example");

  if (!existsSync(envLocal)) {
    if (existsSync(envExample)) {
      copyFileSync(envExample, envLocal);
      log(`${LOG_PREFIX} created .env.local from .env.example`);
    } else {
      writeFileSync(envLocal, "");
      log(`${LOG_PREFIX} created empty .env.local`);
    }
  }

  const existing = readFileSync(envLocal, "utf8");
  const result = nextEnvFile(existing, generateSecret());
  if (!result.changed) return;
  writeFileSync(envLocal, result.content);
  log(`${LOG_PREFIX} generated AUTH_SECRET in .env.local`);
}
