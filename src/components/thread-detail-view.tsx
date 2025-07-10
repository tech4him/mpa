'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AIEmailAssistant } from '@/components/ai-email-assistant'
import { SafeEmailViewer } from '@/components/safe-email-viewer'
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
  FileText,
  Trash2,
  AlertTriangle,
  CheckCircle,
  RotateCcw,
  Brain
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface EmailMessage {
  id: string
  subject: string | null
  body: string | null
  from_name: string | null
  from_email: string | null
  to_recipients: string[] | null
  cc_recipients: string[] | null
  bcc_recipients: string[] | null
  received_at: string
  content_type: string | null
  message_id: string | null
}

interface EmailThread {
  id: string
  subject: string
  participants: string[]
  last_message_date: string
  message_count: number
  has_unread: boolean
  is_action_required: boolean
  category: 'ACTION_REQUIRED' | 'FYI_ONLY' | 'FINANCIAL' | 'MEETING_REQUEST' | 'VIP_CRITICAL' | 'SPAM'
  priority: number
  created_at: string
  is_processed?: boolean
  is_hidden?: boolean
  processed_at?: string
  processing_reason?: string
}

interface ThreadDetailViewProps {
  thread: EmailThread
  messages: EmailMessage[]
}

export function ThreadDetailView({ thread, messages }: ThreadDetailViewProps) {
  const [isMarking, setIsMarking] = useState(false)
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set())
  const [isProcessing, setIsProcessing] = useState(false)
  const [showRuleDialog, setShowRuleDialog] = useState(false)
  const router = useRouter()

  // Get category badge configuration
  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'VIP_CRITICAL': return { variant: 'destructive' as const, icon: Star, label: 'VIP Critical' }
      case 'ACTION_REQUIRED': return { variant: 'default' as const, icon: AlertCircle, label: 'Action Required' }
      case 'FINANCIAL': return { variant: 'secondary' as const, icon: DollarSign, label: 'Financial' }
      case 'MEETING_REQUEST': return { variant: 'outline' as const, icon: Calendar, label: 'Meeting Request' }
      case 'FYI_ONLY': return { variant: 'outline' as const, icon: FileText, label: 'FYI Only' }
      case 'SPAM': return { variant: 'destructive' as const, icon: AlertTriangle, label: 'Spam' }
      default: return { variant: 'outline' as const, icon: Mail, label: 'Email' }
    }
  }

  const getPriorityColor = (priority: number) => {
    if (priority === 1) return 'text-red-600 dark:text-red-400'
    if (priority === 2) return 'text-orange-600 dark:text-orange-400'
    if (priority === 3) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-gray-700 dark:text-gray-300'
  }

  const markAsSpam = async (threadId?: string, messageId?: string) => {
    if (!confirm('Are you sure you want to mark this as spam? This will move the email to your junk folder and delete it from this system.')) {
      return
    }

    setIsMarking(true)
    try {
      const response = await fetch('/api/email/spam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: threadId,
          emailId: messageId
        })
      })

      if (response.ok) {
        const result = await response.json()
        alert(result.message || 'Successfully marked as spam')
        
        // Redirect to dashboard if entire thread was marked
        if (threadId) {
          router.push('/dashboard')
        } else {
          // Refresh the page if just one message
          window.location.reload()
        }
      } else {
        const error = await response.json()
        alert('Failed to mark as spam: ' + error.error)
      }
    } catch (error) {
      console.error('Failed to mark as spam:', error)
      alert('Failed to mark as spam. Please try again.')
    } finally {
      setIsMarking(false)
    }
  }

  const toggleMessageSelection = (messageId: string) => {
    const newSelection = new Set(selectedMessages)
    if (newSelection.has(messageId)) {
      newSelection.delete(messageId)
    } else {
      newSelection.add(messageId)
    }
    setSelectedMessages(newSelection)
  }

  const markSelectedAsSpam = async () => {
    if (selectedMessages.size === 0) {
      alert('Please select messages to mark as spam')
      return
    }

    if (!confirm(`Are you sure you want to mark ${selectedMessages.size} message(s) as spam?`)) {
      return
    }

    setIsMarking(true)
    try {
      for (const messageId of selectedMessages) {
        await markAsSpam(undefined, messageId)
      }
      setSelectedMessages(new Set())
    } finally {
      setIsMarking(false)
    }
  }

  const fileAndDone = async () => {
    if (!confirm('File this email thread to the appropriate folder and mark as done? It will be moved to the processed list and hidden from your active emails.')) {
      return
    }

    setIsProcessing(true)
    try {
      const response = await fetch('/api/emails/processing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'file_and_done',
          threadId: thread.id
        })
      })

      if (response.ok) {
        const result = await response.json()
        alert(result.message || 'Thread filed and marked as done successfully!')
        router.push('/dashboard')
      } else {
        const error = await response.json()
        if (error.requiresSync) {
          alert('Your Microsoft authentication has expired. Please go to the dashboard and click "Sync Emails" to refresh your authentication, then try again.')
          router.push('/dashboard')
        } else {
          alert('Failed to file and mark as done: ' + error.error)
        }
      }
    } catch (error) {
      console.error('Failed to file and mark as done:', error)
      alert('Failed to file and mark as done. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const restoreThread = async () => {
    if (!confirm('Restore this thread to your active emails?')) {
      return
    }

    setIsProcessing(true)
    try {
      const response = await fetch('/api/emails/processing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'unmark_processed',
          threadId: thread.id
        })
      })

      if (response.ok) {
        alert('Thread restored successfully!')
        router.push('/dashboard')
      } else {
        const error = await response.json()
        alert('Failed to restore thread: ' + error.error)
      }
    } catch (error) {
      console.error('Failed to restore thread:', error)
      alert('Failed to restore thread. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const createRuleFromThread = () => {
    setShowRuleDialog(true)
  }

  const categoryBadge = getCategoryBadge(thread.category)
  const CategoryIcon = categoryBadge.icon

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Thread Details</h1>
          </div>
          
          {/* Actions */}
          <div className="flex items-center space-x-2">
            {selectedMessages.size > 0 && (
              <Button
                onClick={markSelectedAsSpam}
                disabled={isMarking}
                variant="destructive"
                size="sm"
                className="flex items-center space-x-2"
              >
                <Trash2 className="h-4 w-4" />
                <span>Mark {selectedMessages.size} as Spam</span>
              </Button>
            )}
            
            {!thread.is_processed ? (
              <Button
                onClick={fileAndDone}
                disabled={isProcessing}
                variant="outline"
                size="sm"
                className="flex items-center space-x-2 text-green-600 hover:text-green-700"
              >
                <CheckCircle className="h-4 w-4" />
                <span>File & Done</span>
              </Button>
            ) : (
              <Button
                onClick={restoreThread}
                disabled={isProcessing}
                variant="outline"
                size="sm"
                className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Restore Thread</span>
              </Button>
            )}
            
            <Button
              onClick={createRuleFromThread}
              variant="outline"
              size="sm"
              className="flex items-center space-x-2 text-purple-600 hover:text-purple-700"
            >
              <Brain className="h-4 w-4" />
              <span>Create Rule</span>
            </Button>
            
            <Button
              onClick={() => markAsSpam(thread.id)}
              disabled={isMarking || thread.category === 'SPAM'}
              variant="outline"
              size="sm"
              className="flex items-center space-x-2 text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
              <span>Mark as Spam</span>
            </Button>
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
                      {thread.is_processed && (
                        <Badge variant="outline" className="text-green-600">
                          Processed
                        </Badge>
                      )}
                    </div>
                    {thread.is_processed && thread.processing_reason && (
                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 italic">
                        Processed: {thread.processing_reason.replace(/_/g, ' ')}
                        {thread.processed_at && ` • ${formatDistanceToNow(new Date(thread.processed_at), { addSuffix: true })}`}
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
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
                    <User className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <div>
                      <p className="text-sm font-medium">Participants</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{thread.participants.length}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Mail className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <div>
                      <p className="text-sm font-medium">Messages</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{thread.message_count}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <div>
                      <p className="text-sm font-medium">Created</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {new Date(thread.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Participants:</p>
                  <div className="flex flex-wrap gap-2">
                    {thread.participants.map((participant: string, index: number) => (
                      <Badge key={`participant-${index}-${participant}`} variant="outline" className="text-xs">
                        {participant}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Messages */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Messages ({messages?.length || 0})</h2>
              
              {messages?.map((message, index) => (
                <div key={message.id} className="relative">
                  {/* Message Metadata */}
                  <div className="mb-3 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedMessages.has(message.id)}
                            onChange={() => toggleMessageSelection(message.id)}
                            className="h-4 w-4 text-blue-600 rounded border-gray-300"
                          />
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{message.from_name || message.from_email}</p>
                          <span className="text-xs text-gray-600 dark:text-gray-400">({message.from_email})</span>
                        </div>
                        
                        <div className="mt-1 space-y-1">
                          {message.to_recipients && message.to_recipients.length > 0 && (
                            <div className="text-xs text-gray-700 dark:text-gray-300">
                              <span className="font-medium">To:</span> {message.to_recipients.join(', ')}
                            </div>
                          )}
                          {message.cc_recipients && message.cc_recipients.length > 0 && (
                            <div className="text-xs text-gray-700 dark:text-gray-300">
                              <span className="font-medium">CC:</span> {message.cc_recipients.join(', ')}
                            </div>
                          )}
                          {message.bcc_recipients && message.bcc_recipients.length > 0 && (
                            <div className="text-xs text-gray-700 dark:text-gray-300">
                              <span className="font-medium">BCC:</span> {message.bcc_recipients.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Button
                          onClick={() => markAsSpam(undefined, message.id)}
                          disabled={isMarking}
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          title="Mark as spam"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <div className="text-right">
                          <div className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                            {new Date(message.received_at).toLocaleDateString()}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {new Date(message.received_at).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Safe Email Content Viewer */}
                  <SafeEmailViewer 
                    subject={message.subject || 'No Subject'}
                    body={message.body || ''}
                    contentType={message.content_type || 'text/html'}
                    className="shadow-sm"
                  />
                  
                  {index < messages.length - 1 && (
                    <div className="mt-6 border-b border-gray-200 dark:border-gray-700" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* AI Assistant - Right Column */}
          <div className="lg:col-span-1">
            <AIEmailAssistant threadId={thread.id} />
          </div>
        </div>
      </div>

      {/* Rule Creation Dialog */}
      {showRuleDialog && (
        <ThreadRuleDialog
          threadId={thread.id}
          thread={thread}
          onClose={() => setShowRuleDialog(false)}
          onRuleCreated={() => {
            setShowRuleDialog(false)
            alert('AI processing rule created successfully!')
          }}
        />
      )}
    </div>
  )
}

// Thread Rule Creation Dialog Component
interface ThreadRuleDialogProps {
  threadId: string
  thread: EmailThread
  onClose: () => void
  onRuleCreated: () => void
}

function ThreadRuleDialog({ threadId, thread, onClose, onRuleCreated }: ThreadRuleDialogProps) {
  const [instruction, setInstruction] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const createRule = async () => {
    if (!instruction.trim()) return

    setIsCreating(true)
    try {
      const response = await fetch('/api/emails/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          instruction: instruction,
          threadId: threadId
        })
      })

      if (response.ok) {
        onRuleCreated()
      } else {
        const error = await response.json()
        alert('Failed to create rule: ' + error.error)
      }
    } catch (error) {
      console.error('Failed to create rule:', error)
      alert('Failed to create rule. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-purple-600" />
              <h2 className="text-lg font-semibold">Create AI Processing Rule</h2>
            </div>
            <Button onClick={onClose} variant="ghost" size="sm">
              ×
            </Button>
          </div>

          {/* Thread Context */}
          <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h3 className="text-sm font-medium mb-2">Email Context:</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              <strong>Subject:</strong> {thread.subject}
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              <strong>Category:</strong> {thread.category}
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>Participants:</strong> {thread.participants.slice(0, 3).join(', ')}
              {thread.participants.length > 3 && ` +${thread.participants.length - 3} more`}
            </p>
          </div>

          {/* Instruction Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              How should the AI handle emails like this in the future?
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Example: These admin notifications require no action. Move them to the Admin folder and mark as processed. I don't need to waste time on them going forward."
              rows={4}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3">
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button
              onClick={createRule}
              disabled={isCreating || !instruction.trim()}
              className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700"
            >
              <Brain className={`h-4 w-4 ${isCreating ? 'animate-pulse' : ''}`} />
              <span>{isCreating ? 'Creating...' : 'Create Rule'}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}