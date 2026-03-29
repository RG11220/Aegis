import app from './src/app';
import { connectDB, connectMongoDB } from './src/config/database';


const PORT = process.env.PORT || 3000;

await connectDB();
await connectMongoDB();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});