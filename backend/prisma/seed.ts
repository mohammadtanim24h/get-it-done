import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/utils/password';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env and configure it.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env and configure it.');
  }

  // Reset data (FK order: tasks/columns/memberships before boards and users).
  await prisma.task.deleteMany();
  await prisma.column.deleteMany();
  await prisma.boardMember.deleteMany();
  await prisma.board.deleteMany();
  await prisma.user.deleteMany();

  const alice = await prisma.user.create({
    data: {
      name: 'Alice Owner',
      email: 'alice@example.com',
      passwordHash: await hashPassword('password123'),
    },
  });

  const bob = await prisma.user.create({
    data: {
      name: 'Bob Member',
      email: 'bob@example.com',
      passwordHash: await hashPassword('password123'),
    },
  });

  const board = await prisma.board.create({
    data: {
      title: 'Project Launch',
      ownerId: alice.id,
      members: {
        create: [{ userId: bob.id }],
      },
      // Positions are zero-based and contiguous within the board: 0, 1, 2.
      columns: {
        create: [
          { title: 'To Do', position: 0 },
          { title: 'In Progress', position: 1 },
          { title: 'Done', position: 2 },
        ],
      },
    },
    include: { columns: { orderBy: { position: 'asc' } } },
  });

  const [toDo, inProgress, done] = board.columns;

  // Positions are zero-based and contiguous within each column.
  await prisma.task.createMany({
    data: [
      { columnId: toDo.id, title: 'Draft project brief', description: 'Outline goals, scope, and success criteria.', position: 0 },
      { columnId: toDo.id, title: 'Set up repository', description: 'Initialize repo with backend and frontend apps.', position: 1 },
      { columnId: toDo.id, title: 'Plan launch checklist', description: '', position: 2 },
      { columnId: inProgress.id, title: 'Design database schema', description: 'Users, boards, columns, tasks with Prisma.', position: 0 },
      { columnId: done.id, title: 'Pick tech stack', description: 'Express + TypeScript + PostgreSQL + Prisma.', position: 0 },
    ],
  });

  console.log('Seed complete:');
  console.log(`  users: ${[alice.email, bob.email].join(', ')}`);
  console.log(`  board: "${board.title}" owned by ${alice.email}, shared with ${bob.email}`);
  console.log(`  columns: ${board.columns.map((column) => `${column.title}(${column.position})`).join(', ')}`);
  console.log('  tasks: 5 (3 in To Do, 1 in In Progress, 1 in Done)');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
