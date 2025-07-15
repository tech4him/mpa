import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { approvalId, action, feedback, correctAction, reasoning } = await request.json()
    
    if (!approvalId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: approvalId, action' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get the current approval
    const { data: approval, error: fetchError } = await supabase
      .from('agent_approvals')
      .select('*')
      .eq('id', approvalId)
      .single()

    if (fetchError) {
      console.error('Error fetching approval:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch approval' },
        { status: 500 }
      )
    }

    // Map action to proper status value
    const status = action === 'approve' ? 'approved' : 'rejected'
    
    // Update the approval with user decision and feedback
    const updateData: any = {
      status: status
    }

    if (status === 'approved') {
      updateData.approved_at = new Date().toISOString()
    } else if (status === 'rejected') {
      updateData.rejected_at = new Date().toISOString()
      updateData.rejection_reason = reasoning || feedback?.reasoning || 'User rejected action'
    }

    const { error: updateError } = await supabase
      .from('agent_approvals')
      .update(updateData)
      .eq('id', approvalId)

    if (updateError) {
      console.error('Error updating approval:', updateError)
      return NextResponse.json(
        { error: 'Failed to update approval' },
        { status: 500 }
      )
    }

    // Record learning data for any feedback (approved with modification or rejected with suggestion)
    let learningRecorded = false
    if ((status === 'rejected' && correctAction) || (status === 'approved' && feedback?.modification)) {
      const emailData = approval.item_data
      
      const learningData = {
        user_id: approval.user_id,
        agent_id: approval.agent_id,
        original_decision: approval.decision,
        user_preferred_action: correctAction || feedback?.modification || 'approve_with_changes',
        email_subject: emailData?.subject,
        email_from: emailData?.from_email,
        reasoning: reasoning || feedback?.reasoning || 'User provided feedback',
        context: {
          originalAction: approval.decision?.action,
          originalReasoning: approval.decision?.reasoning,
          originalConfidence: approval.decision?.confidence,
          userFeedback: feedback,
          userAction: status,
          userCorrection: correctAction,
          emailCategory: emailData?.category,
          emailPriority: emailData?.priority,
          timestamp: new Date().toISOString(),
          itemType: approval.item_type
        }
      }

      const { error: learningError } = await supabase
        .from('learning_samples')
        .insert(learningData)

      if (learningError) {
        console.error('Error recording learning sample:', learningError)
      } else {
        learningRecorded = true
      }
    }

    // If approved, execute the action
    if (status === 'approved') {
      // TODO: Trigger execution of the approved action
      console.log(`Executing approved action: ${approval.decision.action}`)
    }

    return NextResponse.json({ 
      success: true, 
      message: `Approval ${status}`,
      learningRecorded,
      feedback: feedback || reasoning ? 'Feedback recorded for future learning' : undefined
    })

  } catch (error) {
    console.error('Error processing agent feedback:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}