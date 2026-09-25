// Output-side guard for text a customer reads: chat answers and triage
// suggested replies. The system prompt tells the model not
// to disclose its instructions, and a live model still paraphrased them one
// time in three when asked for "a summary, without quoting". A rule the model
// can ignore is not a control, so the answer is checked before it is returned.

// Set when the guard replaced model output, so a caller can count how often it fires.
export const GUARD_HEADER = 'x-groundtruth-guard';

export const DISCLOSURE_REFUSAL =
  "I follow TaskLoop's support policy and cannot share how I am configured. If you have a TaskLoop question, I am happy to help.";

// Phrases that describe the rules themselves, not TaskLoop. One alone can
// occur in an honest answer ("I cannot promise a refund"); two together is a
// description of the instruction set.
const RULE_SIGNATURES: RegExp[] = [
  /untrusted data/i,
  /priority order/i,
  /(never|do not|don['’]t) (reveal|quote|disclose) (these|the|my|your) (instructions|rules|prompt)/i,
  /(only|solely) (use|from|using) .{0,30}(taskloop )?documentation/i,
  /(never|do not|don['’]t) promise (any )?(refunds|discounts|credits)/i,
  /claim(s|ing)? .{0,20}authority/i,
  /manipulation attempt/i,
  /(change|changing) (your|my|the) role/i,
  /RULES \(in priority order/,
  /TASKLOOP DOCUMENTATION \(condensed\)/,
];

export function disclosesInstructions(answer: string): boolean {
  if (RULE_SIGNATURES.slice(-2).some((p) => p.test(answer))) return true;
  return RULE_SIGNATURES.filter((p) => p.test(answer)).length >= 2;
}

/** The answer, or a fixed refusal when the answer describes the agent's own rules. */
export function guardAnswer(answer: string): { text: string; blocked: boolean } {
  return disclosesInstructions(answer)
    ? { text: DISCLOSURE_REFUSAL, blocked: true }
    : { text: answer, blocked: false };
}
