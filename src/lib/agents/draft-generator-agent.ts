import { run } from '@openai/agents';
import { simpleEmailAgent } from './simple-email-agent';
import { createClient } from '@/lib/supabase/server';

interface DraftRequest {
  threadId: string;
  userId: string;
  draftType: 'reply' | 'forward' | 'new';
  context?: string;
  urgency?: 'low' | 'medium' | 'high';
  recipientRelationship?: 'internal' | 'external' | 'board' | 'donor' | 'vendor';
}

export async function generateDraftWithAgent(request: DraftRequest): Promise<{
  id: string;
  content: string;
  subject: string;
  confidence: number;
  reasoning: string;
  organizationalContext?: any;
}> {
  try {
    const supabase = await createClient();

    // Get user profile
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', request.userId)
      .single();

    if (!user) {
      throw new Error('User not found');
    }

    // Get recent user emails for style analysis
    const { data: userEmails } = await supabase
      .from('email_messages')
      .select('body, subject, from_email')
      .eq('user_id', request.userId)
      .order('sent_date', { ascending: false })
      .limit(10);

    // Get thread messages for context
    const { data: threadMessages } = await supabase
      .from('email_messages')
      .select('*')
      .eq('thread_id', request.threadId)
      .order('received_at', { ascending: true });

    // Get thread details
    const { data: threadData } = await supabase
      .from('email_threads')
      .select('*')
      .eq('id', request.threadId)
      .single();

    // Format thread context for AI
    const threadContext = threadMessages?.map(msg => ({
      sender: msg.from_email || msg.sender,
      subject: msg.subject,
      date: msg.received_at || msg.sent_date,
      body: msg.body
    })) || [];

    // Use agent to generate draft with full context
    const response = await run(simpleEmailAgent, `Generate a ${request.draftType} email draft with full organizational context:

USER PROFILE:
- Name: ${user.name}
- Email: ${user.email}
- Role: VP Business Operations
- Organization: Mission Mutual

DRAFT REQUIREMENTS:
- Type: ${request.draftType}
- Thread ID: ${request.threadId}
- User ID: ${request.userId}
- Urgency: ${request.urgency || 'medium'}
- Recipient Relationship: ${request.recipientRelationship || 'professional'}
- Additional Context: ${request.context || 'None provided'}

EMAIL THREAD CONTEXT:
Thread Subject: ${threadData?.subject || 'No subject'}
Thread Participants: ${threadData?.participants?.join(', ') || 'Unknown'}
Thread Category: ${threadData?.category || 'General'}
Thread Priority: ${threadData?.priority || 'Medium'}

THREAD MESSAGES (chronological order):
${threadContext.map((msg, idx) => `
Message ${idx + 1}:
From: ${msg.sender}
Subject: ${msg.subject || 'No subject'}
Date: ${msg.date}
Body: ${msg.body || 'No content'}
`).join('\n---\n')}

TASKS:
1. Analyze the email thread context provided above
2. Generate a response that matches the user's writing style and tone
3. Maintain Mission Mutual's professional values
4. Reference relevant information from the thread history
5. Ensure the response is contextually appropriate

RECENT USER EMAILS FOR STYLE ANALYSIS:
${userEmails?.map(email => `Subject: ${email.subject}\nBody: ${email.body?.substring(0, 300)}...`).join('\n\n---\n\n')}

Generate a draft that:
- Matches the user's writing style and tone
- References relevant project context
- Shows awareness of recipient relationships
- Maintains Mission Mutual's professional Christian values
- Addresses specific points from the thread
- Is concise but thorough

Provide your response in JSON format:
{
  "subject": "email subject line",
  "content": "email body content",
  "confidence": 0.0-1.0,
  "reasoning": "explanation of draft approach",
  "context_used": {
    "project_context": "relevant project info",
    "relationship_context": "recipient relationship info",
    "writing_style": "detected user style"
  }
}`);

    // Parse the agent's response
    const draftData = parseAgentDraft(response.finalOutput || '');

    // Store draft in database
    const { data: draftRecord, error } = await supabase
      .from('email_drafts')
      .insert({
        user_id: request.userId,
        thread_id: request.threadId,
        subject: draftData.subject,
        content: draftData.content,
        draft_content: draftData.content,
        draft_type: request.draftType,
        draft_version: 1,
        confidence_score: draftData.confidence,
        ai_confidence: draftData.confidence,
        ai_reasoning: draftData.reasoning,
        status: 'pending_review',
        context_used: {
          urgency: request.urgency,
          recipient_relationship: request.recipientRelationship,
          context: request.context,
          agent_context: draftData.context_used,
        },
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error storing draft:', error);
      throw new Error('Failed to store draft');
    }

    return {
      id: draftRecord!.id,
      content: draftData.content,
      subject: draftData.subject,
      confidence: draftData.confidence,
      reasoning: draftData.reasoning,
      organizationalContext: draftData.context_used,
    };
  } catch (error) {
    console.error('Agent draft generation error:', error);
    
    // Fallback to basic draft generation
    return generateFallbackDraft(request);
  }
}

function parseAgentDraft(content: string): any {
  try {
    console.log('Parsing agent draft content:', content);
    
    // Look for JSON in the response - improve regex to handle multiline JSON
    const jsonMatch = content.match(/\{[\s\S]*?\}(?=\s*$)/);
    if (jsonMatch) {
      const jsonString = jsonMatch[0];
      console.log('Found JSON:', jsonString);
      const parsed = JSON.parse(jsonString);
      console.log('Parsed JSON:', parsed);
      return parsed;
    }
    
    // Try to find JSON with line breaks and extra content
    const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch2 = cleanedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch2) {
      const jsonString = jsonMatch2[0];
      console.log('Found JSON (attempt 2):', jsonString);
      const parsed = JSON.parse(jsonString);
      console.log('Parsed JSON (attempt 2):', parsed);
      return parsed;
    }
    
    console.log('No JSON found, extracting structured information from:', content);
    
    // If no JSON found, try to extract structured information
    return {
      subject: extractSubject(content),
      content: extractContent(content),
      confidence: 0.7,
      reasoning: 'Agent-generated draft (parsed from text)',
      context_used: {
        project_context: 'Available',
        relationship_context: 'Available',
        writing_style: 'Analyzed',
      },
    };
  } catch (error) {
    console.error('Error parsing agent draft:', error);
    console.error('Content that failed to parse:', content);
    return {
      subject: 'Re: Your email',
      content: content.substring(0, 1000),
      confidence: 0.5,
      reasoning: 'Fallback parsing due to error: ' + (error instanceof Error ? error.message : 'Unknown error'),
      context_used: {},
    };
  }
}

