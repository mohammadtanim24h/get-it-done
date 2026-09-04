import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardsService } from './boards';

const board = {
  id: 'b1',
  title: 'Roadmap',
  ownerId: 'u1',
  role: 'owner' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const member = {
  userId: 'u2',
  name: 'Grace',
  email: 'grace@example.com',
  addedAt: '2026-01-03T00:00:00.000Z',
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

describe('boardsService', () => {
  it('listBoards unwraps the boards envelope', async () => {
    const fetchMock = mockFetch({ data: { boards: [board] } });

    await expect(boardsService.listBoards()).resolves.toEqual([board]);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/boards');
  });

  it('createBoard posts the title and returns the board', async () => {
    const fetchMock = mockFetch({ data: { board } }, 201);

    await expect(boardsService.createBoard({ title: 'Roadmap' })).resolves.toEqual(board);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/boards');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ title: 'Roadmap' });
  });

  it('getBoard returns the detail including members', async () => {
    mockFetch({ data: { board: { ...board, members: [member] } } });

    await expect(boardsService.getBoard('b1')).resolves.toMatchObject({
      id: 'b1',
      members: [member],
    });
  });

  it('renameBoard patches the title', async () => {
    const fetchMock = mockFetch({ data: { board } });

    await expect(boardsService.renameBoard('b1', { title: 'New title' })).resolves.toEqual(board);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/boards/b1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ title: 'New title' });
  });

  it('deleteBoard resolves without content on 204', async () => {
    const fetchMock = mockFetch(null, 204);

    await expect(boardsService.deleteBoard('b1')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/boards/b1');
    expect(init.method).toBe('DELETE');
  });

  it('addBoardMember posts the email and returns the member', async () => {
    const fetchMock = mockFetch({ data: { member } }, 201);

    await expect(
      boardsService.addBoardMember('b1', { email: 'grace@example.com' }),
    ).resolves.toEqual(member);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/boards/b1/members');
  });

  it('removeBoardMember deletes the member', async () => {
    const fetchMock = mockFetch(null, 204);

    await expect(boardsService.removeBoardMember('b1', 'u2')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/boards/b1/members/u2');
    expect(init.method).toBe('DELETE');
  });

  it('propagates API errors as ApiClientError', async () => {
    mockFetch({ error: { code: 'NOT_FOUND', message: 'Board not found' } }, 404);

    await expect(boardsService.getBoard('missing')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Board not found',
    });
  });
});
