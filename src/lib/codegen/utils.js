export const toIdentifier = (value, fallback) => {
  const base = (value || fallback || 'node').toLowerCase();
  const cleaned = base.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || fallback || 'node';
};
