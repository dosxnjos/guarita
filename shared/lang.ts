// Língua dos textos que a API monta (motivos do perigo, lições da autópsia, selo de confiança, zonas, erros…).
// Português é o padrão e continua idêntico ao de antes; `?lang=es` (ou o argumento `lingua` do MCP, ou a locale da
// interação no bot) pede espanhol neutro latino (es-419, "tú"), com os termos do cliente oficial (docs/glossario-es.md).
// Só o texto muda: números, códigos (label, verdict, zone) e a forma da resposta são os mesmos nas duas línguas.
// O cache interno (Cache API) guarda o dado bruto, sem língua; o texto é montado depois, então pedir em espanhol não
// gasta nenhum subrequest a mais. A resposta HTTP varia pela URL inteira, que já leva o `lang`.

export type ApiLang = 'pt' | 'es';

/** Só "es" (sem diferenciar maiúsculas, como em /api/forecast) vira espanhol; ausente ou outro valor fica em português. */
export function apiLang(v: unknown): ApiLang {
  return typeof v === 'string' && v.trim().toLowerCase() === 'es' ? 'es' : 'pt';
}

/** Texto na língua pedida (mesmo contrato do tx do site e do bot, com a língua explícita). */
export function tl(lang: ApiLang | undefined, pt: string, es: string): string {
  return lang === 'es' ? es : pt;
}

const NF = {
  pt: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }),
  es: new Intl.NumberFormat('es-419', { maximumFractionDigits: 0 }),
};
const NF1 = {
  pt: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }),
  es: new Intl.NumberFormat('es-419', { maximumFractionDigits: 1 }),
};

/** Inteiro com separador de milhar: 1350 → "1.350" (es: "1,350"). */
export function fmtIntL(n: number, lang: ApiLang = 'pt'): string {
  return NF[lang].format(Math.round(n));
}

/** Até 1 casa decimal: 2,4 (es: 2.4). */
export function fmtDecL(n: number, lang: ApiLang = 'pt'): string {
  return NF1[lang].format(n);
}

/**
 * Número grande compacto (fama, prata): pt "2,4 mi", "52 mil", "1,2 bi"; es "2.4 M", "52 mil", "1.2 mil M" (mesma
 * convenção do fmtCompact de src/lib/player/format.ts, para o site, o bot e o MCP dizerem igual).
 */
export function fmtFameL(n: number, lang: ApiLang = 'pt'): string {
  const i = NF[lang];
  const d = NF1[lang];
  if (lang === 'es') {
    if (n >= 1e9) return `${d.format(n / 1e9)} mil M`;
    if (n >= 1e6) return `${d.format(n / 1e6)} M`;
    if (n >= 1e3) return `${i.format(n / 1e3)} mil`;
    return i.format(n);
  }
  if (n >= 1e9) return `${d.format(n / 1e9)} bi`;
  if (n >= 1e6) return `${d.format(n / 1e6)} mi`;
  if (n >= 1e3) return `${i.format(n / 1e3)} mil`;
  return i.format(n);
}
