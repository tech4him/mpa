import { NextRequest, NextResponse } from 'next/server';
import { run } from '@openai/agents';
import { simpleEmailAgent } from '@/lib/agents/simple-email-agent';

export async function GET(req: NextRequest) {
  try {
    // Simple test of the agent
    const response = await run(
      simpleEmailAgent,
      'Test message: Can you confirm the agent is working?'
    );

    return NextResponse.json({
      success: true,
      agentResponse: response.finalOutput || 'No response',
      responseType: typeof response,
      toolsAvailable: [
        'searchProjectContext',
        'searchRelationshipHistory',
        'verifyOrganizationalFacts',
        'getEmailThreadContext',
        'updateOrganizationalMemory',
        'fileSearch',
        'webSearch',
      ],
    });
  } catch (error) {
    console.error('Agent test error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: 'Agent test failed',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Test the agent with a custom message
    const response = await run(simpleEmailAgent, message);

    return NextResponse.json({
      success: true,
      agentResponse: response.finalOutput || 'No response',
      responseType: typeof response,
      responseKeys: Object.keys(response),
    });
  } catch (error) {
    console.error('Agent test error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}