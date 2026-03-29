import mysql from 'mysql2/promise';

const pool = mysql.createPool({
    connectionLimit: 10,
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD, 
    database: process.env.SQL_DATABASE
});

export const connectDB = async () => {
    try {
        const connection = await pool.getConnection();
        console.log("MySQL connected successfully");
        connection.release(); 
    } catch (error) {
        console.error("❌ MySQL connection error:", error);
        process.exit(1); 
    }
};

export default pool;