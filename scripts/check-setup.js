#!/usr/bin/env node

/**
 * Check setup script for MPA Email Assistant
 */

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

console.log('🔍 Checking MPA Email Assistant Setup...\n');

// Check required environment variables
const requiredVars = {
  'OPENAI_API_KEY': process.env.OPENAI_API_KEY,
  'OPENAI_ORG_ID': process.env.OPENAI_ORG_ID,
  'OPENAI_VECTOR_STORE_ID': process.env.OPENAI_VECTOR_STORE_ID,
  'MICROSOFT_CLIENT_ID': process.env.MICROSOFT_CLIENT_ID,
  'MICROSOFT_CLIENT_SECRET': process.env.MICROSOFT_CLIENT_SECRET,
  'NEXT_PUBLIC_SUPABASE_URL': process.env.NEXT_PUBLIC_SUPABASE_URL,
  'NEXT_PUBLIC_SUPABASE_ANON_KEY': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

let allSet = true;

console.log('📋 Environment Variables:');
for (const [key, value] of Object.entries(requiredVars)) {
  if (value) {
    console.log(`✅ ${key}: ${value.substring(0, 10)}...`);
  } else {
    console.log(`❌ ${key}: Not set`);
    allSet = false;
  }
}

console.log('\n📊 Setup Status:');
if (allSet) {
  console.log('✅ All environment variables are configured!');
  console.log('✅ Vector Store ID:', process.env.OPENAI_VECTOR_STORE_ID);
  
  console.log('\n🚀 You can now:');
  console.log('1. Start the development server: npm run dev');
  console.log('2. Test the agent API: curl http://localhost:3000/api/test-agent');
  console.log('3. Access the dashboard: http://localhost:3000/dashboard');
  
  console.log('\n📚 Vector Store Information:');
  console.log('Your vector store is already created with ID:', process.env.OPENAI_VECTOR_STORE_ID);
  console.log('To upload documents to your vector store:');
  console.log('1. Use the OpenAI dashboard: https://platform.openai.com/storage');
  console.log('2. Or use the OpenAI API to upload files programmatically');
} else {
  console.log('❌ Some environment variables are missing. Please check your .env.local file.');
}

console.log('\n📖 Documentation:');
console.log('- OpenAI Agents SDK: https://openai.github.io/openai-agents-js/');
console.log('- OpenAI Platform: https://platform.openai.com/');
console.log('- Supabase Dashboard: https://supabase.com/dashboard');