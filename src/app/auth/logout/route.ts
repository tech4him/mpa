import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Sign out from Supabase
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      console.error('Logout error:', error)
      return NextResponse.json({ error: 'Failed to logout' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Logged out successfully' })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: 'Failed to logout' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Sign out from Supabase
    await supabase.auth.signOut()
    
    // Redirect to home page
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/`)
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/`)
  }
}