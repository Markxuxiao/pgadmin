import dotenv from 'dotenv';
dotenv.config();
const config = {
    development: {
        client: 'pg',
        connection: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pgadmin',
        migrations: {
            directory: './db/migrations',
            extension: 'sql'
        },
        seeds: {
            directory: './db/seeds'
        },
        pool: {
            min: 2,
            max: 10
        }
    },
    test: {
        client: 'pg',
        connection: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pgadmin_test',
        migrations: {
            directory: './db/migrations',
            extension: 'sql'
        },
        pool: {
            min: 1,
            max: 5
        }
    },
    production: {
        client: 'pg',
        connection: process.env.DATABASE_URL,
        migrations: {
            directory: './db/migrations',
            extension: 'sql'
        },
        pool: {
            min: 2,
            max: 20
        }
    }
};
export default config;
//# sourceMappingURL=knexfile.js.map