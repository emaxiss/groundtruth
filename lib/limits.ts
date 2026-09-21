// Input limits shared by the request schemas, the UI, and the browser suite,
// so the client-side copy and the server-side validation cannot drift apart.
export const LIMITS = {
  message: 2000,
  subject: 200,
  body: 2000,
} as const;
