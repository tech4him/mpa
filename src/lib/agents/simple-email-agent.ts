import { Agent, tool } from '@openai/agents';
import { VectorStoreService } from '@/lib/vector-store/service';
import { agentLearningService, LearningContext } from './learning-service';
import { 
  searchProjectContextTool, 
  searchRelationshipHistoryTool, 
  verifyOrganizationalFactsTool, 
  getEmailThreadContextTool, 
  updateOrganizationalMemoryTool 
} from './tools/organizational-tools';

// Initialize vector store service lazily to avoid environment variable issues
// Note: The VectorStoreService is not used directly in this file, 
// but via the organizational tools which handle their own initialization

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
    // Custom organizational tools
    searchProjectContextTool,
    searchRelationshipHistoryTool,
    verifyOrganizationalFactsTool,
    getEmailThreadContextTool,
    updateOrganizationalMemoryTool
  ]
});

// Learning-enhanced decision tool
const makeDecisionWithLearning = tool({
  name: 'makeDecisionWithLearning',
  description: 'Make email processing decisions enhanced by past user feedback and learning',
  parameters: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'User ID for learning context' },
      agentId: { type: 'string', description: 'Agent ID for learning context' },
      emailFrom: { type: 'string', description: 'Email sender address' },
      emailSubject: { type: 'string', description: 'Email subject line' },
      emailCategory: { type: 'string', description: 'Detected email category' },
      emailPriority: { type: 'string', description: 'Email priority level' },
      proposedAction: { type: 'string', description: 'Proposed action to take' },
      confidence: { type: 'number', description: 'Initial confidence in decision (0-1)' },
      reasoning: { type: 'string', description: 'Reasoning for the decision' }
    },
    required: ['userId', 'agentId', 'proposedAction', 'confidence', 'reasoning']
  },
  async function({ userId, agentId, emailFrom, emailSubject, emailCategory, emailPriority, proposedAction, confidence, reasoning }) {
    try {
      const now = new Date()
      const context: LearningContext = {
        emailFrom,
        emailSubject,
        emailCategory,
        emailPriority,
        timeOfDay: now.getHours().toString(),
        dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' })
      }

      const suggestions = await agentLearningService.getActionSuggestions(
        userId,
        agentId,
        context,
        proposedAction,
        confidence
      )

      const result = {
        originalAction: proposedAction,
        originalConfidence: confidence,
        originalReasoning: reasoning,
        suggestedAction: suggestions.adjustedAction || proposedAction,
        adjustedConfidence: suggestions.adjustedConfidence,
        learningInsights: suggestions.learningInsights,
        warnings: suggestions.warnings,
        hasLearningData: suggestions.learningInsights.length > 0 || suggestions.warnings.length > 0
      }

      return JSON.stringify(result, null, 2)
    } catch (error) {
      console.error('Error in makeDecisionWithLearning:', error)
      return JSON.stringify({
        originalAction: proposedAction,
        originalConfidence: confidence,
        originalReasoning: reasoning,
        suggestedAction: proposedAction,
        adjustedConfidence: confidence,
        learningInsights: [],
        warnings: [],
        hasLearningData: false,
        error: 'Failed to apply learning'
      })
    }
  }
})

// Add the learning tool to the agent
export const learningEnhancedEmailAgent = new Agent({
  name: 'Learning-Enhanced Email Assistant',
  model: 'gpt-4o',
  instructions: `You are an intelligent email assistant that learns from user feedback to improve decision-making.

Your responsibilities:
1. Analyze emails with organizational context
2. Make decisions enhanced by past user feedback
3. Apply learning from previous corrections
4. Generate responses based on learned preferences

When processing emails:
1. First gather context using organizational tools
2. Make initial decision based on analysis
3. Use makeDecisionWithLearning to apply user feedback and learning
4. Present final recommendation with learning insights
5. Include confidence adjustments based on past performance

Always explain how learning influenced your decision and highlight any warnings from past feedback.`,
  
  tools: [
    searchProjectContextTool,
    searchRelationshipHistoryTool,
    verifyOrganizationalFactsTool,
    getEmailThreadContextTool,
    updateOrganizationalMemoryTool,
    makeDecisionWithLearning
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