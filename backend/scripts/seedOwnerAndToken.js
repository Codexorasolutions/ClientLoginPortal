// Dev-only helper. Login isn't built until Module 5, so this creates
// (or reuses) a test owner account and prints a JWT you can paste into
// localStorage to test the owner dashboard right now.
//
// Run from the backend folder:   node scripts/seedOwnerAndToken.js
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import generateToken from '../utils/generateToken.js';

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  let owner = await User.findOne({ role: 'owner' });
  if (!owner) {
    owner = await User.create({
      role: 'owner',
      fullName: 'Amit Yadav',
      email: 'owner@codexora.test',
      password: 'owner1234',
      isEmailVerified: true,
      approvalStatus: 'approved',
    });
    console.log(`Created test owner: ${owner.email} / owner1234`);
  } else {
    console.log(`Using existing owner: ${owner.email}`);
  }

  const token = generateToken(owner);
  console.log('\nOpen your frontend (http://localhost:5173), open the browser console, and run:\n');
  console.log(`localStorage.setItem('cx_token', '${token}');`);
  console.log('\nThen visit http://localhost:5173/owner/dashboard\n');

  process.exit(0);
};

run();
