/**
 * Test script for Executive Assistant Briefing
 * Run this to test the briefing generation locally
 */

const { ExecutiveAssistantBriefingGenerator } = require('../src/lib/ai/executive-assistant-briefing.ts')

async function testExecutiveBriefing() {
  console.log('Testing Executive Assistant Briefing...')
  
  // Use the same user ID from our sample data
  const userId = 'f4055b91-3971-4189-83cf-c8f4236ffb3c'
  
  try {
    const generator = new ExecutiveAssistantBriefingGenerator(userId)
    console.log('Generator created, generating briefing...')
    
    const briefing = await generator.generateExecutiveBriefing('morning')
    
    console.log('✅ Executive briefing generated successfully!')
    console.log('Priority Score:', briefing.priority_score)
    console.log('Key Actions:', briefing.key_actions_needed?.length || 0)
    
    if (briefing.intelligence_summary) {
      const summary = briefing.intelligence_summary
      console.log('\n📋 Brief Summary:')
      console.log('- Executive Summary:', summary.executive_summary)
      console.log('- Immediate Attention Items:', summary.immediate_attention?.length || 0)
      console.log('- Project Updates:', summary.project_status_updates?.length || 0)
      console.log('- Relationship Insights:', summary.relationship_insights?.length || 0)
      console.log('- Strategic Insights:', summary.strategic_insights?.length || 0)
    }
    
  } catch (error) {
    console.error('❌ Executive briefing test failed:', error)
    
    if (error.message?.includes('Invalid schema')) {
      console.log('\n🔧 This looks like a tool parameter schema issue.')
      console.log('The OpenAI function definitions need to match exactly.')
    }
  }
}

// Only run if called directly
if (require.main === module) {
  testExecutiveBriefing()
}

module.exports = { testExecutiveBriefing }