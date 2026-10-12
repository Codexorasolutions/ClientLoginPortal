import mongoose from 'mongoose';
import dns from 'dns';

// Force Node to resolve DNS through Google's public DNS servers instead
// of whatever the OS/router provides. This is a code-level fix (no
// Windows network settings need to change) for a common issue where an
// ISP or router silently refuses the SRV-record lookups that
// `mongodb+srv://` connection strings require — you'll see
// "querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net" when this
// happens, even though normal internet browsing works completely fine.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`MongoDB connection error: ${err.message}`);

    if (err.message.includes('querySrv') || err.message.includes('ECONNREFUSED')) {
      console.error(
        '\nThis specific error usually means your network is blocking DNS SRV lookups.\n' +
        'A code-level fix (forcing Google DNS) is already applied above — if you still see\n' +
        'this, try switching your MONGO_URI to the non-SRV connection string from MongoDB\n' +
        'Atlas (Connect → Drivers → look for "mongodb://" with a comma-separated host list\n' +
        'instead of "mongodb+srv://"), which skips SRV lookups entirely.\n'
      );
    }

    process.exit(1);
  }
};

export default connectDB;
