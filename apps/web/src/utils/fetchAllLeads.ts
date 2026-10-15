type FetchWithAuth = (url: string, options?: RequestInit) => Promise<Response>;

const PAGE_SIZE = 100; // the API never returns more than 100 rows per request
const PARALLEL_PAGES = 5;

/**
 * Loads every lead matching `query` by walking the paged GET /leads, instead
 * of one oversized request the server used to silently cut to 100 rows.
 * Returns a Response (status of the first page, body `{ leads, total }`) so
 * dashboards that read `res.ok` / `res.json()` keep working unchanged.
 */
export async function fetchAllLeads(
  fetchWithAuth: FetchWithAuth,
  apiBase: string,
  query: Record<string, string> = {},
): Promise<Response> {
  const pageUrl = (offset: number) => {
    const params = new URLSearchParams({
      ...query,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    return `${apiBase}/leads?${params.toString()}`;
  };

  const first = await fetchWithAuth(pageUrl(0));
  if (!first.ok) return first;
  const firstData = await first.json();
  const leads: any[] = firstData.leads || [];
  const total: number = firstData.total ?? leads.length;

  const offsets: number[] = [];
  for (let o = PAGE_SIZE; o < total; o += PAGE_SIZE) offsets.push(o);

  for (let i = 0; i < offsets.length; i += PARALLEL_PAGES) {
    const batch = await Promise.all(
      offsets.slice(i, i + PARALLEL_PAGES).map(async (o) => {
        const res = await fetchWithAuth(pageUrl(o));
        if (!res.ok) throw new Error(`Could not load leads (page at ${o})`);
        return (await res.json()).leads as any[];
      }),
    );
    for (const page of batch) leads.push(...(page || []));
  }

  return new Response(JSON.stringify({ leads, total }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
