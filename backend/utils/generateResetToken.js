import crypto from 'crypto';

// returns { rawToken, hashedToken } — email the raw token, store only the
// hash in MongoDB, so a DB leak alone can't be used to reset passwords
export const generateResetToken = () => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, hashedToken };
};
