#!/usr/bin/env node

/**
 * Examine a specific thread for spam/phishing analysis
 */

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

async function examineThread(threadId) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    console.log(`🔍 Examining thread: ${threadId}\n`);

    const { data: thread } = await supabase
      .from('email_threads')
      .select('*')
      .eq('id', threadId)
      .single();

    if (!thread) {
      console.log('❌ Thread not found');
      return;
    }

    const { data: messages } = await supabase
      .from('email_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('sent_date', { ascending: true });

    console.log('📧 THREAD DETAILS:');
    console.log('Subject:', thread.subject);
    console.log('Category:', thread.category);
    console.log('Priority:', thread.priority);
    console.log('Participants:', thread.participants);
    console.log('Message Count:', thread.message_count);
    console.log('Has Unread:', thread.has_unread);
    console.log('Action Required:', thread.is_action_required);
    console.log('Last Message:', thread.last_message_date);
    console.log();

    console.log('📝 MESSAGES:');
    messages.forEach((msg, index) => {
      console.log(`--- Message ${index + 1} ---`);
      console.log('From:', msg.from_name, `<${msg.from_email}>`);
      console.log('To:', msg.to_recipients);
      console.log('Subject:', msg.subject);
      console.log('Date:', msg.sent_date);
      console.log('Content:', msg.body.substring(0, 500) + (msg.body.length > 500 ? '...' : ''));
      console.log();
    });

    // Basic spam/phishing indicators
    console.log('🚨 SECURITY ANALYSIS:');
    
    const indicators = [];
    
    // Check for suspicious patterns
    messages.forEach((msg, index) => {
      const content = msg.body.toLowerCase();
      const subject = msg.subject.toLowerCase();
      
      // Common spam indicators
      if (content.includes('urgent') || content.includes('act now') || content.includes('limited time')) {
        indicators.push(`Message ${index + 1}: Urgency language detected`);
      }
      
      if (content.includes('click here') || content.includes('verify account') || content.includes('update payment')) {
        indicators.push(`Message ${index + 1}: Phishing language detected`);
      }
      
      if (content.includes('lottery') || content.includes('winner') || content.includes('congratulations')) {
        indicators.push(`Message ${index + 1}: Lottery/prize scam language`);
      }
      
      if (content.includes('bitcoin') || content.includes('crypto') || content.includes('investment opportunity')) {
        indicators.push(`Message ${index + 1}: Investment scam language`);
      }
      
      // Check sender domain
      if (msg.from_email && !msg.from_email.includes('missionmutual.org')) {
        const domain = msg.from_email.split('@')[1];
        if (domain && (domain.includes('gmail') || domain.includes('yahoo') || domain.includes('outlook'))) {
          indicators.push(`Message ${index + 1}: External email service (${domain})`);
        }
      }
      
      // Check for suspicious URLs
      if (content.includes('http://') || content.includes('https://')) {
        indicators.push(`Message ${index + 1}: Contains URLs`);
      }
    });

    if (indicators.length > 0) {
      console.log('⚠️  Potential Issues Found:');
      indicators.forEach(indicator => console.log(`  - ${indicator}`));
    } else {
      console.log('✅ No obvious spam/phishing indicators found');
    }

  } catch (error) {
    console.error('❌ Error examining thread:', error);
  }
}

// Run with thread ID
const threadId = process.argv[2] || '204d9ca8-f562-4a27-b02d-64bf44b59d3d';
examineThread(threadId);