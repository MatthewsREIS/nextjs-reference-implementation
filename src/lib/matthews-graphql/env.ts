export function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `[matthews-graphql] Missing required env var ${name}. See README → Local setup.`,
    );
  }
  return v;
}
