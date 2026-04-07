import mysql, { type Pool } from 'mysql2/promise';
import mongoose from 'mongoose';


const pool : Pool = mysql.createPool({
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

export const connectMongoDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI as string);
        console.log("MongoDB connected successfully");
    } catch (error) {
        console.error("MongoDB connection error:", error);
        process.exit(1);
    }
};

export default pool;