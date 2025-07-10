import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGraphClient } from '@/lib/microsoft-graph/client'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ 
        authenticated: false,
        message: 'Not authenticated with Supabase'
      })
    }

    // Check if user has Microsoft auth
    const { data: userData } = await supabase
      .from('users')
      .select('encrypted_refresh_token, email')
      .eq('id', user.id)
      .single()

    if (!userData?.encrypted_refresh_token) {
      return NextResponse.json({ 
        authenticated: true,
        microsoftAuth: false,
        message: 'Microsoft authentication not set up'
      })
    }

    // Try to decrypt and use the token
    try {
      const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
      const [ivHex, authTagHex, encrypted] = userData.encrypted_refresh_token.split(':')
      
      const iv = Buffer.from(ivHex, 'hex')
      const authTag = Buffer.from(authTagHex, 'hex')
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(authTag)
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      
      // Try to make a simple API call to check if token is valid
      const graphClient = await getGraphClient(decrypted)
      await graphClient.api('/me').select('id').get()
      
      return NextResponse.json({ 
        authenticated: true,
        microsoftAuth: true,
        tokenValid: true,
        message: 'Authentication is valid'
      })

    } catch (error: any) {
      console.error('Token validation error:', error)
      
      if (error?.statusCode === 401 || error?.message?.includes('401')) {
        return NextResponse.json({ 
          authenticated: true,
          microsoftAuth: true,
          tokenValid: false,
          message: 'Microsoft token expired - please reconnect',
          needsReauth: true
        })
      }
      
      return NextResponse.json({ 
        authenticated: true,
        microsoftAuth: true,
        tokenValid: false,
        message: 'Error validating Microsoft token',
        error: error?.message
      })
    }

  } catch (error) {
    console.error('Auth check error:', error)
    return NextResponse.json({ 
      authenticated: false,
      error: 'Failed to check authentication status'
    }, { status: 500 })
  }
}