// Pure check-digit validation for EAN-13 / EAN-8 / UPC-A.
// Shared by the client barcode flow and the server barcode route so an
// invalid check digit is rejected in both places, not only in the UI.
export function checkDigitValid(code: string): boolean {
  if (!/^\d+$/.test(code)) return false;
  if (![8, 12, 13].includes(code.length)) return false;
  if (/^0+$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += digits[i] * weight;
  }
  return (10 - (sum % 10)) % 10 === check;
}
