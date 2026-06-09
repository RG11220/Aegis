import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes';
import chatRoutes from './routes/chatRoutes';
import messageRoutes from './routes/messageRoutes';
import userRoutes from './routes/userRoutes';
import { clerkMiddleware } from '@clerk/express'
import { errorHandler } from './middleware/errorHandler';
import path from 'path';

const app = express();

const DEV_ORIGINS = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
  /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // mobile or curl
    const allowed =
      process.env.NODE_ENV === 'production'
        ? origin === process.env.ALLOWED_ORIGIN
        : DEV_ORIGINS.some(r => r.test(origin));
    cb(allowed ? null : new Error(`CORS: ${origin} not allowed`), allowed);
  },
  credentials: true,
}));

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