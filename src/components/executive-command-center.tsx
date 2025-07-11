'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Users, 
  TrendingUp, 
  Calendar,
  FileText,
  ArrowRight,
  RefreshCw,
  ExternalLink
} from 'lucide-react'

interface Commitment {
  id: string
  description: string
  due_date: string
  status: 'pending' | 'in_progress' | 'overdue'
  committed_to: string
  days_until_due: number
}

interface RelationshipAlert {
  contact_email: string
  contact_name: string
  days_since_contact: number
  relationship_type: string
  importance_score: number
}

interface PriorityAction {
  id: string
  title: string
  description: string
  urgency: 'high' | 'medium' | 'low'
  suggested_actions: string[]
}

interface ExecutiveIntelligence {
  priority_actions: PriorityAction[]
  commitments: Commitment[]
  relationship_alerts: RelationshipAlert[]
  automated_actions: string[]
  intelligence_summary: {
    total_communications: number
    decisions_needed: number
    commitments_tracked: number
    relationships_healthy: number
  }
}

export function ExecutiveCommandCenter() {
  const [intelligence, setIntelligence] = useState<ExecutiveIntelligence | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()

  const loadIntelligence = async () => {
    try {
      const response = await fetch('/api/executive/intelligence')
      if (response.ok) {
        const data = await response.json()
        setIntelligence(data)
      }
    } catch (error) {
      console.error('Error loading executive intelligence:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadIntelligence()
  }

  const handleAction = (actionId: string, action: string) => {
    // Navigate to actionable pages instead of showing useless popups
    if (actionId === 'overdue-commitments') {
      // Navigate to a commitments/tasks page
      router.push('/dashboard?tab=commitments')
    } else if (actionId === 'urgent-emails') {
      if (action === 'Review All') {
        // Navigate to emails filtered by ACTION_REQUIRED
        router.push('/dashboard?tab=emails&filter=action_required')
      } else if (action === 'Generate Drafts') {
        // Navigate to drafts page
        router.push('/dashboard?tab=emails&action=generate_drafts')
      } else if (action === 'Delegate') {
        // Navigate to emails with delegation view
        router.push('/dashboard?tab=emails&action=delegate')
      }
    } else if (actionId === 'pending-drafts') {
      // Navigate to drafts for review
      router.push('/dashboard?tab=emails&filter=drafts')
    } else if (actionId === 'relationship-health') {
      // Navigate to contacts/relationship management
      router.push('/dashboard?tab=relationships')
    }
  }

  useEffect(() => {
    loadIntelligence()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Executive Command Center</h2>
          <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (!intelligence) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 mb-4">
          <TrendingUp className="h-12 w-12 mx-auto" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Intelligence Data</h3>
        <p className="text-gray-500 mb-4">
          Your AI assistant is still learning about your work patterns.
        </p>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Intelligence
        </Button>
      </div>
    )
  }

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low': return 'bg-green-100 text-green-800 border-green-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'overdue': return 'bg-red-100 text-red-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'in_progress': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Executive Command Center</h2>
          <p className="text-gray-500 mt-1">
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh Intelligence'}
        </Button>
      </div>

      {/* Intelligence Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Decisions Needed</p>
                <p className="text-2xl font-bold text-gray-900">
                  {intelligence.intelligence_summary.decisions_needed}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Commitments Tracked</p>
                <p className="text-2xl font-bold text-gray-900">
                  {intelligence.intelligence_summary.commitments_tracked}
                </p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Relationships Healthy</p>
                <p className="text-2xl font-bold text-gray-900">
                  {intelligence.intelligence_summary.relationships_healthy}
                </p>
              </div>
              <Users className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Actions Automated</p>
                <p className="text-2xl font-bold text-gray-900">
                  {intelligence.automated_actions.length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Priority Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-orange-500 mr-2" />
            Priority Actions
          </CardTitle>
          <CardDescription>
            Items requiring your immediate attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          {intelligence.priority_actions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>All caught up! No priority actions need your attention.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {intelligence.priority_actions.map((action) => (
                <div key={action.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{action.title}</h4>
                      <p className="text-sm text-gray-600 mt-1">{action.description}</p>
                    </div>
                    <Badge className={getUrgencyColor(action.urgency)}>
                      {action.urgency}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {action.suggested_actions.map((suggestion, idx) => (
                      <Button
                        key={idx}
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(action.id, suggestion)}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Commitments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="h-5 w-5 text-blue-500 mr-2" />
            Your Commitments
          </CardTitle>
          <CardDescription>
            Promises you've made and deliverables you're tracking
          </CardDescription>
        </CardHeader>
        <CardContent>
          {intelligence.commitments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No active commitments tracked.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {intelligence.commitments.map((commitment) => (
                <div key={commitment.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{commitment.description}</p>
                    <p className="text-sm text-gray-600">
                      To: {commitment.committed_to} • Due: {new Date(commitment.due_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(commitment.status)}>
                      {commitment.status}
                    </Badge>
                    <span className="text-sm text-gray-500">
                      {commitment.days_until_due < 0 
                        ? `${Math.abs(commitment.days_until_due)} days overdue`
                        : `${commitment.days_until_due} days left`
                      }
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Relationship Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="h-5 w-5 text-green-500 mr-2" />
            Relationship Health
          </CardTitle>
          <CardDescription>
            Professional relationships that may need attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          {intelligence.relationship_alerts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>All relationships are healthy!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {intelligence.relationship_alerts.map((alert, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{alert.contact_name || alert.contact_email}</p>
                    <p className="text-sm text-gray-600">
                      {alert.relationship_type} • {alert.days_since_contact} days since last contact
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button size="sm" variant="outline">
                      Send Follow-up
                    </Button>
                    <Button size="sm" variant="outline">
                      Schedule Call
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Automated Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CheckCircle className="h-5 w-5 text-purple-500 mr-2" />
            Handled Automatically
          </CardTitle>
          <CardDescription>
            Actions your AI assistant completed without bothering you
          </CardDescription>
        </CardHeader>
        <CardContent>
          {intelligence.automated_actions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No automated actions yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {intelligence.automated_actions.map((action, idx) => (
                <div key={idx} className="flex items-center p-2 text-sm text-gray-600">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                  {action}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}