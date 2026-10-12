// MUST be the first import — every other imported file (routes,
// controllers, utils/sendEmail.js) reads process.env values, so .env
// has to be loaded into memory before any of them are pulled in.
// 'dotenv/config' loads it automatically as a side effect on import.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import ownerRoutes from './routes/ownerRoutes.js';
import clientRoutes from './routes/clientRoutes.js';
import leadRoutes from './routes/leadRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import profileRoutes from './routes/profileRoutes.js';

connectDB();

const app = express();

// Render/Vercel sit behind a proxy — without this every request looks like it comes from the proxy's IP
// (that would make the IP shown in the audit log and sign-in emails useless)
app.set('trust proxy', 1);

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Codexora Portal API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/profile', profileRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
