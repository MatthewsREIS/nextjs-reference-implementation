import { ensureAuthSecret } from "./auth-secret.mjs";

ensureAuthSecret({ cwd: process.cwd(), log: console.log });
