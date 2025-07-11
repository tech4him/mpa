import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { actions } = body

    if (!Array.isArray(actions)) {
      return NextResponse.json(
        { error: 'Actions must be an array' },
        { status: 400 }
      )
    }

    const results = []

    // Execute batch actions
    for (const action of actions) {
      const { email_id, action_type, data } = action

      try {
        let result
        switch (action_type) {
          case 'archive':
            result = await archiveEmail(supabase, user.id, email_id)
            break
          case 'delete':
            result = await deleteEmail(supabase, user.id, email_id)
            break
          case 'mark_read':
            result = await markAsRead(supabase, user.id, email_id)
            break
          case 'snooze':
            result = await snoozeEmail(supabase, user.id, email_id, data?.until)
            break
          case 'categorize':
            result = await categorizeEmail(supabase, user.id, email_id, data?.category)
            break
          default:
            result = { success: false, error: `Unknown action: ${action_type}` }
        }

        results.push({
          email_id,
          action_type,
          ...result
        })
      } catch (error) {
        console.error(`Failed to execute ${action_type} for email ${email_id}:`, error)
        results.push({
          email_id,
          action_type,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Batch actions error:', error)
    return NextResponse.json(
      { error: 'Failed to execute batch actions' },
      { status: 500 }
    )
  }
}

async function archiveEmail(supabase: any, userId: string, emailId: string) {
  const { error } = await supabase
    .from('email_messages')
    .update({ 
      is_read: true,
      is_archived: true,
      processed_at: new Date().toISOString()
    })
    .eq('id', emailId)
    .eq('user_id', userId)

  return { success: !error, error: error?.message }
}

async function deleteEmail(supabase: any, userId: string, emailId: string) {
  const { error } = await supabase
    .from('email_messages')
    .update({ 
      is_deleted: true,
      processed_at: new Date().toISOString()
    })
    .eq('id', emailId)
    .eq('user_id', userId)

  return { success: !error, error: error?.message }
}

async function markAsRead(supabase: any, userId: string, emailId: string) {
  const { error } = await supabase
    .from('email_messages')
    .update({ 
      is_read: true,
      processed_at: new Date().toISOString()
    })
    .eq('id', emailId)
    .eq('user_id', userId)

  return { success: !error, error: error?.message }
}

async function snoozeEmail(supabase: any, userId: string, emailId: string, until: string) {
  const { error } = await supabase
    .from('email_messages')
    .update({ 
      is_snoozed: true,
      snooze_until: until,
      processed_at: new Date().toISOString()
    })
    .eq('id', emailId)
    .eq('user_id', userId)

  return { success: !error, error: error?.message }
}

async function categorizeEmail(supabase: any, userId: string, emailId: string, category: string) {
  const { error } = await supabase
    .from('email_messages')
    .update({ 
      ai_category: category,
      processed_at: new Date().toISOString()
    })
    .eq('id', emailId)
    .eq('user_id', userId)

  return { success: !error, error: error?.message }
}