// Ligações e segredos do _worker.js do Pages (ver wrangler.toml e scripts/deploy.mjs).
export interface Env {
  ASSETS: Fetcher;
  /** Durable Object Hub do guarita-core (estado: alertas, inscrições push, caches longos). */
  HUB: DurableObjectNamespace;
  /** Worker guarita-core (rotas internas /internal/*). */
  CORE: Fetcher;
  /** Durable Object Timers do guarita-core (despertador da ilha e do foco, Fase 2). */
  TIMERS: DurableObjectNamespace;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APP_ID: string;
  DISCORD_BOT_TOKEN: string;
  VAPID_PUBLIC: string;
}
