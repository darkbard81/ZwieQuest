// Preserve leading zeroes. The UI and server enforce the same ASCII-only policy.
export const validPassword = value => typeof value === 'string' && /^[0-9]{6}$/.test(value);
