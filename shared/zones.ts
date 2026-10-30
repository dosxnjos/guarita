// Regras de perda por tipo de zona (módulo (c) da Fase 2: "Quanto vale arriscar"). Texto em PT-BR para o novato
// (ZONE_RULES) e o mesmo em espanhol (ZONE_TEXT_ES, mais abaixo).
//
// Fontes consultadas em 30/10/2026 (o wiki oficial, wiki.albiononline.com, respondeu 403 a toda consulta
// automatizada nesse dia; as regras abaixo são o consenso das fontes secundárias, e a tela pede para conferir no jogo):
// - AlbionMarket, "Albion Online Zones and Flagging Explained (2026)", 09/07/2026:
//   https://www.albionmarket.gg/guides/zones-and-flagging (azul sem combate entre jogadores; amarela: "Flagged PvP,
//   knockdown only", "a flagged player can knock down anyone, including unflagged players", quem ataca alguém sem
//   bandeira perde um pouco de reputação, e a derrota só derruba e danifica o equipamento; reconferido em 30/10/2026;
//   a página não fala da bandeira de facção, por isso o card não a cita; vermelha: qualquer um pode ser atacado, com ou sem bandeira, e a morte larga
//   equipamento e inventário; preta: todos fora da guilda, aliança e grupo são atacáveis, sem reputação, perde tudo).
// - Albion Free Market, "Albion online guide to zones and flagging", 27/06/2025:
//   https://albionfreemarket.com/articles/view/albion-online-guide-to-zones-and-flagging (nocaute por monstro na
//   azul e por jogador na amarela, cerca de 5% de durabilidade por nocaute; o texto sobre a vermelha se contradiz,
//   por isso a regra da vermelha segue a AlbionMarket).
// - itemlevel.net, "Albion Online zone types explained", 25/04/2023: https://itemlevel.net/albion-online-zone-types-explained/
//   (amarela só perde durabilidade; preta marca todos para PvP automaticamente, sem perda de reputação).
// - Brumas letais e não letais: notas do patch "Beyond the Veil Patch 2" (14/12/2022),
//   https://devtrackers.gg/albion/p/8447e50f-14-december-2022-beyond-the-veil-patch-2 ("Common Lethal" e
//   "Common Nonlethal"), e o guia da KeenGamer (Brumas letais = PvP de saque total sempre ligado).
// - Estradas de Avalon: ficam no mundo das Terras Exteriores e seguem a regra das zonas pretas (saque total,
//   sem bandeira); confirmado só por guias (KeenGamer, AlbionOnlineBuilds), sem página oficial acessível.
// A regra de proteção do saque para quem matou (90 s nas zonas pretas) ficou de fora: as fontes não trazem a data
// nem se continua valendo.
import type { RiskZone, ZoneKind } from './types';

export interface ZoneRule {
  zone: ZoneKind;
  labelPt: string;
  /** Uma linha curta: quem pode atacar. */
  who: string;
  /** O que acontece ao morrer (ou ser derrubado). */
  death: string;
  lose: RiskZone['lose'];
  /** Observação que vai junto do valor no card. */
  note: string;
}

export const ZONE_RULES: ZoneRule[] = [
  {
    zone: 'azul',
    labelPt: 'Zona azul',
    who: 'Ninguém pode atacar você: não existe combate entre jogadores.',
    death: 'Morrer para um monstro só derruba você. O equipamento fica com você e perde durabilidade.',
    lose: 'durabilidade',
    note: 'Você não perde o set, só paga o reparo. O custo do reparo não entra na conta.',
  },
  {
    zone: 'amarela',
    labelPt: 'Zona amarela',
    who: 'Só quem ativou a bandeira de PvP (o ícone de espadas) pode atacar, e pode atacar você mesmo sem bandeira (quem ataca alguém sem bandeira perde um pouco de reputação).',
    death: 'Derrota para jogador ou monstro só derruba. Ninguém saqueia o seu set; o equipamento perde durabilidade.',
    lose: 'durabilidade',
    note: 'Você pode ser derrubado e expulso do local, mas não perde o set. O custo do reparo não entra na conta.',
  },
  {
    zone: 'vermelha',
    labelPt: 'Zona vermelha',
    who: 'Qualquer jogador com bandeira pode atacar você, com ou sem a sua bandeira. Quem ataca alguém sem bandeira perde reputação, mas isso não impede o ataque.',
    death: 'Morrer, para jogador ou para monstro, larga tudo o que você veste e carrega no chão para quem passar.',
    lose: 'tudo',
    note: 'Saque total: o set inteiro e a bolsa ficam no chão. Parte dos itens pode ser destruída na morte.',
  },
  {
    zone: 'preta',
    labelPt: 'Zona preta (Terras Exteriores)',
    who: 'Todo mundo fora da sua guilda, aliança e grupo pode atacar você, sem bandeira e sem perder reputação.',
    death: 'Morrer, para jogador ou para monstro, larga tudo o que você veste e carrega.',
    lose: 'tudo',
    note: 'Saque total, sem aviso de bandeira. Quanto mais perto do centro do mapa, mais gente e mais risco.',
  },
  {
    zone: 'avalon',
    labelPt: 'Estradas de Avalon',
    who: 'Seguem a regra da zona preta: todo mundo fora da sua guilda, aliança e grupo pode atacar você.',
    death: 'Morrer larga tudo o que você veste e carrega. Os portais mudam de lugar e de tempo de fechamento, e a saída pode sumir.',
    lose: 'tudo',
    note: 'Saque total. Confira o tempo do portal de volta antes de entrar.',
  },
  {
    zone: 'brumas',
    labelPt: 'Brumas',
    who: 'Feitas para jogar sozinho ou em dupla. Nas Brumas letais, qualquer um fora do seu grupo pode atacar você.',
    death: 'Nas Brumas letais (entrada por zona vermelha ou preta) a morte larga tudo. Nas não letais (entrada por zona azul ou amarela) você só é derrubado.',
    lose: 'tudo',
    note: 'O valor considera as Brumas letais. Nas não letais você perde só durabilidade.',
  },
];

