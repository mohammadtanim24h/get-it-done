import { afterEach, describe, expect, it, vi } from 'vitest';
import { columnsService } from './columns';

const column = {
  id: 'c1',
  title: 'To Do',
  position: 0,
  boardId: 'b1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('columnsService', () => {
  it('listColumns unwraps the columns envelope', async () => {
    const fetchMock = mockFetch({ data: { columns: [column] } });

    await expect(columnsService.listColumns('b1')).resolves.toEqual([column]);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/boards/b1/columns');
  });

  it('createColumn posts the title and returns the column', async () => {
    const fetchMock = mockFetch({ data: { column } }, 201);

    await expect(columnsService.createColumn('b1', { title: 'To Do' })).resolves.toEqual(column);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/boards/b1/columns');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ title: 'To Do' });
  });

  it('renameColumn patches the title', async () => {
    const fetchMock = mockFetch({ data: { column: { ...column, title: 'Done' } } });

    await expect(columnsService.renameColumn('b1', 'c1', { title: 'Done' })).resolves.toMatchObject({
      title: 'Done',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/boards/b1/columns/c1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ title: 'Done' });
  });

  it('deleteColumn resolves without content on 204', async () => {
    const fetchMock = mockFetch(null, 204);

    await expect(columnsService.deleteColumn('b1', 'c1')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/boards/b1/columns/c1');
    expect(init.method).toBe('DELETE');
  });

  it('propagates API errors as ApiClientError', async () => {
    mockFetch({ error: { code: 'NOT_FOUND', message: 'Column not found' } }, 404);

    await expect(columnsService.renameColumn('b1', 'missing', { title: 'X' })).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Column not found',
    });
  });
});
