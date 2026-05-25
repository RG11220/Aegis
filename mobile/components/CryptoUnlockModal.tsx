/**
 * @deprecated — removed in Phase 5 revision.
 *
 * The separate unlock modal was the wrong UX. Private key decryption now
 * happens transparently inside useEmailSignIn (sign-in) and useEmailSignUp
 * (sign-up) using the password the user already typed at the auth screen.
 * No separate modal or extra prompt is shown to the user.
 */

export {};
