'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertTriangle, CheckCircle, Clock, Users, TrendingUp, RefreshCw, MessageSquare, Calendar, Archive } from 'lucide-react'
import { DailyBriefing, IntelligentAction } from '@/types'

interface DailyBriefingProps {
  briefing?: DailyBriefing | null
  onRefresh?: () => void
  loading?: boolean
}

export function DailyBriefingComponent({ briefing, onRefresh, loading = false }: DailyBriefingProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const [actionsLoading, setActionsLoading] = useState(false)

  const handleActionResponse = async (actionId: string, status: 'approved' | 'rejected', feedback?: string) => {
    setActionsLoading(true)
    try {
      const response = await fetch(`/api/actions/${actionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, user_feedback: feedback })
      })
      
      if (response.ok) {
        onRefresh?.()
      }
    } catch (error) {
      console.error('Error updating action:', error)
    }
    setActionsLoading(false)
  }

  const generateBriefing = async () => {
    setActionsLoading(true)
    try {
      const response = await fetch('/api/briefing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefingType: 'morning' })
      })
      
      if (response.ok) {
        onRefresh?.()
      }
    } catch (error) {
      console.error('Error generating briefing:', error)
    }
    setActionsLoading(false)
  }

  if (!briefing) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Daily Intelligence Briefing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-8">
            <div className="text-muted-foreground mb-4">
              No briefing available for today
            </div>
            <Button 
              onClick={generateBriefing} 
              disabled={loading || actionsLoading}
              className="gap-2"
            >
              {loading || actionsLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )}
              Generate Morning Briefing
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const summary = briefing.intelligence_summary
  const actions = briefing.actions_recommended || []
  const automatedActions = briefing.actions_taken_automatically || []

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Morning Intelligence Briefing
              <Badge variant={briefing.priority_score >= 8 ? 'destructive' : briefing.priority_score >= 6 ? 'default' : 'secondary'}>
                Priority {briefing.priority_score}/10
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {new Date(briefing.briefing_date).toLocaleDateString()}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onRefresh}
                disabled={loading}
                className="gap-2"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {summary.key_metrics?.unread_important || 0}
              </div>
              <div className="text-sm text-muted-foreground">Important Unread</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {summary.key_metrics?.pending_responses || 0}
              </div>
              <div className="text-sm text-muted-foreground">Pending Responses</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {summary.key_metrics?.overdue_tasks || 0}
              </div>
              <div className="text-sm text-muted-foreground">Overdue Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {summary.key_metrics?.vip_threads || 0}
              </div>
              <div className="text-sm text-muted-foreground">VIP Threads</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="actions" className="relative">
            Actions
            {actions.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 text-xs">
                {actions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="anomalies">
            Anomalies
            {summary.anomalies?.length > 0 && (
              <Badge variant="outline" className="ml-1 h-5 w-5 p-0 text-xs">
                {summary.anomalies.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="automated">Automated</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Need to Know */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Need to Know
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.need_to_know?.length > 0 ? (
                summary.need_to_know.map((item, index) => (
                  <div key={index} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h4 className="font-medium">{item.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                      </div>
                      <Badge variant={
                        item.urgency === 'high' ? 'destructive' : 
                        item.urgency === 'medium' ? 'default' : 'secondary'
                      }>
                        {item.urgency}
                      </Badge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  No critical items to review
                </div>
              )}
            </CardContent>
          </Card>

          {/* Need to Do */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Need to Do
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.need_to_do?.length > 0 ? (
                summary.need_to_do.map((task, index) => (
                  <div key={index} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium">{task.task}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm text-muted-foreground">{task.source}</span>
                          {task.due && (
                            <>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(task.due).toLocaleDateString()}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline">P{task.priority}</Badge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  No pending tasks
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Actions Tab */}
        <TabsContent value="actions" className="space-y-4">
          {actions.length > 0 ? (
            actions.map((action) => (
              <ActionCard 
                key={action.id} 
                action={action} 
                onResponse={handleActionResponse}
                loading={actionsLoading}
              />
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No actions requiring your attention
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Anomalies Tab */}
        <TabsContent value="anomalies" className="space-y-4">
          {summary.anomalies?.length > 0 ? (
            summary.anomalies.map((anomaly, index) => (
              <Card key={index}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`h-5 w-5 mt-0.5 ${
                      anomaly.severity === 'critical' ? 'text-red-500' :
                      anomaly.severity === 'warning' ? 'text-orange-500' : 'text-blue-500'
                    }`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium">{anomaly.type.replace('_', ' ').toUpperCase()}</h4>
                        <Badge variant={
                          anomaly.severity === 'critical' ? 'destructive' :
                          anomaly.severity === 'warning' ? 'default' : 'secondary'
                        }>
                          {anomaly.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{anomaly.description}</p>
                      <p className="text-sm font-medium">{anomaly.recommendation}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No anomalies detected
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Automated Actions Tab */}
        <TabsContent value="automated" className="space-y-4">
          {automatedActions.length > 0 ? (
            automatedActions.map((action, index) => (
              <Card key={index}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <CheckCircle className={`h-5 w-5 ${
                      action.result === 'success' ? 'text-green-500' :
                      action.result === 'failed' ? 'text-red-500' : 'text-orange-500'
                    }`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{action.action_type.replace('_', ' ').toUpperCase()}</h4>
                        <Badge variant={
                          action.result === 'success' ? 'default' :
                          action.result === 'failed' ? 'destructive' : 'secondary'
                        }>
                          {action.result}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{action.description}</p>
                      <span className="text-xs text-muted-foreground">
                        {new Date(action.executed_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No automated actions taken
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ActionCard({ action, onResponse, loading }: {
  action: IntelligentAction
  onResponse: (id: string, status: 'approved' | 'rejected', feedback?: string) => void
  loading: boolean
}) {
  const [feedback, setFeedback] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'draft_reply': return <MessageSquare className="h-4 w-4" />
      case 'schedule_meeting': return <Calendar className="h-4 w-4" />
      case 'schedule_follow_up': return <Clock className="h-4 w-4" />
      case 'file_document': return <Archive className="h-4 w-4" />
      default: return <CheckCircle className="h-4 w-4" />
    }
  }

  const getUrgencyColor = (level: number) => {
    if (level >= 8) return 'destructive'
    if (level >= 6) return 'default'
    return 'secondary'
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {getActionIcon(action.action_type)}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium">
                    {action.action_type.replace('_', ' ').toUpperCase()}
                  </h4>
                  <Badge variant={getUrgencyColor(action.urgency_level)}>
                    Urgency {action.urgency_level}/10
                  </Badge>
                  <Badge variant="outline">
                    {Math.round(action.confidence_score * 100)}% confidence
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {action.trigger_context}
                </p>
                <div className="text-sm">
                  <strong>Recommended Action:</strong> {JSON.stringify(action.recommended_action.details)}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => onResponse(action.id, 'approved', feedback)}
              disabled={loading}
              className="gap-2"
            >
              <CheckCircle className="h-3 w-3" />
              Approve
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onResponse(action.id, 'rejected', feedback)}
              disabled={loading}
              className="gap-2"
            >
              Reject
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFeedback(!showFeedback)}
            >
              Add Feedback
            </Button>
          </div>

          {showFeedback && (
            <div className="space-y-2">
              <textarea
                className="w-full p-2 border rounded-md text-sm"
                placeholder="Optional feedback..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={2}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}