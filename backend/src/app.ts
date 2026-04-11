import express from 'express';
import authRoutes from './routes/authRoutes';
import chatRoutes from './routes/chatRoutes';
import messageRoutes from './routes/messageRoutes';
import userRoutes from './routes/userRoutes';
import { clerkMiddleware } from '@clerk/express'
import { errorHandler } from './middleware/errorHandler';
import path from 'path';

const app = express();

app.use(express.json());

app.use(clerkMiddleware())

app.get("/health", (req, res) => {
    res.json({ status: "ok", Message: "Aegis Backend is running smoothly!"});})

app.use("/api/auth", authRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/users", userRoutes);


app.use(errorHandler);

if(process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../../frontend/dist')));
    app.get("/{*any}", (_, res) => {
        res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
    });
}


export default app;