#!/usr/bin/env npx tsx

/**
 * Test script for the Agent System
 * This demonstrates how the autonomous agents work
 */

import { createClient } from '@supabase/supabase-js'
import { AgentOrchestrator } from '../src/lib/agents/core/agent-orchestrator'

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testAgentSystem() {
  console.log('🤖 Testing Agent System')
  console.log('========================')

  try {
    // Get the first user for testing
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .limit(1)

    if (!users || users.length === 0) {
      console.log('❌ No users found in database')
      return
    }

    const userId = users[0].id
    console.log(`✅ Using user ID: ${userId}`)

    // Create orchestrator
    console.log('\n🎯 Initializing Agent Orchestrator...')
    const orchestrator = new AgentOrchestrator({ userId, autoStart: false })
    await orchestrator.initialize()

    // Get agent statuses
    console.log('\n📊 Agent Status:')
    const statuses = orchestrator.getAgentStatuses()
    for (const [id, status] of Object.entries(statuses)) {
      console.log(`  • ${status.name}: ${status.status}`)
      console.log(`    Autonomy: ${status.config.autonomyLevel}`)
      console.log(`    Metrics: ${status.metrics.processed} processed, ${status.metrics.succeeded} succeeded`)
    }

    // Start all agents
    console.log('\n🚀 Starting all agents...')
    await orchestrator.startAll()

    // Wait a bit and check status
    await new Promise(resolve => setTimeout(resolve, 3000))

    console.log('\n📈 Updated Agent Status:')
    const updatedStatuses = orchestrator.getAgentStatuses()
    for (const [id, status] of Object.entries(updatedStatuses)) {
      console.log(`  • ${status.name}: ${status.status}`)
      if (status.startedAt) {
        console.log(`    Started: ${new Date(status.startedAt).toLocaleTimeString()}`)
      }
    }

    // Check for unprocessed emails
    console.log('\n📧 Checking for unprocessed emails...')
    const { data: threads, count } = await supabase
      .from('email_threads')
      .select('id, subject, from_email, is_processed', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_processed', false)
      .limit(5)

    console.log(`Found ${count} unprocessed emails`)
    if (threads && threads.length > 0) {
      threads.forEach(thread => {
        console.log(`  • ${thread.subject} (from: ${thread.from_email})`)
      })
    }

    // Check approval queue
    console.log('\n⏳ Checking approval queue...')
    const approvals = await orchestrator.getApprovalQueue()
    console.log(`Found ${approvals.length} items requiring approval`)
    
    if (approvals.length > 0) {
      approvals.forEach(approval => {
        console.log(`  • ${approval.item_type}: ${approval.decision.action} (confidence: ${Math.round(approval.decision.confidence * 100)}%)`)
        console.log(`    Reason: ${approval.decision.reasoning}`)
      })
    }

    // Let agents run for a bit
    console.log('\n⏰ Letting agents run for 30 seconds...')
    await new Promise(resolve => setTimeout(resolve, 30000))

    // Check final metrics
    console.log('\n📊 Final Metrics:')
    const finalStatuses = orchestrator.getAgentStatuses()
    for (const [id, status] of Object.entries(finalStatuses)) {
      console.log(`  • ${status.name}:`)
      console.log(`    Processed: ${status.metrics.processed}`)
      console.log(`    Succeeded: ${status.metrics.succeeded}`)
      console.log(`    Failed: ${status.metrics.failed}`)
      console.log(`    Pending: ${status.metrics.pending}`)
    }

    // Stop all agents
    console.log('\n🛑 Stopping all agents...')
    await orchestrator.stopAll()

    console.log('\n✅ Agent system test completed successfully!')

  } catch (error) {
    console.error('❌ Error testing agent system:', error)
  }
}

async function createTestData() {
  console.log('📝 Creating test data...')
  
  try {
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .limit(1)

    if (!users || users.length === 0) {
      console.log('❌ No users found')
      return
    }

    const userId = users[0].id

    // Create test email threads
    const testEmails = [
      {
        user_id: userId,
        thread_id: `test-thread-1-${Date.now()}`,
        subject: 'Routine Admin: Account Confirmation',
        from_email: 'admin@example.com',
        category: 'ROUTINE_ADMIN',
        is_processed: false,
        has_unread: true,
        latest_message_preview: 'Please confirm your account details...'
      },
      {
        user_id: userId,
        thread_id: `test-thread-2-${Date.now()}`,
        subject: 'Marketing: Special Offer Inside!',
        from_email: 'marketing@company.com',
        category: 'MARKETING',
        is_processed: false,
        has_unread: true,
        latest_message_preview: 'Don\'t miss our amazing deal...'
      },
      {
        user_id: userId,
        thread_id: `test-thread-3-${Date.now()}`,
        subject: 'FYI: Weekly Report',
        from_email: 'reports@company.com',
        category: 'FYI_ONLY',
        is_processed: false,
        has_unread: true,
        latest_message_preview: 'Here is your weekly summary...'
      }
    ]

    const { error } = await supabase
      .from('email_threads')
      .insert(testEmails)

    if (error) {
      console.error('Error creating test emails:', error)
    } else {
      console.log(`✅ Created ${testEmails.length} test emails`)
    }

  } catch (error) {
    console.error('❌ Error creating test data:', error)
  }
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.includes('--create-test-data')) {
    await createTestData()
  }
  
  await testAgentSystem()
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error)
}