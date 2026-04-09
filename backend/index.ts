import app from './src/app';
import { connectDB, connectMongoDB } from './src/config/database';
import { createServer } from 'http';
import { initializeSocket } from './src/utils/socket';


const PORT = process.env.PORT || 3000;

const httpServer = createServer(app);

initializeSocket(httpServer);

await connectDB();
await connectMongoDB();

httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

