import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SecurityEmailProcessor } from '@/lib/agents/security-agent'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { threadId, messageId, action } = await req.json()

    if (!threadId || !messageId) {
      return NextResponse.json({ error: 'Missing threadId or messageId' }, { status: 400 })
    }

    // Get the message
    const { data: message } = await supabase
      .from('email_messages')
      .select('*')
      .eq('id', messageId)
      .eq('user_id', user.id)
      .single()

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    const securityProcessor = new SecurityEmailProcessor()

    if (action) {
      // Perform specific action
      await securityProcessor.handleSecurityAction(messageId, action, user.id)
      
      return NextResponse.json({
        success: true,
        message: `Security action '${action}' completed for message ${messageId}`,
      })
    } else {
      // Perform analysis
      const linkRegex = /https?:\/\/[^\s<>]+/gi;
      const links = message.body?.match(linkRegex) || [];

      const emailContext = {
        id: message.id,
        subject: message.subject || '',
        sender: message.from_email || '',
        recipients: message.to_recipients || [],
        body: message.body || '',
        links,
        threadId,
      };

      const analysis = await securityProcessor.analyzeEmailSecurity(emailContext, user.id)
      
      // Update message with security analysis
      await supabase
        .from('email_messages')
        .update({
          security_risk_level: analysis.riskLevel,
        })
        .eq('id', messageId)
        .eq('user_id', user.id)

      return NextResponse.json({
        success: true,
        analysis,
        message: `Security analysis completed for message ${messageId}`,
      })
    }

  } catch (error) {
    console.error('Security analysis API error:', error)
    
    return NextResponse.json(
      { error: 'Failed to process security analysis', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const riskLevel = searchParams.get('riskLevel')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Get security analyses
    let query = supabase
      .from('security_analyses')
      .select(`
        *,
        email_messages!inner(id, subject, from_email, from_name, sent_date)
      `)
      .eq('user_id', user.id)
      .order('analysis_date', { ascending: false })
      .limit(limit)

    if (riskLevel) {
      query = query.eq('risk_level', riskLevel)
    }

    const { data: analyses } = await query

    // Get security incidents
    const { data: incidents } = await supabase
      .from('security_incidents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    // Get security stats
    const { data: stats } = await supabase
      .from('security_analyses')
      .select('risk_level, recommended_action')
      .eq('user_id', user.id)

    const securityStats = {
      totalAnalyses: stats?.length || 0,
      riskLevels: {
        low: stats?.filter(s => s.risk_level === 'low').length || 0,
        medium: stats?.filter(s => s.risk_level === 'medium').length || 0,
        high: stats?.filter(s => s.risk_level === 'high').length || 0,
        critical: stats?.filter(s => s.risk_level === 'critical').length || 0,
      },
      actions: {
        allowed: stats?.filter(s => s.recommended_action === 'allow').length || 0,
        quarantined: stats?.filter(s => s.recommended_action === 'quarantine').length || 0,
        deleted: stats?.filter(s => s.recommended_action === 'delete').length || 0,
        reported: stats?.filter(s => s.recommended_action === 'report').length || 0,
      },
      openIncidents: incidents?.filter(i => i.status === 'open').length || 0,
    }

    return NextResponse.json({
      analyses: analyses || [],
      incidents: incidents || [],
      stats: securityStats,
    })

  } catch (error) {
    console.error('Security status API error:', error)
    
    return NextResponse.json(
      { error: 'Failed to get security status' },
      { status: 500 }
    )
  }
}