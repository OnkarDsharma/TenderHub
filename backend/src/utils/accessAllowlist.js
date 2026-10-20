export const isUnlimitedAccessUser = (userOrEmail) => {
  const email = typeof userOrEmail === 'string' ? userOrEmail : userOrEmail?.email;
  if (typeof email !== 'string') return false;

  const allowlist = new Set(
    (process.env.UNLIMITED_TENDER_ACCESS_EMAILS || '')
      .split(',')
      .map((allowedEmail) => allowedEmail.trim().toLowerCase())
      .filter(Boolean)
  );
  return allowlist.has(email.trim().toLowerCase());
};
