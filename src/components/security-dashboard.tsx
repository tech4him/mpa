'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Shield, 
  AlertTriangle, 
  Ban, 
  Trash2, 
  Eye,
  AlertCircle,
  CheckCircle,
  XCircle
} from 'lucide-react'

interface SecurityAnalysis {
  id: string
  email_id: string
  sender: string
  subject: string
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  indicators: string[]
  confidence: number
  recommended_action: 'allow' | 'quarantine' | 'delete' | 'report'
  reasoning: string
  analysis_date: string
  email_messages: {
    id: string
    subject: string
    from_email: string
    from_name: string
    sent_date: string
  }
}

interface SecurityStats {
  totalAnalyses: number
  riskLevels: {
    low: number
    medium: number
    high: number
    critical: number
  }
  actions: {
    allowed: number
    quarantined: number
    deleted: number
    reported: number
  }
  openIncidents: number
}

export function SecurityDashboard() {
  const [analyses, setAnalyses] = useState<SecurityAnalysis[]>([])
  const [stats, setStats] = useState<SecurityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string>('all')

  useEffect(() => {
    fetchSecurityData()
  }, [])

  const fetchSecurityData = async () => {
    try {
      const response = await fetch('/api/security/analyze')
      if (response.ok) {
        const data = await response.json()
        setAnalyses(data.analyses)
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Failed to fetch security data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSecurityAction = async (messageId: string, action: string) => {
    try {
      const response = await fetch('/api/security/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId,
          action,
        }),
      })

      if (response.ok) {
        // Refresh data after action
        await fetchSecurityData()
      }
    } catch (error) {
      console.error('Failed to execute security action:', error)
    }
  }

  const getRiskBadge = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical': return { variant: 'destructive' as const, icon: XCircle, color: 'text-red-600' }
      case 'high': return { variant: 'destructive' as const, icon: AlertTriangle, color: 'text-orange-600' }
      case 'medium': return { variant: 'secondary' as const, icon: AlertCircle, color: 'text-yellow-600' }
      case 'low': return { variant: 'outline' as const, icon: CheckCircle, color: 'text-green-600' }
      default: return { variant: 'outline' as const, icon: Shield, color: 'text-gray-600' }
    }
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'quarantine': return Ban
      case 'delete': return Trash2
      case 'report': return AlertTriangle
      default: return Eye
    }
  }

  const filteredAnalyses = analyses.filter(analysis => {
    if (selectedRiskLevel === 'all') return true
    return analysis.risk_level === selectedRiskLevel
  })

  if (loading) {
    return <div className="flex justify-center p-8">Loading security data...</div>
  }

  return (
    <div className="space-y-6">
      {/* Security Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Analyses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalAnalyses}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">High Risk</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {stats.riskLevels.high + stats.riskLevels.critical}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Quarantined</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {stats.actions.quarantined}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Open Incidents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {stats.openIncidents}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Security Analyses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Security Analyses</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedRiskLevel} onValueChange={setSelectedRiskLevel}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">All ({analyses.length})</TabsTrigger>
              <TabsTrigger value="critical">
                Critical ({stats?.riskLevels.critical || 0})
              </TabsTrigger>
              <TabsTrigger value="high">
                High ({stats?.riskLevels.high || 0})
              </TabsTrigger>
              <TabsTrigger value="medium">
                Medium ({stats?.riskLevels.medium || 0})
              </TabsTrigger>
              <TabsTrigger value="low">
                Low ({stats?.riskLevels.low || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={selectedRiskLevel} className="mt-6">
              <div className="space-y-4">
                {filteredAnalyses.length === 0 ? (
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No security analyses found</p>
                  </div>
                ) : (
                  filteredAnalyses.map((analysis) => {
                    const riskBadge = getRiskBadge(analysis.risk_level)
                    const RiskIcon = riskBadge.icon
                    const ActionIcon = getActionIcon(analysis.recommended_action)
                    
                    return (
                      <Card key={analysis.id} className={`${
                        analysis.risk_level === 'critical' ? 'border-red-200 bg-red-50/50' :
                        analysis.risk_level === 'high' ? 'border-orange-200 bg-orange-50/50' :
                        analysis.risk_level === 'medium' ? 'border-yellow-200 bg-yellow-50/50' :
                        ''
                      }`}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-2">
                                <Badge variant={riskBadge.variant} className="flex items-center space-x-1">
                                  <RiskIcon className="h-3 w-3" />
                                  <span>{analysis.risk_level.toUpperCase()}</span>
                                </Badge>
                                <Badge variant="outline" className="flex items-center space-x-1">
                                  <ActionIcon className="h-3 w-3" />
                                  <span>{analysis.recommended_action}</span>
                                </Badge>
                                <span className="text-sm text-gray-500">
                                  {Math.round(analysis.confidence * 100)}% confidence
                                </span>
                              </div>
                              <CardTitle className="text-lg font-medium">
                                {analysis.email_messages.subject}
                              </CardTitle>
                              <p className="text-sm text-gray-600 mt-1">
                                From: {analysis.email_messages.from_name} &lt;{analysis.email_messages.from_email}&gt;
                              </p>
                            </div>
                            
                            <div className="text-sm text-gray-500">
                              {formatDistanceToNow(new Date(analysis.analysis_date), { addSuffix: true })}
                            </div>
                          </div>
                        </CardHeader>
                        
                        <CardContent>
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm font-medium text-gray-700">Reasoning:</p>
                              <p className="text-sm text-gray-600">{analysis.reasoning}</p>
                            </div>
                            
                            {analysis.indicators.length > 0 && (
                              <div>
                                <p className="text-sm font-medium text-gray-700">Indicators:</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {analysis.indicators.map((indicator, index) => (
                                    <Badge key={index} variant="outline" className="text-xs">
                                      {indicator}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {(analysis.risk_level === 'high' || analysis.risk_level === 'critical') && (
                              <div className="flex space-x-2 pt-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSecurityAction(analysis.email_id, 'quarantine')}
                                  className="flex items-center space-x-1"
                                >
                                  <Ban className="h-4 w-4" />
                                  <span>Quarantine</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSecurityAction(analysis.email_id, 'delete')}
                                  className="flex items-center space-x-1"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span>Delete</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSecurityAction(analysis.email_id, 'report')}
                                  className="flex items-center space-x-1"
                                >
                                  <AlertTriangle className="h-4 w-4" />
                                  <span>Report</span>
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}