import { run } from '@openai/agents';
import { simpleEmailAgent } from './simple-email-agent';
import { EmailThread, ThreadAnalysis } from '@/types';

export async function analyzeEmailThreadWithAgent({
  thread,
  emails,
  latestEmail,
  userId,
}: {
  thread: EmailThread;
  emails: any[];
  latestEmail: any;
  userId: string;
}): Promise<ThreadAnalysis> {
  try {
    // Build thread context for the agent
    const threadContext = emails
      .map(
        (email) =>
          `From: ${email.from?.emailAddress?.address || email.from_email}
Date: ${email.sentDateTime || email.sent_date}
Subject: ${email.subject}
Body: ${(email.body?.content || email.body)?.substring(0, 1000)}...
---`
      )
      .join('\n\n');

    // Extract participants and key information
    const participants = thread.participants || [];
    const subject = thread.subject || '';
    const latestSender = latestEmail.from?.emailAddress?.address || latestEmail.from_email;

    // Run the agent analysis
    const response = await run(simpleEmailAgent, `Analyze this email thread and provide a comprehensive analysis:

THREAD DETAILS:
- Subject: ${subject}
- Participants: ${participants.join(', ')}
- Latest sender: ${latestSender}
- Total messages: ${emails.length}
- Thread ID: ${thread.id}
- User ID: ${userId}

THREAD HISTORY:
${threadContext}

ANALYSIS TASKS:
1. Analyze the thread context provided above
2. Consider the participants and their relationships to Mission Mutual
3. Look for project references, financial implications, or decision points
4. Assess priority based on sender importance and content urgency

Based on your analysis, determine:
- Category: ACTION_REQUIRED, FYI_ONLY, FINANCIAL, MEETING_REQUEST, or VIP_CRITICAL
- Priority: 1-5 (5 being highest)
- Whether it requires a response
- If there are any tasks/commitments mentioned
- If it's from a VIP (board member, major donor, key partner)
- A suggested response approach if action is required

Provide your analysis in JSON format with the following structure:
{
  "requires_action": boolean,
  "has_task": boolean,
  "is_vip": boolean,
  "category": string,
  "priority": number,
  "suggested_response": string,
  "tasks": array,
  "context_summary": string,
  "project_references": array,
  "relationship_insights": string,
  "confidence": number
}`);

    // Parse the agent's response
    const analysis = parseAgentAnalysis(response.finalOutput || '');

    return {
      requiresAction: analysis.requires_action || false,
      hasTask: analysis.has_task || false,
      isVIP: analysis.is_vip || false,
      category: analysis.category || 'FYI_ONLY',
      priority: analysis.priority || 3,
      suggestedResponse: analysis.suggested_response,
      extractedTasks: analysis.tasks || [],
      contextSummary: analysis.context_summary,
      projectReferences: analysis.project_references || [],
      relationshipInsights: analysis.relationship_insights,
      confidence: analysis.confidence || 0.7,
    };
  } catch (error) {
    console.error('Agent email analysis error:', error);
    
    // Fallback to basic analysis
    return {
      requiresAction: false,
      hasTask: false,
      isVIP: false,
      category: 'FYI_ONLY',
      priority: 3,
      suggestedResponse: 'Error occurred during analysis',
      extractedTasks: [],
      contextSummary: 'Analysis failed - using fallback',
      confidence: 0.3,
    };
  }
}

function parseAgentAnalysis(content: string): any {
  try {
    // Look for JSON in the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // If no JSON found, try to extract structured information
    return {
      requires_action: content.toLowerCase().includes('action') || content.toLowerCase().includes('response'),
      has_task: content.toLowerCase().includes('task') || content.toLowerCase().includes('commitment'),
      is_vip: content.toLowerCase().includes('vip') || content.toLowerCase().includes('board'),
      category: extractCategory(content),
      priority: extractPriority(content),
      suggested_response: extractSuggestedResponse(content),
      context_summary: content.substring(0, 200),
      confidence: 0.6,
    };
  } catch (error) {
    console.error('Error parsing agent analysis:', error);
    return {
      requires_action: false,
      has_task: false,
      is_vip: false,
      category: 'FYI_ONLY',
      priority: 3,
      confidence: 0.3,
    };
  }
}

function extractCategory(content: string): string {
  const categories = ['ACTION_REQUIRED', 'FYI_ONLY', 'FINANCIAL', 'MEETING_REQUEST', 'VIP_CRITICAL'];
  for (const category of categories) {
    if (content.toUpperCase().includes(category)) {
      return category;
    }
  }
  return 'FYI_ONLY';
}

function extractPriority(content: string): number {
  const priorityMatch = content.match(/priority[:\s]*(\d)/i);
  if (priorityMatch) {
    return parseInt(priorityMatch[1]);
  }
  return 3;
}

function extractSuggestedResponse(content: string): string {
  const responseMatch = content.match(/suggested[^:]*:([^}]*)/i);
  if (responseMatch) {
    return responseMatch[1].trim();
  }
  return '';
}

// Enhanced analysis with organizational context
export async function analyzeWithOrganizationalContext({
  thread,
  emails,
  latestEmail,
  userId,
}: {
  thread: EmailThread;
  emails: any[];
  latestEmail: any;
  userId: string;
}): Promise<ThreadAnalysis & { 
  organizationalContext: any;
  projectContext: any;
  relationshipContext: any;
}> {
  const basicAnalysis = await analyzeEmailThreadWithAgent({
    thread,
    emails,
    latestEmail,
    userId,
  });

  // Get additional context through direct tool calls
  try {
    const participants = thread.participants || [];
    const subject = thread.subject || '';

    // Search for project context
    const projectResponse = await run(simpleEmailAgent, `Search for project context related to: ${subject}`);

    // Search for relationship history
    const relationshipResponse = await run(simpleEmailAgent, `Search relationship history for contacts: ${participants.join(', ')}`);

    return {
      ...basicAnalysis,
      organizationalContext: {
        hasProjectContext: true,
        hasRelationshipData: true,
      },
      projectContext: extractProjectContext(projectResponse.finalOutput || ''),
      relationshipContext: extractRelationshipContext(relationshipResponse.finalOutput || ''),
    };
  } catch (error) {
    console.error('Error getting organizational context:', error);
    return {
      ...basicAnalysis,
      organizationalContext: { hasProjectContext: false, hasRelationshipData: false },
      projectContext: null,
      relationshipContext: null,
    };
  }
}

function extractProjectContext(content: string): any {
  if (content) {
    try {
      const projectMatch = content.match(/project[^:]*:([^}]*)/i);
      return projectMatch ? { summary: projectMatch[1].trim() } : null;
    } catch {
      return null;
    }
  }
  return null;
}

function extractRelationshipContext(content: string): any {
  if (content) {
    try {
      const relationshipMatch = content.match(/relationship[^:]*:([^}]*)/i);
      return relationshipMatch ? { summary: relationshipMatch[1].trim() } : null;
    } catch {
      return null;
    }
  }
  return null;
}