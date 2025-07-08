import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  const state = crypto.randomBytes(16).toString('hex')
  const nonce = crypto.randomBytes(16).toString('hex')
  
  // Store state in cookie for validation
  const response = NextResponse.redirect(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?` +
    new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      response_mode: 'query',
      scope: 'openid profile email offline_access User.Read Mail.ReadWrite Mail.Send Calendars.Read',
      state: state,
      nonce: nonce,
    })
  )
  
  // Set secure cookie with state for CSRF protection
  response.cookies.set('auth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
  })
  
  return response
}