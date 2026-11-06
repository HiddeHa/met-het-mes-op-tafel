/** Dedicated port so an end-to-end run never touches the live table on 8787. */
export const E2E_PORT = 8899;
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
