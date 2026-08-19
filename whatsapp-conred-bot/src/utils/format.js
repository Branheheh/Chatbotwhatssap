function formatDateTime(date) {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleString('es-GT', {
    timeZone: 'America/Guatemala',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

module.exports = { formatDateTime };
