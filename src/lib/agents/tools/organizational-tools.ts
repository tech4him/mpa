import { tool } from '@openai/agents'
import { 
  searchProjectContext as searchProjectContextImpl,
  searchRelationshipHistory as searchRelationshipHistoryImpl,
  verifyOrganizationalFacts as verifyOrganizationalFactsImpl,
  getEmailThreadContext as getEmailThreadContextImpl,
  updateOrganizationalMemory as updateOrganizationalMemoryImpl
} from './organizational-functions'

// Export the functions for direct use
export { 
  searchProjectContextImpl as searchProjectContext,
  searchRelationshipHistoryImpl as searchRelationshipHistory,
  verifyOrganizationalFactsImpl as verifyOrganizationalFacts,
  getEmailThreadContextImpl as getEmailThreadContext,
  updateOrganizationalMemoryImpl as updateOrganizationalMemory
}

// Tool wrappers for OpenAI Agents framework
export const searchProjectContextTool = tool({
  name: 'searchProjectContext',
  description: 'Search for project-related context and information from the organizational knowledge base',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for project context, can include project names and participant emails'
      }
    },
    required: ['query'],
    additionalProperties: false
  }
}, searchProjectContextImpl)

export const searchRelationshipHistoryTool = tool({
  name: 'searchRelationshipHistory',
  description: 'Search for interaction history and communication patterns with specific contacts',
  parameters: {
    type: 'object',
    properties: {
      contacts: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of contact emails to search for'
      },
      timeframe: {
        type: 'string',
        description: 'Time period for history search (e.g., "last_30_days", "last_6_months")',
        enum: ['last_7_days', 'last_30_days', 'last_3_months', 'last_6_months', 'last_year'],
        default: 'last_6_months'
      }
    },
    required: ['contacts', 'timeframe'],
    additionalProperties: false
  }
}, async ({ contacts, timeframe = 'last_6_months' }) => {
  return await searchRelationshipHistoryImpl({ contacts, timeframe })
})

export const verifyOrganizationalFactsTool = tool({
  name: 'verifyOrganizationalFacts',
  description: 'Verify claims or facts against the organizational knowledge base',
  parameters: {
    type: 'object',
    properties: {
      claims: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of claims or facts to verify'
      },
      context: {
        type: 'string',
        description: 'Additional context for verification',
        default: ''
      }
    },
    required: ['claims', 'context'],
    additionalProperties: false
  }
}, async ({ claims, context = '' }) => {
  return await verifyOrganizationalFactsImpl({ claims, context })
})

export const getEmailThreadContextTool = tool({
  name: 'getEmailThreadContext',
  description: 'Get comprehensive context for an email thread including history, participants, and related information',
  parameters: {
    type: 'object',
    properties: {
      threadId: {
        type: 'string',
        description: 'The ID of the email thread'
      },
      includeHistory: {
        type: 'boolean',
        description: 'Whether to include full message history',
        default: true
      }
    },
    required: ['threadId', 'includeHistory'],
    additionalProperties: false
  }
}, async ({ threadId, includeHistory = true }) => {
  return await getEmailThreadContextImpl({ threadId, includeHistory })
})

export const updateOrganizationalMemoryTool = tool({
  name: 'updateOrganizationalMemory',
  description: 'Update the organizational knowledge base with new information from email interactions',
  parameters: {
    type: 'object',
    properties: {
      documentType: {
        type: 'string',
        description: 'Type of document to store',
        enum: ['email', 'decision', 'project', 'meeting', 'relationship', 'briefing']
      },
      content: {
        type: 'string',
        description: 'Content to store in the knowledge base'
      },
      source: {
        type: 'string',
        description: 'Source of the information',
        default: 'email_interaction'
      },
      priority: {
        type: 'number',
        description: 'Priority level (1-5)',
        default: 3
      },
      significance: {
        type: 'number',
        description: 'Significance score (0-1) for this information',
        minimum: 0,
        maximum: 1,
        default: 0.5
      }
    },
    required: ['documentType', 'content', 'source', 'priority', 'significance'],
    additionalProperties: false
  }
}, ({ documentType, content, source = 'email_interaction', priority = 3, significance = 0.5 }) => {
  // Adapt the call to the implementation function
  return updateOrganizationalMemoryImpl({
    documentType,
    content,
    metadata: {
      source,
      priority,
      tags: [],
      project_name: '',
      participants: []
    },
    significance
  })
})