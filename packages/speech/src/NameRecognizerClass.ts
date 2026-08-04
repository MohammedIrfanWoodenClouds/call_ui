/**
 * Class facade over Kerala name assessment helpers.
 */

import {
  assessHeardName,
  type NameAssessment,
} from "./NameRecognizer.js";

export type { NameAssessment };

export class NameRecognizer {
  recognize(raw?: string): NameAssessment | undefined {
    return assessHeardName(raw);
  }
}
