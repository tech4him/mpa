import { Client } from '@microsoft/microsoft-graph-client'
import { ConfidentialClientApplication } from '@azure/msal-node'

const msalConfig = {
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID || 'dummy-client-id',
    authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}`,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || 'dummy-secret',
  },
}

export const msalClient = new ConfidentialClientApplication(msalConfig)

export async function getGraphClient(accessToken: string) {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken)
    },
  })
}

export async function getAppOnlyToken() {
  const result = await msalClient.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  })
  
  if (!result?.accessToken) {
    throw new Error('Failed to acquire app-only token')
  }
  
  return result.accessToken
}

export async function refreshUserToken(existingToken: string) {
  // Since we don't get refresh tokens in server-side flow,
  // we'll return the existing access token and handle expiry in the sync service
  console.log('Using existing access token (no refresh token available)')
  
  return {
    accessToken: existingToken,
    refreshToken: existingToken,
  }
}