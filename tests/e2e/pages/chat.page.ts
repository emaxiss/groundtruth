import { type Locator, type Page } from '@playwright/test';

/** The chat view: message list, composer, and its validation and error states. */
export class ChatPage {
  readonly input: Locator;
  readonly send: Locator;
  readonly empty: Locator;
  readonly loading: Locator;
  readonly error: Locator;
  readonly validation: Locator;
  readonly charCount: Locator;
  readonly userMessages: Locator;
  readonly agentMessages: Locator;

  constructor(readonly page: Page) {
    const panel = page.getByRole('tabpanel', { name: 'chat' });
    this.input = panel.getByRole('textbox', { name: 'Message', exact: true });
    this.send = panel.getByRole('button', { name: /^send/i });
    this.empty = panel.getByText('No messages yet.', { exact: false });
    this.loading = panel.getByRole('status');
    this.error = panel.getByRole('alert');
    this.validation = page.getByTestId('chat-validation');
    this.charCount = page.getByTestId('chat-charcount');
    this.userMessages = panel.getByRole('article', { name: 'Customer message' });
    this.agentMessages = panel.getByRole('article', { name: 'Agent reply' });
  }

  /** Types a message and submits with the button. */
  async ask(message: string): Promise<void> {
    await this.input.fill(message);
    await this.send.click();
  }

  /** Types a message and submits with the keyboard shortcut. */
  async askWithShortcut(message: string): Promise<void> {
    await this.input.fill(message);
    await this.input.press('ControlOrMeta+Enter');
  }

  get lastAnswer(): Locator {
    return this.agentMessages.last();
  }
}
