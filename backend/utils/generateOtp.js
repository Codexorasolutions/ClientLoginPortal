import crypto from 'crypto';

// 6-digit numeric OTP, e.g. "482913" — from a cryptographically secure source (Math.random is predictable)
const generateOtp = () => String(crypto.randomInt(100000, 1000000));

export default generateOtp;
