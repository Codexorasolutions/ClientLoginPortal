// Builds a small preview image URL for a Cloudinary-hosted file by inserting
// a transformation into the URL — nothing extra is stored, so this also
// works for files uploaded before thumbnails existed.
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']);

export const thumbnailFor = (url) => {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return null;

  const ext = url.split('?')[0].split('.').pop().toLowerCase();

  if (IMAGE_EXT.has(ext)) {
    return url.replace('/image/upload/', '/image/upload/w_240,h_160,c_fill,q_auto/');
  }
  if (ext === 'pdf') {
    // first page of the PDF, rendered as a JPG
    return url
      .replace('/image/upload/', '/image/upload/w_240,h_160,c_fill,pg_1,q_auto/')
      .replace(/\.pdf(\?.*)?$/i, '.jpg$1');
  }
  return null;
};

// adds thumbnailUrl to a Deliverable document (or plain object)
export const withThumbnail = (doc) => {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  return { ...obj, thumbnailUrl: thumbnailFor(obj.url) };
};
