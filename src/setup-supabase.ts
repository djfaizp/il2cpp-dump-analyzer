import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

/**
 * Set up Supabase for vector storage
 */
async function setupSupabase() {
  console.log('Setting up Supabase for vector storage...');

  // Check if Supabase configuration is available
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const supabaseTable = process.env.SUPABASE_TABLE || 'il2cpp_documents';

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_KEY in .env file.');
    process.exit(1);
  }

  try {
    // Initialize Supabase client
    console.log('Initializing Supabase client...');
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    // Read the SQL setup file
    const sqlFilePath = path.resolve(process.cwd(), 'supabase-setup.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

    // Check if the table exists
    console.log(`Checking if table '${supabaseTable}' exists...`);
    const { error: tableError } = await supabaseClient
      .from(supabaseTable)
      .select('id')
      .limit(1);

    if (tableError) {
      console.log(`Table '${supabaseTable}' does not exist or is not accessible.`);
      console.log('Please run the following SQL commands in your Supabase SQL Editor:');
      console.log('\n' + sqlContent);
    } else {
      console.log(`Table '${supabaseTable}' already exists.`);
    }

    console.log('\nSetup instructions:');
    console.log('1. Go to your Supabase project dashboard');
    console.log('2. Navigate to the SQL Editor');
    console.log('3. Copy and paste the SQL commands from supabase-setup.sql');
    console.log('4. Run the commands to set up the vector store');
    console.log('\nOnce the setup is complete, you can use the IL2CPP Dump Analyzer with Supabase vector storage.');

  } catch (error) {
    console.error('Supabase setup failed:', error);
    process.exit(1);
  }
}

// Run the setup
setupSupabase();
