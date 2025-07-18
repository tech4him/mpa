# AI Executive Assistant

A comprehensive AI-powered work orchestration platform that acts as a world-class Executive Assistant, managing communications, maintaining relationships, tracking commitments, and keeping you focused on what matters most. Transform your productivity by letting AI handle the operational overhead while you focus on strategic leadership.

## Architecture Overview

- **Frontend**: Next.js 14 (App Router), Tailwind CSS
- **Backend**: Vercel Edge Functions, Node.js
- **Database**: Supabase (PostgreSQL)
- **Queue**: Upstash QStash  
- **AI**: OpenAI GPT-4o API
- **Email**: Microsoft Graph API v1.0
- **Authentication**: Supabase Auth with Azure AD SSO

## Setup Instructions

### Prerequisites

1. **Microsoft Azure AD App Registration**
   - Go to Azure Portal → App registrations
   - Create a new registration
   - Set redirect URI: `https://your-domain.com/auth/callback`
   - Enable the following permissions:
     - User.Read
     - Mail.ReadWrite
     - Calendars.Read
     - offline_access

2. **Supabase Project**
   - Create a new project at [supabase.com](https://supabase.com)
   - Get your project URL and anon key
   - Run the database schema from `supabase/schema.sql`

3. **OpenAI API Key**
   - Sign up at [openai.com](https://openai.com)
   - Create an API key with GPT-4o access

4. **Upstash QStash**
   - Sign up at [upstash.com](https://upstash.com)
   - Create a QStash queue
   - Get your token and URL

### Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
# Microsoft Graph
MICROSOFT_TENANT_ID=your-tenant-id
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# OpenAI
OPENAI_API_KEY=your-openai-api-key
OPENAI_ORG_ID=your-openai-org-id

# QStash
QSTASH_URL=your-qstash-url
QSTASH_TOKEN=your-qstash-token

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENCRYPTION_KEY=generate-32-byte-hex-key
WEBHOOK_SECRET=generate-random-string
```

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up the database:
```bash
# Run the SQL schema in your Supabase project
psql -f supabase/schema.sql
```

3. Generate encryption key:
```bash
# Generate a 32-byte hex key for ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) with your browser.

## Key Features

### 1. Executive Command Center
- **Daily Intelligence Dashboard**: Morning briefings with need-to-know, need-to-do, and anomalies
- **Priority Communications Hub**: AI-categorized and context-aware message management
- **Commitment Tracking**: Never drop a ball - track all promises and deliverables
- **Relationship Health Monitoring**: Alert before professional relationships go cold

### 2. Intelligent Communication Hub
- **Context-Aware Drafts**: Responses that understand conversation history and relationship dynamics
- **Universal Search**: Find anything across all platforms with natural language queries
- **Multi-Platform Integration**: Email, Teams, SharePoint, OneDrive, ClickUp, and more
- **Automated Routine Handling**: Handle standard responses while surfacing exceptions

### 3. Proactive Work Intelligence
- **Project Context Awareness**: Understand ongoing initiatives across all platforms
- **Anomaly Detection**: Flag unusual patterns and things that need attention
- **Follow-up Management**: Track what you're waiting for and remind when needed
- **Meeting Preparation**: Auto-generate agendas and briefs based on context

### 4. Universal Work Orchestration
- **Cross-Platform Context**: Unified intelligence layer across all work tools
- **Smart Task Management**: Connect communications to projects and deliverables
- **Calendar Intelligence**: Optimize scheduling and protect deep work time
- **Workflow Automation**: Handle routine processes while surfacing exceptions

### 5. Privacy-First Learning System
- **Personal Knowledge Base**: Your data never mixes with other users
- **Continuous Improvement**: Learn from your edits and feedback
- **Contextual Memory**: Remember project details and communication preferences
- **Adaptive Intelligence**: Improve understanding of your work patterns over time

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── webhooks/outlook/     # Microsoft Graph webhooks
│   │   ├── process-email/        # Email processing pipeline
│   │   ├── threads/              # Thread management
│   │   ├── drafts/               # Draft operations
│   │   ├── learning/             # Learning system
│   │   └── briefing/             # Daily briefing
│   ├── auth/                     # Authentication flows
│   ├── dashboard/                # Main dashboard
│   └── layout.tsx
├── lib/
│   ├── supabase/                 # Database clients
│   ├── microsoft-graph/          # Graph API integration
│   ├── ai/                       # AI services
│   └── utils.ts
├── components/                   # React components
├── types/                        # TypeScript definitions
└── hooks/                        # Custom React hooks
```

## Development

### Running Tests
```bash
npm run test
```

### Building for Production
```bash
npm run build
```

### Deployment

The app is designed to deploy on Vercel:

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

## Security Features

- SOC 2 Type II compliance ready
- Encrypted refresh token storage (AES-256-GCM)
- Row-level security for multi-user access
- No email content stored permanently
- Audit trail for all automated actions

## Documentation

See the [PRD/SRD document](./docs/PRD-SRD.md) for detailed requirements and system design.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes following the existing code style
4. Add tests for new functionality
5. Submit a pull request

## License

This project is private and proprietary.
