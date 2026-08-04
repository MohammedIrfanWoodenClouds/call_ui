/**
 * Facade over number / name / email / company recognizers.
 */

import { NumberRecognizer } from "./NumberRecognizer.js";
import { NameRecognizer } from "./NameRecognizerClass.js";
import { EmailRecognizer } from "./EmailRecognizer.js";
import { CompanyRecognizer } from "./CompanyRecognizer.js";

export interface EntityBundle {
  phoneDigits?: string;
  phonePlausible: boolean;
  nameCandidates: string[];
  heardName?: string;
  email?: string;
  likelyEmailTurn: boolean;
  company?: string;
}

export class EntityRecognizer {
  private readonly numbers = new NumberRecognizer();
  private readonly names = new NameRecognizer();
  private readonly emails = new EmailRecognizer();
  private readonly companies = new CompanyRecognizer();

  recognize(
    text: string,
    options: {
      phase?: string;
      nameCandidates?: string[];
    } = {}
  ): EntityBundle {
    const phone = this.numbers.extractDigits(text);
    const name =
      options.phase === "name"
        ? this.names.recognize(text)
        : undefined;
    const email = this.emails.recognize(text);
    const company =
      options.phase === "company"
        ? this.companies.recognize(text, { phase: "company" })
        : undefined;

    return {
      phoneDigits: phone.digits || undefined,
      phonePlausible: phone.plausiblePhone,
      nameCandidates: [
        ...new Set([
          ...(options.nameCandidates ?? []),
          ...(name?.candidates ?? []),
        ]),
      ].slice(0, 5),
      heardName: name?.heard,
      email: email.email,
      likelyEmailTurn: email.likelyEmailTurn,
      company: company?.company,
    };
  }
}
