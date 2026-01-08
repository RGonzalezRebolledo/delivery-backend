export const pgdb = {
// Si no existe, usa los de desarrollo
DB_USER: process.env.DB_USER || 'postgres',
DB_PASSWORD: process.env.DB_PASSWORD || '1234',
DB_HOST: process.env.DB_HOST || 'localhost',
DB_DATABASE: process.env.DB_DATABASE || 'delivery',
DB_PORT: process.env.DB_PORT || 5432,

// Estas sí son necesarias siempre
JWT_SECRET: process.env.JWT_SECRET || 'palabrasecreta'
}