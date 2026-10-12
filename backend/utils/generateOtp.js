// simple 6-digit numeric OTP, e.g. "482913"
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

export default generateOtp;
