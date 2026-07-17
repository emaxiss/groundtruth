import { z } from 'zod';

export const ChatInput = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message must be 2000 characters or fewer'),
});
export type ChatInput = z.infer<typeof ChatInput>;

export type ApiError = {
  error: string;
  kind: 'validation' | 'rate_limited' | 'timeout' | 'upstream' | 'config' | 'schema';
  details?: unknown;
};
