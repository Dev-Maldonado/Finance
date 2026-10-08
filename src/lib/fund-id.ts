export function fundId(cnpj: string, subclass = "") {
  const base = cnpj.replace(/\D/g, "");
  return subclass.trim() ? `${base}:${subclass.trim()}` : base;
}
