const url = process.env.WAIT_URL ?? "http://127.0.0.1:3001/api/health";
const maxAttempts = Number(process.env.WAIT_MAX_ATTEMPTS ?? 180);

for (let i = 0; i < maxAttempts; i++) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      await res.text();
      console.log(`API ready at ${url.replace(/\/api\/health\/?$/, "")} (after ~${i} attempts)`);
      break;
    }
  } catch {
    // server still starting
  }
  if (i === maxAttempts - 1) {
    console.error(`Timed out waiting for ${url} after ${maxAttempts}s`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
