import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

// Check if OpenAI API key is configured
const hasOpenAIKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'dummy-key'

const openai = hasOpenAIKey ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID,
}) : null

interface DraftRequest {
  threadId: string
  userId: string
  draftType: 'reply' | 'forward' | 'new'
  context?: string
  urgency?: 'low' | 'medium' | 'high'
  recipientRelationship?: 'internal' | 'external' | 'board' | 'donor' | 'vendor'
}

export async function generateDraft(request: DraftRequest): Promise<{
  id: string
  content: string
  subject: string
  confidence: number
  reasoning: string
}> {
  // Return mock draft if no OpenAI key is configured
  if (!hasOpenAIKey || !openai) {
    return generateMockDraft(request)
  }

  try {
    const supabase = await createClient()

    // Get user profile
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', request.userId)
      .single()

    if (!user) {
      throw new Error('User not found')
    }

    // Get thread with messages
    const { data: thread } = await supabase
      .from('email_threads')
      .select('*')
      .eq('id', request.threadId)
      .eq('user_id', request.userId)
      .single()

    if (!thread) {
      throw new Error('Thread not found')
    }

    const { data: messages } = await supabase
      .from('email_messages')
      .select('*')
      .eq('thread_id', request.threadId)
      .order('received_at', { ascending: true })

    // Get recent user emails for style analysis
    const { data: userEmails } = await supabase
      .from('email_messages')
      .select('body, subject')
      .eq('user_id', request.userId)
      .eq('is_reply', true)
      .order('created_at', { ascending: false })
      .limit(10)

    // Analyze writing style
    const writingStyle = await analyzeWritingStyle(userEmails || [])

    // Generate draft
    const draft = await generateAIDraft(user, thread, messages || [], writingStyle, request)

    // Store draft
    const { data: draftRecord, error } = await supabase
      .from('email_drafts')
      .insert({
        user_id: request.userId,
        thread_id: request.threadId,
        subject: draft.subject,
        content: draft.content,
        draft_content: draft.content, // Required NOT NULL field
        draft_type: request.draftType,
        draft_version: 1,
        confidence_score: draft.confidence,
        ai_confidence: draft.confidence,
        ai_reasoning: draft.reasoning,
        status: 'pending_review',
        context_used: {
          urgency: request.urgency,
          recipient_relationship: request.recipientRelationship,
          context: request.context,
          writing_style: writingStyle
        }
      })
      .select('id')
      .single()
      
    if (error) {
      console.error('Error storing draft:', error)
      throw new Error('Failed to store draft')
    }

    return {
      id: draftRecord!.id,
      content: draft.content,
      subject: draft.subject,
      confidence: draft.confidence,
      reasoning: draft.reasoning
    }

  } catch (error) {
    console.error('Draft generation error:', error)
    throw error
  }
}

