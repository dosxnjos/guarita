// Ligações e segredos do _worker.js do Pages (ver wrangler.toml e scripts/deploy.mjs).
export interface Env {
  ASSETS: Fetcher;
  /** Durable Object Hub do guarita-core (estado: alertas, inscrições push, caches longos). */
  HUB: DurableObjectNamespace;
  /** Worker guarita-core (rotas internas /internal/*). */
  CORE: Fetcher;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APP_ID: string;
  DISCORD_BOT_TOKEN: string;
  VAPID_PUBLIC: string;
}
