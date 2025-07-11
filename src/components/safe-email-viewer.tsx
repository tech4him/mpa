'use client'

import { useEffect, useState } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Shield, Eye, Code, AlertTriangle } from 'lucide-react'

interface SafeEmailViewerProps {
  subject: string
  body: string
  contentType?: string
  className?: string
}

export function SafeEmailViewer({ subject, body, contentType = 'text/html', className = '' }: SafeEmailViewerProps) {
  const [viewMode, setViewMode] = useState<'safe' | 'plain' | 'raw'>('safe')
  const [sanitizedHtml, setSanitizedHtml] = useState('')
  const [plainText, setPlainText] = useState('')
  const [hasUnsafeContent, setHasUnsafeContent] = useState(false)

  useEffect(() => {
    // Configure DOMPurify for maximum safety
    const config = {
      ALLOWED_TAGS: [
        'a', 'b', 'i', 'em', 'strong', 'p', 'br', 'div', 'span',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'img', 'hr'
      ],
      ALLOWED_ATTR: [
        'href', 'target', 'rel', 'style', 'class', 'id',
        'src', 'alt', 'width', 'height'
      ],
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'javascript'],
      SAFE_FOR_TEMPLATES: true,
      SANITIZE_DOM: true,
      KEEP_CONTENT: true,
      // Force all links to open in new tab with security attributes
      ADD_ATTR: ['target', 'rel'],
      FORCE_BODY: true,
    }

    // Sanitize the HTML content
    const cleanHtml = DOMPurify.sanitize(body, config)
    
    // Check if content was modified (potentially unsafe content was removed)
    if (cleanHtml !== body && contentType === 'text/html') {
      setHasUnsafeContent(true)
    }

    // Add security attributes to all links and remove background styles
    const parser = new DOMParser()
    const doc = parser.parseFromString(cleanHtml, 'text/html')
    
    // Remove background styles from all elements
    const allElements = doc.querySelectorAll('*')
    allElements.forEach(element => {
      const style = element.getAttribute('style')
      if (style) {
        // Remove background-related properties from inline styles
        const cleanedStyle = style
          .replace(/background[^;]*;?/gi, '')
          .replace(/background-color[^;]*;?/gi, '')
          .replace(/background-image[^;]*;?/gi, '')
          .replace(/background-attachment[^;]*;?/gi, '')
          .replace(/background-position[^;]*;?/gi, '')
          .replace(/background-repeat[^;]*;?/gi, '')
          .replace(/background-size[^;]*;?/gi, '')
          .replace(/;;+/g, ';')
          .replace(/^;|;$/g, '')
        
        if (cleanedStyle.trim()) {
          element.setAttribute('style', cleanedStyle)
        } else {
          element.removeAttribute('style')
        }
      }
    })

    const links = doc.querySelectorAll('a')
    links.forEach(link => {
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener noreferrer nofollow')
      // Add visual indicator for external links
      if (!link.textContent?.includes('🔗')) {
        link.textContent = `${link.textContent} 🔗`
      }
    })

    // Block images from loading automatically
    const images = doc.querySelectorAll('img')
    images.forEach(img => {
      const src = img.getAttribute('src')
      img.setAttribute('data-src', src || '')
      img.setAttribute('src', 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23f3f4f6"/%3E%3Ctext x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23374151" font-family="system-ui" font-size="14"%3EImage blocked%3C/text%3E%3C/svg%3E')
      img.setAttribute('title', 'Click to load image')
      img.setAttribute('style', 'cursor: pointer; max-width: 100%; height: auto;')
    })

    setSanitizedHtml(doc.body.innerHTML)

    // Convert HTML to plain text
    const textContent = doc.body.textContent || doc.body.innerText || ''
    setPlainText(textContent)
  }, [body, contentType])

  const handleImageClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG' && target.getAttribute('data-src')) {
      const src = target.getAttribute('data-src')
      if (src && confirm('Load external image? This may expose your IP address to the sender.')) {
        target.setAttribute('src', src)
      }
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-600" />
            {subject}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={viewMode === 'safe' ? 'default' : 'outline'}
              onClick={() => setViewMode('safe')}
              className="flex items-center gap-1"
            >
              <Eye className="h-4 w-4" />
              Safe View
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'plain' ? 'default' : 'outline'}
              onClick={() => setViewMode('plain')}
              className="flex items-center gap-1"
            >
              Plain Text
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'raw' ? 'default' : 'outline'}
              onClick={() => setViewMode('raw')}
              className="flex items-center gap-1"
            >
              <Code className="h-4 w-4" />
              Raw
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hasUnsafeContent && (
          <Alert className="mb-4 border-orange-200 bg-orange-50 text-orange-900 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-100">
            <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <AlertDescription className="text-orange-900 dark:text-orange-100">
              This email contained potentially unsafe content that has been removed for your protection.
            </AlertDescription>
          </Alert>
        )}

        <div className="email-content">
          {viewMode === 'safe' && (
            <div 
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              onClick={handleImageClick}
              style={{
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
              }}
            />
          )}

          {viewMode === 'plain' && (
            <pre className="whitespace-pre-wrap text-sm font-mono bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 rounded-lg overflow-auto max-h-[600px]">
              {plainText}
            </pre>
          )}

          {viewMode === 'raw' && (
            <div className="relative">
              <pre className="whitespace-pre-wrap text-xs font-mono bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 rounded-lg overflow-auto max-h-[600px]">
                <code>{body}</code>
              </pre>
              <div className="absolute top-2 right-2">
                <Alert className="bg-red-50 border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-800 dark:text-red-100 max-w-xs">
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <AlertDescription className="text-xs text-red-900 dark:text-red-100">
                    Raw HTML - Do not copy/paste this content elsewhere
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          )}
        </div>

        <style jsx global>{`
          .email-content {
            color: rgb(17 24 39);
          }
          .email-content * {
            color: inherit !important;
            background-color: transparent !important;
            background-image: none !important;
            background: none !important;
          }
          .email-content a {
            color: rgb(37 99 235) !important;
            text-decoration: underline;
          }
          .email-content a:hover {
            color: rgb(29 78 216) !important;
          }
          .email-content img {
            border: 1px solid rgb(229 231 235);
            border-radius: 0.375rem;
          }
          .email-content table {
            border-collapse: collapse;
          }
          .email-content table td,
          .email-content table th {
            border: none;
            padding: 0;
            margin: 0;
          }
          .email-content blockquote {
            border-left: 4px solid rgb(229 231 235);
            padding-left: 1rem;
            margin: 1rem 0;
            color: rgb(107 114 128) !important;
          }
          .dark .email-content {
            color: rgb(243 244 246);
          }
          .dark .email-content * {
            color: inherit !important;
            background-color: transparent !important;
            background-image: none !important;
            background: none !important;
          }
          .dark .email-content a {
            color: rgb(96 165 250) !important;
          }
          .dark .email-content a:hover {
            color: rgb(147 197 253) !important;
          }
          .dark .email-content img {
            border: 1px solid rgb(75 85 99);
          }
          .dark .email-content table td,
          .dark .email-content table th {
            border: none;
          }
          .dark .email-content blockquote {
            border-left: 4px solid rgb(75 85 99);
            color: rgb(156 163 175) !important;
          }
          @media (prefers-color-scheme: dark) {
            .email-content {
              color: rgb(243 244 246);
            }
            .email-content * {
              color: inherit !important;
              background-color: transparent !important;
              background-image: none !important;
              background: none !important;
            }
            .email-content a {
              color: rgb(96 165 250) !important;
            }
            .email-content a:hover {
              color: rgb(147 197 253) !important;
            }
            .email-content img {
              border: 1px solid rgb(75 85 99);
            }
            .email-content table td,
            .email-content table th {
              border: none;
            }
            .email-content blockquote {
              border-left: 4px solid rgb(75 85 99);
              color: rgb(156 163 175) !important;
            }
          }
        `}</style>
      </CardContent>
    </Card>
  )
}