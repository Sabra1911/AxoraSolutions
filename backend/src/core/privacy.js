function minimizeText(value, maxLength = 1000) {
  return String(value || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[correo oculto]')
    .replace(/\b(?:nit|c\.?c\.?|c[eé]dula|documento|identificaci[oó]n)\s*[:#-]?\s*[\d.\-\s]{6,}\d/gi, '[identificación ocultada]')
    .replace(/\b\d(?:[\d .()-]*\d){7,}\b/g, '[número oculto]')
    .slice(0, maxLength);
}

module.exports = { minimizeText };
