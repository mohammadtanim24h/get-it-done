import { afterEach, describe, expect, it, vi } from 'vitest';
import { tasksService } from './tasks';

const task = {
  id: 't1',
  title: 'Write docs',
  description: '',
  position: 0,
  columnId: 'c1',
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

describe('tasksService', () => {
  it('listTasks unwraps the tasks envelope', async () => {
    const fetchMock = mockFetch({ data: { tasks: [task] } });

    await expect(tasksService.listTasks('c1')).resolves.toEqual([task]);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/columns/c1/tasks');
  });

  it('createTask posts title and optional description', async () => {
    const fetchMock = mockFetch({ data: { task } }, 201);

    await expect(
      tasksService.createTask('c1', { title: 'Write docs', description: ' API docs' }),
    ).resolves.toEqual(task);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/columns/c1/tasks');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      title: 'Write docs',
      description: ' API docs',
    });
  });

  it('updateTask patches title and description', async () => {
    const fetchMock = mockFetch({ data: { task: { ...task, title: 'New' } } });

    await expect(
      tasksService.updateTask('t1', { title: 'New', description: 'Updated' }),
    ).resolves.toMatchObject({ title: 'New' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/tasks/t1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ title: 'New', description: 'Updated' });
  });

  it('deleteTask resolves without content on 204', async () => {
    const fetchMock = mockFetch(null, 204);

    await expect(tasksService.deleteTask('t1')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/tasks/t1');
    expect(init.method).toBe('DELETE');
  });

  it('propagates API errors as ApiClientError', async () => {
    mockFetch({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);

    await expect(tasksService.deleteTask('missing')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Task not found',
    });
  });
});