async function generateMockDraft(request: DraftRequest) {
  const supabase = await createClient()
  
  // Get thread details for mock draft
  const { data: thread } = await supabase
    .from('email_threads')
    .select('subject')
    .eq('id', request.threadId)
    .single()

  const mockContent = `Thank you for your email. I appreciate you reaching out about this matter.

I will review the details and get back to you within 1-2 business days with a comprehensive response.

If this is urgent, please don't hesitate to call me directly.

Best regards,
[Your Name]`

  // Store mock draft
  const { data: draftRecord, error } = await supabase
    .from('email_drafts')
    .insert({
      user_id: request.userId,
      thread_id: request.threadId,
      subject: `Re: ${thread?.subject || 'Your email'}`,
      content: mockContent,
      draft_content: mockContent, // Required NOT NULL field
      draft_type: request.draftType,
      draft_version: 1,
      confidence_score: 0.7,
      ai_confidence: 0.7,
      ai_reasoning: 'Mock draft generated (OpenAI API key not configured)',
      status: 'pending_review'
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error storing mock draft:', error)
    throw new Error('Failed to store mock draft')
  }

  return {
    id: draftRecord?.id || 'mock-' + Date.now(),
    content: mockContent,
    subject: `Re: ${thread?.subject || 'Your email'}`,
    confidence: 0.7,
    reasoning: 'Mock draft generated (OpenAI API key not configured)'
  }
}

async function analyzeWritingStyle(userEmails: any[]) {
  if (userEmails.length === 0 || !hasOpenAIKey || !openai) {
    return {
      tone: 'professional',
      style: 'concise',
      greeting: 'standard',
      closing: 'standard'
    }
  }

  const emailBodies = userEmails.map(email => email.body).join('\n\n')
  
  try {
    const analysis = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Analyze the following email content to determine the user's writing style. Return a JSON object with:
          - tone: formal, professional, casual, friendly
          - style: concise, detailed, conversational, direct
          - greeting: formal, casual, none, personalized
          - closing: formal, casual, friendly, none
          - formality_level: 1-5 (1=very casual, 5=very formal)`
        },
        {
          role: 'user',
          content: emailBodies
        }
      ],
      max_tokens: 500,
      temperature: 0.1
    })

    const result = analysis.choices[0]?.message?.content
    if (result) {
      try {
        return JSON.parse(result)
      } catch {
        return {
          tone: 'professional',
          style: 'concise',
          greeting: 'standard',
          closing: 'standard'
        }
      }
    }
  } catch (error) {
    console.error('Style analysis error:', error)
  }

  return {
    tone: 'professional',
    style: 'concise',
    greeting: 'standard',
    closing: 'standard'
  }
}

async function generateAIDraft(
  user: any,
  thread: any,
  messages: any[],
  writingStyle: any,
  request: DraftRequest
) {
  if (!hasOpenAIKey || !openai) {
    throw new Error('OpenAI API key not configured')
  }
  const lastMessage = messages[messages.length - 1]
  const threadHistory = messages.map(msg => 
    `From: ${msg.from_name} <${msg.from_email}>\n` +
    `Subject: ${msg.subject}\n` +
    `Date: ${new Date(msg.received_at).toLocaleString()}\n\n` +
    `${msg.body}`
  ).join('\n\n---\n\n')

  const systemPrompt = `You are an AI assistant helping ${user.name} draft professional emails for Mission Mutual (a nonprofit organization focused on partnering for collective impact).

User Profile:
- Name: ${user.name}
- Email: ${user.email}
- Role: VP Business Operations
- Organization: Mission Mutual

Writing Style Analysis:
- Tone: ${writingStyle.tone}
- Style: ${writingStyle.style}
- Greeting: ${writingStyle.greeting}
- Closing: ${writingStyle.closing}
- Formality Level: ${writingStyle.formality_level || 3}/5

Thread Context:
- Category: ${thread.category}
- Priority: ${thread.priority}
- Participants: ${thread.participants.join(', ')}

Instructions:
1. Generate a ${request.draftType} email that matches the user's writing style
2. Consider the relationship with recipients (${request.recipientRelationship || 'professional'})
3. Maintain appropriate tone for Mission Mutual's Christian values
4. Be concise but thorough
5. Include proper greetings and closings based on style analysis
6. If replying, address specific points from the last message
7. Return JSON with: subject, content, confidence (0-1), reasoning

Draft Type: ${request.draftType}
Urgency: ${request.urgency || 'medium'}
Additional Context: ${request.context || 'None provided'}`

  const userPrompt = `Please draft a ${request.draftType} email for this thread:

${threadHistory}

${request.draftType === 'reply' ? `Please reply to the most recent message from ${lastMessage?.from_name}.` : ''}
${request.context ? `Additional context: ${request.context}` : ''}`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 1000,
      temperature: 0.3
    })

    const result = completion.choices[0]?.message?.content
    if (!result) {
      throw new Error('No response from AI')
    }

    try {
      const parsed = JSON.parse(result)
      return {
        subject: parsed.subject || thread.subject,
        content: parsed.content,
        confidence: parsed.confidence || 0.7,
        reasoning: parsed.reasoning || 'AI-generated draft'
      }
    } catch {
      return {
        subject: `Re: ${thread.subject}`,
        content: result,
        confidence: 0.6,
        reasoning: 'AI-generated draft (fallback format)'
      }
    }
  } catch (error) {
    console.error('AI generation error:', error)
    throw new Error('Failed to generate AI draft')
  }
}