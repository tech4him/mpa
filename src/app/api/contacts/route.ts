import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('contacts')
      .select('*')
      .eq('user_id', user.id)

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data: contacts, error } = await query
      .order('interaction_count', { ascending: false })
      .order('last_interaction', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      throw new Error('Failed to fetch contacts')
    }

    // Get contact stats
    const { data: stats } = await supabase
      .from('contacts')
      .select('id, is_vip, interaction_count')
      .eq('user_id', user.id)

    const contactStats = {
      total: stats?.length || 0,
      vip: stats?.filter(c => c.is_vip).length || 0,
      active: stats?.filter(c => c.interaction_count > 5).length || 0
    }

    return NextResponse.json({ 
      contacts: contacts || [], 
      stats: contactStats,
      pagination: {
        limit,
        offset,
        hasMore: (contacts?.length || 0) === limit
      }
    })

  } catch (error) {
    console.error('Contacts fetch API error:', error)
    
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
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

    const body = await req.json()
    const { 
      email, 
      name, 
      company, 
      title, 
      phone, 
      notes, 
      is_vip,
      tags 
    } = body

    if (!email || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: email, name' }, 
        { status: 400 }
      )
    }

    // Check if contact already exists
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', user.id)
      .eq('email', email)
      .single()

    if (existingContact) {
      return NextResponse.json(
        { error: 'Contact with this email already exists' },
        { status: 409 }
      )
    }

    const { data: contact, error } = await supabase
      .from('contacts')
      .insert({
        user_id: user.id,
        email,
        name,
        company: company || null,
        title: title || null,
        phone: phone || null,
        notes: notes || null,
        is_vip: is_vip || false,
        tags: tags || [],
        interaction_count: 0
      })
      .select()
      .single()

    if (error) {
      throw new Error('Failed to create contact')
    }

    return NextResponse.json({
      success: true,
      contact
    })

  } catch (error) {
    console.error('Contact creation API error:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to create contact',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}