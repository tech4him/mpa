#!/usr/bin/env npx tsx

/**
 * Simple test to verify agent system is set up correctly
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:')
  console.error('  NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅' : '❌')
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌')
  process.exit(1)
}

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testSetup() {
  console.log('🔍 Testing Agent System Setup')
  console.log('==============================')

  try {
    // Test 1: Check agent_configs table
    console.log('\n📋 Test 1: Checking agent_configs table...')
    const { data: configs, error: configError } = await supabase
      .from('agent_configs')
      .select('*')
      .limit(5)

    if (configError) {
      console.error('❌ agent_configs table error:', configError)
      return
    }

    console.log(`✅ Found ${configs?.length || 0} agent configurations`)
    if (configs && configs.length > 0) {
      configs.forEach(config => {
        console.log(`  • ${config.agent_type}: ${config.autonomy_level}`)
      })
    }

    // Test 2: Check email threads for processing
    console.log('\n📧 Test 2: Checking test email threads...')
    const { data: threads, error: threadError } = await supabase
      .from('email_threads')
      .select('id, subject, category, is_processed')
      .eq('is_processed', false)
      .limit(10)

    if (threadError) {
      console.error('❌ email_threads table error:', threadError)
      return
    }

    console.log(`✅ Found ${threads?.length || 0} unprocessed email threads`)
    if (threads && threads.length > 0) {
      threads.forEach(thread => {
        console.log(`  • ${thread.subject} (${thread.category})`)
      })
    }

    // Test 3: Check email messages
    console.log('\n💌 Test 3: Checking email messages...')
    const { data: messages, error: messageError } = await supabase
      .from('email_messages')
      .select('id, subject, from_email, processed')
      .eq('processed', false)
      .limit(5)

    if (messageError) {
      console.error('❌ email_messages table error:', messageError)
      return
    }

    console.log(`✅ Found ${messages?.length || 0} unprocessed email messages`)
    if (messages && messages.length > 0) {
      messages.forEach(msg => {
        console.log(`  • ${msg.subject} (from: ${msg.from_email})`)
      })
    }

    // Test 4: Check agent tables exist
    console.log('\n🗄️  Test 4: Checking agent tables exist...')
    const tables = ['agent_actions', 'agent_events', 'agent_approvals', 'agent_metrics']
    
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('count(*)', { count: 'exact', head: true })

      if (error) {
        console.error(`❌ ${table} table error:`, error)
      } else {
        console.log(`✅ ${table} table exists`)
      }
    }

    // Test 5: Verify user exists
    console.log('\n👤 Test 5: Checking user exists...')
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .limit(1)

    if (userError) {
      console.error('❌ users table error:', userError)
      return
    }

    if (users && users.length > 0) {
      console.log(`✅ Found user: ${users[0].email}`)
      console.log(`   User ID: ${users[0].id}`)
    } else {
      console.log('⚠️  No users found - you may need to sign up first')
    }

    console.log('\n🎉 Agent system setup verification complete!')
    console.log('\n📝 Next steps:')
    console.log('  1. Start the development server: npm run dev')
    console.log('  2. Navigate to /dashboard and click the "Agents" tab')
    console.log('  3. Start the Email Agent to begin autonomous processing')

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

// Run the test
testSetup().catch(console.error)