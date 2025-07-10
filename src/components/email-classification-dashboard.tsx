'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Filter, 
  Archive, 
  EyeOff, 
  CheckCircle,
  XCircle,
  Building,
  Users,
  FileText,
  Mail,
  AlertCircle
} from 'lucide-react'

interface EmailClassification {
  id: string
  email_id: string
  sender: string
  subject: string
  is_relevant: boolean
  category: 'BUSINESS_RELEVANT' | 'PROMOTIONAL' | 'SOCIAL' | 'NEWSLETTER' | 'SPAM' | 'PERSONAL'
  business_context: 'MISSION_MUTUAL' | 'INSURANCE_INDUSTRY' | 'CHRISTIAN_MINISTRY' | 'EXTERNAL' | 'UNRELATED'
  should_index: boolean
  should_archive: boolean
  reasoning: string
  confidence: number
  classification_date: string
}

interface ClassificationStats {
  totalClassifications: number
  categories: {
    BUSINESS_RELEVANT: number
    PROMOTIONAL: number
    SOCIAL: number
    NEWSLETTER: number
    SPAM: number
    PERSONAL: number
  }
  businessContexts: {
    MISSION_MUTUAL: number
    INSURANCE_INDUSTRY: number
    CHRISTIAN_MINISTRY: number
    EXTERNAL: number
    UNRELATED: number
  }
  indexedEmails: number
  archivedEmails: number
}

