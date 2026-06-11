// Central API client. In dev, requests go to "/api" and Vite proxies them to
// the backend. In production, set VITE_API_URL to the backend's public URL.
const API_BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let msg = 'Request failed';
    try {
      const body = await res.json();
      msg = body.error || msg;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(msg, res.status);
  }
  // Some endpoints (DELETE) may return empty bodies
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' }),

  // Multipart upload (CSV/PDF/image) — no JSON content-type header.
  upload: async (path, formData) => {
    const res = await fetch(API_BASE + path, { method: 'POST', body: formData });
    if (!res.ok) {
      let msg = 'Upload failed';
      try { msg = (await res.json()).error || msg; } catch {}
      throw new ApiError(msg, res.status);
    }
    return res.json();
  },

  // Health check hits the server root, not /api.
  health: async () => {
    const root = API_BASE.replace(/\/api$/, '');
    const res = await fetch(root + '/health');
    return res.ok;
  },

  // Build an absolute URL for a stored receipt image.
  // Build a URL for a stored receipt image. If the value is already an absolute
  // URL (e.g. a Cloudinary link), return it unchanged; otherwise treat it as a
  // local filename served by the backend.
  receiptImage: (file) =>
    /^https?:\/\//.test(file) ? file : `${API_BASE}/receipts/image/${file}`,
};

export { API_BASE };