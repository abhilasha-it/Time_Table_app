const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
const isPostgres = dbUrl.startsWith('postgres') || dbUrl.startsWith('mysql');

module.exports = {
  schema: isPostgres ? './prisma/schema.prisma' : './prisma/schema.sqlite.prisma',
  datasource: {
    url: dbUrl,
  },
};
