import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { ThreadDetailView } from '@/components/thread-detail-view'

export default async function ThreadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/login')
  }

  // Get thread details
  const { data: thread } = await supabase
    .from('email_threads')
    .select('*, is_processed, is_hidden, processed_at, processing_reason')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!thread) {
    notFound()
  }

  // Get all messages in the thread (excluding deleted ones)
  const { data: messages } = await supabase
    .from('email_messages')
    .select('*')
    .eq('thread_id', id)
    .is('is_deleted', false)
    .order('received_at', { ascending: false })

  return <ThreadDetailView thread={thread} messages={messages || []} />
}