function extractSubject(content: string): string {
  const subjectMatch = content.match(/subject[:\s]*([^\n]*)/i);
  if (subjectMatch) {
    return subjectMatch[1].trim().replace(/"/g, '');
  }
  return 'Re: Your email';
}

function extractContent(content: string): string {
  const contentMatch = content.match(/content[:\s]*([^}]*)/i);
  if (contentMatch) {
    return contentMatch[1].trim().replace(/"/g, '');
  }
  return content;
}

async function generateFallbackDraft(request: DraftRequest): Promise<{
  id: string;
  content: string;
  subject: string;
  confidence: number;
  reasoning: string;
}> {
  const supabase = await createClient();
  
  // Get thread details for fallback draft
  const { data: thread } = await supabase
    .from('email_threads')
    .select('subject')
    .eq('id', request.threadId)
    .single();

  const fallbackContent = `Thank you for your email. I appreciate you reaching out about this matter.

I will review the details and get back to you within 1-2 business days with a comprehensive response.

If this is urgent, please don't hesitate to call me directly.

Best regards,
[Your Name]`;

  // Store fallback draft
  const { data: draftRecord, error } = await supabase
    .from('email_drafts')
    .insert({
      user_id: request.userId,
      thread_id: request.threadId,
      subject: `Re: ${thread?.subject || 'Your email'}`,
      content: fallbackContent,
      draft_content: fallbackContent,
      draft_type: request.draftType,
      draft_version: 1,
      confidence_score: 0.5,
      ai_confidence: 0.5,
      ai_reasoning: 'Fallback draft generated (agent processing failed)',
      status: 'pending_review',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error storing fallback draft:', error);
    throw new Error('Failed to store fallback draft');
  }

  return {
    id: draftRecord?.id || 'fallback-' + Date.now(),
    content: fallbackContent,
    subject: `Re: ${thread?.subject || 'Your email'}`,
    confidence: 0.5,
    reasoning: 'Fallback draft generated (agent processing failed)',
  };
}

// Enhanced draft generation with continuous learning
export async function generateDraftWithLearning(request: DraftRequest): Promise<{
  id: string;
  content: string;
  subject: string;
  confidence: number;
  reasoning: string;
  organizationalContext?: any;
}> {
  try {
    const supabase = await createClient();

    // Get user's learning samples for pattern recognition
    const { data: learningSamples } = await supabase
      .from('learning_samples')
      .select('*')
      .eq('user_id', request.userId)
      .order('created_at', { ascending: false })
      .limit(20);

    // Extract patterns from learning samples
    const patterns = analyzeUserPatterns(learningSamples || []);

    // Get thread messages for context
    const { data: threadMessages } = await supabase
      .from('email_messages')
      .select('*')
      .eq('thread_id', request.threadId)
      .order('received_at', { ascending: true });

    // Get thread details
    const { data: threadData } = await supabase
      .from('email_threads')
      .select('*')
      .eq('id', request.threadId)
      .single();

    // Format thread context for AI
    const threadContext = threadMessages?.map(msg => ({
      sender: msg.from_email || msg.sender,
      subject: msg.subject,
      date: msg.received_at || msg.sent_date,
      body: msg.body
    })) || [];

    // Generate draft with enhanced context
    const response = await run(simpleEmailAgent, `Generate a ${request.draftType} email draft with personalized learning patterns:

LEARNING PATTERNS:
${JSON.stringify(patterns, null, 2)}

DRAFT REQUIREMENTS:
- Type: ${request.draftType}
- Thread ID: ${request.threadId}
- User ID: ${request.userId}
- Urgency: ${request.urgency || 'medium'}
- Recipient Relationship: ${request.recipientRelationship || 'professional'}
- Additional Context: ${request.context || 'None provided'}

EMAIL THREAD CONTEXT:
Thread Subject: ${threadData?.subject || 'No subject'}
Thread Participants: ${threadData?.participants?.join(', ') || 'Unknown'}
Thread Category: ${threadData?.category || 'General'}
Thread Priority: ${threadData?.priority || 'Medium'}

THREAD MESSAGES (chronological order):
${threadContext.map((msg, idx) => `
Message ${idx + 1}:
From: ${msg.sender}
Subject: ${msg.subject || 'No subject'}
Date: ${msg.date}
Body: ${msg.body || 'No content'}
`).join('\n---\n')}

Apply the learning patterns to:
1. Match the user's preferred tone and style
2. Use phrases the user commonly uses
3. Avoid phrases the user tends to change
4. Structure responses according to user preferences
5. Maintain consistency with past successful drafts

Generate a draft that incorporates these personalized patterns while maintaining organizational context.`);

    const draftData = parseAgentDraft(response.finalOutput || '');

    // Store draft with learning context
    const { data: draftRecord, error } = await supabase
      .from('email_drafts')
      .insert({
        user_id: request.userId,
        thread_id: request.threadId,
        subject: draftData.subject,
        content: draftData.content,
        draft_content: draftData.content,
        draft_type: request.draftType,
        draft_version: 1,
        confidence_score: draftData.confidence,
        ai_confidence: draftData.confidence,
        ai_reasoning: draftData.reasoning,
        status: 'pending_review',
        context_used: {
          urgency: request.urgency,
          recipient_relationship: request.recipientRelationship,
          context: request.context,
          learning_patterns: patterns,
          agent_context: draftData.context_used,
        },
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error storing draft with learning:', error);
      throw new Error('Failed to store draft with learning');
    }

    return {
      id: draftRecord!.id,
      content: draftData.content,
      subject: draftData.subject,
      confidence: draftData.confidence,
      reasoning: draftData.reasoning,
      organizationalContext: draftData.context_used,
    };
  } catch (error) {
    console.error('Enhanced draft generation error:', error);
    return generateDraftWithAgent(request);
  }
}

function analyzeUserPatterns(learningSamples: any[]): any {
  if (learningSamples.length === 0) {
    return {
      commonPhrases: [],
      avoidPhrases: [],
      tonePreference: 'professional',
      structurePreference: 'standard',
    };
  }

  const patterns = {
    commonPhrases: extractCommonPhrases(learningSamples),
    avoidPhrases: extractAvoidPhrases(learningSamples),
    tonePreference: determineTonePreference(learningSamples),
    structurePreference: determineStructurePreference(learningSamples),
  };

  return patterns;
}

function extractCommonPhrases(samples: any[]): string[] {
  // Extract phrases that appear frequently in final_sent but not in original_draft
  const phrases: string[] = [];
  samples.forEach(sample => {
    if (sample.final_sent && sample.original_draft) {
      // Simple phrase extraction - in production, use more sophisticated NLP
      const finalWords = sample.final_sent.toLowerCase().split(/\s+/);
      const originalWords = sample.original_draft.toLowerCase().split(/\s+/);
      
      finalWords.forEach((word: string) => {
        if (word.length > 3 && !originalWords.includes(word)) {
          phrases.push(word);
        }
      });
    }
  });
  
  return [...new Set(phrases)].slice(0, 10); // Top 10 unique phrases
}

function extractAvoidPhrases(samples: any[]): string[] {
  // Extract phrases that are consistently removed from drafts
  const avoidPhrases: string[] = [];
  samples.forEach(sample => {
    if (sample.original_draft && sample.final_sent) {
      const originalWords = sample.original_draft.toLowerCase().split(/\s+/);
      const finalWords = sample.final_sent.toLowerCase().split(/\s+/);
      
      originalWords.forEach((word: string) => {
        if (word.length > 3 && !finalWords.includes(word)) {
          avoidPhrases.push(word);
        }
      });
    }
  });
  
  return [...new Set(avoidPhrases)].slice(0, 10); // Top 10 unique phrases to avoid
}

function determineTonePreference(samples: any[]): string {
  // Analyze tone changes in edits
  const positiveChanges = samples.filter(s => s.feedback_score > 0).length;
  const totalChanges = samples.length;
  
  if (positiveChanges / totalChanges > 0.7) {
    return 'professional';
  } else if (positiveChanges / totalChanges > 0.5) {
    return 'friendly';
  } else {
    return 'formal';
  }
}

function determineStructurePreference(samples: any[]): string {
  // Analyze structural changes in edits
  const hasStructuralChanges = samples.some(s => 
    s.diff_analysis?.structureChange === true
  );
  
  return hasStructuralChanges ? 'custom' : 'standard';
}