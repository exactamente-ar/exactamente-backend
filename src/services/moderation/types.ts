export type ModerationReasonCode =
  'INAPPROPRIATE_LANGUAGE' | 'SPAM' | 'EXCESSIVE_URLS' | 'DUPLICATE_CONTENT';

export type ModerationDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: ModerationReasonCode;
      message: string;
    };
