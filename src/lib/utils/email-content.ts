// Simple HTML sanitization without external dependencies

interface EmailContent {
  text: string
  preview: string
  hasHtml: boolean
}

export function parseEmailContent(htmlContent: string): EmailContent {
  if (!htmlContent) {
    return {
      text: 'No content available',
      preview: 'No content available',
      hasHtml: false
    }
  }

  // Check if content is HTML or plain text
  const isHtml = /<[a-z][\s\S]*>/i.test(htmlContent)
  
  if (!isHtml) {
    // Already plain text
    const cleaned = htmlContent.trim()
    return {
      text: cleaned,
      preview: cleaned.length > 200 ? cleaned.substring(0, 200) + '...' : cleaned,
      hasHtml: false
    }
  }

  // Simple HTML sanitization - remove script tags and dangerous attributes
  const sanitized = htmlContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '') // Remove event handlers
    .replace(/javascript:/gi, '') // Remove javascript: URLs

  // Convert HTML to readable text
  const textContent = htmlToText(sanitized)
  const cleanedContent = cleanupText(textContent)
  
  return {
    text: cleanedContent,
    preview: cleanedContent.length > 200 ? cleanedContent.substring(0, 200) + '...' : cleanedContent,
    hasHtml: true
  }
}

function htmlToText(html: string): string {
  // Create a temporary div to parse HTML
  if (typeof window !== 'undefined') {
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = html
    return extractTextFromElement(tempDiv).trim()
  } else {
    // Server-side HTML parsing
    return serverSideHtmlToText(html)
  }
}

function extractTextFromElement(element: HTMLElement): string {
  let text = ''
  
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || ''
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = (node as HTMLElement).tagName.toLowerCase()
      
      switch (tagName) {
        case 'br':
          text += '\n'
          break
        case 'p':
        case 'div':
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          text += '\n\n' + extractTextFromElement(node as HTMLElement) + '\n\n'
          break
        case 'li':
          text += '\n• ' + extractTextFromElement(node as HTMLElement)
          break
        case 'ul':
        case 'ol':
          text += '\n' + extractTextFromElement(node as HTMLElement) + '\n'
          break
        case 'a':
          const href = (node as HTMLElement).getAttribute('href')
          const linkText = extractTextFromElement(node as HTMLElement)
          text += href ? `${linkText} (${href})` : linkText
          break
        case 'strong':
        case 'b':
          text += '**' + extractTextFromElement(node as HTMLElement) + '**'
          break
        case 'em':
        case 'i':
          text += '*' + extractTextFromElement(node as HTMLElement) + '*'
          break
        default:
          text += extractTextFromElement(node as HTMLElement)
      }
    }
  }
  
  return text
}

function serverSideHtmlToText(html: string): string {
  // Simple server-side HTML to text conversion
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6])\b[^>]*>/gi, '\n\n')
    .replace(/<\/?(ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    .replace(/<strong\b[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<(b)\b[^>]*>(.*?)<\/\1>/gi, '**$2**')
    .replace(/<em\b[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<(i)\b[^>]*>(.*?)<\/\1>/gi, '*$2*')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]*>/g, '') // Remove any remaining tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ') // Collapse multiple spaces into one
    .replace(/\n\s+/g, '\n') // Remove spaces after newlines
    .replace(/\s+\n/g, '\n') // Remove spaces before newlines
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines to max 2
    .trim()
}

function cleanupText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Collapse multiple spaces into one
    .replace(/\n\s+/g, '\n') // Remove spaces after newlines
    .replace(/\s+\n/g, '\n') // Remove spaces before newlines
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines to max 2
    .replace(/\t+/g, ' ') // Replace tabs with spaces
    .trim()
}

export function formatEmailForDisplay(content: string): {
  formatted: string
  isLong: boolean
} {
  const parsed = parseEmailContent(content)
  const lines = parsed.text.split('\n')
  const isLong = lines.length > 20 || parsed.text.length > 1000
  
  // If content is very long, show first part with truncation
  if (isLong) {
    const truncatedLines = lines.slice(0, 15)
    const truncated = truncatedLines.join('\n')
    return {
      formatted: truncated + '\n\n... [Content truncated - click "Show Full Content" to see more]',
      isLong: true
    }
  }
  
  return {
    formatted: parsed.text,
    isLong: false
  }
}