export function EmailClassificationDashboard() {
  const [classifications, setClassifications] = useState<EmailClassification[]>([])
  const [stats, setStats] = useState<ClassificationStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  useEffect(() => {
    fetchClassificationData()
  }, [])

  const fetchClassificationData = async () => {
    try {
      const response = await fetch('/api/email/classifications')
      if (response.ok) {
        const data = await response.json()
        setClassifications(data.classifications)
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Failed to fetch classification data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEmailAction = async (emailId: string, action: string) => {
    try {
      const response = await fetch('/api/email/classifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emailId,
          action,
        }),
      })

      if (response.ok) {
        // Refresh data after action
        await fetchClassificationData()
      }
    } catch (error) {
      console.error('Failed to execute email action:', error)
    }
  }

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'BUSINESS_RELEVANT': return { variant: 'default' as const, icon: Building, color: 'text-blue-600' }
      case 'PROMOTIONAL': return { variant: 'secondary' as const, icon: Mail, color: 'text-purple-600' }
      case 'SOCIAL': return { variant: 'outline' as const, icon: Users, color: 'text-green-600' }
      case 'NEWSLETTER': return { variant: 'outline' as const, icon: FileText, color: 'text-orange-600' }
      case 'SPAM': return { variant: 'destructive' as const, icon: XCircle, color: 'text-red-600' }
      case 'PERSONAL': return { variant: 'outline' as const, icon: Users, color: 'text-gray-600' }
      default: return { variant: 'outline' as const, icon: AlertCircle, color: 'text-gray-600' }
    }
  }

  const getContextBadge = (context: string) => {
    switch (context) {
      case 'MISSION_MUTUAL': return { label: 'Mission Mutual', color: 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200' }
      case 'INSURANCE_INDUSTRY': return { label: 'Insurance Industry', color: 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200' }
      case 'CHRISTIAN_MINISTRY': return { label: 'Christian Ministry', color: 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200' }
      case 'EXTERNAL': return { label: 'External Business', color: 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200' }
      case 'UNRELATED': return { label: 'Unrelated', color: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200' }
      default: return { label: 'Unknown', color: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200' }
    }
  }

  const filteredClassifications = classifications.filter(classification => {
    if (selectedCategory === 'all') return true
    if (selectedCategory === 'relevant') return classification.is_relevant
    if (selectedCategory === 'indexed') return classification.should_index
    return classification.category === selectedCategory
  })

  if (loading) {
    return <div className="flex justify-center p-8">Loading classification data...</div>
  }

  return (
    <div className="space-y-6">
      {/* Classification Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Classified</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalClassifications}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Business Relevant</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {stats.categories.BUSINESS_RELEVANT}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Indexed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.indexedEmails}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Spam Filtered</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {stats.categories.SPAM}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Email Classifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Email Classifications</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="all">All ({classifications.length})</TabsTrigger>
              <TabsTrigger value="relevant">
                Relevant ({classifications.filter(c => c.is_relevant).length})
              </TabsTrigger>
              <TabsTrigger value="indexed">
                Indexed ({classifications.filter(c => c.should_index).length})
              </TabsTrigger>
              <TabsTrigger value="BUSINESS_RELEVANT">
                Business ({stats?.categories.BUSINESS_RELEVANT || 0})
              </TabsTrigger>
              <TabsTrigger value="SPAM">
                Spam ({stats?.categories.SPAM || 0})
              </TabsTrigger>
              <TabsTrigger value="PROMOTIONAL">
                Promotional ({stats?.categories.PROMOTIONAL || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={selectedCategory} className="mt-6">
              <div className="space-y-4">
                {filteredClassifications.length === 0 ? (
                  <div className="text-center py-8">
                    <Filter className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-700 dark:text-gray-300">No email classifications found</p>
                  </div>
                ) : (
                  filteredClassifications.map((classification) => {
                    const categoryBadge = getCategoryBadge(classification.category)
                    const contextBadge = getContextBadge(classification.business_context)
                    const CategoryIcon = categoryBadge.icon
                    
                    return (
                      <Card key={classification.id} className={`${
                        !classification.is_relevant ? 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800' :
                        classification.should_index ? 'border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800' :
                        'border-gray-200 dark:border-gray-700'
                      }`}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-2">
                                <Badge variant={categoryBadge.variant} className="flex items-center space-x-1">
                                  <CategoryIcon className="h-3 w-3" />
                                  <span>{classification.category.replace('_', ' ')}</span>
                                </Badge>
                                <span className={`text-xs px-2 py-1 rounded-full ${contextBadge.color}`}>
                                  {contextBadge.label}
                                </span>
                                {classification.should_index && (
                                  <Badge variant="outline" className="text-green-600">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Indexed
                                  </Badge>
                                )}
                                <span className="text-sm text-gray-500">
                                  {Math.round(classification.confidence * 100)}% confidence
                                </span>
                              </div>
                              <CardTitle className="text-lg font-medium">
                                {classification.subject}
                              </CardTitle>
                              <p className="text-sm text-gray-600 mt-1">
                                From: {classification.sender}
                              </p>
                            </div>
                            
                            <div className="text-sm text-gray-500">
                              {formatDistanceToNow(new Date(classification.classification_date), { addSuffix: true })}
                            </div>
                          </div>
                        </CardHeader>
                        
                        <CardContent>
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm font-medium text-gray-700">Classification Reasoning:</p>
                              <p className="text-sm text-gray-600">{classification.reasoning}</p>
                            </div>
                            
                            <div className="flex items-center space-x-4 text-sm">
                              <div className="flex items-center space-x-1">
                                <span className="font-medium">Relevant:</span>
                                {classification.is_relevant ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-600" />
                                )}
                              </div>
                              <div className="flex items-center space-x-1">
                                <span className="font-medium">Indexed:</span>
                                {classification.should_index ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-gray-400" />
                                )}
                              </div>
                            </div>
                            
                            <div className="flex space-x-2 pt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEmailAction(classification.email_id, 'archive')}
                                className="flex items-center space-x-1"
                              >
                                <Archive className="h-4 w-4" />
                                <span>Archive</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEmailAction(classification.email_id, 'ignore')}
                                className="flex items-center space-x-1"
                              >
                                <EyeOff className="h-4 w-4" />
                                <span>Ignore</span>
                              </Button>
                              {classification.is_relevant ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEmailAction(classification.email_id, 'mark_irrelevant')}
                                  className="flex items-center space-x-1"
                                >
                                  <XCircle className="h-4 w-4" />
                                  <span>Mark Irrelevant</span>
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEmailAction(classification.email_id, 'mark_relevant')}
                                  className="flex items-center space-x-1"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                  <span>Mark Relevant</span>
                                </Button>
                              )}
                            </div>
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