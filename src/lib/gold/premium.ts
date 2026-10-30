// Calculadora "Premium compensa?" (lógica pura, sem DOM; testada em tests/gold.test.ts).
// Nenhum preço em reais vem daqui: o usuário informa quanto paga. Premium de 30 dias = 3.750 ouro
// (PREMIUM_30D_GOLD, gamedata.xml); imposto de venda 8% sem e 4% com Premium (SALES_TAX*, shared/market.ts).
// Espanhol: quem joga na versão em espanhol não paga em reais; a tela pede o valor "na sua moeda" e fmtBrl mostra o
// número sem símbolo (o cálculo não depende da moeda).
import { PREMIUM_30D_GOLD, SALES_TAX, SALES_TAX_PREMIUM } from '../../../shared/market';
import { currentLocale, type Locale } from '../i18n/core';

/**
 * Número digitado em pt-BR → number. Aceita "19,90", "1.234,56", "1234.5", "R$ 29,90", "2 mil" não (null).
 * Ponto seguido de exatamente 3 dígitos é separador de milhar ("1.000" = mil); vazio ou inválido → null.
 * Espanhol (loc 'es'): vírgula em grupos de 3 dígitos também é milhar ("1,000" = mil, "1,234.5"), como no es-419;
 * fora disso vale a mesma regra ("29,90" e "29.90" = 29,9).
 */
export function parseDecimalBr(raw: string | null | undefined, loc: Locale = currentLocale()): number | null {
  if (raw === null || raw === undefined) return null;
  let s = raw.trim().replace(/^r\$\s*/i, '').replace(/^\$\s*/, '').replace(/\s+/g, '');
  if (!s) return null;
  if (!/^[\d.,]+$/.test(s)) return null;
  if (loc === 'es' && /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (s.includes(',')) {
    // vírgula = decimal; pontos = milhar
    if (s.indexOf(',') !== s.lastIndexOf(',')) return null;
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  } else if ((s.match(/\./g) ?? []).length > 1) {
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface PremiumInput {
  /** Cotação do ouro em prata (preço atual da API). */
  goldPrice: number | null;
  /** Quanto o usuário paga em R$ pelo pacote. */
  packBrl: number | null;
  /** Quanto ouro vem no pacote. */
  packGold: number | null;
  /** Prata que o usuário ganha por hora de jogo. */
  silverPerHour: number | null;
  /** Prata vendida no mercado por mês (opcional, para a economia de imposto). */
  monthlySales?: number | null;
}

export interface PremiumResult {
  premiumGold: number;
  /** Premium de 30 dias comprado com prata (via ouro na cotação atual). */
  silver: number | null;
  /** R$ por 1 ouro, pelo pacote informado. */
  brlPerGold: number | null;
  /** Premium de 30 dias em reais, pelo pacote informado. */
  brl: number | null;
  /** Horas de jogo que pagam o Premium em prata. */
  hours: number | null;
  /** Prata por R$ 1 (pela cotação atual e pelo pacote): quanto vale cada real em prata. */
  silverPerBrl: number | null;
  /** Economia de imposto por mês com Premium (vendas × (8% − 4%)). */
  taxSaving: number | null;
  /** A economia de imposto sozinha já paga o Premium em prata? */
  taxPays: boolean | null;
}

const pos = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

export function premiumCalc(i: PremiumInput): PremiumResult {
  const premiumGold = PREMIUM_30D_GOLD;
  const silver = pos(i.goldPrice) ? Math.round(premiumGold * i.goldPrice) : null;
  const brlPerGold = pos(i.packBrl) && pos(i.packGold) ? i.packBrl / i.packGold : null;
  const brl = brlPerGold === null ? null : Math.round(premiumGold * brlPerGold * 100) / 100;
  const hours = silver !== null && pos(i.silverPerHour) ? silver / i.silverPerHour : null;
  const silverPerBrl = pos(i.goldPrice) && brlPerGold !== null ? i.goldPrice / brlPerGold : null;
  const taxSaving = pos(i.monthlySales) ? Math.round(i.monthlySales * (SALES_TAX - SALES_TAX_PREMIUM)) : null;
  const taxPays = taxSaving !== null && silver !== null ? taxSaving >= silver : null;
  return { premiumGold, silver, brlPerGold, brl, hours, silverPerBrl, taxSaving, taxPays };
}

const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlFine = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });

const moneyEs = new Intl.NumberFormat('es-419', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyEsFine = new Intl.NumberFormat('es-419', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * R$ formatado; fine: até 4 casas (preço de 1 ouro costuma ser centavos). Espanhol: só o número, sem símbolo
 * ("29.90"), porque o valor está na moeda de quem preencheu.
 */
export function fmtBrl(n: number | null | undefined, fine = false, loc: Locale = currentLocale()): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  if (loc === 'es') return (fine ? moneyEsFine : moneyEs).format(n);
  return (fine ? brlFine : brlFmt).format(n);
}

/** Horas → "45 min", "3 h 20 min", "12 h", "2 dias e 4 h" (de jogo; es: "2 días y 4 h"). */
export function fmtHours(h: number | null | undefined, loc: Locale = currentLocale()): string {
  if (typeof h !== 'number' || !Number.isFinite(h) || h < 0) return '—';
  const totalMin = Math.max(1, Math.round(h * 60));
  if (totalMin < 60) return `${totalMin} min`;
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (hh < 10) return mm ? `${hh} h ${mm} min` : `${hh} h`;
  if (hh < 48) return `${Math.round(h)} h`;
  const d = Math.floor(hh / 24);
  const rest = hh % 24;
  if (loc === 'es') return rest ? `${d} días y ${rest} h` : `${d} días`;
  return rest ? `${d} dias e ${rest} h` : `${d} dias`;
}
