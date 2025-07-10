'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Mail, 
  Clock, 
  AlertCircle, 
  User, 
  FileText, 
  Calendar,
  DollarSign,
  Star,
  RefreshCw,
  Trash2,
  CheckCircle,
  RotateCcw,
  Brain
} from 'lucide-react'

interface EmailThread {
  id: string
  subject: string
  participants: string[]
  last_message_date: string
  message_count: number
  has_unread: boolean
  is_action_required: boolean
  category: 'ACTION_REQUIRED' | 'FYI_ONLY' | 'FINANCIAL' | 'MEETING_REQUEST' | 'VIP_CRITICAL'
  priority: number
  is_processed?: boolean
  is_hidden?: boolean
  processed_at?: string
  processing_reason?: string
}

interface EmailThreadListProps {
  threads: EmailThread[]
  showProcessed?: boolean
  onThreadUpdated?: () => void
}

export function EmailThreadList({ threads, showProcessed = false, onThreadUpdated }: EmailThreadListProps) {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const [syncStats, setSyncStats] = useState<any>(null)
  const [mounted, setMounted] = useState(false)
  const [markingSpam, setMarkingSpam] = useState<string | null>(null)
  const [processingThread, setProcessingThread] = useState<string | null>(null)
  const [showRuleDialog, setShowRuleDialog] = useState<{threadId: string, thread: EmailThread} | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Filter threads based on selected category
  const filteredThreads = threads.filter(thread => {
    if (selectedCategory === 'all') return true
    if (selectedCategory === 'unread') return thread.has_unread
    if (selectedCategory === 'action') return thread.is_action_required
    return thread.category === selectedCategory
  })

  // Get category badge variant
  const getCategoryBadge = (category: EmailThread['category']) => {
    switch (category) {
      case 'VIP_CRITICAL': return { variant: 'destructive' as const, icon: Star, label: 'VIP' }
      case 'ACTION_REQUIRED': return { variant: 'default' as const, icon: AlertCircle, label: 'Action Required' }
      case 'FINANCIAL': return { variant: 'secondary' as const, icon: DollarSign, label: 'Financial' }
      case 'MEETING_REQUEST': return { variant: 'outline' as const, icon: Calendar, label: 'Meeting' }
      case 'FYI_ONLY': return { variant: 'outline' as const, icon: FileText, label: 'FYI' }
      default: return { variant: 'outline' as const, icon: Mail, label: 'Email' }
    }
  }

  // Get priority color
  const getPriorityColor = (priority: number) => {
    if (priority === 1) return 'text-red-600'
    if (priority === 2) return 'text-orange-600'
    if (priority === 3) return 'text-yellow-600'
    return 'text-gray-700 dark:text-gray-300'
  }

  // Sync emails
  const syncEmails = async () => {
    setSyncStatus('syncing')
    try {
      const response = await fetch('/api/email/sync', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for authentication
      })
      
      if (response.ok) {
        setSyncStatus('success')
        setTimeout(() => setSyncStatus('idle'), 3000)
        // Refresh the page to show new emails
        window.location.reload()
      } else {
        const errorData = await response.json()
        console.error('Sync error:', errorData)
        
        // Handle specific error cases
        if (errorData.code === 'AUTH_REQUIRED' || 
            errorData.error?.includes('Authentication expired') ||
            errorData.error?.includes('re-authenticate')) {
          if (confirm('Your Microsoft authentication has expired. Would you like to reconnect now?')) {
            window.location.href = '/auth/login'
          }
        } else if (response.status === 401) {
          alert('Authentication required. Please refresh the page and try again.')
        } else {
          alert(`Sync failed: ${errorData.error || 'Unknown error'}`)
          console.error('Sync failed:', errorData.details || errorData.error)
        }
        
        setSyncStatus('error')
        setTimeout(() => setSyncStatus('idle'), 3000)
      }
    } catch (error) {
      console.error('Sync request failed:', error)
      setSyncStatus('error')
      setTimeout(() => setSyncStatus('idle'), 3000)
    }
  }

  // Mark thread as spam
  const markAsSpam = async (threadId: string, event: React.MouseEvent) => {
    event.preventDefault() // Prevent navigation
    event.stopPropagation()
    
    if (!confirm('Are you sure you want to mark this thread as spam? This will move all emails in the thread to your junk folder and remove them from this system.')) {
      return
    }

    setMarkingSpam(threadId)
    try {
      const response = await fetch('/api/email/spam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId })
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Thread marked as spam:', result.message)
        // Refresh the page to show updated list
        window.location.reload()
      } else {
        const error = await response.json()
        alert('Failed to mark as spam: ' + error.error)
      }
    } catch (error) {
      console.error('Failed to mark as spam:', error)
      alert('Failed to mark as spam. Please try again.')
    } finally {
      setMarkingSpam(null)
    }
  }

  // File thread and mark as processed (done)
  const fileAndDone = async (threadId: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    
    if (!confirm('File this email thread to the appropriate folder and mark as done? It will be moved to the processed list and hidden from your active emails.')) {
      return
    }

    setProcessingThread(threadId)
    try {
      const response = await fetch('/api/emails/processing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'file_and_done',
          threadId
        })
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Thread filed and marked as done:', result.message)
        onThreadUpdated?.()
      } else {
        const error = await response.json()
        if (error.requiresSync) {
          alert('Your Microsoft authentication has expired. Please click "Sync Emails" to refresh your authentication, then try again.')
        } else {
          alert('Failed to file and mark as done: ' + error.error)
        }
      }
    } catch (error) {
      console.error('Failed to file and mark as done:', error)
      alert('Failed to file and mark as done. Please try again.')
    } finally {
      setProcessingThread(null)
    }
  }

  // Restore processed thread
  const restoreThread = async (threadId: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    
    if (!confirm('Restore this thread to your active emails?')) {
      return
    }

    setProcessingThread(threadId)
    try {
      const response = await fetch('/api/emails/processing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'unmark_processed',
          threadId
        })
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Thread restored:', result.message)
        onThreadUpdated?.()
      } else {
        const error = await response.json()
        alert('Failed to restore thread: ' + error.error)
      }
    } catch (error) {
      console.error('Failed to restore thread:', error)
      alert('Failed to restore thread. Please try again.')
    } finally {
      setProcessingThread(null)
    }
  }

  // Create processing rule from thread
  const createRuleFromThread = async (threadId: string, thread: EmailThread, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    
    setShowRuleDialog({ threadId, thread })
  }

  // Get sync status
  useEffect(() => {
    const fetchSyncStatus = async () => {
      try {
        const response = await fetch('/api/email/sync', {
          credentials: 'include' // Include cookies for authentication
        })
        if (response.ok) {
          const data = await response.json()
          setSyncStats(data)
        }
      } catch (error) {
        console.error('Failed to fetch sync status:', error)
        // Set default stats if API fails
        setSyncStats({
          syncStatus: 'idle',
          lastSyncAt: null,
          stats: {
            totalThreads: threads.length,
            unreadThreads: threads.filter(t => t.has_unread).length,
            actionRequired: threads.filter(t => t.is_action_required).length,
            categories: {
              VIP_CRITICAL: threads.filter(t => t.category === 'VIP_CRITICAL').length,
              ACTION_REQUIRED: threads.filter(t => t.category === 'ACTION_REQUIRED').length,
              FINANCIAL: threads.filter(t => t.category === 'FINANCIAL').length,
              MEETING_REQUEST: threads.filter(t => t.category === 'MEETING_REQUEST').length,
              FYI_ONLY: threads.filter(t => t.category === 'FYI_ONLY').length,
            }
          }
        })
      }
    }

    fetchSyncStatus()
  }, [threads])

  return (
    <div className="space-y-6">
      {/* Sync Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            onClick={syncEmails}
            disabled={syncStatus === 'syncing'}
            className="flex items-center space-x-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            <span>
              {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Emails'}
            </span>
          </Button>
          
          {syncStats && (
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Last sync: {syncStats.lastSyncAt ? 
                formatDistanceToNow(new Date(syncStats.lastSyncAt), { addSuffix: true }) : 
                'Never'
              }
            </div>
          )}
        </div>

        {syncStatus === 'success' && (
          <Badge variant="outline" className="text-green-600">
            Sync completed successfully
          </Badge>
        )}
        
        {syncStatus === 'error' && (
          <Badge variant="destructive">
            Sync failed
          </Badge>
        )}
      </div>

      {/* Category Tabs */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="all">All ({threads.length})</TabsTrigger>
          <TabsTrigger value="unread">
            Unread ({threads.filter(t => t.has_unread).length})
          </TabsTrigger>
          <TabsTrigger value="action">
            Action ({threads.filter(t => t.is_action_required).length})
          </TabsTrigger>
          <TabsTrigger value="VIP_CRITICAL">
            VIP ({threads.filter(t => t.category === 'VIP_CRITICAL').length})
          </TabsTrigger>
          <TabsTrigger value="FINANCIAL">
            Financial ({threads.filter(t => t.category === 'FINANCIAL').length})
          </TabsTrigger>
          <TabsTrigger value="MEETING_REQUEST">
            Meetings ({threads.filter(t => t.category === 'MEETING_REQUEST').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={selectedCategory} className="mt-6">
          {/* Thread List */}
          <div className="space-y-4">
            {filteredThreads.length === 0 ? (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <Mail className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-700 dark:text-gray-300">No email threads found</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      Try syncing your emails or check a different category
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              filteredThreads.map((thread) => {
                const categoryBadge = getCategoryBadge(thread.category)
                const CategoryIcon = categoryBadge.icon
                
                return (
                  <Link key={thread.id} href={`/dashboard/thread/${thread.id}`}>
                    <Card className={`group cursor-pointer transition-all hover:shadow-md ${
                      thread.has_unread ? 'border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800' : ''
                    }`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <CardTitle className={`text-lg ${thread.has_unread ? 'font-bold' : 'font-medium'}`}>
                            {thread.subject}
                          </CardTitle>
                          <div className="flex items-center space-x-2 mt-2">
                            <Badge variant={categoryBadge.variant} className="flex items-center space-x-1">
                              <CategoryIcon className="h-3 w-3" />
                              <span>{categoryBadge.label}</span>
                            </Badge>
                            <div className={`flex items-center space-x-1 ${getPriorityColor(thread.priority)}`}>
                              <AlertCircle className="h-3 w-3" />
                              <span className="text-xs font-medium">Priority {thread.priority}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                          <Clock className="h-4 w-4" />
                          <span>
                            {mounted 
                              ? formatDistanceToNow(new Date(thread.last_message_date), { addSuffix: true })
                              : new Date(thread.last_message_date).toLocaleDateString()
                            }
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-1">
                            <User className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {thread.participants.length} participant{thread.participants.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Mail className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {thread.message_count} message{thread.message_count !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
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
                          
                          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!thread.is_processed ? (
                              <Button
                                onClick={(e) => fileAndDone(thread.id, e)}
                                disabled={processingThread === thread.id}
                                variant="ghost"
                                size="sm"
                                className="text-green-600 hover:text-green-700"
                                title="File & done"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                onClick={(e) => restoreThread(thread.id, e)}
                                disabled={processingThread === thread.id}
                                variant="ghost"
                                size="sm"
                                className="text-blue-600 hover:text-blue-700"
                                title="Restore to active"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              onClick={(e) => createRuleFromThread(thread.id, thread, e)}
                              variant="ghost"
                              size="sm"
                              className="text-purple-600 hover:text-purple-700"
                              title="Create AI rule from this email"
                            >
                              <Brain className="h-4 w-4" />
                            </Button>
                            <Button
                              onClick={(e) => markAsSpam(thread.id, e)}
                              disabled={markingSpam === thread.id}
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              title="Mark as spam"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-3 text-sm text-gray-700 dark:text-gray-300">
                        <span className="font-medium">Participants:</span> {thread.participants.slice(0, 3).join(', ')}
                        {thread.participants.length > 3 && ` +${thread.participants.length - 3} more`}
                      </div>
                      
                      {thread.is_processed && thread.processing_reason && (
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                          Processed: {thread.processing_reason.replace(/_/g, ' ')}
                          {thread.processed_at && ` • ${formatDistanceToNow(new Date(thread.processed_at), { addSuffix: true })}`}
                        </div>
                      )}
                    </CardContent>
                    </Card>
                  </Link>
                )
              })
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Rule Creation Dialog */}
      {showRuleDialog && (
        <ThreadRuleDialog
          threadId={showRuleDialog.threadId}
          thread={showRuleDialog.thread}
          onClose={() => setShowRuleDialog(null)}
          onRuleCreated={() => {
            setShowRuleDialog(null)
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