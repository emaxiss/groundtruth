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
    const panel = page.getByRole('tabpanel', { name: 'triage' });
    this.subject = panel.getByLabel('subject');
    this.body = panel.getByLabel('body');
    this.plan = panel.getByLabel('customer plan');
    this.submit = panel.getByRole('button', { name: /^classify/i });
    this.empty = panel.getByText('No classification yet.', { exact: false });
    this.loading = panel.getByRole('status');
    this.error = panel.getByRole('alert');
    this.subjectValidation = page.getByTestId('triage-subject-validation');
    this.bodyValidation = page.getByTestId('triage-body-validation');
    this.result = panel.getByRole('article', { name: 'Classification' });
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
