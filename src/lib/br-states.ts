// Brazilian DDD → state (UF) + flag image URL (via Wikimedia Special:FilePath)
export type BrState = { uf: string; name: string; flag: string };

const file = (n: string) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(n)}?width=40`;

const S: Record<string, BrState> = {
  AC: { uf: "AC", name: "Acre", flag: file("Bandeira_do_Acre.svg") },
  AL: { uf: "AL", name: "Alagoas", flag: file("Bandeira_de_Alagoas.svg") },
  AP: { uf: "AP", name: "Amapá", flag: file("Bandeira_do_Amapá.svg") },
  AM: { uf: "AM", name: "Amazonas", flag: file("Bandeira_do_Amazonas.svg") },
  BA: { uf: "BA", name: "Bahia", flag: file("Bandeira_da_Bahia.svg") },
  CE: { uf: "CE", name: "Ceará", flag: file("Bandeira_do_Ceará.svg") },
  DF: { uf: "DF", name: "Distrito Federal", flag: file("Bandeira_do_Distrito_Federal_(Brasil).svg") },
  ES: { uf: "ES", name: "Espírito Santo", flag: file("Bandeira_do_Espírito_Santo.svg") },
  GO: { uf: "GO", name: "Goiás", flag: file("Bandeira_de_Goiás.svg") },
  MA: { uf: "MA", name: "Maranhão", flag: file("Bandeira_do_Maranhão.svg") },
  MT: { uf: "MT", name: "Mato Grosso", flag: file("Bandeira_de_Mato_Grosso.svg") },
  MS: { uf: "MS", name: "Mato Grosso do Sul", flag: file("Bandeira_de_Mato_Grosso_do_Sul.svg") },
  MG: { uf: "MG", name: "Minas Gerais", flag: file("Bandeira_de_Minas_Gerais.svg") },
  PA: { uf: "PA", name: "Pará", flag: file("Bandeira_do_Pará.svg") },
  PB: { uf: "PB", name: "Paraíba", flag: file("Bandeira_da_Paraíba.svg") },
  PR: { uf: "PR", name: "Paraná", flag: file("Bandeira_do_Paraná.svg") },
  PE: { uf: "PE", name: "Pernambuco", flag: file("Bandeira_de_Pernambuco.svg") },
  PI: { uf: "PI", name: "Piauí", flag: file("Bandeira_do_Piauí.svg") },
  RJ: { uf: "RJ", name: "Rio de Janeiro", flag: file("Bandeira_do_estado_do_Rio_de_Janeiro.svg") },
  RN: { uf: "RN", name: "Rio Grande do Norte", flag: file("Bandeira_do_Rio_Grande_do_Norte.svg") },
  RS: { uf: "RS", name: "Rio Grande do Sul", flag: file("Bandeira_do_Rio_Grande_do_Sul.svg") },
  RO: { uf: "RO", name: "Rondônia", flag: file("Bandeira_de_Rondônia.svg") },
  RR: { uf: "RR", name: "Roraima", flag: file("Bandeira_de_Roraima.svg") },
  SC: { uf: "SC", name: "Santa Catarina", flag: file("Bandeira_de_Santa_Catarina.svg") },
  SP: { uf: "SP", name: "São Paulo", flag: file("Bandeira_do_estado_de_São_Paulo.svg") },
  SE: { uf: "SE", name: "Sergipe", flag: file("Bandeira_de_Sergipe.svg") },
  TO: { uf: "TO", name: "Tocantins", flag: file("Bandeira_do_Tocantins.svg") },
};

const DDD_TO_UF: Record<string, string> = {
  "11": "SP","12":"SP","13":"SP","14":"SP","15":"SP","16":"SP","17":"SP","18":"SP","19":"SP",
  "21":"RJ","22":"RJ","24":"RJ",
  "27":"ES","28":"ES",
  "31":"MG","32":"MG","33":"MG","34":"MG","35":"MG","37":"MG","38":"MG",
  "41":"PR","42":"PR","43":"PR","44":"PR","45":"PR","46":"PR",
  "47":"SC","48":"SC","49":"SC",
  "51":"RS","53":"RS","54":"RS","55":"RS",
  "61":"DF",
  "62":"GO","64":"GO",
  "63":"TO",
  "65":"MT","66":"MT",
  "67":"MS",
  "68":"AC",
  "69":"RO",
  "71":"BA","73":"BA","74":"BA","75":"BA","77":"BA",
  "79":"SE",
  "81":"PE","87":"PE",
  "82":"AL",
  "83":"PB",
  "84":"RN",
  "85":"CE","88":"CE",
  "86":"PI","89":"PI",
  "91":"PA","93":"PA","94":"PA",
  "92":"AM","97":"AM",
  "95":"RR",
  "96":"AP",
  "98":"MA","99":"MA",
};

export function getStateFromPhone(phone: string): BrState | null {
  const d = (phone || "").replace(/\D/g, "");
  // strip country code 55 if present
  const local = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  if (local.length < 2) return null;
  const ddd = local.slice(0, 2);
  const uf = DDD_TO_UF[ddd];
  return uf ? S[uf] : null;
}
