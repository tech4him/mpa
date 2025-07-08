'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function AuthErrorContent() {
  const searchParams = useSearchParams()
  const errorMessage = searchParams.get('message') || 'Unknown error'
  const errorDescription = searchParams.get('description') || ''

  const errorDescriptions: Record<string, string> = {
    Invalid_request: 'The authentication request was invalid. This usually means the redirect URI is not configured correctly.',
    Authentication_failed: 'Authentication failed. Please try again.',
    access_denied: 'Access was denied. Please contact your administrator.',
    server_error: 'A server error occurred. Please try again later.',
  }

  const description = errorDescription || errorDescriptions[errorMessage] || `An error occurred: ${errorMessage}`

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
            Authentication Error
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {description}
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Error Code: {errorMessage}
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{description}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center">
            <Link
              href="/auth/login"
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              Try again
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthErrorContent />
    </Suspense>
  )
}