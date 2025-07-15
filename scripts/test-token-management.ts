import { getValidTokenForUser, getTokenCacheStatus } from '../src/lib/microsoft-graph/client'
import { createClient } from '../src/lib/supabase/server'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function testTokenManagement() {
  console.log('Testing MSAL token management...')
  
  try {
    // Get a user from the database
    const supabase = await createClient()
    const { data: users } = await supabase
      .from('users')
      .select('id, email, azure_ad_id')
      .limit(1)
    
    if (!users || users.length === 0) {
      console.log('No users found in database')
      return
    }
    
    const user = users[0]
    console.log('Testing with user:', user.email)
    
    // Test token cache status
    console.log('\n1. Checking token cache status...')
    const status = await getTokenCacheStatus(user.id)
    console.log('Token cache status:', status)
    
    // Test getting valid token
    console.log('\n2. Getting valid token...')
    try {
      const token = await getValidTokenForUser(user.id, ['User.Read'])
      console.log('✅ Successfully obtained valid token (length:', token.length, ')')
      
      // Test token with Microsoft Graph
      console.log('\n3. Testing token with Microsoft Graph...')
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const userInfo = await response.json()
        console.log('✅ Token works with Microsoft Graph:', userInfo.displayName)
      } else {
        console.log('❌ Token failed with Microsoft Graph:', response.status, response.statusText)
      }
      
    } catch (error: any) {
      console.log('❌ Failed to get valid token:', error.message)
    }
    
  } catch (error) {
    console.error('Test failed:', error)
  }
}

testTokenManagement().catch(console.error)