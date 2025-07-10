import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EmailProcessingService } from '@/lib/email/processing-status'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const processingService = new EmailProcessingService()
    const rules = await processingService.getUserRules(user.id)
    
    return NextResponse.json({ success: true, rules })

  } catch (error) {
    console.error('Error fetching processing rules:', error)
    
    return NextResponse.json({
      error: 'Failed to fetch processing rules',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { instruction, threadId } = body

    if (!instruction) {
      return NextResponse.json({ 
        error: 'instruction is required' 
      }, { status: 400 })
    }

    // Get thread example if threadId provided
    let threadExample = null
    if (threadId) {
      const { data: thread } = await supabase
        .from('email_threads')
        .select(`
          *,
          email_messages(
            id,
            subject,
            body,
            from_email,
            from_name,
            received_at
          )
        `)
        .eq('id', threadId)
        .eq('user_id', user.id)
        .single()
      
      threadExample = thread
    }

    const processingService = new EmailProcessingService()
    const rule = await processingService.createRuleFromInstruction(
      user.id, 
      instruction, 
      threadExample
    )
    
    return NextResponse.json({ 
      success: true, 
      rule,
      message: `Processing rule "${rule.name}" created successfully`
    })

  } catch (error) {
    console.error('Error creating processing rule:', error)
    
    return NextResponse.json({
      error: 'Failed to create processing rule',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const ruleId = searchParams.get('id')

    if (!ruleId) {
      return NextResponse.json({ 
        error: 'Rule ID is required' 
      }, { status: 400 })
    }

    const processingService = new EmailProcessingService()
    await processingService.deleteRule(user.id, ruleId)
    
    return NextResponse.json({ 
      success: true,
      message: 'Processing rule deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting processing rule:', error)
    
    return NextResponse.json({
      error: 'Failed to delete processing rule',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { ruleId, isActive, feedback, applicationId, notes } = body

    const processingService = new EmailProcessingService()

    if (typeof isActive === 'boolean') {
      // Toggle rule active status
      await processingService.toggleRule(user.id, ruleId, isActive)
      
      return NextResponse.json({ 
        success: true,
        message: `Rule ${isActive ? 'activated' : 'deactivated'} successfully`
      })
    }

    if (feedback && applicationId) {
      // Provide feedback on rule application
      await processingService.provideFeedback(user.id, applicationId, feedback, notes)
      
      return NextResponse.json({ 
        success: true,
        message: 'Feedback recorded successfully'
      })
    }

    return NextResponse.json({ 
      error: 'Invalid request parameters' 
    }, { status: 400 })

  } catch (error) {
    console.error('Error updating processing rule:', error)
    
    return NextResponse.json({
      error: 'Failed to update processing rule',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}