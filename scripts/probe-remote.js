async page => {
  const before = await page.evaluate(async () => {
    const r = await fetch('/api/samples');
    const j = await r.json();
    return { status: r.status, count: j.posts?.length, error: j.error };
  });
  const results = await page.evaluate(async () => {
    const out = [];
    for (const source of ['Seowoo_0501', 'gapyeonghaus']) {
      const r = await fetch('/api/probe?source=' + source, {
        method: 'POST', headers: { 'x-validation-action': 'collect' }
      });
      out.push({ source, status: r.status, body: await r.json() });
    }
    return out;
  });
  await page.reload();
  return { before, results };
}
