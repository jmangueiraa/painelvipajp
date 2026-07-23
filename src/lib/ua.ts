// Detecção leve de sistema operacional e navegador a partir do User-Agent.
export type UAInfo = { os: string; browser: string };

export function parseUA(ua: string | null | undefined): UAInfo {
  const s = (ua || "").toString();
  let os = "Desconhecido";
  let browser = "Desconhecido";

  if (/windows nt/i.test(s)) os = "Windows";
  else if (/android/i.test(s)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(s)) os = "iOS";
  else if (/mac os x|macintosh/i.test(s)) os = "macOS";
  else if (/linux/i.test(s)) os = "Linux";

  if (/edg\//i.test(s)) browser = "Edge";
  else if (/opr\/|opera/i.test(s)) browser = "Opera";
  else if (/chrome\//i.test(s) && !/edg\//i.test(s)) browser = "Chrome";
  else if (/crios\//i.test(s)) browser = "Chrome iOS";
  else if (/fxios\//i.test(s)) browser = "Firefox iOS";
  else if (/firefox\//i.test(s)) browser = "Firefox";
  else if (/safari\//i.test(s)) browser = "Safari";

  return { os, browser };
}
