// Round avatar: the photo when there is one, otherwise initials (works for Hindi/Devanagari names).
import { initials } from '../utils/format.js';

export default function Avatar({ name, src, size = 36 }) {
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) };
  return src
    ? <img className="avatar" src={src} alt="" style={style} loading="lazy" referrerPolicy="no-referrer" />
    : <span className="avatar avatar-initials" style={style} aria-hidden="true">{initials(name)}</span>;
}
