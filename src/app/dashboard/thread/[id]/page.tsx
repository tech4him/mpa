import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AIEmailAssistant } from '@/components/ai-email-assistant'
import { formatDistanceToNow } from 'date-fns'
import { 
  ArrowLeft, 
  User, 
  Clock, 
  Mail,
  Star,
  AlertCircle,
  DollarSign,
  Calendar,
  FileText
} from 'lucide-react'
import Link from 'next/link'

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
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!thread) {
    notFound()
  }

  // Get all messages in the thread
  const { data: messages } = await supabase
    .from('email_messages')
    .select('*')
    .eq('thread_id', id)
    .order('received_at', { ascending: true })

  // Get category badge configuration
  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'VIP_CRITICAL': return { variant: 'destructive' as const, icon: Star, label: 'VIP Critical' }
      case 'ACTION_REQUIRED': return { variant: 'default' as const, icon: AlertCircle, label: 'Action Required' }
      case 'FINANCIAL': return { variant: 'secondary' as const, icon: DollarSign, label: 'Financial' }
      case 'MEETING_REQUEST': return { variant: 'outline' as const, icon: Calendar, label: 'Meeting Request' }
      case 'FYI_ONLY': return { variant: 'outline' as const, icon: FileText, label: 'FYI Only' }
      default: return { variant: 'outline' as const, icon: Mail, label: 'Email' }
    }
  }

  const getPriorityColor = (priority: number) => {
    if (priority === 1) return 'text-red-600'
    if (priority === 2) return 'text-orange-600'
    if (priority === 3) return 'text-yellow-600'
    return 'text-gray-600'
  }

  const categoryBadge = getCategoryBadge(thread.category)
  const CategoryIcon = categoryBadge.icon

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard">
              <Button variant="outline" size="sm" className="flex items-center space-x-2">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Dashboard</span>
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Thread Details</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Thread Content - Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Thread Header */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl mb-3">{thread.subject}</CardTitle>
                    <div className="flex items-center space-x-2 mb-3">
                      <Badge variant={categoryBadge.variant} className="flex items-center space-x-1">
                        <CategoryIcon className="h-3 w-3" />
                        <span>{categoryBadge.label}</span>
                      </Badge>
                      <div className={`flex items-center space-x-1 ${getPriorityColor(thread.priority)}`}>
                        <AlertCircle className="h-3 w-3" />
                        <span className="text-xs font-medium">
                          Priority {thread.priority}
                        </span>
                      </div>
                      {thread.has_unread && (
                        <Badge variant="outline" className="text-blue-600">
                          Unread
                        </Badge>
                      )}
                      {thread.is_action_required && (
                        <Badge variant="default">
                          Action Required
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    <div className="flex items-center space-x-1">
                      <Clock className="h-4 w-4" />
                      <span>
                        {formatDistanceToNow(new Date(thread.last_message_date), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center space-x-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">Participants</p>
                      <p className="text-sm text-gray-600">{thread.participants.length}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">Messages</p>
                      <p className="text-sm text-gray-600">{thread.message_count}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">Created</p>
                      <p className="text-sm text-gray-600">
                        {new Date(thread.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Participants:</p>
                  <div className="flex flex-wrap gap-2">
                    {thread.participants.map((participant, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {participant}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Messages */}
            <Card>
              <CardHeader>
                <CardTitle>Messages ({messages?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {messages?.map((message, index) => (
                    <div key={message.id} className="border-l-4 border-blue-200 pl-4 py-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm">{message.from_name}</p>
                          <p className="text-xs text-gray-500">{message.from_email}</p>
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(message.received_at).toLocaleString()}
                        </div>
                      </div>
                      
                      <h4 className="font-medium text-sm mb-2">{message.subject}</h4>
                      
                      <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded max-h-48 overflow-y-auto">
                        <pre className="whitespace-pre-wrap">{message.body}</pre>
                      </div>
                      
                      {(message.to_recipients?.length > 0 || message.cc_recipients?.length > 0 || message.bcc_recipients?.length > 0) && (
                        <div className="mt-2 text-xs text-gray-500">
                          {message.to_recipients?.length > 0 && (
                            <div>
                              <span className="font-medium">To:</span> {message.to_recipients.join(', ')}
                            </div>
                          )}
                          {message.cc_recipients?.length > 0 && (
                            <div>
                              <span className="font-medium">CC:</span> {message.cc_recipients.join(', ')}
                            </div>
                          )}
                          {message.bcc_recipients?.length > 0 && (
                            <div>
                              <span className="font-medium">BCC:</span> {message.bcc_recipients.join(', ')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* AI Assistant - Right Column */}
          <div className="lg:col-span-1">
            <AIEmailAssistant threadId={id} />
          </div>
        </div>
      </div>
    </div>
  )
}