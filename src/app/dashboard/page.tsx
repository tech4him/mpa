import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EmailThreadList } from '@/components/email-thread-list'
import { StatsCards } from '@/components/stats-cards'
import { DashboardHeader } from '@/components/dashboard-header'

export default async function DashboardPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/login')
  }

  // Get user's email threads
  const { data: threads } = await supabase
    .from('email_threads')
    .select('*')
    .eq('user_id', user.id)
    .order('last_message_date', { ascending: false })
    .limit(50)

  // Get stats
  const statsData = {
    totalThreads: threads?.length || 0,
    actionRequired: threads?.filter(t => t.is_action_required).length || 0,
    unread: threads?.filter(t => t.has_unread).length || 0,
    vipThreads: threads?.filter(t => t.category === 'VIP_CRITICAL').length || 0,
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Email Dashboard
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage your email threads and AI-generated drafts
          </p>
        </div>

        <StatsCards stats={statsData} />

        <div className="mt-8">
          <EmailThreadList threads={threads || []} />
        </div>
      </main>
    </div>
  )
}