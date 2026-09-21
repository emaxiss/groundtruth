import { type Locator, type Page } from '@playwright/test';

export type TicketDraft = { subject: string; body: string; plan?: 'free' | 'pro' | 'team' };

/** The triage view: ticket form, its validation, and the classification result. */
export class TriagePage {
  readonly subject: Locator;
  readonly body: Locator;
  readonly plan: Locator;
  readonly submit: Locator;
  readonly empty: Locator;
  readonly loading: Locator;
  readonly error: Locator;
  readonly subjectValidation: Locator;
  readonly bodyValidation: Locator;
  readonly result: Locator;
  readonly category: Locator;
  readonly severity: Locator;
  readonly route: Locator;
  readonly refund: Locator;
  readonly confidence: Locator;
  readonly reply: Locator;

  constructor(readonly page: Page) {
    this.subject = page.getByTestId('triage-subject');
    this.body = page.getByTestId('triage-body');
    this.plan = page.getByTestId('triage-plan');
    this.submit = page.getByTestId('triage-submit');
    this.empty = page.getByTestId('triage-empty');
    this.loading = page.getByTestId('triage-loading');
    this.error = page.getByTestId('triage-error');
    this.subjectValidation = page.getByTestId('triage-subject-validation');
    this.bodyValidation = page.getByTestId('triage-body-validation');
    this.result = page.getByTestId('triage-result');
    this.category = page.getByTestId('triage-category');
    this.severity = page.getByTestId('triage-severity');
    this.route = page.getByTestId('triage-route');
    this.refund = page.getByTestId('triage-refund');
    this.confidence = page.getByTestId('triage-confidence');
    this.reply = page.getByTestId('triage-reply');
  }

  async fill({ subject, body, plan }: TicketDraft): Promise<void> {
    await this.subject.fill(subject);
    await this.body.fill(body);
    if (plan) await this.plan.selectOption(plan);
  }

  async classify(draft: TicketDraft): Promise<void> {
    await this.fill(draft);
    await this.submit.click();
  }

  async classifyWithShortcut(draft: TicketDraft): Promise<void> {
    await this.fill(draft);
    await this.body.press('ControlOrMeta+Enter');
  }
}
