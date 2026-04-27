#!/usr/bin/env bun
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const envLocalPath = resolve(root, ".env.local");
const envExamplePath = resolve(root, ".env.example");

if (!existsSync(envLocalPath)) {
  if (existsSync(envExamplePath)) {
    copyFileSync(envExamplePath, envLocalPath);
    console.log("[ensure-auth-secret] created .env.local from .env.example");
  } else {
    writeFileSync(envLocalPath, "");
    console.log("[ensure-auth-secret] created empty .env.local");
  }
}

const contents = readFileSync(envLocalPath, "utf8");
const match = contents.match(/^AUTH_SECRET=(.*)$/m);
const hasValue = match !== null && match[1].trim().length > 0;

if (hasValue) {
  process.exit(0);
}

const secret = randomBytes(33).toString("base64");
const line = `AUTH_SECRET=${secret}`;
const updated = match
  ? contents.replace(/^AUTH_SECRET=.*$/m, line)
  : contents + (contents.endsWith("\n") || contents === "" ? "" : "\n") + line + "\n";

writeFileSync(envLocalPath, updated);
console.log("[ensure-auth-secret] generated AUTH_SECRET in .env.local");