/** Texto de uma zona numa língua (rótulo, quem ataca, o que acontece ao morrer, observação). */
export interface ZoneText {
  label: string;
  who: string;
  death: string;
  note: string;
}

/**
 * As mesmas regras em espanhol (glossário: zona amarilla/roja/negra, Tierras Lejanas, Caminos de Avalon, Nieblas,
 * gremio, botín completo). Fonte única do espanhol: a API (/api/risk?lang=es), o MCP e o bot leem daqui; a cópia em
 * src/lib/novato/arriscar.ts (ZONE_TEXT_ES) tem de ser idêntica (tests/api-i18n.test.ts confere).
 */
export const ZONE_TEXT_ES: Record<ZoneKind, ZoneText> = {
  azul: {
    label: 'Zona azul',
    who: 'Nadie puede atacarte: no hay combate entre jugadores.',
    death: 'Morir ante un monstruo solo te derriba. El equipo se queda contigo y pierde durabilidad.',
    note: 'No pierdes el set, solo pagas la reparación. El costo de la reparación no entra en el cálculo.',
  },
  amarela: {
    label: 'Zona amarilla',
    who: 'Solo quien activó la bandera de PvP (el ícono de espadas) puede atacar, y puede atacarte aunque no tengas bandera (quien ataca a alguien sin bandera pierde un poco de reputación).',
    death: 'Una derrota ante un jugador o un monstruo solo te derriba. Nadie saquea tu set; el equipo pierde durabilidad.',
    note: 'Pueden derribarte y echarte del lugar, pero no pierdes el set. El costo de la reparación no entra en el cálculo.',
  },
  vermelha: {
    label: 'Zona roja',
    who: 'Cualquier jugador con bandera puede atacarte, tengas o no tu bandera. Quien ataca a alguien sin bandera pierde reputación, pero eso no impide el ataque.',
    death: 'Al morir, ante un jugador o un monstruo, todo lo que llevas puesto y en la bolsa queda en el suelo para quien pase.',
    note: 'Botín completo: el set entero y la bolsa quedan en el suelo. Parte de los objetos puede destruirse al morir.',
  },
  preta: {
    label: 'Zona negra (Tierras Lejanas)',
    who: 'Cualquiera fuera de tu gremio, alianza y grupo puede atacarte, sin bandera y sin perder reputación.',
    death: 'Al morir, ante un jugador o un monstruo, dejas todo lo que llevas puesto y en la bolsa.',
    note: 'Botín completo, sin aviso de bandera. Cuanto más cerca del centro del mapa, más gente y más riesgo.',
  },
  avalon: {
    label: 'Caminos de Avalon',
    who: 'Siguen la regla de la zona negra: cualquiera fuera de tu gremio, alianza y grupo puede atacarte.',
    death: 'Al morir dejas todo lo que llevas puesto y en la bolsa. Los portales cambian de lugar y de tiempo de cierre, y la salida puede desaparecer.',
    note: 'Botín completo. Revisa el tiempo del portal de regreso antes de entrar.',
  },
  brumas: {
    label: 'Nieblas',
    who: 'Hechas para jugar solo o en pareja. En las Nieblas letales, cualquiera fuera de tu grupo puede atacarte.',
    death: 'En las Nieblas letales (entrada por zona roja o negra) al morir lo dejas todo. En las no letales (entrada por zona azul o amarilla) solo te derriban.',
    note: 'El valor considera las Nieblas letales. En las no letales solo pierdes durabilidad.',
  },
};

/** Texto da zona na língua pedida: pt = o de ZONE_RULES (igual a antes); es = ZONE_TEXT_ES. */
export function zoneTextFor(zone: ZoneKind, lang: 'pt' | 'es' = 'pt'): ZoneText {
  const r = zoneRule(zone);
  if (lang === 'es' && ZONE_TEXT_ES[zone]) return ZONE_TEXT_ES[zone];
  return { label: r.labelPt, who: r.who, death: r.death, note: r.note };
}

/**
 * Cards por zona para um set que custa `total` em prata (só as zonas de saque total põem o valor em risco).
 * Em espanhol, `note` vem em espanhol e o campo opcional `label` traz o rótulo em espanhol; `labelPt` continua o
 * português (contrato). Em português a forma é a de antes, sem `label`.
 */
export function zonesFor(total: number, lang: 'pt' | 'es' = 'pt'): RiskZone[] {
  const safe = Number.isFinite(total) && total > 0 ? Math.round(total) : 0;
  return ZONE_RULES.map((r) => {
    const base: RiskZone = {
      zone: r.zone,
      labelPt: r.labelPt,
      lose: r.lose,
      amount: r.lose === 'tudo' ? safe : 0,
      note: r.note,
    };
    if (lang !== 'es') return base;
    const es = ZONE_TEXT_ES[r.zone];
    return { ...base, note: es.note, label: es.label };
  });
}

export function zoneRule(zone: ZoneKind): ZoneRule {
  return ZONE_RULES.find((r) => r.zone === zone) ?? ZONE_RULES[0];
}
