import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Agent, tool } from '@openai/agents'

// Initialize the Commitment Extraction Agent
const commitmentAgent = new Agent({
  name: 'Commitment Extraction Agent',
  model: 'gpt-4o',
  instructions: `You are a commitment extraction agent that analyzes email communications to identify promises, deliverables, and deadlines.

Your role is to:
1. Extract explicit commitments like "I'll send this by Friday" or "Let's schedule a call next week"
2. Identify implicit commitments like "I need to review this" or "We should discuss this"
3. Determine due dates from context (explicit dates, relative dates like "next week", "by Friday")
4. Identify who made the commitment and to whom
5. Categorize commitments as "promised" (I will do X) or "waiting_for" (I'm waiting for Y from someone)

Return a JSON array of commitments with:
- description: What needs to be done
- due_date: When it's due (ISO date string or null if unclear)
- committed_by: Email address of person making commitment
- committed_to: Email address of person receiving commitment (if applicable)
- commitment_type: "promised" or "waiting_for"
- priority: 1-5 (1 = highest priority)
- confidence: 0.0-1.0 (how confident you are this is a real commitment)

Only extract commitments with confidence > 0.6. Be conservative - it's better to miss a commitment than create false ones.`
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { threadId, messageId } = await request.json()

    // Get the email thread and messages
    const { data: thread } = await supabase
      .from('email_threads')
      .select(`
        *,
        email_messages (
          id,
          subject,
          body,
          from_email,
          from_name,
          to_recipients,
          cc_recipients,
          sent_date
        )
      `)
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single()

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Get user's email for commitment analysis
    const userEmail = user.email

    // Analyze the thread for commitments
    const commitments = await extractCommitmentsFromThread(thread, userEmail)

    // Save new commitments to database
    const savedCommitments = []
    for (const commitment of commitments) {
      // Check if commitment already exists
      const { data: existing } = await supabase
        .from('commitments')
        .select('id')
        .eq('user_id', user.id)
        .eq('description', commitment.description)
        .eq('committed_by', commitment.committed_by)
        .single()

      if (!existing) {
        const { data: saved } = await supabase
          .from('commitments')
          .insert({
            user_id: user.id,
            thread_id: threadId,
            commitment_type: commitment.commitment_type,
            description: commitment.description,
            committed_by: commitment.committed_by,
            committed_to: commitment.committed_to,
            due_date: commitment.due_date,
            priority: commitment.priority,
            status: 'pending'
          })
          .select()
          .single()

        if (saved) {
          savedCommitments.push(saved)
        }
      }
    }

    return NextResponse.json({
      success: true,
      commitments_found: commitments.length,
      commitments_saved: savedCommitments.length,
      commitments: savedCommitments
    })

  } catch (error) {
    console.error('Commitment extraction error:', error)
    return NextResponse.json(
      { error: 'Failed to extract commitments' },
      { status: 500 }
    )
  }
}

async function extractCommitmentsFromThread(thread: any, userEmail: string): Promise<any[]> {
  try {
    // Prepare the email thread content for analysis
    const threadContent = {
      subject: thread.subject,
      participants: thread.participants,
      messages: thread.email_messages.map((msg: any) => ({
        from: msg.from_email,
        to: msg.to_recipients,
        cc: msg.cc_recipients,
        date: msg.sent_date,
        subject: msg.subject,
        body: msg.body
      }))
    }

    // Use the commitment agent to analyze
    const response = await commitmentAgent.run({
      messages: [{
        role: 'user',
        content: `Analyze this email thread and extract all commitments. The user's email is: ${userEmail}

Thread Subject: ${thread.subject}
Participants: ${thread.participants.join(', ')}

Messages:
${thread.email_messages.map((msg: any, idx: number) => `
Message ${idx + 1}:
From: ${msg.from_email}
To: ${msg.to_recipients?.join(', ')}
Date: ${msg.sent_date}
Subject: ${msg.subject}
Body: ${msg.body || '(No body content)'}
`).join('\n')}

Please extract all commitments and return them as a JSON array.`
      }]
    })

    // Parse the response
    const commitments = JSON.parse(response.text || '[]')
    
    // Filter commitments by confidence and validate
    return commitments
      .filter((c: any) => c.confidence > 0.6)
      .map((c: any) => ({
        description: c.description,
        due_date: c.due_date ? new Date(c.due_date).toISOString() : null,
        committed_by: c.committed_by,
        committed_to: c.committed_to,
        commitment_type: c.commitment_type,
        priority: Math.min(5, Math.max(1, c.priority || 3)),
        confidence: c.confidence
      }))

  } catch (error) {
    console.error('Error analyzing commitments:', error)
    return []
  }
}