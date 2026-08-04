/**
 * Light company-name cleanup for STT (trim / collapse spaces).
 * Does not invent or fuzzy-replace business names.
 */

export interface CompanyRecognitionResult {
  company?: string;
  cleaned: string;
}

export class CompanyRecognizer {
  recognize(
    text: string,
    options: { phase?: string } = {}
  ): CompanyRecognitionResult {
    const cleaned = text.trim().replace(/\s+/g, " ");
    if (!cleaned) return { cleaned: "" };
    if (options.phase === "company" || options.phase === undefined) {
      // Strip common lead-ins when the turn is about company.
      const stripped = cleaned
        .replace(
          /^(?:my\s+)?(?:company(?:\s+name)?|business(?:\s+name)?|firm)\s+(?:is\s+)?/iu,
          ""
        )
        .replace(
          /^(?:എന്റെ?\s+)?(?:കമ്പനി|ബിസിനസ്)(?:\s+നെയിം)?\s*(?:ആണ്|ആണ്‌)?\s*/u,
          ""
        )
        .trim();
      return {
        cleaned,
        company: stripped || cleaned,
      };
    }
    return { cleaned };
  }
}
