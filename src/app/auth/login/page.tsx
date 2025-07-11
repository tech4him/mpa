export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
            AI Executive Assistant
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in with your Microsoft 365 account to access your personal AI assistant
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <a
            href="/api/auth/login"
            className="group relative flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Sign in with Microsoft
          </a>

          <div className="text-center text-sm text-gray-600">
            <p>
              By signing in, you agree to allow the AI Executive Assistant to access your
              work data to provide intelligent automation and insights.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}