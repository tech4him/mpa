import OpenAI from 'openai'
import { EmailThread, ThreadAnalysis } from '@/types'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
  organization: process.env.OPENAI_ORG_ID,
})

const THREAD_ANALYSIS_PROMPT = `You are an AI assistant analyzing email threads for a busy executive. 
Analyze the email thread and determine:

1. Category: ACTION_REQUIRED, FYI_ONLY, FINANCIAL, MEETING_REQUEST, or VIP_CRITICAL
2. Priority: 1-5 (5 being highest)
3. Whether it requires a response
4. If there are any tasks/commitments mentioned
5. If it's from a VIP (board member, major donor, key partner)
6. A suggested response if action is required

Consider the entire thread context, not just the latest email.`

export async function analyzeEmailThread({
  thread,
  emails,
  latestEmail,
}: {
  thread: EmailThread
  emails: any[]
  latestEmail: any
}): Promise<ThreadAnalysis> {
  const threadContext = emails
    .map(
      (email) =>
        `From: ${email.from.emailAddress.address}
Date: ${email.sentDateTime}
Subject: ${email.subject}
Body: ${email.body.content.substring(0, 1000)}...
---`
    )
    .join('\n\n')

  const prompt = `Thread Subject: ${thread.subject}
Participants: ${thread.participants.join(', ')}
Latest Email From: ${latestEmail.from.emailAddress.address}

Thread History:
${threadContext}

Analyze this email thread and provide a JSON response.`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: THREAD_ANALYSIS_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })

    const response = JSON.parse(completion.choices[0].message.content || '{}')

    return {
      requiresAction: response.requires_action || false,
      hasTask: response.has_task || false,
      isVIP: response.is_vip || false,
      category: response.category || 'FYI_ONLY',
      priority: response.priority || 3,
      suggestedResponse: response.suggested_response,
      extractedTasks: response.tasks || [],
    }
  } catch (error) {
    console.error('Thread analysis error:', error)
    return {
      requiresAction: false,
      hasTask: false,
      isVIP: false,
      category: 'FYI_ONLY',
      priority: 3,
    }
  }
}