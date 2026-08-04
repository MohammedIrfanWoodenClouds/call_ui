/**
 * Lightweight spoken / typed email extraction from STT text.
 */

const EMAIL_RE = /[\w.+-]+\s*@\s*[\w.-]+\.[a-z]{2,}/iu;
const EMAIL_CUE =
  /\b(?:gmail|email|e-mail|yahoo|hotmail|outlook)\b|ഇമെയിൽ/iu;

export interface EmailRecognitionResult {
  email?: string;
  likelyEmailTurn: boolean;
}

export class EmailRecognizer {
  recognize(text: string): EmailRecognitionResult {
    const raw = text.trim();
    const match = EMAIL_RE.exec(raw);
    if (match) {
      const email = match[0]!.replace(/\s+/g, "").toLowerCase();
      return { email, likelyEmailTurn: true };
    }
    return {
      likelyEmailTurn: EMAIL_CUE.test(raw),
    };
  }
}
