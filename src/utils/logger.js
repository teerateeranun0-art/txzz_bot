const ts = () => new Date().toISOString();

export const logger = {
  info: (...args) => console.log(`[${ts()}] INFO`, ...args),
  warn: (...args) => console.warn(`[${ts()}] WARN`, ...args),
  error: (message, err) => {
    console.error(`[${ts()}] ERROR`, message);
    if (err?.stack) console.error(err.stack);
    else if (err) console.error(err);
  },
};
