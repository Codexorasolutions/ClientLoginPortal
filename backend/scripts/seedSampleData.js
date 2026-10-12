// Dev-only helper. Owner UI for creating projects/invoices doesn't exist
// until Module 7 — this seeds a sample project + invoice for the first
// approved client, so the Client Dashboard has real data to display now.
//
// Run from the backend folder:   node scripts/seedSampleData.js
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Invoice from '../models/Invoice.js';

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const client = await User.findOne({ role: 'client', approvalStatus: 'approved' });
  if (!client) {
    console.log('No approved client found yet. Sign up + verify + approve a client first (Modules 2-4), then re-run this.');
    process.exit(0);
  }

  let project = await Project.findOne({ client: client._id });
  if (!project) {
    project = await Project.create({
      client: client._id,
      name: `${client.businessName || client.fullName} — Website`,
      planLabel: `${client.businessType} Website — Standard`,
      stage: 'development',
      nextMilestoneLabel: 'Homepage preview',
      nextMilestoneDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    console.log(`Created sample project for ${client.email}`);
  } else {
    console.log(`Project already exists for ${client.email}`);
  }

  const invoiceCount = await Invoice.countDocuments({ client: client._id });
  if (invoiceCount === 0) {
    await Invoice.create({
      client: client._id,
      description: 'Website development — milestone 2',
      amount: 8000,
      status: 'due',
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });
    console.log(`Created sample invoice for ${client.email}`);
  }

  console.log(`\nLog in as ${client.email} to see this data on the Client Dashboard.`);
  process.exit(0);
};

run();
