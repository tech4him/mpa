import { Agent, tool } from '@openai/agents';
import { VectorStoreService } from '@/lib/vector-store/service';
// import { 
//   searchProjectContext, 
//   searchRelationshipHistory, 
//   verifyOrganizationalFacts, 
//   getEmailThreadContext, 
//   updateOrganizationalMemory 
// } from './tools/organizational-tools';

// Initialize vector store service
const vectorStoreService = new VectorStoreService();

// Enhanced email agent with organizational context tools
export const simpleEmailAgent = new Agent({
  name: 'MPA Email Assistant',
  model: 'gpt-4o',
  instructions: `You are an intelligent email assistant for Mission Mutual, a nonprofit organization focused on partnering for collective impact.

Your primary responsibilities:
1. Analyze email threads with organizational context awareness
2. Generate contextually appropriate responses based on company knowledge
3. Maintain awareness of ongoing projects and relationships
4. Adapt communication style based on recipient relationships
5. Use available tools to gather context and verify information

Key principles:
- Always use available tools to gather context before making decisions
- Maintain Mission Mutual's professional values focused on collective impact
- Be concise but thorough in analysis and responses
- Consider the full thread context, not just the latest message
- Generate responses that demonstrate organizational awareness
- Focus on collaboration and partnership opportunities

Available tools and when to use them:
- searchProjectContext: When emails mention projects, initiatives, or need project background
- searchRelationshipHistory: When analyzing communication patterns or understanding participant relationships
- verifyOrganizationalFacts: When claims need to be verified against organizational knowledge
- getEmailThreadContext: When you need comprehensive thread history and context
- updateOrganizationalMemory: When processing significant decisions, projects, or relationship insights

When analyzing emails:
1. Use getEmailThreadContext to understand the full conversation
2. Use searchRelationshipHistory to understand participant dynamics
3. Use searchProjectContext if project-related content is mentioned
4. Use verifyOrganizationalFacts for any claims that need verification
5. Consider priority based on sender importance and content urgency
6. Provide specific, actionable insights
7. Use updateOrganizationalMemory to store significant insights

Always explain your reasoning and cite the tools you used to gather context.`,
  tools: [
    // Custom organizational tools - temporarily disabled for build
    // searchProjectContext,
    // searchRelationshipHistory,
    // verifyOrganizationalFacts,
    // getEmailThreadContext,
    // updateOrganizationalMemory
  ]
});

// Basic analysis function using the simple agent
export async function analyzeEmailBasic(emailContent: string, threadContext: string) {
  // This will be implemented once the agent API is working correctly
  return {
    category: 'FYI_ONLY',
    priority: 3,
    requiresAction: false,
    hasTask: false,
    isVIP: false,
    confidence: 0.7,
  };
}

// Enhanced analysis function for autonomous agent
export async function analyzeEmailWithAgent(emailContent: string, threadContext: string) {
  // Simple rule-based analysis for now
  let category = 'FYI_ONLY'
  let priority = 3
  let requiresAction = false
  let confidence = 0.8

  // Check for spam/marketing
  if (emailContent.toLowerCase().includes('unsubscribe') || 
      emailContent.toLowerCase().includes('marketing') ||
      emailContent.toLowerCase().includes('promotion')) {
    category = 'MARKETING'
    priority = 5
    confidence = 0.9
  }

  // Check for admin/routine
  if (emailContent.toLowerCase().includes('confirm') || 
      emailContent.toLowerCase().includes('verification') ||
      emailContent.toLowerCase().includes('account')) {
    category = 'ROUTINE_ADMIN'
    priority = 4
    confidence = 0.85
  }

  // Check for action required
  if (emailContent.toLowerCase().includes('approval') || 
      emailContent.toLowerCase().includes('urgent') ||
      emailContent.toLowerCase().includes('action required')) {
    category = 'ACTION_REQUIRED'
    requiresAction = true
    priority = 2
    confidence = 0.9
  }

  // Check for VIP
  if (emailContent.toLowerCase().includes('ceo') || 
      emailContent.toLowerCase().includes('urgent') ||
      threadContext.toLowerCase().includes('vip')) {
    category = 'VIP_CRITICAL'
    requiresAction = true
    priority = 1
    confidence = 0.95
  }

  return {
    category,
    priority,
    requiresAction,
    hasTask: requiresAction,
    isVIP: category === 'VIP_CRITICAL',
    confidence,
  }
}