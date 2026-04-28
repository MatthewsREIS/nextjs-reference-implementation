import { describe, expect, it } from "vitest";
import { nextEnvFile } from "./auth-secret.mjs";

const SECRET = "deterministic-secret-for-tests";

describe("nextEnvFile", () => {
  it("creates AUTH_SECRET line in an empty file", () => {
    const { content, changed } = nextEnvFile("", SECRET);
    expect(changed).toBe(true);
    expect(content).toBe(`AUTH_SECRET=${SECRET}\n`);
  });

  it("appends AUTH_SECRET to a file missing the key", () => {
    const existing = "GRAPHQL_API_URL=https://example.com\n";
    const { content, changed } = nextEnvFile(existing, SECRET);
    expect(changed).toBe(true);
    expect(content).toBe(`${existing}AUTH_SECRET=${SECRET}\n`);
  });

  it("adds a newline before appending when file does not end with one", () => {
    const existing = "GRAPHQL_API_URL=https://example.com";
    const { content } = nextEnvFile(existing, SECRET);
    expect(content).toBe(
      `GRAPHQL_API_URL=https://example.com\nAUTH_SECRET=${SECRET}\n`,
    );
  });

  it("replaces an empty AUTH_SECRET line", () => {
    const existing = "AUTH_SECRET=\nGRAPHQL_API_URL=https://example.com\n";
    const { content, changed } = nextEnvFile(existing, SECRET);
    expect(changed).toBe(true);
    expect(content).toBe(
      `AUTH_SECRET=${SECRET}\nGRAPHQL_API_URL=https://example.com\n`,
    );
  });

  it("leaves a populated AUTH_SECRET untouched", () => {
    const existing = "AUTH_SECRET=already-set\n";
    const { content, changed } = nextEnvFile(existing, SECRET);
    expect(changed).toBe(false);
    expect(content).toBe(existing);
  });

  it("treats a quoted empty value as empty", () => {
    const existing = 'AUTH_SECRET=""\n';
    const { content, changed } = nextEnvFile(existing, SECRET);
    expect(changed).toBe(true);
    expect(content).toBe(`AUTH_SECRET=${SECRET}\n`);
  });

  it("preserves a quoted populated value", () => {
    const existing = 'AUTH_SECRET="already-set"\n';
    const { content, changed } = nextEnvFile(existing, SECRET);
    expect(changed).toBe(false);
    expect(content).toBe(existing);
  });
});
