import { useState } from 'react';
import timeAgo from '../utils/timeAgo.js';

// "PDF", "PNG", "ZIP"... taken from the last path segment of the URL
const extOf = (url = '') => {
  const last = url.split('?')[0].split('/').pop();
  return last.includes('.') ? last.split('.').pop().slice(0, 4).toUpperCase() : 'FILE';
};

// One file: thumbnail (or a file-type tile), name, version badge, type, age.
// Used on both the client dashboard and the owner's client panel.
export default function FileRow({ file, compact = false }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const showThumb = file.thumbnailUrl && !thumbFailed;

  return (
    <div className={`file-row ${compact ? 'compact' : ''}`}>
      <a className="file-thumb" href={file.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.name}`}>
        {showThumb ? (
          // if the thumbnail can't load (e.g. Cloudinary blocks PDF delivery), fall back to the tile
          <img src={file.thumbnailUrl} alt="" loading="lazy" onError={() => setThumbFailed(true)} />
        ) : (
          <span className="file-ext">{extOf(file.url)}</span>
        )}
      </a>
      <div className="file-meta">
        <a className="file-name" href={file.url} target="_blank" rel="noopener noreferrer">{file.name}</a>
        <div className="file-sub">
          {file.versionLabel && <span className="version-badge">{file.versionLabel}</span>}
          <span>{file.type}</span>
          <span>·</span>
          <span>{timeAgo(file.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
