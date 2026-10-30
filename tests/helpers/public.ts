// Lê arquivos de public/ do disco nos testes (o tsconfig não carrega @types/node; fs tipado à mão).
const NODE_FS = 'node:fs';
const { readFileSync, existsSync } = (await import(/* @vite-ignore */ NODE_FS)) as {
  readFileSync(p: URL, enc: 'utf8'): string;
  existsSync(p: URL): boolean;
};

/** Conteúdo de public/<caminho>, ou null se não existir. */
export function readPublic(pathname: string): string | null {
  const url = new URL(`../../public${pathname}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : null;
}
