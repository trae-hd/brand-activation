export interface User {
  name: string;
  email: string;
  /** Avatar URL — empty string if unavailable. */
  avatar: string;
  /** Two-character initials derived from name. */
  initials: string;
  /** User's role in the workspace, e.g. "ADMIN" | "MEMBER". */
  role?: string;
}
