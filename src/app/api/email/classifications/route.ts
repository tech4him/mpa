import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EmailClassificationProcessor } from '@/lib/agents/email-classifier'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Get email classifications
    let query = supabase
      .from('email_classifications')
      .select('*')
      .eq('user_id', user.id)
      .order('classification_date', { ascending: false })
      .limit(limit)

    if (category) {
      query = query.eq('category', category)
    }

    const { data: classifications } = await query

    // Get classification stats
    const { data: allClassifications } = await supabase
      .from('email_classifications')
      .select('category, business_context, is_relevant, should_index, should_archive')
      .eq('user_id', user.id)

    const stats = {
      totalClassifications: allClassifications?.length || 0,
      categories: {
        BUSINESS_RELEVANT: allClassifications?.filter(c => c.category === 'BUSINESS_RELEVANT').length || 0,
        PROMOTIONAL: allClassifications?.filter(c => c.category === 'PROMOTIONAL').length || 0,
        SOCIAL: allClassifications?.filter(c => c.category === 'SOCIAL').length || 0,
        NEWSLETTER: allClassifications?.filter(c => c.category === 'NEWSLETTER').length || 0,
        SPAM: allClassifications?.filter(c => c.category === 'SPAM').length || 0,
        PERSONAL: allClassifications?.filter(c => c.category === 'PERSONAL').length || 0,
      },
      businessContexts: {
        MISSION_MUTUAL: allClassifications?.filter(c => c.business_context === 'MISSION_MUTUAL').length || 0,
        INSURANCE_INDUSTRY: allClassifications?.filter(c => c.business_context === 'INSURANCE_INDUSTRY').length || 0,
        CHRISTIAN_MINISTRY: allClassifications?.filter(c => c.business_context === 'CHRISTIAN_MINISTRY').length || 0,
        EXTERNAL: allClassifications?.filter(c => c.business_context === 'EXTERNAL').length || 0,
        UNRELATED: allClassifications?.filter(c => c.business_context === 'UNRELATED').length || 0,
      },
      indexedEmails: allClassifications?.filter(c => c.should_index).length || 0,
      archivedEmails: allClassifications?.filter(c => c.should_archive).length || 0,
    }

    return NextResponse.json({
      classifications: classifications || [],
      stats,
    })

  } catch (error) {
    console.error('Classification API error:', error)
    
    return NextResponse.json(
      { error: 'Failed to get classifications' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { emailId, action } = await req.json()

    if (!emailId || !action) {
      return NextResponse.json({ error: 'Missing emailId or action' }, { status: 400 })
    }

    const classificationProcessor = new EmailClassificationProcessor()
    
    // Perform the requested action
    await classificationProcessor.handleEmailAction(emailId, action, user.id)
    
    return NextResponse.json({
      success: true,
      message: `Email action '${action}' completed for email ${emailId}`,
    })

  } catch (error) {
    console.error('Classification action API error:', error)
    
    return NextResponse.json(
      { error: 'Failed to process classification action', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}