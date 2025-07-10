import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Mail, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  User, 
  Clock 
} from 'lucide-react'

export default function ThemeTestPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Theme Test Page
          </h1>
          <p className="mt-2 text-gray-700 dark:text-gray-300">
            Testing light and dark theme contrast across components
          </p>
        </div>

        {/* Alerts */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Alerts</h2>
          
          <Alert className="border-orange-200 bg-orange-50 text-orange-900 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-100">
            <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <AlertDescription className="text-orange-900 dark:text-orange-100">
              This is an orange alert for potentially unsafe content
            </AlertDescription>
          </Alert>

          <Alert className="bg-red-50 border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-800 dark:text-red-100">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertDescription className="text-red-900 dark:text-red-100">
              This is a red alert for critical issues
            </AlertDescription>
          </Alert>

          <Alert className="border-green-200 bg-green-50 text-green-900 dark:bg-green-900/20 dark:border-green-800 dark:text-green-100">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-900 dark:text-green-100">
              This is a green alert for success messages
            </AlertDescription>
          </Alert>
        </div>

        {/* Cards with different backgrounds */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Cards</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  Default Card
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 dark:text-gray-300">This is default card content</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  With secondary text
                </p>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  Blue Card
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-900 dark:text-gray-100">Unread email card</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                  Business relevant content
                </p>
              </CardContent>
            </Card>

            <Card className="border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  Red Card
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-900 dark:text-gray-100">Irrelevant email card</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                  Filtered from processing
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Badges */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Badges</h2>
          
          <div className="flex flex-wrap gap-2">
            <Badge variant="default">Default Badge</Badge>
            <Badge variant="secondary">Secondary Badge</Badge>
            <Badge variant="outline">Outline Badge</Badge>
            <Badge variant="destructive">Destructive Badge</Badge>
          </div>
        </div>

        {/* Text Colors */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Text Colors</h2>
          
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <p className="text-gray-900 dark:text-gray-100">Primary text (gray-900/gray-100)</p>
                <p className="text-gray-700 dark:text-gray-300">Secondary text (gray-700/gray-300)</p>
                <p className="text-gray-600 dark:text-gray-400">Muted text (gray-600/gray-400)</p>
                <p className="text-gray-500 dark:text-gray-500">Placeholder text (gray-500/gray-500)</p>
                <p className="text-gray-400 dark:text-gray-600">Disabled text (gray-400/gray-600)</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Interactive Elements */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Interactive Elements</h2>
          
          <div className="flex gap-4">
            <Button variant="default">Default Button</Button>
            <Button variant="secondary">Secondary Button</Button>
            <Button variant="outline">Outline Button</Button>
            <Button variant="destructive">Destructive Button</Button>
          </div>
        </div>

        {/* Code Blocks */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Code Blocks</h2>
          
          <pre className="whitespace-pre-wrap text-sm font-mono bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 rounded-lg overflow-auto">
{`// This is a code block
const example = {
  theme: 'light-or-dark',
  contrast: 'sufficient',
  accessibility: 'wcag-compliant'
}`}
          </pre>
        </div>

        {/* Email Message Example */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Email Message Example</h2>
          
          <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">John Doe</p>
                  <span className="text-xs text-gray-600 dark:text-gray-400">(john@example.com)</span>
                </div>
                
                <div className="mt-1 space-y-1">
                  <div className="text-xs text-gray-700 dark:text-gray-300">
                    <span className="font-medium">To:</span> recipient@example.com
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                  Dec 9, 2024
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  2:30 PM
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
            Toggle between light and dark mode to test contrast
          </p>
        </div>
      </div>
    </div>
  )
}