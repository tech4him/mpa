import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: contact, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Get recent email threads with this contact
    const { data: recentThreads } = await supabase
      .from('email_threads')
      .select('id, subject, last_message_date, category, message_count')
      .eq('user_id', user.id)
      .contains('participants', [contact.email])
      .order('last_message_date', { ascending: false })
      .limit(10)

    return NextResponse.json({ 
      contact,
      recentThreads: recentThreads || []
    })

  } catch (error) {
    console.error('Contact fetch API error:', error)
    
    return NextResponse.json(
      { error: 'Failed to fetch contact' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { 
      name, 
      email, 
      company, 
      title, 
      phone, 
      notes, 
      is_vip, 
      tags 
    } = body

    const updates: any = {
      updated_at: new Date().toISOString()
    }

    if (name !== undefined) updates.name = name
    if (email !== undefined) updates.email = email
    if (company !== undefined) updates.company = company
    if (title !== undefined) updates.title = title
    if (phone !== undefined) updates.phone = phone
    if (notes !== undefined) updates.notes = notes
    if (is_vip !== undefined) updates.is_vip = is_vip
    if (tags !== undefined) updates.tags = tags

    const { data: contact, error } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to update contact' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      contact
    })

  } catch (error) {
    console.error('Contact update API error:', error)
    
    return NextResponse.json(
      { error: 'Failed to update contact' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: 'Failed to delete contact' }, { status: 400 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Contact delete API error:', error)
    
    return NextResponse.json(
      { error: 'Failed to delete contact' },
      { status: 500 }
    )
  }
}