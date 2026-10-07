// Minimal transport for the existing bracket queries in local preview mode.
export const localClient = {
  from(table: string) {
    const query: Record<string, unknown> = { table, action: 'select' };
    const builder = {
      select() { return builder; },
      order(column: string, options?: { ascending?: boolean }) { query.order = { column, ascending: options?.ascending !== false }; return builder; },
      eq(column: string, value: unknown) { query.filter = { column, value }; return builder; },
      maybeSingle() { query.single = true; return builder; },
      upsert(data: unknown) { query.action = 'upsert'; query.data = data; return builder; },
      update(data: unknown) { query.action = 'update'; query.data = data; return builder; },
      delete() { query.action = 'delete'; return builder; },
      then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
        return fetch('/api/local-tournament', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) })
          .then(res => res.json()).then(resolve, reject);
      },
    };
    return builder;
  },
};
