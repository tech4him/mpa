'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
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
  RefreshCw
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
  priority: 'high' | 'medium' | 'low'
}

interface EmailThreadListProps {
  threads: EmailThread[]
}

export function EmailThreadList({ threads }: EmailThreadListProps) {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const [syncStats, setSyncStats] = useState<any>(null)

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
  const getPriorityColor = (priority: EmailThread['priority']) => {
    switch (priority) {
      case 'high': return 'text-red-600'
      case 'medium': return 'text-yellow-600'
      case 'low': return 'text-green-600'
      default: return 'text-gray-600'
    }
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
        if (errorData.code === 'AUTH_REQUIRED') {
          alert('Microsoft authentication expired. Please sign out and sign in again.')
        } else if (response.status === 401) {
          alert('Authentication required. Please refresh the page and try again.')
        } else {
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
            <div className="text-sm text-gray-600">
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
                    <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No email threads found</p>
                    <p className="text-sm text-gray-500 mt-2">
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
                  <Card key={thread.id} className={`cursor-pointer transition-all hover:shadow-md ${
                    thread.has_unread ? 'border-blue-200 bg-blue-50/50' : ''
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
                              <span className="text-xs font-medium capitalize">{thread.priority}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2 text-sm text-gray-500">
                          <Clock className="h-4 w-4" />
                          <span>{formatDistanceToNow(new Date(thread.last_message_date), { addSuffix: true })}</span>
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-1">
                            <User className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-600">
                              {thread.participants.length} participant{thread.participants.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Mail className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-600">
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
                        </div>
                      </div>
                      
                      <div className="mt-3 text-sm text-gray-600">
                        <span className="font-medium">Participants:</span> {thread.participants.slice(0, 3).join(', ')}
                        {thread.participants.length > 3 && ` +${thread.participants.length - 3} more`}
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}