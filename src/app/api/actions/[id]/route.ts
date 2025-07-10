import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { status, user_feedback } = await request.json()
    
    if (!['pending', 'approved', 'executed', 'rejected', 'expired'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const updateData: any = { status }
    
    if (user_feedback) {
      updateData.user_feedback = user_feedback
    }
    
    if (status === 'executed') {
      updateData.executed_at = new Date()
    }

    const { data: action, error } = await supabase
      .from('intelligent_actions')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id) // Ensure user owns this action
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Action not found' }, { status: 404 })
      }
      throw error
    }

    // If action is approved and auto-executable, execute it
    if (status === 'approved' && action.auto_execute) {
      await executeAction(action)
    }

    return NextResponse.json({ action })
  } catch (error) {
    console.error('Error updating action:', error)
    return NextResponse.json(
      { error: 'Failed to update action' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('intelligent_actions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id) // Ensure user owns this action

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Action not found' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting action:', error)
    return NextResponse.json(
      { error: 'Failed to delete action' },
      { status: 500 }
    )
  }
}

async function executeAction(action: any) {
  const supabase = await createClient()
  
  try {
    switch (action.action_type) {
      case 'file_document':
        await executeFileAction(action)
        break
      case 'archive_thread':
        await executeArchiveAction(action)
        break
      case 'send_reminder':
        await executeSendReminderAction(action)
        break
      // Add more action types as needed
      default:
        console.log(`Action type ${action.action_type} not auto-executable`)
    }
    
    // Mark as executed
    await supabase
      .from('intelligent_actions')
      .update({ 
        status: 'executed', 
        executed_at: new Date() 
      })
      .eq('id', action.id)
      
  } catch (error) {
    console.error('Error executing action:', error)
    
    // Mark as failed
    await supabase
      .from('intelligent_actions')
      .update({ 
        status: 'rejected',
        user_feedback: `Auto-execution failed: ${error instanceof Error ? error.message : String(error)}` 
      })
      .eq('id', action.id)
  }
}

async function executeFileAction(action: any) {
  const supabase = await createClient()
  
  // Move thread to specified folder/archive
  if (action.thread_id) {
    await supabase
      .from('email_threads')
      .update({ 
        status: 'archived',
        metadata: { 
          ...action.metadata,
          folder: action.recommended_action.folder,
          archived_by: 'ai_action',
          archived_at: new Date()
        }
      })
      .eq('id', action.thread_id)
  }
}

async function executeArchiveAction(action: any) {
  const supabase = await createClient()
  
  if (action.thread_id) {
    await supabase
      .from('email_threads')
      .update({ 
        status: 'archived',
        metadata: { 
          ...action.metadata,
          archived_by: 'ai_action',
          archived_at: new Date()
        }
      })
      .eq('id', action.thread_id)
  }
}

async function executeSendReminderAction(action: any) {
  // TODO: Implement reminder sending
  // This would integrate with email service to send reminders
  console.log('Sending reminder:', action.recommended_action)
}