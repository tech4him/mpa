# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Essential Commands:**
- `npm run dev` - Start development server with Turbopack (faster than standard Next.js)
- `npm run build` - Production build
- `npm run lint` - ESLint checks
- `npm run start` - Production server

**Database Management:**
- Apply migrations via Supabase Dashboard or MCP tools
- Schema files in `supabase/` directory are applied manually

**Utility Scripts:**
- `npm run reprocess-emails` - Reprocess existing emails through AI pipeline
- `npm run check-vector-store` - Verify OpenAI vector store status
- `npm run check-emails` - Simple email verification script

## Architecture Overview

This is an AI-powered email assistant built on a privacy-first, agent-based architecture with comprehensive Microsoft 365 integration.

### Core Technology Stack
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Backend**: Vercel Edge Functions, OpenAI Agents framework
- **Database**: Supabase (PostgreSQL) with Row-Level Security
- **AI**: OpenAI GPT-4o with custom agents and per-user vector stores
- **Integrations**: Microsoft Graph API, Azure AD, Upstash QStash

### Key Architectural Patterns

**Agent-Based Processing**: Uses OpenAI Agents framework (`@openai/agents`) with custom tools for organizational context, email analysis, and draft generation. Each agent has specialized tools for different aspects of email intelligence.

**Privacy-First Design**: 
- Per-user encrypted vector stores (no shared knowledge base)
- Row-Level Security policies ensuring complete data isolation
- AES-256-GCM encryption for sensitive tokens
- All user data stays within their own encrypted context

**Event-Driven Architecture**:
- Microsoft Graph webhooks trigger real-time email processing
- Upstash QStash handles background jobs and async processing
- Webhook responses must complete within 5 seconds (Microsoft requirement)

### Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── webhooks/outlook/        # Microsoft Graph webhook handlers
│   │   ├── drafts/                  # AI draft generation and management
│   │   ├── email/                   # Email sync, spam, and processing
│   │   ├── security/                # Security analysis endpoints
│   │   └── test-agent/              # Agent testing utilities
│   ├── auth/                        # Azure AD authentication flows
│   └── dashboard/                   # Main application UI
├── lib/
│   ├── agents/                      # OpenAI agent implementations
│   ├── ai/                         # Core AI services (draft generator, security)
│   ├── email/                      # Email processing, rules, sync services
│   ├── microsoft-graph/            # Graph API integration layer
│   ├── supabase/                   # Database clients (client/server)
│   └── vector-store/               # Vector database service
├── components/                     # React components with security-focused viewers
└── types/                         # TypeScript definitions for entire system
```

### Database Schema

The database follows a comprehensive privacy-first design:

**Core Tables:**
- `users` - User management with encrypted tokens and per-user vector store IDs
- `email_threads` & `email_messages` - Full conversation tracking with RLS
- `email_drafts` - AI-generated drafts with versioning and feedback loops
- `email_processing_rules` - User-defined automation rules with AI parsing
- `learning_samples` - User edit tracking for continuous AI improvement

**Intelligence Tables:**
- `relationship_intelligence` - Contact interaction patterns and preferences
- `project_contexts` - Organizational project awareness
- `daily_briefings` - Morning intelligence summaries
- `intelligent_actions` - Proactive recommendations

**Security:** All tables use Row-Level Security policies to ensure users only access their own data.

### AI Integration Patterns

**OpenAI Agents Framework:**
- `DraftGeneratorAgent` - Context-aware email response generation
- `SecurityAgent` - Email threat analysis and classification
- `AnalysisAgent` - Thread categorization and priority assessment

**Custom Tools:**
- `searchProjectContext` - RAG search for organizational knowledge
- `searchRelationshipHistory` - Contact interaction analysis
- `verifyOrganizationalFacts` - Fact-checking against knowledge base

**Vector Store Management:**
- Each user has their own OpenAI Vector Store ID stored in `users.personal_vector_store_id`
- Documents are indexed with metadata for project, participant, and significance scoring
- Privacy maintained through complete data isolation per user

### Microsoft Graph Integration

**Authentication Flow:**
- Azure AD OAuth 2.0 with PKCE
- Encrypted token storage with automatic refresh
- Scope: `User.Read`, `Mail.ReadWrite`, `Calendars.Read`, `offline_access`

**Webhook System:**
- Real-time email monitoring via Microsoft Graph subscriptions
- Webhook validation using shared secrets
- Async processing to meet 5-second response requirement

**API Integration:**
- Thread-aware email fetching with conversation context
- Folder management for smart filing
- Spam handling with junk folder integration

### Security Implementation

**Data Encryption:**
- All Microsoft refresh tokens encrypted using AES-256-GCM
- Encryption key stored in environment variables
- Per-user data isolation enforced at database level

**Content Security:**
- `SafeEmailViewer` component sanitizes HTML email content
- DOMPurify integration prevents XSS attacks
- Audit trails for all automated actions

### Development Patterns

**Error Handling:**
- Comprehensive try-catch blocks with user-friendly messages
- Token expiration detection with reauthentication prompts
- Graceful degradation when AI services are unavailable

**Component Architecture:**
- Thread-aware components that understand conversation context
- Processing status tracking with optimistic UI updates
- Real-time sync status with user feedback

**API Design:**
- RESTful endpoints with consistent error responses
- Webhook endpoints optimized for Microsoft Graph requirements
- Background job processing for time-intensive operations

### Environment Configuration

Required environment variables documented in `.env.example`:
- Microsoft Graph credentials and tenant configuration
- Supabase database and authentication keys
- OpenAI API keys with organization ID
- QStash configuration for background processing
- Encryption keys and webhook secrets

### Testing and Quality

**Current State:**
- TypeScript strict mode enabled for type safety
- Component-level error boundaries
- Basic integration testing structure

**Development Guidelines:**
- Follow existing patterns for agent tool creation
- Maintain privacy-first principles in all new features
- Use Row-Level Security for any new user data tables
- Implement proper error handling with user guidance

### Key Business Logic

**Email Processing Pipeline:**
1. Webhook receives email notification
2. QStash queues background processing
3. AI agents analyze content and context
4. Processing rules applied for automation
5. User notifications for important items

**Learning System:**
- Captures user edits to AI-generated drafts
- Analyzes patterns in communication style
- Improves future draft quality through feedback loops
- Maintains user-specific learning within their vector store

**Intelligence Features:**
- Daily morning briefings with need-to-know information
- Proactive action recommendations based on patterns
- Anomaly detection for unusual communication patterns
- Context-aware draft generation using full organizational knowledge

This codebase implements a sophisticated AI assistant focused on privacy, intelligence, and user autonomy while maintaining enterprise-grade security and compliance standards.