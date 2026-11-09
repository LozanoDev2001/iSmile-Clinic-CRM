/** Allowed values of the VARCHAR + CHECK status columns (see the SQL migration). */
export const USER_STATUSES = ["invited", "active", "suspended", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PASSWORD_TOKEN_PURPOSES = ["invite", "reset"] as const;
export type PasswordTokenPurpose = (typeof PASSWORD_TOKEN_PURPOSES)[number];
