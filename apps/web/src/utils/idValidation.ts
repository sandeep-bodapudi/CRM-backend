const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR_REGEX = /^\d{4}\s?\d{4}\s?\d{4}$/;

export const getPanFormatError = (pan: string): string | null => {
  if (!pan) return null;
  return PAN_REGEX.test(pan)
    ? null
    : 'Invalid format — expected 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)';
};

export const getAadhaarFormatError = (aadhaar: string): string | null => {
  if (!aadhaar) return null;
  return AADHAAR_REGEX.test(aadhaar)
    ? null
    : 'Invalid format — expected 12 digits (e.g. 1234 5678 9012)';
};
