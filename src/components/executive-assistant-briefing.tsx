'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Users, 
  TrendingUp, 
  RefreshCw, 
  Brain,
  Target,
  MessageCircle,
  Calendar,
  Eye,
  AlertCircle,
  ChevronRight,
  Lightbulb,
  Shield
} from 'lucide-react'
import { ExecutiveAssistantBriefing } from '@/types/executive-assistant'
import Link from 'next/link'

interface ExecutiveAssistantBriefingProps {
  briefing?: ExecutiveAssistantBriefing | null
  onRefresh?: () => void
  loading?: boolean
}

export function ExecutiveAssistantBriefingComponent({ 
  briefing, 
  onRefresh, 
  loading = false 
}: ExecutiveAssistantBriefingProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const [regenerating, setRegenerating] = useState(false)

  const generateExecutiveBriefing = async (forceRegenerate: boolean = false) => {
    setRegenerating(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const response = await fetch('/api/briefing/executive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          briefingType: 'morning',
          forceRegenerate 
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('Executive briefing generated:', data)
        onRefresh?.()
      } else {
        const error = await response.json()
        console.error('Executive briefing generation failed:', response.status, error)
      }
    } catch (error) {
      console.error('Error generating executive briefing:', error)
    }
    setRegenerating(false)
  }

  if (!briefing) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Executive Intelligence Briefing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-8">
            <div className="text-muted-foreground mb-4">
              No executive briefing available for today
            </div>
            <Button 
              onClick={() => generateExecutiveBriefing()} 
              disabled={loading || regenerating}
              className="gap-2"
            >
              {loading || regenerating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Brain className="h-4 w-4" />
              )}
              Generate Executive Briefing
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const summary = briefing.intelligence_summary as any
  const immediateAttention = summary?.immediate_attention || []
  const projectUpdates = summary?.project_status_updates || []
  const relationshipInsights = summary?.relationship_insights || []
  const strategicInsights = summary?.strategic_insights || []
  const upcomingDecisions = summary?.upcoming_decisions || []
  const gapsAndRisks = summary?.gaps_and_risks || []

  return (
    <div className="w-full space-y-6">
      {/* Executive Summary Header */}
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Executive Intelligence Briefing
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
                disabled={loading || regenerating}
                className="gap-2"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh
              </Button>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => generateExecutiveBriefing(true)}
                disabled={loading || regenerating}
                className="gap-2"
              >
                {loading || regenerating ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Brain className="h-4 w-4" />
                )}
                Re-generate
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Executive Summary
            </h3>
            <p className="text-blue-800">{summary?.executive_summary || briefing.executive_summary}</p>
          </div>
          
          {/* Key Metrics Dashboard */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {immediateAttention.length}
              </div>
              <div className="text-sm text-muted-foreground">Immediate Attention</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {upcomingDecisions.length}
              </div>
              <div className="text-sm text-muted-foreground">Decisions Needed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {projectUpdates.filter((p: any) => p.status === 'at_risk').length}
              </div>
              <div className="text-sm text-muted-foreground">Projects At Risk</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {relationshipInsights.filter((r: any) => r.urgency === 'high').length}
              </div>
              <div className="text-sm text-muted-foreground">Relationship Issues</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview" className="relative">
            <Target className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="attention" className="relative">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Attention
            {immediateAttention.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 text-xs">
                {immediateAttention.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="projects">
            <TrendingUp className="h-4 w-4 mr-2" />
            Projects
          </TabsTrigger>
          <TabsTrigger value="relationships">
            <Users className="h-4 w-4 mr-2" />
            Relationships
          </TabsTrigger>
          <TabsTrigger value="decisions">
            <Calendar className="h-4 w-4 mr-2" />
            Decisions
          </TabsTrigger>
          <TabsTrigger value="insights">
            <Lightbulb className="h-4 w-4 mr-2" />
            Insights
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Top Priority Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Requires Your Immediate Attention
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {immediateAttention.slice(0, 3).map((item: any, index: number) => (
                <div key={index} className="border rounded-lg p-3 bg-red-50 border-red-200">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-red-900">{item.title}</h4>
                      <p className="text-sm text-red-700 mt-1">{item.description}</p>
                      <p className="text-sm font-medium text-red-800 mt-2">
                        Recommended: {item.recommended_action}
                      </p>
                    </div>
                    <Badge variant="destructive">
                      Urgency {item.urgency}/5
                    </Badge>
                  </div>
                </div>
              ))}
              {immediateAttention.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  No immediate attention items today
                </div>
              )}
            </CardContent>
          </Card>

          {/* Project Health Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Project Portfolio Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {projectUpdates.slice(0, 4).map((project: any, index: number) => (
                <div key={index} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{project.project_name}</h4>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        project.status === 'at_risk' ? 'destructive' :
                        project.status === 'stalled' ? 'destructive' :
                        project.status === 'progressing' ? 'default' : 'secondary'
                      }>
                        {project.status}
                      </Badge>
                      <Badge variant="outline">
                        {project.health_trend}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">{project.key_development}</p>
                  {project.action_needed && (
                    <p className="text-sm font-medium">Action: {project.action_needed}</p>
                  )}
                </div>
              ))}
              {projectUpdates.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  No project updates available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Immediate Attention Tab */}
        <TabsContent value="attention" className="space-y-4">
          {immediateAttention.map((item: any, index: number) => (
            <Card key={index}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 mt-0.5 text-red-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium">{item.title}</h4>
                      <Badge variant="destructive">
                        Urgency {item.urgency}/5
                      </Badge>
                      <Badge variant="outline">
                        {item.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                    <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-2">
                      <p className="text-sm font-medium text-blue-900">
                        Recommended Action: {item.recommended_action}
                      </p>
                    </div>
                    {item.timeline && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Timeline: {item.timeline}
                      </div>
                    )}
                    {item.stakeholders_involved && item.stakeholders_involved.length > 0 && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                        <Users className="h-3 w-3" />
                        Involves: {item.stakeholders_involved.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {immediateAttention.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No immediate attention items today
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Projects Tab */}
        <TabsContent value="projects" className="space-y-4">
          {projectUpdates.map((project: any, index: number) => (
            <Card key={index}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-medium">{project.project_name}</h4>
                  <div className="flex items-center gap-2">
                    <Badge variant={
                      project.status === 'at_risk' ? 'destructive' :
                      project.status === 'stalled' ? 'destructive' :
                      project.status === 'progressing' ? 'default' : 'secondary'
                    }>
                      {project.status}
                    </Badge>
                    <Badge variant="outline">
                      {project.health_trend}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{project.key_development}</p>
                {project.action_needed && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-2">
                    <p className="text-sm font-medium text-yellow-900">
                      Action Needed: {project.action_needed}
                    </p>
                  </div>
                )}
                <div className="text-sm text-muted-foreground">
                  Stakeholder Engagement: {project.stakeholder_pulse}
                </div>
              </CardContent>
            </Card>
          ))}
          {projectUpdates.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No project updates available
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Relationships Tab */}
        <TabsContent value="relationships" className="space-y-4">
          {relationshipInsights.map((insight: any, index: number) => (
            <Card key={index}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <MessageCircle className="h-5 w-5 mt-0.5 text-blue-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium">{insight.stakeholder}</h4>
                      <Badge variant={
                        insight.urgency === 'high' ? 'destructive' :
                        insight.urgency === 'medium' ? 'default' : 'secondary'
                      }>
                        {insight.urgency}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{insight.insight}</p>
                    {insight.recommended_action && (
                      <div className="bg-green-50 border border-green-200 rounded p-2">
                        <p className="text-sm font-medium text-green-900">
                          Recommendation: {insight.recommended_action}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {relationshipInsights.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No relationship insights to report
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Decisions Tab */}
        <TabsContent value="decisions" className="space-y-4">
          {upcomingDecisions.map((decision: any, index: number) => (
            <Card key={index}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 mt-0.5 text-purple-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium">{decision.decision}</h4>
                      {decision.deadline && (
                        <Badge variant="outline">
                          Due: {new Date(decision.deadline).toLocaleDateString()}
                        </Badge>
                      )}
                    </div>
                    {decision.stakeholders && decision.stakeholders.length > 0 && (
                      <div className="text-sm text-muted-foreground mb-2">
                        Stakeholders: {decision.stakeholders.join(', ')}
                      </div>
                    )}
                    {decision.information_needed && decision.information_needed.length > 0 && (
                      <div className="mb-2">
                        <p className="text-sm font-medium mb-1">Information Needed:</p>
                        <ul className="text-sm text-muted-foreground list-disc list-inside">
                          {decision.information_needed.map((info: string, idx: number) => (
                            <li key={idx}>{info}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {decision.recommendation && (
                      <div className="bg-purple-50 border border-purple-200 rounded p-2">
                        <p className="text-sm font-medium text-purple-900">
                          Recommendation: {decision.recommendation}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {upcomingDecisions.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No upcoming decisions requiring attention
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Strategic Insights Tab */}
        <TabsContent value="insights" className="space-y-4">
          {strategicInsights.map((insight: any, index: number) => (
            <Card key={index}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Lightbulb className="h-5 w-5 mt-0.5 text-yellow-500" />
                  <div className="flex-1">
                    <h4 className="font-medium mb-2">{insight.insight}</h4>
                    <p className="text-sm text-muted-foreground mb-2">{insight.implications}</p>
                    {insight.recommended_approach && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                        <p className="text-sm font-medium text-yellow-900">
                          Approach: {insight.recommended_approach}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {gapsAndRisks.map((risk: any, index: number) => (
            <Card key={`risk-${index}`}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 mt-0.5 text-red-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium">Gap/Risk Identified</h4>
                      <Badge variant="destructive">Risk</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-1"><strong>Issue:</strong> {risk.issue}</p>
                    <p className="text-sm text-muted-foreground mb-2"><strong>Impact:</strong> {risk.impact}</p>
                    {risk.suggested_intervention && (
                      <div className="bg-red-50 border border-red-200 rounded p-2">
                        <p className="text-sm font-medium text-red-900">
                          Intervention: {risk.suggested_intervention}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {strategicInsights.length === 0 && gapsAndRisks.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No strategic insights or risks detected
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}