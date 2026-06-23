// PIX BR Code (EMV) generator — "copia e cola"
// Reference: BACEN PIX manual

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitize(input: string, max: number): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .slice(0, max)
    .trim() || "PAGAMENTO";
}

export function buildPixPayload(opts: {
  key: string;
  amount: number; // BRL
  merchantName: string;
  merchantCity: string;
  txid?: string;
  description?: string;
}): string {
  const merchantAccount =
    tlv("00", "br.gov.bcb.pix") +
    tlv("01", opts.key) +
    (opts.description ? tlv("02", sanitize(opts.description, 50)) : "");

  const txid = sanitize((opts.txid ?? "***").replace(/[^A-Za-z0-9]/g, ""), 25) || "***";

  const payload =
    tlv("00", "01") +
    tlv("26", merchantAccount) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", opts.amount.toFixed(2)) +
    tlv("58", "BR") +
    tlv("59", sanitize(opts.merchantName, 25)) +
    tlv("60", sanitize(opts.merchantCity, 15)) +
    tlv("62", tlv("05", txid));

  const toCrc = payload + "6304";
  return toCrc + crc16(toCrc);
}
