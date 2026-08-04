export {
  normalizeDomainVocabulary,
  type DomainVocabularyResult,
} from "./core.js";

import { normalizeDomainVocabulary } from "./core.js";

export class DomainVocabulary {
  normalize(rawTranscript: string) {
    return normalizeDomainVocabulary(rawTranscript);
  }
}
