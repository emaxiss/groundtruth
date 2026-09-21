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
    this.input = page.getByTestId('chat-input');
    this.send = page.getByTestId('chat-send');
    this.empty = page.getByTestId('chat-empty');
    this.loading = page.getByTestId('chat-loading');
    this.error = page.getByTestId('chat-error');
    this.validation = page.getByTestId('chat-validation');
    this.charCount = page.getByTestId('chat-charcount');
    this.userMessages = page.getByTestId('msg-user');
    this.agentMessages = page.getByTestId('msg-agent');
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
